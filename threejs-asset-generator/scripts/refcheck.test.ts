// npx tsx refcheck.test.ts   (the CLI part needs `sharp` and tsx on PATH; it is skipped when sharp is missing)
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadSharp } from './sharp';
import { parseResult } from './result';
import { silhouette, maskIoU, bestIoU, maskFromRGBA, keepLargest, flipH, dominantColors, paletteGap, proportions, compareToRef, maskToB64, frameMask, type Tris, type Mask } from './refcheck';

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
// whole gate run: right model passes, wrong model fails with a hint
const ref = { views: { front: { w: 64, h: 64, data: maskToB64(ir.mask), aspect: ir.aspect } }, palette: dc, proportions: { w: 2 } };
const good = compareToRef(wide, ref, ['#c82828', '#2828c8', '#fafafa']); assert.ok(good.gates.every((g) => g.pass), JSON.stringify(good.gates));
const bad = compareToRef(box(0, 0.5, 0, 1, 1, 1), ref, ['#00ff00']); assert.ok(bad.gates.filter((g) => !g.pass).length >= 3);
assert.ok(bad.diffs.front!.length === 64 * 64 * 4);

// CLI end-to-end (needs sharp + tsx)
const sharp = await loadSharp();
if (sharp) {
  const dir = mkdtempSync(join(tmpdir(), 'refcheck-')), here = new URL('.', import.meta.url).pathname;
  const png = rect(300, 200, 30, 50, 270, 170, [180, 90, 40, 255]); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) png.set([0, 0, 0, 255], (y * 300 + x) * 4);
  await sharp(png, { raw: { width: 300, height: 200, channels: 4 } }).png().toFile(join(dir, 'ref.png'));
  const run = (file: string, args: string[]) => spawnSync('tsx', [join(here, file), ...args], { cwd: dir, encoding: 'utf8', env: process.env });
  const a = run('ref-intake.ts', ['front=ref.png', '--out', 'ref.json', '--w', '2']); assert.equal(a.status, 0, a.stderr + a.stdout); assert.ok(existsSync(join(dir, 'ref-front-mask.png')));
  assert.match(a.stdout, /aspect 2\.00/); assert.match(a.stdout, /#b45a28/);
  const ar = parseResult(a.stdout)!; assert.ok(ar.ok && ar.tool === 'ref-intake' && Math.abs((ar.views as any).front.aspect - 2) < 0.05, 'ref-intake result line');
  writeFileSync(join(dir, 'tris.json'), JSON.stringify({ tris: box(0, 0.5, 0, 2, 1, 1), colors: ['#b45a28'] }));
  const ok = run('ref-compare.ts', ['ref.json', 'tris.json']); assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.ok(existsSync(join(dir, 'diff-front.png')));
  const okr = parseResult(ok.stdout)!; assert.ok(okr.ok && okr.tool === 'ref-compare' && okr.gates!.length > 0 && okr.gates!.every((g) => g.pass), 'ref-compare result line');
  writeFileSync(join(dir, 'tris.json'), JSON.stringify({ tris: box(0, 0.5, 0, 1, 1, 1), colors: ['#00ff00'] }));
  const no = run('ref-compare.ts', ['ref.json', 'tris.json']); assert.equal(no.status, 2); assert.match(no.stdout, /FAIL/);
  const nor = parseResult(no.stdout)!; assert.ok(!nor.ok && nor.gates!.some((g) => !g.pass), 'failing compare reports ok:false');
  const miss = run('ref-compare.ts', ['nope.json', 'tris.json']); assert.equal(miss.status, 1); assert.equal(parseResult(miss.stdout)!.ok, false);
  console.log('CLI OK');
}
else console.log('(sharp missing: CLI test skipped)');
console.log('REFCHECK OK');
