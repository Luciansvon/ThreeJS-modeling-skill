// npx tsx scripts/color-qc.test.ts
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  calculateDeltaE00,
  evaluateRegionalColorQC,
  extractROIStats,
  hexToRgb,
  rgbToLab,
  sampleModelRegionColors,
  sampleRenderRegion,
  type SemanticRegionRef,
} from './color-qc';
import { writePngRgba } from './png';
import { compareToRef, maskToB64, silhouette } from './refcheck';
import { parseResult, spawnTsx } from './result';

const here = dirname(fileURLToPath(import.meta.url));
const boxTris = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
  const x = [cx - sx / 2, cx + sx / 2], y = [cy - sy / 2, cy + sy / 2], z = [cz - sz / 2, cz + sz / 2];
  const P = (i: number, j: number, k: number) => [x[i], y[j], z[k]];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d];
  return [
    ...quad(P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)),
    ...quad(P(1, 0, 0), P(0, 0, 0), P(0, 1, 0), P(1, 1, 0)),
    ...quad(P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)),
    ...quad(P(1, 0, 1), P(1, 0, 0), P(1, 1, 0), P(1, 1, 1)),
    ...quad(P(0, 1, 1), P(1, 1, 1), P(1, 1, 0), P(0, 1, 0)),
    ...quad(P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)),
  ];
};

// 0. Core CIEDE2000 & ROI stats parity checks (Sharma et al. 2005 published vector = 2.0425)
{
  const sharma = calculateDeltaE00({ l: 50, a: 2.6772, b: -79.7751 }, { l: 50, a: 0, b: -82.7485 });
  assert.ok(Math.abs(sharma - 2.0425) < 1e-4, `Sharma 2005 vector expected 2.0425, got ${sharma}`);
  const blue = rgbToLab({ r: 34, g: 85, b: 204 });
  assert.equal(calculateDeltaE00(blue, blue), 0);
  const red = rgbToLab({ r: 217, g: 43, b: 43 });
  assert.ok(calculateDeltaE00(blue, red) > 40, 'distinct hues have large CIEDE2000 (~44.8)');

  const rgba = new Uint8Array([
    34, 85, 204, 255,
    34, 85, 204, 255,
    255, 0, 0, 0, // transparent pixel must be ignored
  ]);
  const stats = extractROIStats(rgba);
  assert.equal(stats.pixelCount, 2);
  assert.deepEqual(stats.meanRgb, { r: 34, g: 85, b: 204 });
}

const semanticRefs: SemanticRegionRef[] = [
  { region: 'body', label: 'blue', hex: '#2255cc', status: 'confident' },
  { region: 'belly', label: 'white', hex: '#f4f4f4', status: 'confident' },
  { region: 'horns', label: 'yellow', hex: '#f2c94c', status: 'confident' },
  { region: 'eyes', label: 'red', hex: '#d92b2b', status: 'confident', emissive: true },
];

function buildCreature(map: Record<string, string>, mode: 'material' | 'vertex-color' | 'texture' = 'material') {
  const root = new THREE.Group();
  root.name = 'creature_root';

  if (mode === 'material') {
    for (const [part, hex] of Object.entries(map)) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.85 }),
      );
      m.name = `${part}_mesh`;
      root.add(m);
    }
    return root;
  }

  if (mode === 'vertex-color') {
    for (const [part, hex] of Object.entries(map)) {
      const g = new THREE.BoxGeometry(0.4, 0.4, 0.4).toNonIndexed();
      const c = new THREE.Color(hex);
      const count = g.attributes.position.count;
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
      m.name = part;
      root.add(m);
    }
    return root;
  }

  // Texture atlas: 4x1 RGBA DataTexture where each part maps its UVs (U axis) cleanly into its own swatch
  const parts = Object.entries(map);
  const w = Math.max(1, parts.length);
  const data = new Uint8Array(w * 4);
  parts.forEach(([, hex], idx) => {
    const { r, g, b } = hexToRgb(hex);
    data.set([r, g, b, 255], idx * 4);
  });
  const tex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  parts.forEach(([part], idx) => {
    const g = new THREE.BoxGeometry(0.4, 0.4, 0.4).toNonIndexed();
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (idx + 0.5) / w, 0.5);
    }
    const m = new THREE.Mesh(g, mat);
    m.name = part;
    root.add(m);
  });
  return root;
}

// 1. Matching colors on right regions -> G3 PASS & G4 PASS across Material, Vertex Color, AND Texture Atlas
const matchedPalette = { body: '#2255cc', belly: '#f4f4f4', horns: '#f2c94c', eyes: '#d92b2b' };
for (const kind of ['material', 'vertex-color', 'texture'] as const) {
  const model = buildCreature(matchedPalette, kind);
  const samples = sampleModelRegionColors(model, semanticRefs);
  for (const r of semanticRefs) assert.equal(samples[r.region]?.source, kind, `expected ${kind} extraction`);
  const g4 = evaluateRegionalColorQC(semanticRefs, samples, { mode: 'balance' });
  assert.equal(g4.status, 'PASS', `${kind} matching colors must PASS G4: ${g4.reason}`);
  assert.ok(g4.maxDeltaE00 <= 0.5, `exact color round-trip ΔE00 should be ~0, got ${g4.maxDeltaE00}`);
}

// 2. Crucial test: SAME global palette, SWAPPED region colors -> G3 PASS, G4 FAIL!
{
  const swappedPalette = { body: '#f4f4f4', belly: '#2255cc', horns: '#d92b2b', eyes: '#f2c94c' };
  const swappedModel = buildCreature(swappedPalette, 'vertex-color');
  const samples = sampleModelRegionColors(swappedModel, semanticRefs);

  // Build synthetic ref.json where G3 sees the exact same global palette
  const geom = boxTris(0, 0.5, 0, 1, 1, 1);
  const frontSil = silhouette(geom, 'front');
  const g3Result = compareToRef(
    geom,
    {
      views: { front: { w: 64, h: 64, data: maskToB64(frontSil.mask), aspect: frontSil.aspect } },
      palette: semanticRefs.map((r) => ({ hex: r.hex!, share: 0.25 })),
    },
    Object.values(swappedPalette),
  );
  assert.equal(g3Result.gates.find((g) => g.gate === 'G3 palette')?.pass, true, 'G3 cannot catch region swap when global palette matches');

  const g4Swap = evaluateRegionalColorQC(semanticRefs, samples, { mode: 'quality' });
  assert.equal(g4Swap.status, 'FAIL', 'G4 MUST catch swapped region colors');
  assert.equal(g4Swap.failed, 4);
  assert.equal(g4Swap.gate?.pass, false);
  for (const name of ['body', 'belly', 'horns', 'eyes']) {
    assert.match(g4Swap.gate!.value, new RegExp(name), `gate summary should name failing region ${name}`);
  }
}

// 3. Lighting variance immunity
{
  // (a) Live scene lights changed dramatically -> Priority 1 reads base material/vertex color cleanly
  const dimScene = new THREE.Scene();
  dimScene.add(new THREE.DirectionalLight(0x223355, 0.2), buildCreature(matchedPalette, 'material'));
  const brightScene = new THREE.Scene();
  brightScene.add(new THREE.DirectionalLight(0xffeedd, 5.0), buildCreature(matchedPalette, 'material'));
  const g4Dim = evaluateRegionalColorQC(semanticRefs, sampleModelRegionColors(dimScene, semanticRefs), { mode: 'balance' });
  const g4Bright = evaluateRegionalColorQC(semanticRefs, sampleModelRegionColors(brightScene, semanticRefs), { mode: 'balance' });
  assert.equal(g4Dim.status, 'PASS');
  assert.equal(g4Bright.status, 'PASS');
  assert.equal(g4Dim.maxDeltaE00, g4Bright.maxDeltaE00);

  // (b) Priority 3 render fallback: pure exposure shift (dimmed blue) passes with lightingOnlyWarning, real hue swap fails
  const makeSolidRgba = (r: number, g: number, b: number) => {
    const buf = new Uint8Array(10 * 10 * 4);
    for (let i = 0; i < 100; i++) buf.set([r, g, b, 255], i * 4);
    return buf;
  };
  const shadedBlue = sampleRenderRegion('body', makeSolidRgba(16, 40, 98), 10, 10, { x: 0, y: 0, width: 100, height: 100 });
  const g4RenderLight = evaluateRegionalColorQC([semanticRefs[0]], { body: shadedBlue }, { mode: 'balance' });
  assert.equal(g4RenderLight.status, 'PASS', `exposure shift should not fail G4: ${g4RenderLight.reason}`);
  assert.equal(g4RenderLight.regions[0].lightingOnlyWarning, true);

  const greenBody = sampleRenderRegion('body', makeSolidRgba(34, 180, 75), 10, 10, { x: 0, y: 0, width: 100, height: 100 });
  const g4RenderHueFail = evaluateRegionalColorQC([semanticRefs[0]], { body: greenBody }, { mode: 'balance' });
  assert.equal(g4RenderHueFail.status, 'FAIL', 'real hue mismatch on render must still FAIL');
}

// 4. Incomplete / uncertain reference & unreadable texture -> SKIPPED (never PASS)
{
  const incomplete: SemanticRegionRef[] = [
    { region: 'body', hex: '#2255cc', status: 'confident' },
    { region: 'horns', label: 'unknown', status: 'uncertain' },
  ];
  const g4Partial = evaluateRegionalColorQC(incomplete, sampleModelRegionColors(buildCreature({ body: '#2255cc' }), incomplete), { mode: 'balance' });
  assert.equal(g4Partial.status, 'PASS');
  assert.equal(g4Partial.skipped, 1);

  const g4AllUncertain = evaluateRegionalColorQC([{ region: 'horns', status: 'uncertain' }], {}, { mode: 'balance' });
  assert.equal(g4AllUncertain.status, 'SKIPPED');

  const g4Empty = evaluateRegionalColorQC([], {}, { mode: 'quality' });
  assert.equal(g4Empty.status, 'SKIPPED');

  const unreadableTex = new THREE.Texture(); // no .image.data buffer
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: unreadableTex }));
  m.name = 'body';
  root.add(m);
  const g4Unreadable = evaluateRegionalColorQC([semanticRefs[0]], sampleModelRegionColors(root, [semanticRefs[0]]), { mode: 'balance' });
  assert.equal(g4Unreadable.status, 'SKIPPED');
  assert.equal(g4Unreadable.regions[0].reason, 'material.map has no readable pixel buffer in current runtime');

  const g4BadHex = evaluateRegionalColorQC([{ region: 'body', hex: 'not-a-hex' }], { body: { region: 'body', hex: '#2255cc', source: 'declared' } }, { mode: 'balance' });
  assert.equal(g4BadHex.status, 'ERROR');
}

// 5. Fast/Quick mode policy + isolated CPU overhead benchmark vs G3-only
{
  const model = buildCreature(matchedPalette, 'vertex-color');
  const fastRes = evaluateRegionalColorQC(semanticRefs, {}, { mode: 'fast' });
  assert.equal(fastRes.status, 'SKIPPED');
  const quickRes = evaluateRegionalColorQC(semanticRefs, {}, { mode: 'quick' });
  assert.equal(quickRes.status, 'SKIPPED');

  const frontSil = silhouette(boxTris(0, 0.5, 0, 1, 1, 1), 'front');
  const g3Ref = { views: {}, palette: semanticRefs.map((r) => ({ hex: r.hex!, share: 0.25 })) };
  const tris = boxTris(0, 0.5, 0, 1, 1, 1);
  const used = Object.values(matchedPalette);
  const N = 500;

  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    compareToRef(tris, g3Ref, used);
  }
  const g3Ms = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < N; i++) {
    compareToRef(tris, g3Ref, used);
    const samples = sampleModelRegionColors(model, semanticRefs);
    evaluateRegionalColorQC(semanticRefs, samples, { mode: 'balance' });
  }
  const g3PlusG4Ms = performance.now() - t1;
  const g4OnlyPerRunMs = (g3PlusG4Ms - g3Ms) / N;
  const fastPerRunMs = (() => {
    const s = performance.now();
    for (let i = 0; i < N; i++) evaluateRegionalColorQC(semanticRefs, {}, { mode: 'fast' });
    return (performance.now() - s) / N;
  })();

  console.log(`BENCHMARK (${N} runs): G3-only=${(g3Ms / N).toFixed(4)}ms/run | G3+G4=${(g3PlusG4Ms / N).toFixed(4)}ms/run | G4-overhead=${g4OnlyPerRunMs.toFixed(4)}ms/run | Fast-skip=${fastPerRunMs.toFixed(6)}ms/run | front=${frontSil.mask.w}x${frontSil.mask.h}`);
  assert.ok(g4OnlyPerRunMs < 2.0, `G4 pure overhead must stay lightweight (< 2ms/run), got ${g4OnlyPerRunMs.toFixed(3)}ms`);
  assert.ok(fastPerRunMs < 0.05, `Fast skip must have ~0 overhead, got ${fastPerRunMs.toFixed(4)}ms`);
}

// 6. CLI End-to-End: ref-intake --regions ROI caching + ref-compare --module across modes fast vs balance
{
  const dir = mkdtempSync(join(tmpdir(), 'g4-cli-'));
  try {
    // Paint 100x100 ref PNG with upper-half blue (body) and lower-half yellow (horns)
    const png = new Uint8Array(100 * 100 * 4);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        const bg = x < 10 || x >= 90 || y < 10 || y >= 90;
        const c = bg ? [255, 255, 255, 255] : y < 50 ? [34, 85, 204, 255] : [242, 201, 76, 255];
        png.set(c, (y * 100 + x) * 4);
      }
    }
    writePngRgba(join(dir, 'ref.png'), png, 100, 100);
    writeFileSync(join(dir, 'regions.json'), JSON.stringify([
      { region: 'body', roi: { view: 'front', x: 25, y: 20, width: 50, height: 20 } },
      { region: 'horns', roi: { view: 'front', x: 25, y: 60, width: 50, height: 20 } },
      { region: 'belly', status: 'uncertain' },
    ]));

    const intake = spawnTsx(join(here, 'ref-intake.ts'), ['front=ref.png', '--regions', 'regions.json', '--out', 'ref.json'], { cwd: dir });
    assert.equal(intake.status, 0, intake.stdout + intake.stderr);
    const refJson = JSON.parse(readFileSync(join(dir, 'ref.json'), 'utf8'));
    assert.equal(refJson.regions[0].hex, '#2255cc');
    assert.equal(refJson.regions[1].hex, '#f2c94c');
    assert.equal(refJson.regions[2].status, 'uncertain');
    assert.ok(typeof refJson.regionCacheKey === 'string' && refJson.regionCacheKey.startsWith('regions-'));

    writeFileSync(join(dir, 'model.ts'), `
      export function build(params: { swap?: boolean }, THREE: any) {
        const root = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), new THREE.MeshStandardMaterial({ color: params.swap ? '#f2c94c' : '#2255cc' }));
        body.name = 'body';
        body.position.y = 0.6;
        const horns = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), new THREE.MeshStandardMaterial({ color: params.swap ? '#2255cc' : '#f2c94c' }));
        horns.name = 'horns';
        horns.position.y = 0.2;
        root.add(body, horns);
        return root;
      }
    `);

    const fastSwapped = spawnTsx(join(here, 'ref-compare.ts'), ['ref.json', '--module', 'model.ts', '--params', '{"swap":true}', '--mode', 'fast'], { cwd: dir });
    assert.equal(fastSwapped.status, 0, fastSwapped.stdout + fastSwapped.stderr);
    assert.equal(parseResult(fastSwapped.stdout)?.g4?.status, 'SKIPPED');

    const balMatch = spawnTsx(join(here, 'ref-compare.ts'), ['ref.json', '--module', 'model.ts', '--mode', 'balance'], { cwd: dir });
    assert.equal(balMatch.status, 0, balMatch.stdout + balMatch.stderr);
    assert.equal((parseResult(balMatch.stdout)?.g4 as { status: string })?.status, 'PASS');

    const balSwapped = spawnTsx(join(here, 'ref-compare.ts'), ['ref.json', '--module', 'model.ts', '--params', '{"swap":true}', '--mode', 'balance'], { cwd: dir });
    assert.equal(balSwapped.status, 2, balSwapped.stdout + balSwapped.stderr);
    const swapJson = parseResult(balSwapped.stdout)!;
    assert.equal((swapJson.g4 as { status: string })?.status, 'FAIL');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('COLOR-QC OK');
