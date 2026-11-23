// npx tsx refcheck.test.ts   (runs end-to-end with pure-Node PNG support, no `sharp` required)
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePngRgba, decodePngRgba } from './png';
import { parseResult, spawnTsx } from './result';
import { silhouette, maskIoU, bestIoU, maskFromRGBA, keepLargest, flipH, dominantColors, paletteGap, proportions, compareToRef, maskToB64, frameMask, splitGridSheet, diffRGBA, THRESH, type RefData, type Tris } from './refcheck';

const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Tris => {
  const x = [cx - sx / 2, cx + sx / 2], y = [cy - sy / 2, cy + sy / 2], z = [cz - sz / 2, cz + sz / 2], P = (i: number, j: number, k: number) => [x[i], y[j], z[k]];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d];
  return [...quad(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)), ...quad(P(1, 0, 0), P(0, 0, 0), P(0, 1, 0), P(1, 1, 0)), ...quad(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)), ...quad(P(1, 0, 1), P(1, 0, 0), P(1, 1, 0), P(1, 1, 1)), ...quad(P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0)), ...quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1))];
};
const rect = (W: number, H: number, x0: number, y0: number, x1: number, y1: number, fg = [30, 30, 30, 255], bg = [255, 255, 255, 255]) => {
  const d = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set(x >= x0 && x < x1 && y >= y0 && y < y1 ? fg : bg, (y * W + x) * 4); return d;
};

// silhouette of a 2:1 box
const wide = box(0, 0.5, 0, 2, 1, 1);
const f = silhouette(wide, 'front'); assert.ok(Math.abs(f.aspect - 2) < 0.02, `aspect ${f.aspect}`);
assert.equal(maskIoU(f.mask, silhouette(wide, 'front').mask), 1);
assert.ok(Math.abs(silhouette(wide, 'side').aspect - 1) < 0.02 && Math.abs(silhouette(wide, 'top').aspect - 2) < 0.02);
assert.ok(Math.abs(proportions(wide).w - 2) < 1e-9 && Math.abs(proportions(wide).d - 1) < 1e-9);
// a different-looking box scores low
assert.ok(maskIoU(f.mask, silhouette(box(0, 0.5, 0, 1, 1, 1), 'front').mask) < 0.6);
// an image of the same shape (opaque background) matches the model
const img = maskFromRGBA(rect(200, 120, 20, 30, 180, 110), 200, 120);          // 160 x 80 = 2:1
const ir = frameMask(img); assert.ok(Math.abs(ir.aspect - 2) < 0.05); assert.ok(maskIoU(f.mask, ir.mask) > 0.95, 'image vs model');
// border flood-fill keeps interior light patches (e.g. cream belly matching bg) solid instead of poking a hole
{
  const belly = rect(200, 120, 20, 30, 180, 110, [60, 50, 50, 255], [235, 230, 228, 255]);
  for (let y = 50; y < 90; y++) for (let x = 70; x < 130; x++) belly.set([235, 230, 228, 255], (y * 200 + x) * 4);
  const floodMask = maskFromRGBA(belly, 200, 120);
  const flatMask = maskFromRGBA(belly, 200, 120, { flood: false });
  assert.equal(floodMask.data.reduce((a, b) => a + b, 0), 160 * 80, 'flood-fill keeps enclosed light belly solid');
  assert.ok(flatMask.data.reduce((a, b) => a + b, 0) < 160 * 80, 'flat threshold leaves an interior hole');
}
// transparent background: alpha is used
const tr = maskFromRGBA(rect(200, 120, 20, 30, 180, 110, [200, 50, 50, 255], [255, 255, 255, 0]), 200, 120); assert.equal(tr.data.reduce((a, b) => a + b, 0), 160 * 80);
// speck / shadow removal
const sp = rect(200, 120, 20, 30, 180, 110); for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) sp.set([0, 0, 0, 255], (y * 200 + x + 190) * 4);
const spm = maskFromRGBA(sp, 200, 120); assert.equal(spm.data.reduce((a, b) => a + b, 0), 160 * 80, 'speck removed');
assert.ok(keepLargest({ w: 4, h: 1, data: Uint8Array.from([1, 0, 1, 1]) }).data.join('') === '0011');
// mirrored reference is detected
const L: Tris = [...box(0, 0.5, 0, 1, 1, 1), ...box(0.75, 0.15, 0, 0.5, 0.3, 1)];   // block with a foot on the right
const Lm = silhouette(L, 'front').mask, mirrored = flipH(Lm);
assert.ok(maskIoU(Lm, mirrored) < 0.9); const bi = bestIoU(Lm, mirrored, 'front'); assert.equal(bi.flip, 'flipH'); assert.ok(bi.iou > 0.99);
// palette
const px = new Uint8Array(100 * 4); for (let i = 0; i < 100; i++) px.set(i < 70 ? [200, 40, 40, 255] : i < 95 ? [40, 40, 200, 255] : [250, 250, 250, 255], i * 4);
const dc = dominantColors(px, 10, 10, 3); assert.equal(dc[0].hex, '#c82828'); assert.ok(Math.abs(dc[0].share - 0.7) < 1e-9);
assert.ok(paletteGap(dc, ['#c82828', '#2828c8', '#fafafa']).gap < 1); assert.ok(paletteGap(dc, ['#00ff00']).gap > 100);
assert.equal(paletteGap([{ hex: '#ff0000', share: 0.01 }], ['#00ff00']).gap, 0, 'tiny shares are ignored');
// grid sheet splitting
{
  const sheet = new Uint8Array(400 * 120 * 4); sheet.fill(255);
  const left = rect(200, 120, 20, 30, 180, 110, [180, 90, 40, 255]);    // 2:1 front
  const right = rect(200, 120, 60, 20, 140, 100, [180, 90, 40, 255]);   // 1:1 side
  for (let y = 0; y < 120; y++) {
    sheet.set(left.subarray(y * 200 * 4, (y + 1) * 200 * 4), y * 400 * 4);
    sheet.set(right.subarray(y * 200 * 4, (y + 1) * 200 * 4), (y * 400 + 200) * 4);
  }
  const tiles = splitGridSheet(sheet, 400, 120, 2, 1);
  assert.equal(tiles.length, 2);
  assert.ok(Math.abs(frameMask(maskFromRGBA(tiles[0].rgba, 200, 120)).aspect - 2) < 0.05);
  assert.ok(Math.abs(frameMask(maskFromRGBA(tiles[1].rgba, 200, 120)).aspect - 1) < 0.05);
}
// whole gate run: right model passes, wrong model fails with a hint
const ref = { views: { front: { w: 64, h: 64, data: maskToB64(ir.mask), aspect: ir.aspect } }, palette: dc, proportions: { w: 2 } };
const good = compareToRef(wide, ref, ['#c82828', '#2828c8', '#fafafa']); assert.ok(good.gates.every((g) => g.pass), JSON.stringify(good.gates));
const bad = compareToRef(box(0, 0.5, 0, 1, 1, 1), ref, ['#00ff00']); assert.ok(bad.gates.filter((g) => !g.pass).length >= 3);
assert.ok(bad.diffs.front!.length === 64 * 64 * 4);

// Asymmetric shapes at the angular sweep limits pick the matching camera for both G2 gates and the diff.
const angledAsset = [...L, ...box(-0.6, 0.7, 0.8, 0.3, 0.4, 1.2)];
const frontCamera = { azimuthDeg: 50, elevationDeg: 10, azimuthOffsetDeg: 12, elevationOffsetDeg: -6 };
const rearCamera = { azimuthDeg: 130, elevationDeg: 22, azimuthOffsetDeg: -12, elevationOffsetDeg: 6 };
const frontAngle = silhouette(angledAsset, '34', 64, frontCamera);
const rearAngle = silhouette(angledAsset, '34_back', 64, rearCamera);
const angledRef: RefData = {
  views: {
    '34': { w: 64, h: 64, aspect: frontAngle.aspect, data: maskToB64(frontAngle.mask) },
    '34_back': { w: 64, h: 64, aspect: rearAngle.aspect, data: maskToB64(flipH(rearAngle.mask)) },
  },
  palette: [],
};
{
  const before = angledAsset.slice();
  assert.ok(bestIoU(silhouette(angledAsset, '34').mask, frontAngle.mask, '34').iou < 0.95);
  assert.ok(bestIoU(silhouette(angledAsset, '34_back').mask, rearAngle.mask, '34_back').iou < 0.95);
  const sweep = compareToRef(angledAsset, angledRef);
  assert.deepEqual(sweep.angles, { '34': frontCamera, '34_back': rearCamera });
  assert.ok(sweep.gates.every((gate) => gate.pass), JSON.stringify(sweep.gates));
  assert.match(sweep.gates[1].value, /^1\.00 .+azimuth 50° \[\+12°\], elevation 10° \[-6°\]; canonical IoU 0\.\d{2}/);
  assert.match(sweep.gates[3].value, /reference mirrored: flipH/);
  assert.deepEqual(sweep.diffs['34'], diffRGBA(frontAngle.mask, frontAngle.mask));
  assert.deepEqual(sweep.diffs['34_back'], diffRGBA(rearAngle.mask, rearAngle.mask));
  assert.deepEqual(angledAsset, before, 'compare must leave the triangles intact');
}

// Report "passed via angle sweep" when canonical IoU is below threshold and only the swept angle clears it.
{
  const asymmetric = [...box(0, 0.5, 0, 0.3, 1.0, 0.3), ...box(-1.6, 0.2, 2.0, 0.25, 0.25, 1.8)];
  const shiftedCam = { azimuthDeg: 50, elevationDeg: 10, azimuthOffsetDeg: 12, elevationOffsetDeg: -6 };
  const shifted = silhouette(asymmetric, '34', 64, shiftedCam);
  const canon = bestIoU(silhouette(asymmetric, '34').mask, shifted.mask, '34').iou;
  assert.ok(canon < THRESH.iou34, `expected canonical IoU < ${THRESH.iou34}, got ${canon}`);
  const swept = compareToRef(asymmetric, { views: { '34': { w: 64, h: 64, data: maskToB64(shifted.mask), aspect: shifted.aspect } }, palette: [] });
  assert.ok(swept.gates[1].pass);
  assert.match(swept.gates[1].value, new RegExp(`canonical IoU ${canon.toFixed(2)}, passed via angle sweep`));
}

// A perfect mask match can miss the measured aspect. Prefer the best overlap within tolerance.
{
  const highestIoU = { azimuthDeg: 142, elevationDeg: 10, azimuthOffsetDeg: 0, elevationOffsetDeg: -6 };
  const exactMask = silhouette(angledAsset, '34_back', 64, highestIoU);
  const measuredAspect = silhouette(angledAsset, '34_back').aspect;
  assert.ok(Math.abs(exactMask.aspect / measuredAspect - 1) > THRESH.aspect34);
  const rear = { w: 64, h: 64, data: maskToB64(exactMask.mask), aspect: measuredAspect };
  const preferred = compareToRef(angledAsset, { views: { '34_back': rear }, palette: [] });
  assert.deepEqual(preferred.angles['34_back'], { azimuthDeg: 130, elevationDeg: 10, azimuthOffsetDeg: -12, elevationOffsetDeg: -6 });
  assert.ok(preferred.gates.every((gate) => gate.pass), JSON.stringify(preferred.gates));

  // With an unattainable aspect, report the highest IoU so the failing aspect stays visible.
  const diagnostic = compareToRef(angledAsset, { views: { '34_back': { ...rear, aspect: 100 } }, palette: [] });
  assert.deepEqual(diagnostic.angles['34_back'], highestIoU);
  assert.deepEqual(diagnostic.gates.map((gate) => gate.pass), [false, true]);
}

// Every camera ties in IoU and satisfies the relaxed aspect tolerance. Canonical wins.
{
  const blank = { w: 64, h: 64, data: maskToB64({ w: 64, h: 64, data: new Uint8Array(64 * 64) }), aspect: 1 };
  const tied = compareToRef(angledAsset, { views: { '34': blank, '34_back': blank }, palette: [] }, [], { ...THRESH, aspect34: 1 });
  assert.deepEqual(tied.angles, {
    '34': { azimuthDeg: 38, elevationDeg: 16, azimuthOffsetDeg: 0, elevationOffsetDeg: 0 },
    '34_back': { azimuthDeg: 142, elevationDeg: 16, azimuthOffsetDeg: 0, elevationOffsetDeg: 0 },
  });
}

for (const view of ['front', 'back', 'side', 'top'] as const) {
  const fixed = silhouette(angledAsset, view);
  assert.deepEqual(fixed, silhouette(angledAsset, view, 64, frontCamera), `${view} is a fixed projection`);
  const reference = { views: { [view]: { w: 64, h: 64, data: maskToB64(fixed.mask), aspect: fixed.aspect } }, palette: [] };
  const compared = compareToRef(angledAsset, reference);
  assert.deepEqual(compared.angles, {});
  assert.equal(compared.gates[1].value, '1.00');
}

// CLI end-to-end (works with pure-Node PNG writer/reader, no sharp needed)
{
  const dir = mkdtempSync(join(tmpdir(), 'refcheck-')), here = dirname(fileURLToPath(import.meta.url));
  const png = rect(300, 200, 30, 50, 270, 170, [180, 90, 40, 255]); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) png.set([0, 0, 0, 255], (y * 300 + x) * 4);
  writePngRgba(join(dir, 'ref.png'), png, 300, 200);
  const dec = decodePngRgba(readFileSync(join(dir, 'ref.png')))!;
  assert.equal(dec.width, 300); assert.equal(dec.height, 200);
  const run = (file: string, args: string[]) => spawnTsx(join(here, file), args, { cwd: dir, env: process.env });
  const singleFile = join('results', 'single', 'asset-ref.json'), singlePath = join(dir, singleFile);
  const a = run('ref-intake.ts', ['front=ref.png', '--out', singleFile, '--w', '2']);
  assert.equal(a.status, 0, a.stderr + a.stdout);
  assert.match(a.stdout, /aspect 2\.00/); assert.match(a.stdout, /#b45a28/);
  const checkMasks = (stdout: string, out: string, names: string[], stem: string) => {
    const result = parseResult(stdout)!;
    assert.equal(result.tool, 'ref-intake');
    assert.equal(result.ok, true);
    assert.equal(result.out, out);
    const manifest = JSON.parse(readFileSync(out, 'utf8')) as RefData;
    const views = result.views as Record<string, { aspect: number; mask: string }>;
    assert.deepEqual(Object.keys(views), names);
    assert.deepEqual(Object.keys(manifest.views), names);
    for (const name of names) {
      const view = manifest.views[name as keyof RefData['views']]!;
      assert.equal(view.mask, `${stem}-${name}-mask.png`);
      assert.equal(views[name].mask, join(dirname(out), view.mask));
      const decoded = decodePngRgba(readFileSync(views[name].mask))!;
      assert.equal(decoded.width, view.w);
      assert.equal(decoded.height, view.h);
    }
  };
  checkMasks(a.stdout, singlePath, ['front'], 'asset-ref');

  // turnaround sheet mode (--sheet --grid 2x1 --views front,side)
  const sheet = new Uint8Array(400 * 120 * 4); sheet.fill(255);
  const left = rect(200, 120, 20, 30, 180, 110, [180, 90, 40, 255]);
  const right = rect(200, 120, 60, 20, 140, 100, [180, 90, 40, 255]);
  for (let y = 0; y < 120; y++) {
    sheet.set(left.subarray(y * 200 * 4, (y + 1) * 200 * 4), y * 400 * 4);
    sheet.set(right.subarray(y * 200 * 4, (y + 1) * 200 * 4), (y * 400 + 200) * 4);
  }
  writePngRgba(join(dir, 'sheet.png'), sheet, 400, 120);
  const sheetPath = join(dir, 'results', 'sheet', 'turnaround.json');
  const sh = run('ref-intake.ts', ['--sheet', 'sheet.png', '--grid', '2x1', '--views', 'front,side', '--out', sheetPath]);
  assert.equal(sh.status, 0, sh.stderr + sh.stdout);
  checkMasks(sh.stdout, sheetPath, ['front', 'side'], 'turnaround');
  const blocked = run('ref-intake.ts', ['ref.png', '--out', 'results']);
  assert.equal(blocked.status, 1, blocked.stderr + blocked.stdout);
  assert.match(String(parseResult(blocked.stdout)?.error), /--out points to a directory/);
  assert.deepEqual(readdirSync(dir).sort(), ['ref.png', 'results', 'sheet.png'], 'nested intake must leave cwd clean');

  const defaultIntake = run('ref-intake.ts', ['ref.png']);
  assert.equal(defaultIntake.status, 0, defaultIntake.stderr + defaultIntake.stdout);
  checkMasks(defaultIntake.stdout, join(dir, 'ref.json'), ['front'], 'ref');

  // A single named-parts JSON with palette works for QA, budgets, and reference matching.
  writeFileSync(join(dir, 'tris.json'), JSON.stringify({ parts: { body: wide }, colors: ['#b45a28'] }));
  const qa = run('qa-asset.ts', ['--tris', 'tris.json', '--no-render']);
  assert.equal(qa.status, 0, qa.stdout + qa.stderr);
  assert.deepEqual((parseResult(qa.stdout)?.stats as Record<string, unknown>).parts, { body: 12 });
  const stats = run('mesh-stats.ts', ['--tris', 'tris.json']);
  assert.equal(stats.status, 0, stats.stdout + stats.stderr);
  assert.equal((parseResult(stats.stdout)?.stats as Record<string, unknown>).triangles, 12);
  const ok = run('ref-compare.ts', [singleFile, 'tris.json']); assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.ok(existsSync(join(dir, 'diff-front.png')));
  const okr = parseResult(ok.stdout)!; assert.ok(okr.ok && okr.tool === 'ref-compare' && okr.gates!.length > 0 && okr.gates!.every((g) => g.pass), 'ref-compare result line');
  assert.equal(okr.gates?.find((gate) => gate.gate === 'G3 palette')?.pass, true);
  writeFileSync(join(dir, 'tris.json'), JSON.stringify({ parts: { body: wide, broken: [1, null] } }));
  const malformed = [
    run('qa-asset.ts', ['--tris', 'tris.json', '--no-render']),
    run('mesh-stats.ts', ['--tris', 'tris.json']),
    run('ref-compare.ts', [singleFile, 'tris.json']),
  ];
  for (const error of malformed) {
    assert.equal(error.status, 1);
    assert.match(String(parseResult(error.stdout)?.error), /parts\.broken/);
  }

  writeFileSync(join(dir, 'tris.json'), JSON.stringify({ tris: box(0, 0.5, 0, 1, 1, 1), colors: ['#00ff00'] }));
  const no = run('ref-compare.ts', ['ref.json', 'tris.json']); assert.equal(no.status, 2); assert.match(no.stdout, /FAIL/);
  const nor = parseResult(no.stdout)!; assert.ok(!nor.ok && nor.gates!.some((g) => !g.pass), 'failing compare reports ok:false');
  const miss = run('ref-compare.ts', ['nope.json', 'tris.json']); assert.equal(miss.status, 1); assert.equal(parseResult(miss.stdout)!.ok, false);
  writeFileSync(join(dir, 'invalid-ref.json'), '{}');
  const invalid = run('ref-compare.ts', ['invalid-ref.json', 'tris.json']);
  assert.equal(invalid.status, 1);
  assert.match(String(parseResult(invalid.stdout)?.error), /cannot compare invalid-ref\.json/);

  writeFileSync(join(dir, 'angled-ref.json'), JSON.stringify(angledRef));
  writeFileSync(join(dir, 'tris.json'), JSON.stringify(angledAsset));
  const angled = run('ref-compare.ts', ['angled-ref.json', 'tris.json']);
  assert.equal(angled.status, 0, angled.stdout + angled.stderr);
  assert.deepEqual(parseResult(angled.stdout)?.angles, { '34': frontCamera, '34_back': rearCamera });

  // Uneven 3-view sheet with `back` view + `--grid auto` gap-splitting
  const uneven = rect(600, 120, 20, 20, 220, 100, [40, 80, 180, 255]); // front 200x80 (aspect 2.5)
  for (let y = 20; y < 100; y++) {
    for (let x = 260; x < 300; x++) uneven.set([40, 80, 180, 255], (y * 600 + x) * 4); // side 40x80 (aspect 0.5)
    for (let x = 360; x < 560; x++) uneven.set([40, 80, 180, 255], (y * 600 + x) * 4); // back 200x80 (aspect 2.5)
  }
  writePngRgba(join(dir, 'uneven.png'), uneven, 600, 120);
  const autoPath = join(dir, 'results', 'auto', 'turn3.json');
  const autoRun = run('ref-intake.ts', ['--sheet', 'uneven.png', '--grid', 'auto', '--views', 'front,side,back', '--out', autoPath]);
  assert.equal(autoRun.status, 0, autoRun.stderr + autoRun.stdout);
  checkMasks(autoRun.stdout, autoPath, ['front', 'side', 'back'], 'turn3');
  const autoViews = (parseResult(autoRun.stdout)!.views as Record<string, { aspect: number }>);
  assert.ok(Math.abs(autoViews.front.aspect - 2.5) < 0.05);
  assert.ok(Math.abs(autoViews.side.aspect - 0.5) < 0.05);
  assert.ok(Math.abs(autoViews.back.aspect - 2.5) < 0.05);
  console.log('Reference CLI OK: nested single and sheet masks, shared triangle JSON, and both angled views');
}
console.log('REFCHECK OK');
