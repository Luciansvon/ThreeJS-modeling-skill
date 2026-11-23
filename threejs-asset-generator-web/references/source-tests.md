# Test source and third-party notices

Contents: src/biped.test.ts · src/creatures.test.ts · src/detail.pure.test.ts · src/detailThree.test.ts · src/lod.test.ts · src/qa.kernel.test.ts · src/skinnedRig.test.ts · src/voxel.test.ts · scripts/art-styles.test.ts · scripts/budget.test.ts · scripts/color-qc.test.ts · scripts/glb.test.ts · scripts/qacheck.test.ts · scripts/refcheck.test.ts · scripts/rigcheck.test.ts · scripts/studio.test.ts · tools/tools.test.ts · tools/trigger-cases.json · THIRD_PARTY_NOTICES.md

Generated from the canonical harness files. Search by original file path and use the [web runtime guide](runtime.md) to choose which commands or helpers to use in this session.

## src/biped.test.ts

~~~typescript source-excerpt
import assert from 'node:assert/strict';
import { signedVolumeOf, mirrorTris } from './tri';
import { extrudeTris, ngon, boxTris, footTris, handTris, earTris, eyeTris, noseTris, sleeveTris, twoBoneIK, bipedRest, loftTris, frameFrom } from './biped';
import { tubeTris } from './organic';

const closed: Record<string, number[]> = {
  extrudeX: extrudeTris(ngon(6, 0.3), [0, 0, 0], [1, 0, 0], 1, { taper: 0.5, bevel: 0.2 }),
  extrudeDown: extrudeTris(ngon(5, 0.3), [0, 1, 0], [0, -1, 0], 1),
  extrudeAny: extrudeTris(ngon(7, 0.3, 0.2), [1, 2, 3], [0.3, 0.5, -0.8], 2, { taper: [0.4, 0.8], bevel: 0.1 }),
  box: boxTris([0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 2, 3]),
  foot: footTris([0, 0, 0], [0, 0, 1], 0.4, 0.2, 0.15),
  hand: handTris([0, 1, 0], [0.4, -1, 0], 0.2, 0.1, 0.05),
  eye: eyeTris([0, 0, 0], [0, 0, 1], 0.05),
  nose: noseTris([0, 0, 0], [0, 0, 1], 0.1, 0.06),
  earShell: earTris([0, 0, 0], [1, 0, 0], 0.3, 0.12).shell,
  earInner: earTris([0, 0, 0], [1, 0, 0], 0.3, 0.12).inner,
  sleeve: sleeveTris([[0, 2, 0], [0.3, 1.5, 0], [0.5, 1, 0.1]], (t) => 0.1 - 0.04 * t, 0.1, 0.7, 0.02, 8, (a) => 1 + 0.2 * Math.cos(a * 4)),
  ribbed: tubeTris([[0, 0, 0], [0, 1, 0], [0, 2, 0]], [0.2, 0.2, 0.2], 12, true, (a) => 1 + 0.15 * Math.cos(a * 6)),
};
for (const [k, t] of Object.entries(closed)) {
  const v = signedVolumeOf(t);
  assert.ok(v > 0, `${k} inside-out or open: ${v}`);
  assert.ok(Math.abs(signedVolumeOf(mirrorTris(t)) - v) < 1e-9, `${k} mirror`);
}
// analytic check: unit square prism 1x1x2 -> volume 2*... box 1x2x3 = 6
assert.ok(Math.abs(signedVolumeOf(closed.box) - 6) < 1e-9, 'box volume');
// frame is right-handed and orthonormal
for (const d of [[0, 0, 1], [0, 1, 0], [0, -1, 0], [1, 1, 1]] as const) {
  const f = frameFrom([...d] as any), c = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
  c.forEach((x, i) => assert.ok(Math.abs(x - f.d[i]) < 1e-9));
}
// IK keeps bone lengths
const root: [number, number, number] = [0, 1, 0], tgt: [number, number, number] = [0.2, 0.2, 0.4];
const knee = twoBoneIK(root, tgt, 0.5, 0.5, [0, 0, 1]);
const L = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
assert.ok(Math.abs(L(root, knee) - 0.5) < 1e-9 && Math.abs(L(knee, tgt) - 0.5) < 1e-9 && knee[2] > 0.1, 'ik');
const far = twoBoneIK(root, [0, -5, 0], 0.5, 0.5, [0, 0, 1]);
assert.ok(Math.abs(L(root, far) - 0.5) < 1e-6, 'ik clamp');
const rest = bipedRest({ height: 1.1, legRatio: 0.38, armRatio: 0.4, headRatio: 0.3, bulk: 1 });
assert.ok(rest.footL[1] === 0 && rest.head[1] > rest.neck[1] && rest.handL[0] > rest.shoulderL[0]);
assert.deepEqual(rest, bipedRest({ height: 1.1, legRatio: 0.38, armRatio: 0.4, headRatio: 0.3, bulk: 1 }));
console.log('ok', Object.keys(closed).length, 'closed kernels');

// shape param of tubeTris must change the geometry (v3 silently ignored it)
{
  const path: [number, number, number][] = [[0, 0, 0], [0, 1, 0], [0, 2, 0]];
  const plain = tubeTris(path, [0.2, 0.2, 0.2], 12, true);
  const ribbed = tubeTris(path, [0.2, 0.2, 0.2], 12, true, (a) => 1 + 0.15 * Math.cos(a * 6));
  assert(JSON.stringify(plain) !== JSON.stringify(ribbed), 'shape ignored');
  assert(signedVolumeOf(ribbed) > 0, 'ribbed tube inside-out');
}
console.log('shape OK');
~~~

## src/creatures.test.ts

~~~typescript source-excerpt
import assert from 'node:assert/strict';
import { createPRNG } from './prng';
import { resolveParams } from './params';
import { signedVolumeOf, mirrorTris } from './tri';
import { tubeTris, tubeTrisWithT, planarBladeTris, radialArrayTris } from './organic';
import { dragonParameters, buildDragonKernel } from './dragonKernel';

const kernel = (o = {}) => {
  const p = resolveParams({ parameters: dragonParameters }, { seed: 7, ...o });
  return buildDragonKernel(p, createPRNG(p.seed as number));
};
const k = kernel();

assert.deepEqual(k, kernel());                                              // same seed, same triangles
for (const name of ['body', 'spikes', 'legs'] as const)                     // closed parts only; sheets have no volume
  assert.ok(signedVolumeOf(k[name]) > 0, `${name} is inside-out or open`);
assert.ok(Math.abs(signedVolumeOf(mirrorTris(k.legs)) - signedVolumeOf(k.legs)) < 1e-9);   // mirror keeps winding
assert.deepEqual(kernel({ hasSpikes: false }).body, kernel({ hasSpikes: true }).body);     // stream isolation

// v4.2 helpers: tubeTris upHint on vertical curve, planarBladeTris stays thin in X, radialArrayTris preserves volume
const vTube = tubeTris([[0, 0, 0], [0, 0.5, -0.02], [0, 1.0, -0.05]], [0.1, 0.08, 0.04], 6, true, undefined, [0, 0, 1]);
assert.ok(signedVolumeOf(vTube) > 0, 'vertical tubeTris with upHint has positive volume');

const blade = planarBladeTris([0, 0, 0], [0, 0.4, -0.1], [0, 0.85, -0.35], 0.025, 0.14, 0.10, [1, 0, 0]);
assert.ok(signedVolumeOf(blade) > 0, 'planarBladeTris is closed with outward CCW winding');
let maxAbsX = 0; for (let i = 0; i < blade.length; i += 3) maxAbsX = Math.max(maxAbsX, Math.abs(blade[i]));
assert.ok(maxAbsX <= 0.026, `planarBladeTris stays razor-thin in X (got ${maxAbsX})`);

const singleLeg = tubeTris([[0.3, 0.4, 0], [0.7, 0.5, 0], [0.9, 0, 0]], [0.06, 0.045, 0.025], 6);
const spider8 = radialArrayTris(singleLeg, 8, 1);
assert.equal(spider8.length, singleLeg.length * 8, 'radialArrayTris duplicates triangles 8x');
assert.ok(Math.abs(signedVolumeOf(spider8) - signedVolumeOf(singleLeg) * 8) < 1e-6, 'radialArrayTris preserves outward winding');

// v4.3.1: tubeTrisWithT preserves exact curve parameter t even on folded/overlapping paths
const foldedPath: [number, number, number][] = [[0, 0, 0], [0, 0, -1], [0, 0.5, -1], [0, 0, 0]];
const foldedArgs = [foldedPath, [0.08, 0.08, 0.08, 0.08], 6, true] as const;
const withT = tubeTrisWithT(...foldedArgs);
assert.deepEqual(withT.tris, tubeTris(...foldedArgs), 'tubeTrisWithT matches tubeTris geometry');
assert.equal(withT.vertexT.length, withT.tris.length / 3, 'vertexT has 1 entry per triangle vertex');
assert.ok(withT.vertexT.every((t) => t >= 0 && t <= 1), 'every vertexT is normalized to [0, 1]');
const capTriCount = 6;
const capStartOffset = withT.vertexT.length - capTriCount * 6;
for (let j = 0; j < capTriCount; j++) {
  const sIdx = capStartOffset + j * 6;
  assert.deepEqual(withT.vertexT.slice(sIdx, sIdx + 3), [0, 0, 0], 'start cap keeps t=0 even where folded end overlaps');
  assert.deepEqual(withT.vertexT.slice(sIdx + 3, sIdx + 6), [1, 1, 1], 'end cap keeps t=1 even where folded end overlaps');
}
~~~

## src/detail.pure.test.ts

~~~typescript source-excerpt
// detail.pure.test.ts: Node only. Needs just tri.ts and detail.ts (no three installed). Run: npx tsx detail.pure.test.ts
import assert from 'node:assert/strict';
import { signedVolumeOf, mirrorTris } from './tri';
import { chamferBoxTris, tubeWithUV, latheWithUV, loftSculptedBody, sculptFalloff, atlasRect, raycastTris, scatterOnSurface, placeTris, mirrorHit, aoFactor, paintAtlas, ATLAS_UNUSED, type AtlasCell, type Rng } from './detail';

const rngOf = (s: number): Rng => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const nrm = (t: number[], i: number) => { const a = [t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]], b = [t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]]; const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const l = Math.hypot(...n) || 1; return n.map((v) => v / l); };
const triArea = (t: number[], i: number) => { const a = [t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]], b = [t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]]; return Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2; };

// chamfer box
const cb = chamferBoxTris([0, 0, 0], [2, 2, 2], 0.3);
assert.equal(cb.length / 9, 44);
const v = signedVolumeOf(cb); assert.ok(v > 7 && v < 8, `chamfer vol ${v}`);
assert.ok(signedVolumeOf(chamferBoxTris([1, 2, 3], [1, 2, 3], 0.2)) > 0);
assert.ok(Math.abs(signedVolumeOf(mirrorTris(cb)) - v) < 1e-9);
// bevel = 0 is a plain 12-triangle box with no zero-area triangles; a bad bevel or size throws
const flat = chamferBoxTris([0, 0, 0], [1, 1, 1], 0);
assert.equal(flat.length / 9, 12); assert.ok(Math.abs(signedVolumeOf(flat) - 1) < 1e-9);
for (let i = 0; i < flat.length; i += 9) assert.ok(triArea(flat, i) > 1e-6, 'no degenerate triangle');
for (let i = 0; i < cb.length; i += 9) assert.ok(triArea(cb, i) > 1e-6, 'no degenerate triangle');
assert.throws(() => chamferBoxTris([0, 0, 0], [1, 1, 1], -0.1), RangeError);
assert.throws(() => chamferBoxTris([0, 0, 0], [1, 1, 1], NaN), RangeError);
assert.throws(() => chamferBoxTris([0, 0, 0], [1, 0, 1], 0.1), RangeError);
assert.ok(chamferBoxTris([0, 0, 0], [1, 1, 1], 5).length / 9 === 44 && signedVolumeOf(chamferBoxTris([0, 0, 0], [1, 1, 1], 5)) > 0, 'huge bevel is clamped, not broken');
// tube + lathe uv
const tu = tubeWithUV([[0, 0, 0], [0, 1, 0], [0, 2, 0]], [0.2, 0.3, 0.2], 8);
assert.equal(tu.uv.length / 2, tu.tris.length / 3); assert.ok(signedVolumeOf(tu.tris) > 0);
const la = latheWithUV([[0.001, 0], [0.5, 0.2], [0.4, 1], [0.001, 1.2]], 10);
assert.equal(la.uv.length / 2, la.tris.length / 3); assert.ok(signedVolumeOf(la.tris) > 0, 'lathe winding');
assert.ok(signedVolumeOf(latheWithUV([[0.4, 0], [0.5, 0.5], [0.3, 1]], 8).tris) > 0, 'capped lathe');
const cell = atlasRect(5, 4); const tc = tubeWithUV([[0, 0, 0], [0, 1, 0]], [0.2, 0.2], 6, true, cell);
for (let i = 0; i < tc.uv.length; i += 2) { assert.ok(tc.uv[i] >= cell.u0 - 1e-9 && tc.uv[i] <= cell.u1 + 1e-9 && tc.uv[i + 1] >= cell.v0 - 1e-9 && tc.uv[i + 1] <= cell.v1 + 1e-9); }
// sculpted body
const spine: [number, number, number][] = Array.from({ length: 9 }, (_, i) => [0, 1, i * 0.25]);
const plain = loftSculptedBody(spine, () => 0.3, () => 0.2, [], 12);
const bumped = loftSculptedBody(spine, () => 0.3, () => 0.2, [{ t: 0.5, width: 0.3, amount: 0.4, angle: Math.PI * 1.5 }], 12);
assert.ok(signedVolumeOf(plain.tris) > 0 && signedVolumeOf(bumped.tris) > signedVolumeOf(plain.tris));
assert.deepEqual(loftSculptedBody(spine, () => 0.3, () => 0.2, [], 12), plain);
assert.equal(sculptFalloff(0.5, 0.5, 0.2), 1); assert.equal(sculptFalloff(0.9, 0.5, 0.2), 0);
// AO
assert.equal(aoFactor([0, 0, 0], [0, 1, 0], {}), 1);
assert.ok(aoFactor([0, 0, 0], [0, -1, 0], { downBias: 0.5 }) < 1);
assert.ok(aoFactor([0, 0, 0], [0, 1, 0], { zones: [{ at: [0, 0, 0], radius: 1, strength: 5 }] }) >= 0.35);
// sockets
const sphere = signedVolumeOf(latheWithUV(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI; return [Math.max(Math.sin(a), 0.0005), -Math.cos(a)] as [number, number]; }), 16).tris);
assert.ok(sphere > 0);
const S = latheWithUV(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI; return [Math.max(Math.sin(a), 0.0005), -Math.cos(a)] as [number, number]; }), 16).tris;
const hit = raycastTris(S, [0, 0, 0], [0, 1, 0.0001])!; assert.ok(hit && Math.abs(hit.point[1] - 1) < 0.02 && hit.normal[1] > 0.9, JSON.stringify(hit));
const hits = scatterOnSurface(S, rngOf(9), 12, { filter: (_p, n) => n[1] > 0.3, minDist: 0.2 });
assert.ok(hits.length >= 4 && hits.every((h) => h.normal[1] > 0.3));
assert.deepEqual(hits, scatterOnSurface(S, rngOf(9), 12, { filter: (_p, n) => n[1] > 0.3, minDist: 0.2 }));
const bump = chamferBoxTris([0, 0.5, 0], [1, 1, 1], 0.2);            // base on y = 0, pointing +Y
const h0 = hits[0], placed = placeTris(bump, h0, { scale: 0.1, sink: 0.2, spin: 0.7 });
assert.ok(signedVolumeOf(placed) > 0, 'placed winding'); assert.ok(Math.abs(signedVolumeOf(placed) - signedVolumeOf(bump) * 0.001) < 1e-9);
const ctr = [0, 1, 2].map((k) => placed.filter((_, i) => i % 3 === k).reduce((a, b) => a + b, 0) / (placed.length / 3));
const radial = Math.hypot(ctr[0], ctr[1], ctr[2]); assert.ok(radial > 0.99 && radial < 1.08, `detail sits on surface: ${radial}`);   // not floating, not buried
assert.ok(signedVolumeOf(placeTris(bump, mirrorHit(h0, 0), { scale: 0.1 })) > 0);

// atlas (paintAtlas is pure bytes)
{
const cellPx = 16, cols = 2;
const cellPixels = (a: ReturnType<typeof paintAtlas>, ci: number) => {
  const out: number[] = [], cx0 = (ci % cols) * cellPx, cy0 = Math.floor(ci / cols) * cellPx;
  for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
    const o = ((a.H - 1 - (cy0 + y)) * a.W + (cx0 + x)) * 4;
    out.push(a.color[o], a.color[o + 1], a.color[o + 2], a.rough[o + 1], a.bump[o + 1]);
  }
  return out;
};

// #4: unused slots (3 cells in a 2x2 grid) are opaque grey, not transparent black
const three: AtlasCell[] = [{ kind: 'gills', base: 0xd8c8a8 }, { kind: 'spots', base: 0xb03030, accent: 0xf0e0d0 }, { kind: 'fur', base: 0x805030 }];
const A = paintAtlas(rngOf(3), three, cols, cellPx);
const un = cellPixels(A, 3);
assert.ok(un.every((v, i) => v === [0x80, 0x80, 0x80, Math.round(255 * ATLAS_UNUSED.rough), Math.round(255 * ATLAS_UNUSED.bump)][i % 5]), 'unused cell is neutral grey');
for (let i = 3; i < A.color.length; i += 4) assert.equal(A.color[i], 255, 'alpha is 255 everywhere');
for (let i = 3; i < A.rough.length; i += 4) assert.equal(A.rough[i], 255);
for (let i = 3; i < A.bump.length; i += 4) assert.equal(A.bump[i], 255);

// determinism
assert.deepEqual(paintAtlas(rngOf(3), three, cols, cellPx), A);
assert.notDeepEqual(paintAtlas(rngOf(4), three, cols, cellPx).color, A.color);

// #6: stream isolation. Changing cell 1 (pattern, density, colour) leaves cells 0 and 2 byte-identical.
const changed: AtlasCell[] = [three[0], { kind: 'noise', base: 0x123456, density: 40 }, three[2]];
const B = paintAtlas(rngOf(3), changed, cols, cellPx);
assert.deepEqual(cellPixels(B, 0), cellPixels(A, 0), 'cell 0 unchanged');
assert.deepEqual(cellPixels(B, 2), cellPixels(A, 2), 'cell 2 unchanged');
assert.notDeepEqual(cellPixels(B, 1), cellPixels(A, 1), 'cell 1 did change');
// spots density change (3*density draws before the fix) must not disturb the next cell
const C = paintAtlas(rngOf(3), [three[0], { ...three[1], density: 30 }, three[2]], cols, cellPx);
assert.deepEqual(cellPixels(C, 2), cellPixels(A, 2), 'cell 2 survives a spots density change');
// appending a cell leaves earlier cells alone
const D = paintAtlas(rngOf(3), [...three, { kind: 'scales', base: 0x306040 }], cols, cellPx);
for (const ci of [0, 1, 2]) assert.deepEqual(cellPixels(D, ci), cellPixels(A, ci), `append keeps cell ${ci}`);
// the caller's stream is drawn exactly once
let calls = 0; paintAtlas(() => (calls++, 0.5), three, cols, cellPx); assert.equal(calls, 1);
// bad input
assert.throws(() => paintAtlas(rngOf(1), three, 0, cellPx), RangeError);

}

// recipes (pure halves)
{
// ── Mushroom ──
const aCols = 2, aRows = 2;                                             // atlas.cols / atlas.rows for 3 cells in a 2-wide grid
const capProfile: [number, number][] = [[0.001, 0.9], [0.55, 0.9], [0.62, 1.0], [0.5, 1.22], [0.28, 1.36], [0.001, 1.4]];
const gillProfile: [number, number][] = [[0.001, 0], [0.54, 0]];       // flat disc, translated 0.01 below the cap underside
const stemPath: [number, number, number][] = [[0, 0, 0], [0, 0.45, 0], [0, 0.92, 0]];
const cap = latheWithUV(capProfile, 12, atlasRect(1, aCols, aRows));
assert.ok(signedVolumeOf(cap.tris) > 0, 'cap is closed and outward');
const gills = latheWithUV(gillProfile, 12, atlasRect(0, aCols, aRows));
// a lathe segment at constant y is the underside; the end cap at the last point faces up (hidden inside the cap, harmless)
let down = 0; for (let i = 0; i < gills.tris.length; i += 9) if (nrm(gills.tris, i)[1] < -0.9) down++;
assert.equal(down, 12 * 3, 'gill underside: 2 wall + 1 start-cap triangle per segment face down');
const stem = tubeWithUV(stemPath, (t) => 0.18 - 0.05 * t, 8, true, atlasRect(2, aCols, aRows));
assert.ok(signedVolumeOf(stem.tris) > 0, 'vertical stem is closed and outward');
assert.equal(stem.uv.length / 2, stem.tris.length / 3);
// spots: scatter on the dome only, place small chamfer bumps, keep them attached
const hits = scatterOnSurface(cap.tris, rngOf(11), 9, { filter: (_p, n) => n[1] > 0.35, minDist: 0.25 });
assert.ok(hits.length >= 5, `got ${hits.length} of 9 spots`);                       // may be < count by design, see TODO #13
const bumpLocal = chamferBoxTris([0, 0.5, 0], [1, 1, 1], 0.2), spin = rngOf(5);
const flecks = hits.flatMap((h) => placeTris(bumpLocal, h, { scale: 0.08, sink: 0.2, spin: spin() * 6.28 }));
assert.equal(flecks.length, hits.length * 44 * 9);
assert.ok(signedVolumeOf(flecks) > 0);
// no cap-top bump may sit below the rim or float: its centroid is within 0.1 of the cap surface radius
for (let k = 0; k < hits.length; k++) { const c = [0, 1, 2].map((a) => { let s = 0; for (let i = a; i < 44 * 9; i += 3) s += flecks[k * 44 * 9 + i]; return s / 132; }); assert.ok(c[1] > 0.9 && Math.hypot(c[0], c[2]) < 0.7); }

// ── Pickup truck ──
const bodyTris = chamferBoxTris([0, 0.9, 0], [1.8, 0.9, 4.2], 0.08);
const handleTris = chamferBoxTris([0, 0.5, 0], [0.25, 1, 1.5], 0.06);                // 1 unit tall: base y = 0, points +Y, long side along +Z. sink 0.3 buries only the lower 30%
const doorHit = raycastTris(bodyTris, [0.4, 1.0, 0.3], [1, 0, 0])!;
assert.ok(doorHit && Math.abs(doorHit.point[0] - 0.9) < 1e-9 && doorHit.normal[0] > 0.99, JSON.stringify(doorHit));
const handle = placeTris(handleTris, doorHit, { scale: 0.12, sink: 0.3 });
assert.ok(signedVolumeOf(handle) > 0);
let xMax = -1e9, xMin = 1e9; for (let i = 0; i < handle.length; i += 3) { xMax = Math.max(xMax, handle[i]); xMin = Math.min(xMin, handle[i]); }
assert.ok(xMax > 0.9 + 0.05 && xMin < 0.9 && xMin > 0.9 - 0.05, `handle sticks out (${xMax}) and is anchored in the door (${xMin})`);

// ── Shiba ──
const spine: [number, number, number][] = Array.from({ length: 9 }, (_, i) => [0, 0.5, i * 0.15]);
const rxF = (t: number) => 0.26 + 0.1 * Math.sin(Math.PI * t), ryF = (t: number) => 0.22 + 0.08 * Math.sin(Math.PI * t);
const plain = loftSculptedBody(spine, rxF, ryF, [], 12);
const shiba = loftSculptedBody(spine, rxF, ryF, [{ t: 0.45, width: 0.25, amount: 0.25, angle: Math.PI * 1.5, angleWidth: 1.2 }], 12);
assert.ok(signedVolumeOf(shiba.tris) > signedVolumeOf(plain.tris) && signedVolumeOf(plain.tris) > 0);

}
console.log('PURE OK');
~~~

## src/detailThree.test.ts

~~~typescript source-excerpt
// detailThree.test.ts: needs three installed. Run: npx tsx detailThree.test.ts
// NOT executed in the session that produced this version (three was not installed there): run it once in the project.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { signedVolumeOf } from './tri';
import { chamferBoxTris, atlasRect } from './detail';
import { seededAtlas, aoShade, applyAO, latheGeoWithUV, trisUVToGeometry } from './detailThree';
import { PartBuilder, lowPolyMaterial } from './lowpoly';

const rngOf = (s: number) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// AO
const col = aoShade('#ffffff', { downBias: 0.6 });
const ti = { normal: new THREE.Vector3(0, -1, 0), centroid: new THREE.Vector3(), index: 0 };
const dark = (col as any)(ti) as THREE.Color; assert.ok(dark.r < 1 && dark.r > 0.3);
const pb = new PartBuilder();
pb.addTris(chamferBoxTris([0, 0, 0], [1, 1, 1], 0.1), '#c0a080');
const geo = pb.build(lowPolyMaterial()).geometry.clone(); const sumC = () => (geo.attributes.color as THREE.BufferAttribute).array.reduce((a: number, b: number) => a + b, 0);
const s0 = sumC(); applyAO(geo, { downBias: 1, floor: 0.5 }); assert.ok(sumC() < s0 * 0.98 && sumC() > s0 * 0.5, 'applyAO darkens, never black');

// atlas: determinism + texture setup + neutral unused slot
const cells: any[] = [{ kind: 'gills', base: 0xd8c8a8 }, { kind: 'spots', base: 0xb03030, accent: 0xf0e0d0 }, { kind: 'fur', base: 0x805030 }];   // 3 cells in a 2x2 grid
const A = seededAtlas(rngOf(3), cells, 2, 16), B = seededAtlas(rngOf(3), cells, 2, 16);
assert.deepEqual(A.map.image.data, B.map.image.data); assert.equal(A.map.image.width, 32);
assert.equal(A.roughnessMap.colorSpace, THREE.NoColorSpace); assert.equal(A.map.colorSpace, THREE.SRGBColorSpace);
assert.equal((A.map.image.data as Uint8Array)[3], 255, 'alpha 255');

// textured part end-to-end (uv keep)
const pu = new PartBuilder({ uv: 'keep' });
pu.add(latheGeoWithUV([[0.3, 0], [0.4, 0.5], [0.1, 1]], 8, atlasRect(0, 2)), '#ffffff');
const tr = chamferBoxTris([0, 0, 0], [1, 1, 1], 0.1);
pu.add(trisUVToGeometry(tr, new Array(tr.length / 3 * 2).fill(0.5)), '#ffffff', new THREE.Matrix4().makeScale(-1, 1, 1));
const m = pu.build(lowPolyMaterial({ map: A.map })); assert.ok(m.geometry.attributes.uv.count === m.geometry.attributes.position.count);
assert.ok(signedVolumeOf(tr) > 0);

// uv 'keep' + a part without uv must throw at add(), not silently produce a mesh without uv
const bad = new PartBuilder({ uv: 'keep' });
assert.throws(() => bad.addTris(chamferBoxTris([0, 0, 0], [1, 1, 1], 0.1), '#ffffff'), /no uv/);
// a plain PartBuilder still takes kernel triangles, and a bevel-0 box
const plainPart = new PartBuilder(); plainPart.addTris(chamferBoxTris([0, 0, 0], [1, 1, 1], 0), '#ffffff');
assert.equal(plainPart.build(lowPolyMaterial()).geometry.attributes.position.count, 36);
console.log('THREE OK');
~~~

## src/lod.test.ts

~~~typescript source-excerpt
// src/lod.test.ts: `detail` is a resolution knob, not a different asset. Default output must not move; every level is a full asset; wings (own stream) must not change.
// Run: npx tsx src/lod.test.ts
import assert from 'node:assert/strict';
import { createPRNG } from './prng';
import { resolveParams } from './params';
import { dragonParameters, buildDragonKernel } from './dragonKernel';
import { detailParam, lodLevel, lodPick, lodRadiusScale } from './lod';
import { qaGates, normalizeParts, type Parts } from '../scripts/qacheck';

// 0. the helpers: detail 0 is a real level (?? not ||), junk falls back to full detail
assert.equal(lodLevel(0), 0); assert.equal(lodLevel(undefined), 2); assert.equal(lodLevel(null), 2); assert.equal(lodLevel(NaN), 2); assert.equal(lodLevel('abc'), 2);
assert.equal(lodLevel(1.6), 2); assert.equal(lodLevel(-3), 0); assert.equal(lodLevel(9), 2); assert.equal(lodLevel('1'), 1);
assert.equal(lodPick(0, ['low', 'mid', 'full']), 'low'); assert.equal(lodPick(undefined, ['low', 'mid', 'full']), 'full');
assert.equal(resolveParams({ parameters: [detailParam] }, {}).detail, 2, 'default is full detail');
assert.equal(resolveParams({ parameters: [detailParam] }, { detail: 0 }).detail, 0, 'resolveParams keeps detail 0');
assert.equal(resolveParams({ parameters: [detailParam] }, { detail: 7 }).detail, 2, 'clamped to the maximum');

const dragon = (seed: number, extra: Record<string, unknown> = {}): Parts => { const p = resolveParams({ parameters: dragonParameters }, { seed, ...extra }); return normalizeParts(buildDragonKernel(p, createPRNG(p.seed as number))); };
const stats = (parts: Parts) => qaGates(parts, { grounding: false, open: ['wingL', 'wingR'] }).stats;

// 1. adding `detail` to the schema left the default asset untouched: hashes recorded from the kernel BEFORE the change (seeds 0, 1, 7, 42)
const before: Record<number, number> = { 0: 1648848669, 1: -1129344675, 7: -1231732518, 42: -51022698 };
for (const [seed, hash] of Object.entries(before)) assert.equal(stats(dragon(Number(seed))).hash, hash, `seed ${seed} at the default detail equals the pre-LOD asset`);
assert.deepEqual(stats(dragon(7)).parts, { body: 208, spikes: 112, legs: 60, wingL: 4, wingR: 4 });

// 2. every level is a full asset (closed parts closed, wings listed as sheets, mirror-symmetric), for seed 0 too, and about half the triangles per level
const tri = (d: number, seed = 7) => stats(dragon(seed, { detail: d })).triangles as number;
for (const seed of [0, 7]) for (const detail of [2, 1, 0]) {
  const bad = qaGates(dragon(seed, { detail }), { grounding: false, open: ['wingL', 'wingR'], symmetric: true }).gates.filter((g) => !g.pass);
  assert.deepEqual(bad, [], `seed ${seed} detail ${detail} passes Q1 to Q5 and Q7`);
}
assert.deepEqual([tri(2), tri(1), tri(0)], [388, 204, 96]);
for (const [a, b] of [[1, 2], [0, 1]]) { const r = tri(a) / tri(b); assert.ok(r > 0.35 && r < 0.65, `detail ${a} / detail ${b} = ${r}`); }

// 3. one stream per feature: the wing sheets do not change with detail, and the toggle still only removes spikes
for (const detail of [1, 0]) { assert.deepEqual(dragon(7, { detail }).wingL, dragon(7).wingL, `wingL at detail ${detail}`); assert.deepEqual(dragon(7, { detail }).wingR, dragon(7).wingR); }
assert.equal((stats(dragon(7, { hasSpikes: false })).parts as Record<string, number>).spikes ?? 0, 0);
assert.deepEqual(dragon(7, { hasSpikes: false, detail: 1 }).wingL, dragon(7).wingL, 'toggling spikes does not reshuffle the wings at another level either');

// 4. spikes follow the ring count (7, 4, 2 spikes of 16 triangles), legs lose their knee only at the lowest level
assert.deepEqual([2, 1, 0].map((d) => (stats(dragon(7, { detail: d })).parts as Record<string, number>).spikes), [112, 64, 32]);
assert.deepEqual([2, 1, 0].map((d) => (stats(dragon(7, { detail: d })).parts as Record<string, number>).legs), [60, 48, 24]);
// 5. lodRadiusScale keeps polygon bounding extents identical across 8 -> 6 -> 4 sides (and is 1,1 at refSides)
assert.deepEqual(lodRadiusScale(8, 8), { rx: 1, rz: 1 }, 'identity at refSides');
for (const sides of [6, 4]) {
  const sc = lodRadiusScale(sides, 8);
  let mx = 0, mz = 0;
  for (let j = 0; j < sides; j++) { const th = (j / sides) * Math.PI * 2 + Math.PI / sides; mx = Math.max(mx, Math.abs(Math.sin(th) * sc.rx)); mz = Math.max(mx, Math.abs(Math.cos(th) * sc.rz)); }
  const ref = Math.cos(Math.PI / 8);
  assert.ok(Math.abs(mx - ref) < 1e-9 && Math.abs(mz - ref) < 1e-9, `${sides}-gon compensated bounds match 8-gon`);
}
console.log('LOD OK');
~~~

## src/qa.kernel.test.ts

~~~typescript source-excerpt
// src/qa.kernel.test.ts: the QA gates (scripts/qacheck.ts) against the REAL kernels of this skill, not only against hand-made boxes.
// Two jobs: no false positives on closed kernels, and lock in what the gates found (odd tube sides are not mirror-symmetric; wing sheets need `open`).
import assert from 'node:assert/strict';
import { createPRNG } from './prng';
import { resolveParams } from './params';
import { dragonParameters, buildDragonKernel } from './dragonKernel';
import { tubeTris, spikeTris } from './organic';
import * as B from './biped';
import { qaGates, normalizeParts, type Parts, type QAOptions } from '../scripts/qacheck';

const gate = (parts: Parts, id: string, o: QAOptions = {}) => qaGates(parts, o).gates.find((g) => g.gate.startsWith(id))!;
const failing = (parts: Parts, o: QAOptions = {}) => qaGates(parts, { grounding: false, ...o }).gates.filter((g) => !g.pass).map((g) => `${g.gate} [${g.value}]`);

// 1. no false positives: every closed-mesh producer passes finite, degenerate, winding, closed, budget
const outline = B.ngon(6, 0.3, 0.2);
const closed: Record<string, unknown> = {
  boxTris: B.boxTris([0, 0.5, 0], [0, 0, 1], [0, 1, 0], [1, 1, 1]),
  taperedBoxTris: B.taperedBoxTris(1, 0.8, 0.5, 0.4, 1),
  extrudeTris: B.extrudeTris(outline, [0, 0, 0], [0, 1, 0], 1),
  loftTris: B.loftTris(outline, [0, 0, 0], [0, 1, 0], [{ dist: 0, scale: 1 }, { dist: 0.5, scale: [1.2, 0.8] }, { dist: 1, scale: 0.5 }]),
  footTris: B.footTris([0, 0.1, 0], [0, 0, 1], 0.3, 0.12, 0.1),
  handTris: B.handTris([0, 1, 0], [0, -1, 0], 0.2, 0.1, 0.04),
  eyeTris: B.eyeTris([0, 1, 0], [0, 0, 1], 0.05),
  noseTris: B.noseTris([0, 1, 0], [0, 0, 1], 0.08, 0.05),
  earTris: B.earTris([0.1, 1, 0], [1, 0, 0], 0.1, 0.05),                     // { shell, inner }: named parts
  sleeveTris: B.sleeveTris([[0, 2, 0], [0, 1.5, 0], [0, 1, 0]], () => 0.1, 0, 1),
  tubeTris: tubeTris([[0, 0, 0], [0, 1, 0], [0.2, 2, 0]], (t) => 0.2 - 0.1 * t, 6),
  spikeTris: spikeTris([0, 0, 0], [0, 1, 0], 1, 0.2),
};
for (const [name, raw] of Object.entries(closed)) assert.deepEqual(failing(normalizeParts(raw)), [], `${name} should pass Q1 to Q5`);

// 2. the dragon example: closed parts pass, the wing fans are sheets
const p = resolveParams({ parameters: dragonParameters }, { seed: 7 });
const dragon = buildDragonKernel(p, createPRNG(p.seed as number)) as unknown as Parts;
assert.deepEqual(failing(dragon, { open: ['wingL', 'wingR'], symmetric: true }), [], 'dragon: closed parts pass, wings listed as open, mirror-symmetric');
{
  const q3 = gate(dragon, 'Q3'), q4 = gate(dragon, 'Q4');
  assert.equal(q3.pass, false); assert.equal(q4.pass, false);
  assert.match(q4.value, /wingL: 6 open edges/, 'Q4 is what tells a sheet from an inside-out part');
  assert.doesNotMatch(q4.value, /body|spikes|legs/, 'the closed parts are not blamed');
}
{
  const floor = Math.min(...Object.values(dragon).flatMap((t) => t.filter((_, i) => i % 3 === 1)));
  const grounded: Parts = Object.fromEntries(Object.entries(dragon).map(([k, t]) => [k, t.map((v, i) => (i % 3 === 1 ? v - floor : v))]));
  assert.equal(gate(grounded, 'Q6').pass, true, 'after grounding (what groundAsset does) Q6 passes');
}

// 3. what Q7 found: a tube whose first ring vertex lies on the X axis is mirror-symmetric only with an even side count
const spine: [number, number, number][] = [[0, 1.2, -3], [0, 1.4, -1], [0, 1.5, 1], [0, 1.9, 2.6]];   // horizontal run: ring starts on +X
for (const sides of [4, 6, 8]) assert.equal(gate({ a: tubeTris(spine, [0.3, 0.4, 0.4, 0.3], sides) }, 'Q7', { symmetric: true }).pass, true, `${sides} sides is symmetric`);
for (const sides of [5, 7]) assert.equal(gate({ a: tubeTris(spine, [0.3, 0.4, 0.4, 0.3], sides) }, 'Q7', { symmetric: true }).pass, false, `${sides} sides is not symmetric`);
console.log('QA KERNEL OK');
~~~

## src/skinnedRig.test.ts

~~~typescript source-excerpt
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { assetStats } from '../scripts/budget';
import { boundsOf, flatten, normalizeParts, qaGates } from '../scripts/qacheck';
import { rigGates } from '../scripts/rigcheck';
import { attachCurveSkinWeights, bakeClip30fps, buildBoneHierarchy, extractQaArtifacts } from './skinnedRig';

const close = (actual: number, expected: number, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};

// Early and late rings of a folded chain can overlap in XYZ and still need different weights.
{
  const { rootBone, bones, boneOrder } = buildBoneHierarchy([
    { name: 'hips', worldPos: [1, 0, 0] },
    { name: 'early', parent: 'hips', worldPos: [0, 0, 0] },
    { name: 'fin', parent: 'hips', worldPos: [1, 1, 0] },
    { name: 'fold', parent: 'early', worldPos: [0, 0, -1] },
    { name: 'late', parent: 'fold', worldPos: [0, 0, 0] },
  ]);
  assert.equal(bones.early.parent, rootBone);
  assert.deepEqual(bones.early.position.toArray(), [-1, 0, 0]);
  assert.deepEqual(bones.fin.position.toArray(), [0, 1, 0]);
  assert.deepEqual(bones.late.position.toArray(), [0, 0, 1]);
  assert.deepEqual(bones.late.getWorldPosition(new THREE.Vector3()).toArray(), [0, 0, 0]);
  assert.deepEqual(boneOrder, ['hips', 'early', 'fin', 'fold', 'late']);
  assert.throws(() => buildBoneHierarchy([{ name: 'child', parent: 'unknown', worldPos: [0, 0, 0] }]), /parents? .*before/i);
  assert.throws(() => buildBoneHierarchy([{ name: 'a', worldPos: [0, 0, 0] }, { name: 'b', worldPos: [0, 0, 0] }]), /single root/);
  assert.throws(() => buildBoneHierarchy([{ name: 'a', worldPos: [0, 0, 0] }, { name: 'a', parent: 'a', worldPos: [0, 0, 0] }]), /Duplicate/);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.2, 0, 0, 0.2, 0, 0, 0.2, -0.5, 0, 0.2, -0.5, 0, 0.2, 0,
  ], 3));
  geometry.setIndex([0, 2, 1, 1, 3, 4]);
  const chain = ['early', 'fold', 'late'];
  const samples = { vertexT: [0, 1, 0.3, 0.7, 0.5], boneT: [0.1, 0.5, 0.9] };
  assert.equal(attachCurveSkinWeights(geometry, boneOrder, chain, samples), geometry);
  const index = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  assert.equal(index.count, 5);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => [index.getX(i), index.getY(i)]), [[1, 0], [4, 0], [1, 3], [3, 4], [3, 4]]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => [weight.getX(i), weight.getY(i)]), [[1, 0], [1, 0], [0.5, 0.5], [0.5, 0.5], [1, 0]]);
  assert.throws(() => attachCurveSkinWeights(geometry, boneOrder, chain, { ...samples, vertexT: [0, 1] }), /vertex count/);
  assert.throws(() => attachCurveSkinWeights(geometry, boneOrder, chain, { ...samples, boneT: [0.2, 0.2, 1] }), /strictly increasing/);
  assert.throws(() => attachCurveSkinWeights(geometry, boneOrder, chain, { ...samples, vertexT: [0, 1, -0.1, 0.2, 0.3] }), /\[0, 1\]/);
  assert.equal(geometry.getAttribute('skinWeight'), weight);

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const root = new THREE.Group().add(rootBone, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(boneOrder.map((name) => bones[name])));
  bones.late.position.x += 2;
  root.updateMatrixWorld(true);
  close(mesh.getVertexPosition(0, new THREE.Vector3()).x, 0);
  close(mesh.getVertexPosition(1, new THREE.Vector3()).x, 2);
  close(mesh.getVertexPosition(3, new THREE.Vector3()).x, 1);

  attachCurveSkinWeights(geometry, boneOrder, ['fin'], { vertexT: samples.vertexT, boneT: [0.5] });
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => geometry.getAttribute('skinIndex').getX(i)), [2, 2, 2, 2, 2]);
}

function tailAsset() {
  const { rootBone, bones, boneOrder } = buildBoneHierarchy([
    { name: 'hips', worldPos: [0, 1, 0] },
    { name: 'tail', parent: 'hips', worldPos: [0, 1, -1] },
    { name: 'tailTip', parent: 'tail', worldPos: [0, 2, -1] },
  ]);
  const geometry = new THREE.BoxGeometry(0.2, 1, 0.2).translate(0, 1.5, -1);
  const position = geometry.getAttribute('position');
  const vertexT = Array.from({ length: position.count }, (_, i) => position.getY(i) - 1);
  attachCurveSkinWeights(geometry, boneOrder, ['tail', 'tailTip'], { vertexT, boneT: [0, 1] });

  const map = new THREE.DataTexture(new Uint8Array(8 * 4 * 4), 8, 4);
  map.name = 'tail_atlas';
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ name: 'hide', map }));
  skin.name = 'body';
  const rigid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ name: 'hide', map }));
  rigid.name = 'body';
  rigid.position.set(0, 0.75, 0.2);
  bones.hips.add(rigid);

  const root = new THREE.Group().add(rootBone, skin);
  root.name = 'TailAsset';
  root.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton(boneOrder.map((name) => bones[name])));
  root.position.y = -1; // Ground the wrapper after binding.
  return { root, bones, skin, rigid };
}

// Real Three.js poses. A vertical tail must pitch toward -Z before yaw can move its tip along X.
{
  const { root, bones, skin } = tailAsset();
  const sampled: number[] = [];
  const angle: [number, number, number] = [-Math.PI / 2, 0, 0];
  const swayPose = { rotations: { tail: angle } };
  const sway = bakeClip30fps('TailSway', 1, bones, (u) => {
    sampled.push(u);
    angle[1] = Math.sin(2 * Math.PI * u) * Math.PI / 3;
    return swayPose;
  });
  assert.equal(sampled.length, 30);
  assert.equal(sampled[0], 0);
  assert.equal(sway.tracks[0].times.length, 31);
  assert.equal(sway.tracks[0].times[30], 1);
  assert.deepEqual(sway.tracks[0].values.slice(-4), sway.tracks[0].values.slice(0, 4));
  const yawOnly = bakeClip30fps('YawOnly', 1, bones, () => ({ rotations: { tail: [0, Math.PI / 3, 0] } }));
  const alternate = bakeClip30fps('OtherOrder', 1, bones, () => ({ rotations: { tail: [-Math.PI / 2, Math.PI / 3, 0] } }), { eulerOrder: 'XYZ' });
  const topVertex = Array.from({ length: skin.geometry.getAttribute('position').count }, (_, i) => i)
    .find((i) => skin.geometry.getAttribute('position').getY(i) === 2)!;
  const tipAt = (clip: THREE.AnimationClip, t: number) => {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    const tip = bones.tailTip.getWorldPosition(new THREE.Vector3());
    const surface = skin.getVertexPosition(topVertex, new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
    mixer.stopAllAction();
    return { tip, surface };
  };
  const neutral = tipAt(sway, 0).tip;
  close(neutral.z, -2);
  close(neutral.y, 0);
  close(tipAt(yawOnly, 0.25).tip.x, 0);
  close(tipAt(alternate, 0.25).tip.x, 0);
  const { tip: left, surface: leftSurface } = tipAt(sway, 0.25);
  const { tip: right, surface: rightSurface } = tipAt(sway, 0.75);
  assert.ok(leftSurface.x < -0.7 && rightSurface.x > 0.7);
  close(left.x, -Math.sqrt(3) / 2, 0.003);
  close(right.x, Math.sqrt(3) / 2, 0.003);
  close(left.y, 0);
  close(right.y, 0);
  close(left.z, right.z);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(sway).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(sway.duration);
  close(bones.tailTip.getWorldPosition(new THREE.Vector3()).distanceTo(neutral), 0);
}

// Delayed channels still get tracks, and angle wraps never take the long quaternion path.
{
  const { bones } = tailAsset();
  const branch = bakeClip30fps('BranchWrap', 0.8, bones, (u) => ({
    rotations: { tail: [0, 0.4 + (u >= 0.5 ? Math.PI * 2 : 0), 0] },
    rootOffset: u > 0 ? [0, 0.2, 0] : undefined,
    scales: u > 0 ? { tailTip: [1, 0.15, 1] } : undefined,
  }), { fps: 20 });
  const [positions, quaternions, scales] = branch.tracks;
  assert.equal(positions.name, 'hips.position');
  assert.equal(quaternions.times.length, 17);
  assert.equal(scales.name, 'tailTip.scale');
  assert.deepEqual(Array.from(positions.values.slice(0, 3)), [0, 1, 0]);
  assert.deepEqual(Array.from(scales.values.slice(0, 3)), [1, 1, 1]);
  close(positions.values[4], 1.2);
  close(scales.values[4], 0.15);
  for (const track of branch.tracks) {
    const size = track.getValueSize();
    assert.deepEqual(track.values.slice(0, size), track.values.slice(-size));
  }
  const spin = bakeClip30fps('FullTurn', 1, bones, (u) => ({ rotations: { tail: [0, u * Math.PI * 2, 0] } }));
  const spinValues = spin.tracks[0].values;
  const a = new THREE.Quaternion(), b = new THREE.Quaternion();
  for (let i = 4; i < spinValues.length; i += 4) {
    assert.ok(a.fromArray(spinValues, i - 4).dot(b.fromArray(spinValues, i)) > 0);
  }
  close(a.fromArray(spinValues, 0).dot(b), -1); // Opposite encodings of the same orientation.
  const times = bakeClip30fps('FractionalDuration', 1.15, bones, (u) => ({ rootOffset: [u, 0, 0] })).tracks[0].times;
  assert.equal(times.length, 36);
  for (let i = 0; i <= 34; i++) assert.equal(times[i], Math.fround(i / 30));
  assert.equal(times[35], Math.fround(1.15));
  const integral = bakeClip30fps('IntegralFrameCount', 0.14, bones, () => ({ rootOffset: [0, 0, 0] }), { fps: 100 });
  assert.equal(integral.tracks[0].times.length, 15); // The floating-point product is slightly above 14.

  const bow = bakeClip30fps('Bow', 1, bones, (u) => ({ rotations: { tail: [u, 0, 0] } }), { loop: false });
  const bowTrack = bow.tracks.find((track) => track.name === 'tail.quaternion')!;
  assert.equal(bowTrack.times[bowTrack.times.length - 1], 1);
  close(bowTrack.values[bowTrack.values.length - 4], Math.sin(0.5));
  assert.equal(extractQaArtifacts({ root: bones.hips, bones, animations: [bow] }).rigMetadata.animations?.[0].loop, false);

  assert.throws(() => bakeClip30fps('Bad', 0, bones, () => ({})), /positive/);
  assert.throws(() => bakeClip30fps('Bad', 1, bones, () => ({ rotations: { unknown: [0, 0, 0] } })), /Unknown rotation bone/);
}

{
  const { root, bones, skin } = tailAsset();
  const dip = bakeClip30fps('FloorDip', 1, bones, (u) => {
    const eased = Math.sin(Math.PI * u) ** 2;
    return { rootOffset: [0, -0.3 * eased, 0], rotations: { tail: [-Math.PI / 2 * eased, 0, 0] } };
  });
  const scene = new THREE.Scene();
  scene.position.y = 100;
  scene.add(root);
  root.userData.animations = [dip];
  root.userData.self = root.userData;

  const preview = new THREE.AnimationMixer(root);
  preview.clipAction(dip).play();
  preview.setTime(0.23);
  scene.updateMatrixWorld(true);
  skin.computeBoundingBox();
  const state = () => ({
    hip: bones.hips.position.toArray(), tail: bones.tail.rotation.toArray(),
    boneWorld: bones.tailTip.matrixWorld.toArray(), bindInverse: skin.bindMatrixInverse.toArray(),
    box: skin.boundingBox!.min.toArray(), mixerTime: preview.time,
  });
  const before = state();
  const artifacts = extractQaArtifacts({ root, bones, motionMode: 'free' });
  assert.deepEqual(state(), before);
  assert.equal(root.parent, scene);
  assert.equal(root.userData.self, root.userData);
  assert.deepEqual(Object.keys(artifacts.tris), ['body', 'body_2']);
  assert.equal(artifacts.tris.body.length, 12 * 9);
  assert.equal(artifacts.tris.body_2.length, 12 * 9);

  const parts = normalizeParts(JSON.parse(JSON.stringify(artifacts.tris)));
  close(boundsOf(flatten(parts)).min[1], 0);
  assert.ok(qaGates(parts).gates.every((gate) => gate.pass));
  const stats = assetStats(parts, JSON.parse(JSON.stringify(artifacts.meshMeta)));
  assert.deepEqual([stats.triangles, stats.meshes, stats.bones, stats.materials, stats.drawCalls], [24, 2, 3, 2, 2]);
  assert.deepEqual(stats.textures.map(({ name, w, h }) => [name, w, h]), [['tail_atlas', 8, 4]]);
  assert.equal(artifacts.meshMeta.parts?.body.bone, 'hips');

  const rig = JSON.parse(JSON.stringify(artifacts.rigMetadata)) as typeof artifacts.rigMetadata;
  assert.deepEqual(rig.rig?.hierarchy, [{ parent: 'hips', child: 'tail' }, { parent: 'tail', child: 'tailTip' }]);
  assert.deepEqual(rig.rig?.restLocalPositions?.hips, [0, 1, 0]);
  assert.equal(rig.animations?.[0].loop, true);
  assert.equal(rig.animations?.[0].tracks?.[0].name, 'hips.position');
  close(rig.qa!.clipMinY!, -0.4);
  const gates = rigGates(rig, { kind: 'creature' }).gates;
  assert.deepEqual(gates.filter((gate) => !gate.pass).map((gate) => gate.gate), ['R6 floor clearance']);

  // A one-shot ending at its deepest point and a narrow dip between default frames must both be sampled.
  const end = new THREE.AnimationClip('EndDip', 1, [new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 1, 0, 0, 0.25, 0])]);
  const fast = new THREE.AnimationClip('FastDip', 1, [
    new THREE.VectorKeyframeTrack('hips.position', [0, 0.123, 0.124, 1], [0, 1, 0, 0, 0.1, 0, 0, 1, 0, 0, 1, 0]),
  ]);
  const endRig = extractQaArtifacts({ root, bones, animations: [end] }).rigMetadata;
  assert.equal(endRig.animations?.[0].loop, false);
  close(endRig.qa!.clipMinY!, -0.75);
  close(extractQaArtifacts({ root, bones, animations: [dip, end, fast] }).rigMetadata.qa!.clipMinY!, -0.9);
  assert.equal(extractQaArtifacts({ root, bones, animations: [] }).rigMetadata.qa?.clipMinY, undefined);
  const invalid = new THREE.AnimationClip('Invalid', 1, [new THREE.VectorKeyframeTrack('body.position', [0], [0, 0, 0])]);
  assert.throws(() => extractQaArtifacts({ root, bones, animations: [invalid] }), /unique rig bone/);
  assert.deepEqual(state(), before);
}

{
  const { root, bones } = tailAsset();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, -10, 0, 1, -10, 0, 0, -10, 1,
    0, 2, 0, 1, 2, 0, 0, 2, 1,
    0, -20, 0, 1, -20, 0, 0, -20, 1,
  ], 3));
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 3, 1);
  geometry.setDrawRange(3, 6);
  const sheet = new THREE.Mesh(geometry, [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ visible: false })]);
  sheet.name = 'sheet';
  root.add(sheet);
  const { tris } = extractQaArtifacts({ root, bones });
  assert.deepEqual(tris.sheet, [0, 1, 0, 1, 1, 0, 0, 1, 1]);
}

console.log('SKINNED RIG OK (folded weights, YXZ motion, loop wrap, posed QA and metadata contracts)');
~~~

## src/voxel.test.ts

~~~typescript source-excerpt
// npx tsx src/voxel.test.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelGrid, attachWorldSkinWeights, createHdrGlowMaterial, createVoxelMaterials, shadeHexSRGB } from './voxel';
import { attachCurveSkinWeights, buildBoneHierarchy } from './skinnedRig';
import { boundsOf, qaGates, signedVolume, triCount } from '../scripts/qacheck';

// 1. Multi-material voxel inlay + deliberate diagonal pinch + exact X-mirroring ('even' axis)
{
  const v = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  v.fillBox(0, 0, -1, 1, 3, 1, '#262b74', 'body');
  // Deliberate 2x2 XY diagonal pinch sticking out on +X and a glow eye inlaid adjacent to body
  v.set(2, 1, 0, '#2e357d', 'body');
  v.set(3, 2, 0, '#2e357d', 'body');
  v.set(1, 2, 1, '#ff9800', 'glow'); // eye inlay replacing corner of body box
  v.mirrorX();

  // Before fixDiagonalPinches, Q4 must detect duplicated edges on the pinch
  const before = qaGates(v.buildParts(), { symmetric: true, grounding: true });
  assert.equal(before.gates.find((g) => g.gate === 'Q4 closed')?.pass, false, 'diagonal pinch trips Q4 before fix');

  const fixed = v.fixDiagonalPinches();
  assert.ok(fixed >= 2, `expected both mirrored pinches fixed, got ${fixed}`);

  const afterParts = v.buildParts();
  const after = qaGates(afterParts, { symmetric: true, grounding: true });
  const failed = after.gates.filter((g) => !g.pass);
  assert.deepEqual(failed, [], `expected all QA gates to pass after fixDiagonalPinches: ${JSON.stringify(failed)}`);
  assert.ok(afterParts.body && afterParts.glow, 'material buckets remain separated cleanly');

  // Verify buildMeshes + unshaded sRGB->linear vertex colors ({ ao: false }) + worldVertexT + default Corner AO
  const mats = createVoxelMaterials(THREE);
  const unshaded = v.buildMeshes(THREE, mats, { ao: false });
  assert.ok(unshaded.meshes.body.isMesh && unshaded.meshes.glow.isMesh);
  const colorAttr = unshaded.meshes.body.geometry.getAttribute('color');
  const firstR = colorAttr.getX(0);
  const expectedLinearR = new THREE.Color('#262b74').r;
  assert.ok(Math.abs(firstR - expectedLinearR) < 1e-4, `vertex color with ao:false must match exact linear sRGB (${expectedLinearR}): got ${firstR}`);
  assert.ok(firstR < 0.04, `dark indigo linear red should stay dark (< 0.04), got ${firstR}`);

  const defaultAo = v.buildMeshes(THREE, mats);
  const aoQa = qaGates(defaultAo.parts, { symmetric: true, grounding: true });
  assert.deepEqual(aoQa.gates.filter((g) => !g.pass), [], 'default Corner AO diagonal flip keeps Q1-Q6 cleanly passing');

  const geomsWithT = v.buildGeometries(THREE, { worldVertexT: (_x, y) => Math.max(0, Math.min(1, y / 0.4)) });
  assert.equal(geomsWithT.body.vertexT?.length, geomsWithT.body.geometry.getAttribute('position').count);
}

// 2. Odd-symmetry grid mode + fillEllipsoid + zero dup edges
{
  const odd = new VoxelGrid({ voxelSize: 0.05, origin: [0, 0, 0], symAxis: 'odd' });
  odd.fillEllipsoid(0, 3, 0, 2.2, 2.5, 1.8, '#3b4496', 'body');
  odd.set(1, 3, 2, '#14f0ff', 'glow');
  odd.mirrorX();
  odd.fixDiagonalPinches();
  odd.ground(0);
  const res = qaGates(odd.buildParts(), { symmetric: true, grounding: true });
  assert.deepEqual(res.gates.filter((g) => !g.pass), [], JSON.stringify(res.gates));
}

// 3. Opt-in greedy meshing preserves bounds, outward winding, positive volume & palette while cutting flat triangles >= 40%
{
  const block = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  block.fillBox(0, 0, -2, 2, 4, 2, '#1c2434', 'body');
  block.fillBox(0, 1, 2, 0, 3, 2, '#62c4ff', 'body'); // inlaid lighter belly strip breaks uniform face cleanly
  block.set(1, 3, 2, '#36b8ff', 'glow');
  block.mirrorX();
  block.ground(0);

  const stdParts = block.buildParts('material');
  const greedyParts = block.buildParts('material', { greedy: true });
  const stdTris = triCount(stdParts.body);
  const greedyTris = triCount(greedyParts.body);
  const savings = (stdTris - greedyTris) / stdTris;
  assert.ok(savings >= 0.4, `expected greedy meshing to reduce body triangles >= 40%, got ${(savings * 100).toFixed(1)}% (${stdTris} -> ${greedyTris})`);
  assert.deepEqual(boundsOf(greedyParts.body), boundsOf(stdParts.body), 'greedy bounds must match exact voxel envelope');
  assert.ok(Math.abs(signedVolume(greedyParts.body) - signedVolume(stdParts.body)) < 1e-6, 'greedy volume must stay identical and outward CCW');

  const mats = createVoxelMaterials(THREE);
  const stdBuilt = block.buildMeshes(THREE, mats);
  const greedyBuilt = block.buildMeshes(THREE, mats, { greedy: true });
  assert.deepEqual(greedyBuilt.colors, stdBuilt.colors);
  assert.equal(greedyBuilt.meshes.body.geometry.getIndex()!.count / 3, greedyTris);
}

// 4. Corner Voxel AO darkens concave creases while keeping glow unshaded + glowBoost + HDR material helper
{
  const stepGrid = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  stepGrid.fillBox(0, 0, 0, 1, 0, 0, '#ffffff', 'body');
  stepGrid.set(1, 1, 0, '#ffffff', 'body'); // protruding wall creates concave corner at x=1 on top of (0,0,0)
  stepGrid.set(0, 0, 1, '#ff5500', 'glow');
  const g = stepGrid.buildGeometries(THREE, { glowBoost: 1.6 });
  const pos = g.body.geometry.getAttribute('position');
  const nor = g.body.geometry.getAttribute('normal');
  const col = g.body.geometry.getAttribute('color');
  let outerTopL = -1, creaseTopL = -1;
  for (let i = 0; i < pos.count; i++) {
    if (nor.getY(i) > 0.9 && Math.abs(pos.getY(i) - 0.1) < 1e-5) {
      if (Math.abs(pos.getX(i)) < 1e-5) outerTopL = col.getX(i);
      if (Math.abs(pos.getX(i) - 0.1) < 1e-5) creaseTopL = col.getX(i);
    }
  }
  assert.ok(outerTopL > 0.99 && creaseTopL > 0 && creaseTopL < outerTopL * 0.92, `expected AO crease darkening (${creaseTopL}) vs exposed (${outerTopL})`);

  const glowCol = g.glow.geometry.getAttribute('color');
  const expectedGlowR = new THREE.Color('#ff5500').r * 1.6;
  assert.ok(Math.abs(glowCol.getX(0) - expectedGlowR) < 1e-4, 'glow bucket skips AO and scales by glowBoost');
  const hdrMat = createHdrGlowMaterial(THREE, '#ff6600', 1.8);
  assert.equal(hdrMat.emissiveIntensity, 1.8);
  assert.equal(hdrMat.toneMapped, false);
}

// 5. Organic curve sculpting (fillSuperEllipsoid, fillTube, fillCubicBezier) passes Q1-Q6
{
  const org = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  org.fillSuperEllipsoid(0, 2, 0, 2.2, 2.2, 2.2, '#2d283e', { power: 2.8 });
  org.fillCubicBezier([1, 4, 0], [3, 6, -1], [4, 9, -2], [3, 11, -1], 1.1, 0.4, '#8b7b6b');
  org.fillTube([0, 2, -2], [0, 1, -7], 1.2, 0.5, '#2d283e');
  org.mirrorX();
  org.fixDiagonalPinches();
  org.ground(0);
  const res = qaGates(org.buildParts(), { symmetric: true, grounding: true });
  assert.deepEqual(res.gates.filter((g) => !g.pass), [], JSON.stringify(res.gates));
}

// 6. shadeHexSRGB strictly darkens dark colors without lavender blowup
{
  const darkBase = '#1c1428';
  const darker = shadeHexSRGB(darkBase, -0.07);
  const baseC = new THREE.Color(darkBase), darkC = new THREE.Color(darker);
  assert.ok(darkC.b <= baseC.b && darkC.g <= baseC.g && darkC.r <= baseC.r, `negative shift on ${darkBase} -> ${darker} must never brighten`);
  const veryDark = '#050308';
  const deeper = shadeHexSRGB(veryDark, -0.1);
  assert.ok(new THREE.Color(deeper).b <= new THREE.Color(veryDark).b, `ultra-dark ${veryDark} -> ${deeper} must never jump brighter`);
  const lighter = shadeHexSRGB(darkBase, 0.1);
  assert.ok(new THREE.Color(lighter).b > baseC.b && new THREE.Color(lighter).b < 0.25, `positive shift on ${darkBase} -> ${lighter} stays controlled`);
}

// 7. World-corner skinning (worldVertexT + attachWorldSkinWeights) stays zero-tear under 150-degree bend
{
  const tail = new VoxelGrid({ voxelSize: 0.1, symAxis: 'odd' });
  tail.fillBox(-1, 0, -6, 1, 1, 0, '#2a2238', 'body');
  tail.fixDiagonalPinches();
  const { rootBone, bones, boneOrder } = buildBoneHierarchy([
    { name: 'root', worldPos: [0, 0.1, 0.05] },
    { name: 'mid', parent: 'root', worldPos: [0, 0.1, -0.25] },
    { name: 'tip', parent: 'mid', worldPos: [0, 0.1, -0.55] },
  ]);
  const built = tail.buildGeometries(THREE, {
    ao: false,
    worldVertexT: (_wx, _wy, wz) => Math.max(0, Math.min(1, (0.05 - wz) / 0.7)),
  });
  attachCurveSkinWeights(built.body.geometry, boneOrder, ['root', 'mid', 'tip'], { vertexT: built.body.vertexT!, boneT: [0, 0.5, 1] });
  const skin = new THREE.SkinnedMesh(built.body.geometry, createVoxelMaterials(THREE).body);
  skin.add(rootBone);
  skin.bind(new THREE.Skeleton(boneOrder.map((n) => bones[n])));

  // Map rest coincident pairs
  const pos = skin.geometry.getAttribute('position');
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    const list = buckets.get(k) ?? [];
    list.push(i);
    buckets.set(k, list);
  }
  bones.mid.rotation.x = 2.6; // extreme 149-deg bend
  rootBone.updateMatrixWorld(true);
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  for (const idxs of buckets.values()) {
    skin.getVertexPosition(idxs[0], v0);
    for (let j = 1; j < idxs.length; j++) {
      skin.getVertexPosition(idxs[j], v1);
      assert.ok(v0.distanceTo(v1) < 1e-6, 'worldVertexT keeps shared corners fused under extreme bend');
    }
  }

  // Test attachWorldSkinWeights directly too
  const geo2 = built.body.geometry.clone();
  attachWorldSkinWeights(THREE, geo2, boneOrder, (_wx, _wy, wz) => {
    const u = Math.max(0, Math.min(1, (0.05 - wz) / 0.7));
    return [{ bone: 'root', weight: 1 - u }, { bone: 'tip', weight: u }];
  });
  const si2 = geo2.getAttribute('skinIndex'), sw2 = geo2.getAttribute('skinWeight');
  for (const idxs of buckets.values()) {
    for (let j = 1; j < idxs.length; j++) {
      assert.equal(si2.getX(idxs[0]), si2.getX(idxs[j]));
      assert.ok(Math.abs(sw2.getX(idxs[0]) - sw2.getX(idxs[j])) < 1e-6);
    }
  }
}

console.log('voxel.test.ts PASS');
~~~

## scripts/art-styles.test.ts

~~~typescript source-excerpt
// npx tsx scripts/art-styles.test.ts
// Verifies the lightweight 3D Art Style Guide (27 styles), context footprint vs baseline,
// zero new dependencies, and end-to-end Three.js modeling/QA/preview/GLB export across 3 style scenarios:
//   1. Low Poly (faceted PartBuilder + lowPolyMaterial)
//   2. Voxel (VoxelGrid default watertight + greedy meshing option)
//   3. Hybrid: Chibi + Hand-Painted + Toon Shading (facial pivots + procedural DataTexture + MeshToonMaterial)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { groundAsset } from '../src/lifecycle';
import { PartBuilder, lowPolyMaterial } from '../src/lowpoly';
import { createPRNG } from '../src/prng';
import { VoxelGrid, createVoxelMaterials } from '../src/voxel';
import { tokensOf } from '../tools/validate-skills';
import { countScene, extractObjectParts } from './asset-builder';
import { clipMotion } from './clip-motion';
import { decodePngRgba, encodePngRgba } from './png';
import { boundsOf, qaGates, signedVolume, triCount } from './qacheck';
import { parseResult, spawnTsx } from './result';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '..');
const webDir = join(rootDir, '..', 'threejs-asset-generator-web');

const EXPECTED_STYLES = [
  // Geometry (7)
  'Low Poly', 'Voxel', 'Blocky', 'Smooth Stylized', 'Chibi', 'Hard Surface', 'Primitive-Based',
  // Materials (7)
  'Claymation', 'Hand-Painted', 'Papercraft', 'Wool', 'Wooden Toy', 'Vinyl Toy', 'Pixelated',
  // Rendering (7)
  'Toon Shading', 'Anime Shading', 'Comic Ink', 'Painterly', 'Watercolor', 'Retro PS1', 'Realistic PBR',
  // Art Direction (6)
  'Cozy Pastel', 'Fantasy', 'Gothic', 'Cyberpunk', 'Storybook', 'Minimalist',
] as const;

function readGlbJson(buf: ArrayBuffer): Record<string, any> {
  const dv = new DataView(buf);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'GLB magic');
  const jsonLen = dv.getUint32(12, true);
  return JSON.parse(Buffer.from(buf, 20, jsonLen).toString('utf8'));
}

async function withNodeGlbTextureShim<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, any>;
  const origSelf = g.self;
  const origFileReader = g.FileReader;
  const origDocument = g.document;
  const origImageData = g.ImageData;
  const blobStore = new Map<string, Blob>();
  let urlCounter = 0;

  if (typeof g.self === 'undefined') g.self = g;

  if (typeof g.FileReader === 'undefined') {
    g.FileReader = class {
      result: ArrayBuffer | string | null = null;
      onloadend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      readAsArrayBuffer(blob: Blob) {
        blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }).catch((e) => this.onerror?.(e));
      }
      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then((b) => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
          this.onloadend?.();
        }).catch((e) => this.onerror?.(e));
      }
    };
  }

  g.ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };

  const origCreateObjUrl = URL.createObjectURL;
  const origRevokeObjUrl = URL.revokeObjectURL;
  URL.createObjectURL = (obj: any) => {
    const id = `blob:node-art-style/${++urlCounter}`;
    if (obj && typeof obj.arrayBuffer === 'function') blobStore.set(id, obj as Blob);
    return id;
  };
  URL.revokeObjectURL = (u: string) => { blobStore.delete(u); };

  g.document = {
    createElementNS: (_ns: string, tag: string) => g.document.createElement(tag),
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        let w = 1, h = 1;
        let pixels = new Uint8Array(4);
        let flip = false;
        return {
          get width() { return w; },
          set width(v: number) { w = Math.max(1, v | 0); pixels = new Uint8Array(w * h * 4); },
          get height() { return h; },
          set height(v: number) { h = Math.max(1, v | 0); pixels = new Uint8Array(w * h * 4); },
          getContext: () => ({
            translate: () => {},
            scale: (_sx: number, sy: number) => { if (sy < 0) flip = true; },
            putImageData: (img: { data: Uint8ClampedArray; width: number; height: number }) => {
              w = img.width; h = img.height;
              pixels = new Uint8Array(w * h * 4);
              for (let y = 0; y < h; y++) {
                const sy = flip ? h - 1 - y : y;
                const srcOff = sy * w * 4;
                const dstOff = y * w * 4;
                pixels.set(img.data.subarray(srcOff, srcOff + w * 4), dstOff);
              }
            },
            drawImage: () => {},
          }),
          toBlob: (cb: (blob: Blob) => void, mime = 'image/png') => {
            const png = encodePngRgba(pixels, w, h);
            cb(new Blob([new Uint8Array(png)], { type: mime }));
          },
        };
      }
      // Minimal <img> stub for THREE.ImageLoader inside GLTFLoader.parseAsync
      const listeners: Record<string, Array<(e?: any) => void>> = {};
      const imgEl: Record<string, any> = {
        width: 1,
        height: 1,
        addEventListener: (ev: string, cb: (e?: any) => void) => { (listeners[ev] ??= []).push(cb); },
        removeEventListener: (ev: string, cb: (e?: any) => void) => {
          listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== cb);
        },
        set src(url: string) {
          queueMicrotask(async () => {
            try {
              const blob = blobStore.get(url);
              let bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
              if (!bytes && url.startsWith('data:image/png;base64,')) {
                bytes = new Uint8Array(Buffer.from(url.slice('data:image/png;base64,'.length), 'base64'));
              }
              const decoded = bytes ? decodePngRgba(Buffer.from(bytes)) : null;
              if (decoded) {
                imgEl.width = decoded.width;
                imgEl.height = decoded.height;
                imgEl.data = decoded.rgba;
              }
              for (const cb of listeners.load ?? []) cb({});
            } catch (err) {
              for (const cb of listeners.error ?? []) cb(err);
            }
          });
        },
      };
      return imgEl;
    },
  };

  try {
    return await fn();
  } finally {
    URL.createObjectURL = origCreateObjUrl;
    URL.revokeObjectURL = origRevokeObjUrl;
    if (origSelf === undefined) delete g.self; else g.self = origSelf;
    if (origFileReader === undefined) delete g.FileReader; else g.FileReader = origFileReader;
    if (origDocument === undefined) delete g.document; else g.document = origDocument;
    if (origImageData === undefined) delete g.ImageData; else g.ImageData = origImageData;
  }
}

// -----------------------------------------------------------------------------
// 0. Catalog completeness, standalone Web Full sync & context-budget check
// -----------------------------------------------------------------------------
const harnessCatalogPath = join(rootDir, 'references', 'art-styles.md');
const webCatalogPath = join(webDir, 'references', 'art-styles.md');
assert.ok(existsSync(harnessCatalogPath), 'harness references/art-styles.md exists');
assert.ok(existsSync(webCatalogPath), 'web references/art-styles.md exists');

const harnessCatalog = readFileSync(harnessCatalogPath, 'utf8').replace(/\r\n/g, '\n');
const webCatalog = readFileSync(webCatalogPath, 'utf8').replace(/\r\n/g, '\n');
assert.equal(harnessCatalog, webCatalog, 'art-styles.md must stay synced cleanly between harness and web');
assert.ok(/^Contents:\s+\S/m.test(harnessCatalog), 'art-styles.md has Contents: line');
for (const style of EXPECTED_STYLES) {
  assert.ok(harnessCatalog.includes(`### ${style}\n`), `missing style heading: ### ${style}`);
}
const externalUrls = harnessCatalog.match(/https:\/\/[^\s)]+/g) ?? [];
assert.ok(externalUrls.length >= EXPECTED_STYLES.length, 'each style includes trusted reference link(s)');

// Ensure art-styles.md was NOT dumped into modeling-guide.md (context stays on-demand)
const modelingGuide = readFileSync(join(webDir, 'references', 'modeling-guide.md'), 'utf8');
assert.ok(!modelingGuide.includes('## references/art-styles.md'), 'modeling-guide.md must NOT auto-inline art-styles.md');

// Ensure zero new packages/dependencies added
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), ['esbuild', 'tsx', 'three']);
assert.deepEqual(Object.keys(pkg.optionalDependencies ?? {}), ['playwright-core', 'sharp']);
assert.equal(pkg.dependencies, undefined, 'no runtime dependencies added');

const harnessSkillTokens = tokensOf(readFileSync(join(rootDir, 'SKILL.md'), 'utf8'));
const webSkillTokens = tokensOf(readFileSync(join(webDir, 'SKILL.md'), 'utf8'));
const modelingGuideBytes = Buffer.byteLength(modelingGuide, 'utf8');
assert.ok(harnessSkillTokens <= 5000, `harness SKILL.md must stay <= 5000 tokens (got ${harnessSkillTokens})`);
assert.ok(webSkillTokens <= 5000, `web SKILL.md must stay <= 5000 tokens (got ${webSkillTokens})`);

const tmpOut = mkdtempSync(join(tmpdir(), 'art-styles-test-'));
try {
  await withNodeGlbTextureShim(async () => {
    // -------------------------------------------------------------------------
    // 1. Scenario 1: Low Poly (Crystal Shrine Pillar — faceted PartBuilder)
    // -------------------------------------------------------------------------
    const t1 = performance.now();
  function buildLowPolySample(seed = 7) {
    const rng = createPRNG(seed);
    const pb = new PartBuilder();
    pb.add(new THREE.CylinderGeometry(0.42, 0.55, 0.25, 6), '#4a5568', new THREE.Matrix4().makeTranslation(0, 0.125, 0));
    pb.add(
      new THREE.CylinderGeometry(0.18, 0.34, 0.95, 6),
      ({ normal }) => (normal.y > 0.3 ? '#38bdf8' : rng() < 0.5 ? '#0284c7' : '#0369a1'),
      new THREE.Matrix4().makeTranslation(0, 0.725, 0),
    );
    const group = new THREE.Group();
    group.name = 'lowpoly_crystal_root';
    group.add(pb.build(lowPolyMaterial({ roughness: 0.85, metalness: 0.05 }), { name: 'crystal_pillar' }));
    return groundAsset(group);
  }

  const lpRoot = buildLowPolySample(7);
  const lpQa = qaGates(extractObjectParts(lpRoot, THREE), { grounding: true, footprint: true });
  assert.deepEqual(lpQa.gates.filter((g) => !g.pass), [], `Low Poly QA failed: ${JSON.stringify(lpQa.gates)}`);

  const lpGlb = await new GLTFExporter().parseAsync(lpRoot, { binary: true, onlyVisible: true });
  const lpReloaded = await new GLTFLoader().parseAsync(lpGlb, '');
  const lpBefore = countScene(lpRoot);
  const lpAfter = countScene(lpReloaded.scene);
  assert.equal(lpAfter.tris, lpBefore.tris);
  assert.equal(lpAfter.vertexColorMeshes, 1);
  const s1Ms = performance.now() - t1;

  // ---------------------------------------------------------------------------
  // 2. Scenario 2: Voxel (Stepped Voxel Totem — default watertight + greedy)
  // ---------------------------------------------------------------------------
  const t2 = performance.now();
  const grid = new VoxelGrid({ voxelSize: 0.08, symAxis: 'even' });
  grid.fillBox(0, 0, -2, 2, 5, 2, '#1f2937', 'body');
  grid.fillBox(0, 1, 2, 0, 3, 2, '#60a5fa', 'body');
  grid.set(1, 4, 2, '#38bdf8', 'glow');
  grid.mirrorX();
  grid.fixDiagonalPinches();
  grid.ground(0);

  const voxMats = createVoxelMaterials(THREE);
  const voxStd = grid.buildMeshes(THREE, voxMats);
  const voxGreedy = grid.buildMeshes(THREE, voxMats, { greedy: true });
  const stdBodyTris = triCount(voxStd.parts.body);
  const greedyBodyTris = triCount(voxGreedy.parts.body);
  const greedyRatio = (stdBodyTris - greedyBodyTris) / stdBodyTris;
  assert.ok(greedyRatio >= 0.35, `expected greedy reduction >= 35%, got ${(greedyRatio * 100).toFixed(1)}%`);
  assert.deepEqual(boundsOf(voxGreedy.parts.body), boundsOf(voxStd.parts.body));
  assert.ok(Math.abs(signedVolume(voxGreedy.parts.body) - signedVolume(voxStd.parts.body)) < 1e-6);

  const voxQa = qaGates(extractObjectParts(voxStd.group, THREE), { grounding: true, symmetric: true });
  assert.deepEqual(voxQa.gates.filter((g) => !g.pass), [], `Voxel QA failed: ${JSON.stringify(voxQa.gates)}`);

  const voxGlb = await new GLTFExporter().parseAsync(voxStd.group, { binary: true, onlyVisible: true });
  const voxReloaded = await new GLTFLoader().parseAsync(voxGlb, '');
  assert.equal(countScene(voxReloaded.scene).tris, countScene(voxStd.group).tris);
  assert.equal(readGlbJson(voxGlb).materials.length, 2);
  const s2Ms = performance.now() - t2;

  // ---------------------------------------------------------------------------
  // 3. Scenario 3: Hybrid (Chibi + Hand-Painted + Toon Shading)
  //    Validates primary+2 modifiers, closed-socket facial pivots, native
  //    DataTexture + MeshToonMaterial gradientMap, animation, studio preview & GLB note.
  // ---------------------------------------------------------------------------
  const t3 = performance.now();
  function createBrushTexture(rng: () => number, size = 32): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    const base = new THREE.Color('#4f7cac');
    const warm = new THREE.Color('#70a288');
    const c = new THREE.Color();
    for (let y = 0; y < size; y++) {
      const grad = y / (size - 1);
      for (let x = 0; x < size; x++) {
        const stroke = 0.88 + 0.12 * Math.sin(x * 0.7 + rng() * 0.5) + 0.08 * grad;
        c.copy(base).lerp(warm, grad * 0.55).multiplyScalar(Math.min(1, stroke));
        // Stored as sRGB bytes per Three.js SRGBColorSpace convention
        const sr = Math.min(255, Math.round(Math.pow(c.r, 1 / 2.2) * 255));
        const sg = Math.min(255, Math.round(Math.pow(c.g, 1 / 2.2) * 255));
        const sb = Math.min(255, Math.round(Math.pow(c.b, 1 / 2.2) * 255));
        data.set([sr, sg, sb, 255], (y * size + x) * 4);
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  function createToonRamp(): THREE.DataTexture {
    // 3-step nearest gradient map (zero custom shaders)
    const ramp = new Uint8Array([
      85, 85, 85, 255,
      175, 175, 175, 255,
      255, 255, 255, 255,
    ]);
    const tex = new THREE.DataTexture(ramp, 3, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  const rng3 = createPRNG(11);
  const paintTex = createBrushTexture(rng3.fork('paint'));
  const gradientMap = createToonRamp();
  const toonPaintedMat = new THREE.MeshToonMaterial({ map: paintTex, gradientMap });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#22d3ee'), toneMapped: false });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e293b'), roughness: 0.85 });

  const chibiRoot = new THREE.Group();
  chibiRoot.name = 'chibi_hybrid_root';
  const torso = new THREE.Group(); torso.name = 'torso'; torso.position.set(0, 0.25, 0);
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.36), toonPaintedMat);
  torsoMesh.name = 'torso_mesh';
  torso.add(torsoMesh);
  chibiRoot.add(torso);

  // Oversized 1:1 chibi head + separated Balance/Quality facial pivots (eyelids, brows, jaw)
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.52, 0);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.52), toonPaintedMat);
  headMesh.name = 'head_mesh';
  head.add(headMesh);

  for (const [side, sx] of [['L', 0.14], ['R', -0.14]] as const) {
    const eye = new THREE.Group(); eye.name = `eye${side}`; eye.position.set(sx, 0.04, 0.27);
    const eyeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.04), eyeMat);
    eyeMesh.name = `eye${side}_mesh`; eye.add(eyeMesh);

    const lid = new THREE.Group(); lid.name = `eyelid${side}`; lid.position.set(sx, 0.11, 0.28);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), darkMat);
    lidMesh.name = `eyelid${side}_mesh`; lid.add(lidMesh);

    const brow = new THREE.Group(); brow.name = `brow${side}`; brow.position.set(sx, 0.16, 0.28);
    const browMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.04), darkMat);
    browMesh.name = `brow${side}_mesh`; brow.add(browMesh);
    head.add(eye, lid, brow);
  }
  const jaw = new THREE.Group(); jaw.name = 'lowerJawPivot'; jaw.position.set(0, -0.14, 0.12);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.2), darkMat);
  jawMesh.name = 'jaw_mesh'; jaw.add(jawMesh);
  head.add(jaw);
  torso.add(head);

  const qOpen = new THREE.Quaternion().toArray();
  const qBlink = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45).toArray();
  const qJaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.32).toArray();
  const qNod = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12).toArray();
  const idleClip = new THREE.AnimationClip('Idle', 1.6, [
    new THREE.QuaternionKeyframeTrack('eyelidL.quaternion', [0, 0.4, 0.8, 1.6], [...qOpen, ...qBlink, ...qOpen, ...qOpen]),
    new THREE.QuaternionKeyframeTrack('eyelidR.quaternion', [0, 0.4, 0.8, 1.6], [...qOpen, ...qBlink, ...qOpen, ...qOpen]),
    new THREE.QuaternionKeyframeTrack('lowerJawPivot.quaternion', [0, 0.8, 1.2, 1.6], [...qOpen, ...qOpen, ...qJaw, ...qOpen]),
    new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.8, 1.6], [...qOpen, ...qNod, ...qOpen]),
  ]);

  const hybridQa = qaGates(extractObjectParts(chibiRoot, THREE), { grounding: true });
  assert.deepEqual(hybridQa.gates.filter((g) => !g.pass), [], `Hybrid QA failed: ${JSON.stringify(hybridQa.gates)}`);

  // Verify live clip motion across facial pivots before export
  const motionBefore = clipMotion(THREE, chibiRoot, [idleClip]);
  assert.equal(motionBefore[0].moving.length, 4, 'all 4 chibi facial/head pivots move cleanly');

  const ab = await new GLTFExporter().parseAsync(chibiRoot, { binary: true, animations: [idleClip], onlyVisible: true });
  const reloaded = await new GLTFLoader().parseAsync(ab, '');
  const hybridGlb = { ab, reloaded };

  const glbJson = readGlbJson(hybridGlb.ab);
  assert.ok(Array.isArray(glbJson.images) && glbJson.images.length >= 1, 'hand-painted texture exported into GLB');
  // Confirm documented GLTF limitation: MeshToonMaterial exports as glTF pbrMetallicRoughness (gradientMap is preview-only)
  assert.ok(glbJson.materials.some((m: any) => m.pbrMetallicRoughness?.baseColorTexture !== undefined));
  assert.equal(countScene(hybridGlb.reloaded.scene).tris, countScene(chibiRoot).tris);
  assert.equal(hybridGlb.reloaded.animations.length, 1);
  const motionAfter = clipMotion(THREE, hybridGlb.reloaded.scene, hybridGlb.reloaded.animations);
  assert.ok(motionAfter[0].moving.some((m) => m.node === 'eyelidL'), 'eyelid blink preserved after GLB reload');

  // Verify pack-studio pipeline builds an interactive preview cleanly on Scenario 3
  const hybridModulePath = join(tmpOut, 'chibi-hybrid.ts');
  const hybridHtmlPath = join(tmpOut, 'chibi-hybrid.html');
  writeFileSync(hybridModulePath, `
    export function buildHybrid(_p: unknown, THREE: any) {
      const root = new THREE.Group();
      root.name = 'chibi_preview';
      const ramp = new THREE.DataTexture(new Uint8Array([90,90,90,255, 180,180,180,255, 255,255,255,255]), 3, 1, THREE.RGBAFormat);
      ramp.minFilter = THREE.NearestFilter; ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshToonMaterial({ color: '#4f7cac', gradientMap: ramp }));
      m.position.y = 0.25; m.name = 'head'; root.add(m);
      return { root, animations: [new THREE.AnimationClip('Idle', 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0,0,0,1, 0,0.2,0,0.98, 0,0,0,1])])] };
    }
  `);
  const packRun = spawnTsx(join(here, 'pack-studio.ts'), [
    '--module', hybridModulePath,
    '--export', 'buildHybrid',
    '--initial-clip', 'Idle',
    '--out', hybridHtmlPath,
  ], { cwd: rootDir });
  assert.equal(packRun.status, 0, `${packRun.stdout}${packRun.stderr}`);
  const packRes = parseResult(packRun.stdout)!;
  assert.equal(packRes.ok, true);
  assert.ok(readFileSync(hybridHtmlPath, 'utf8').includes('buildHybrid'));
  const s3Ms = performance.now() - t3;

  console.log(
    `ART-STYLES BENCHMARK: styles=${EXPECTED_STYLES.length} | depsAdded=0 | `
    + `harnessSkillTokens=${harnessSkillTokens}(baseline:4656,+${harnessSkillTokens - 4656}) | `
    + `webSkillTokens=${webSkillTokens}(baseline:3140,+${webSkillTokens - 3140}) | `
    + `modelingGuideBytes=${modelingGuideBytes}(baseline:103096,+${modelingGuideBytes - 103096}) | `
    + `S1_LowPoly=${s1Ms.toFixed(1)}ms(${lpBefore.tris}tris) | `
    + `S2_Voxel=${s2Ms.toFixed(1)}ms(std=${stdBodyTris},greedy=${greedyBodyTris},saved=${(greedyRatio * 100).toFixed(1)}%) | `
    + `S3_Hybrid=${s3Ms.toFixed(1)}ms(4movingPivots,GLB=${(hybridGlb.ab.byteLength / 1024).toFixed(1)}KB)`,
  );
  console.log('ART-STYLES OK');
  });
} finally {
  rmSync(tmpOut, { recursive: true, force: true });
}
~~~

## scripts/budget.test.ts

~~~typescript source-excerpt
// scripts/budget.test.ts: the budget gates must pass inside the limits AND fail just outside them; the LOD gates must fail on each defect they exist for. Run: npx tsx scripts/budget.test.ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, textureMiB, assetStats, budgetGates, lodGates, parseBudgetArgs, type Stats } from './budget';
import { normalizeParts, type Parts } from './qacheck';
import { parseResult, spawnTsx } from './result';
import { box, buildCrateTris } from './fixtures/crate.qa';
import { buildDragon } from './fixtures/dragon.qa';

const here = dirname(fileURLToPath(import.meta.url));
const base: Stats = { triangles: 100, gpuVertices: 300, meshes: 1, drawCalls: 1, drawCallsExact: true, materials: 1, bones: null, textures: [], textureMiB: 0 };
const gate = (s: Partial<Stats>, id: string, o: Parameters<typeof budgetGates>[1] = {}) => { const g = budgetGates({ ...base, ...s }, o).gates.find((x) => x.gate.startsWith(id)); assert.ok(g, `gate ${id} missing`); return g!; };

// 0. the table: the figures of references/budget.md, and its internal order
assert.equal(PROFILES.web.tris.prop.max, 10000); assert.equal(PROFILES.mobile.tris.hero.max, 15000); assert.equal(PROFILES.desktop.bones.max, 300); assert.equal(PROFILES.mobile.texture, 1024);
for (const [name, p] of Object.entries(PROFILES)) for (const k of ['hero', 'prop'] as const) { assert.ok(p.tris[k].target <= p.tris[k].max, `${name} ${k}`); assert.ok(p.tris.prop.max <= p.tris.hero.max, `${name}: a prop is not bigger than a hero`); }
assert.ok(Math.abs(textureMiB(1024) - 5.33) < 0.01 && Math.abs(textureMiB(2048) - 21.33) < 0.01 && Math.abs(textureMiB(4096) - 85.33) < 0.01, 'the 5.3 / 21 / 85 MiB of the table');
assert.equal(textureMiB(1024, 1024, false), 4);
assert.equal(parseBudgetArgs([]).triangleLimit, null);
assert.equal(parseBudgetArgs(['--kind', 'creature']).platform, null);
assert.equal(parseBudgetArgs(['--profile', 'mobile']).triangleLimit, PROFILES.mobile.tris.prop.max);
assert.throws(() => parseBudgetArgs(['--profile', 'toString']), /--profile must be one of/);
assert.throws(() => parseBudgetArgs(['--profile']), /--profile needs a value/);
assert.throws(() => parseBudgetArgs(['--budget', 'Infinity']), /--budget needs a positive number/);
assert.throws(() => parseBudgetArgs(['--budget']), /--budget needs a value/);

// 1. stats: GPU vertices are 3 x triangles (flat, non-indexed); draw calls group by (bone, material) when meta says so, else one per part (an upper bound)
{
  const parts: Parts = { a: box(0, 0, 0, 1, 1, 1), b: box(2, 0, 0, 3, 1, 1), c: box(4, 0, 0, 5, 1, 1) };
  const plain = assetStats(parts); assert.equal(plain.triangles, 36); assert.equal(plain.gpuVertices, 108); assert.equal(plain.meshes, 3); assert.equal(plain.drawCalls, 3); assert.equal(plain.drawCallsExact, false); assert.equal(plain.materials, null);
  const meta = { parts: { a: { material: 'wood', bone: 'root' }, b: { material: 'wood', bone: 'root' }, c: { material: 'metal', bone: 'root' } }, bones: ['root'], textures: [1024, { name: 'atlas', width: 2048, height: 1024 }] };
  const exact = assetStats(parts, meta); assert.equal(exact.drawCalls, 2, 'a and b share bone and material'); assert.equal(exact.drawCallsExact, true); assert.equal(exact.materials, 2); assert.equal(exact.bones, 1);
  assert.ok(Math.abs(exact.textureMiB - (textureMiB(1024) + textureMiB(2048, 1024))) < 1e-9); assert.equal(exact.textures[1].name, 'atlas');
  assert.equal(assetStats(parts, { ...meta, parts: { ...meta.parts, a: { material: 'wood', bone: 'arm' } } }).drawCalls, 3, 'another bone is another draw call');
  assert.equal(assetStats(parts, { parts: { a: { material: 'm' } } }).drawCallsExact, false, 'meta that misses a part is not exact');
  assert.equal(assetStats(parts, { bones: 12 }).bones, 12);
}

// 2. triangles: pass at the limit, fail one above, the target is a note
assert.equal(gate({ triangles: 10000 }, 'B1').pass, true); assert.equal(gate({ triangles: 10001 }, 'B1').pass, false);
assert.match(gate({ triangles: 5000 }, 'B1').value, /above the target/); assert.doesNotMatch(gate({ triangles: 900 }, 'B1').value, /above the target/);
assert.equal(gate({ triangles: 3001 }, 'B1', { platform: 'mobile' }).pass, false, 'a mobile prop is limited to 3000');
assert.equal(gate({ triangles: 3001 }, 'B1', { platform: 'mobile', kind: 'hero' }).pass, true, 'but a hero may have 15000');
assert.equal(gate({ triangles: 150001 }, 'B1', { platform: 'desktop', kind: 'hero' }).pass, false);
// materials, bones, textures
assert.equal(gate({ materials: 2 }, 'B2').pass, true); assert.equal(gate({ materials: 3 }, 'B2').pass, false);
assert.equal(gate({ bones: 100 }, 'B4').pass, true); assert.equal(gate({ bones: 101 }, 'B4').pass, false); assert.equal(gate({ bones: 76 }, 'B4', { platform: 'mobile' }).pass, false);
{ const t = (n: number) => ({ textures: [{ name: 'atlas', w: n, h: n, mib: textureMiB(n) }], textureMiB: textureMiB(n) });
  assert.equal(gate(t(2048), 'B3').pass, true); assert.equal(gate(t(4096), 'B3').pass, false, 'web allows 2048'); assert.equal(gate(t(4096), 'B3', { platform: 'desktop' }).pass, true); assert.equal(gate(t(2048), 'B3', { platform: 'mobile' }).pass, false); assert.match(gate(t(2048), 'B3').value, /21\.33 MiB/); }
// draw calls: only mobile and web have a limit in the table; the number is labelled an upper bound when meta is missing
assert.equal(gate({ drawCalls: 100 }, 'B5').pass, true); assert.equal(gate({ drawCalls: 51 }, 'B5', { platform: 'mobile' }).pass, false); assert.match(gate({ drawCallsExact: false }, 'B5').value, /upper bound/);
for (const platform of ['vr', 'desktop'] as const) { assert.equal(budgetGates(base, { platform }).gates.some((g) => g.gate.startsWith('B5')), false); assert.ok(budgetGates(base, { platform }).skipped.some((s) => s.startsWith('B5')), `${platform}: no limit is reported as not checked, not invented`); }
// GLB size: hero on mobile or web only
assert.equal(gate({}, 'B6', { kind: 'hero', glbBytes: 5 * 1048576 }).pass, true); assert.equal(gate({}, 'B6', { kind: 'hero', glbBytes: 5 * 1048576 + 1 }).pass, false);
assert.match(gate({}, 'B6', { kind: 'hero', glbBytes: 3 * 1048576 }).value, /above the target/);
assert.ok(budgetGates(base, { kind: 'prop', glbBytes: 1 }).skipped.some((s) => s.startsWith('B6')), 'no table value for a prop GLB');
assert.ok(budgetGates(base, { kind: 'hero', platform: 'desktop', glbBytes: 1 }).skipped.some((s) => s.startsWith('B6')));
assert.ok(budgetGates(base).skipped.some((s) => /B6.*no --glb/.test(s)));
// unknown facts are skipped, never guessed
{ const r = budgetGates({ ...base, materials: null }); assert.ok(r.skipped.some((s) => s.startsWith('B2')) && r.skipped.some((s) => s.startsWith('B3')) && r.skipped.some((s) => s.startsWith('B4'))); }

// 3. LOD gates: the real kernel passes; each defect trips its own gate and only that one
// A row of closed boxes with gaps (touching boxes would share faces and fail Q4, which is a real finding) from x = 0 to x = 2: 4 / 2 / 1 boxes at detail 2 / 1 / 0 (48, 24, 12 triangles),
// the same part, the same bounds. Each defect changes ONE thing.
const row = (detail: number, o: { boxes?: number[]; lift?: number; extra?: boolean; hole?: boolean; wobble?: number } = {}): Parts => {
  const n = (o.boxes ?? [1, 2, 4])[detail], bw = n === 1 ? 2 : 0.8 * (2 / n), step = n === 1 ? 0 : (2 - bw) / (n - 1), y = detail === 0 ? (o.lift ?? 0) : 0;
  let t: number[] = []; for (let i = 0; i < n; i++) t.push(...box(i * step, y, 0, i * step + bw, y + 1 + (o.wobble ?? 0), 1));
  if (o.hole && detail === 0) t = t.slice(9);
  const parts: Parts = { a: t }; if (o.extra && detail > 0) parts.b = box(5, 0, 0, 6, 1, 1);
  return parts;
};
const lodOf = async (o: Parameters<typeof row>[1] = {}, flaky = false) => { let calls = 0; const r = await lodGates(async (p) => row(Number(p.detail), { ...o, wobble: flaky ? 1e-3 * (calls++ % 2) : 0 }), normalizeParts, {}, {}); return { by: Object.fromEntries(r.gates.map((g) => [g.gate.split(' ')[0], g])), gates: r.gates, levels: r.levels }; };
const failing = (r: { gates: { gate: string; pass: boolean }[] }) => r.gates.filter((g) => !g.pass).map((g) => g.gate.split(' ')[0]);
{
  const kernel = await lodGates(async (p) => buildDragon(p), normalizeParts, { seed: 7 }, { open: ['wingL', 'wingR'], symmetric: true });
  assert.deepEqual(kernel.gates.filter((g) => !g.pass), []); assert.deepEqual(kernel.levels.map((l) => l.triangles), [388, 204, 96]); assert.equal(kernel.gates.length, 4, 'L1 to L4 only: no L0 when every level passes QA');
  const control = await lodOf(); assert.deepEqual(failing(control), [], 'control: the row builder passes'); assert.deepEqual(control.levels.map((l) => l.triangles), [48, 24, 12]);

  const ignores = await lodOf({ boxes: [4, 4, 4] }); assert.deepEqual(failing(ignores), ['L1'], 'a builder that ignores detail'); assert.match(ignores.by.L1.hint, /ignores `detail`/);
  const steep = await lodOf({ boxes: [1, 2, 8] }); assert.deepEqual(failing(steep), ['L1'], 'ratios 0.25 and 0.5 are not both "half"');
  const drops = await lodOf({ extra: true }); assert.ok(failing(drops).includes('L2'), 'a level that drops a part'); assert.match(drops.by.L2.value, /differ/);
  const moves = await lodOf({ lift: 0.5 }); assert.deepEqual(failing(moves), ['L3'], 'the lowest level floats half a metre: pivot moved'); assert.match(moves.by.L3.value, /2\d\.\d%/);
  const small = await lodOf({ lift: 0.05 }); assert.deepEqual(failing(small), [], '0.05 of a 2 m asset is 2.5%: inside the 5% limit');
  const rand = await lodOf({}, true); assert.ok(failing(rand).includes('L4'), 'two builds of one level differ');
  const hole = await lodOf({ hole: true }); assert.ok(hole.by.L0, 'a level with a hole reports its own QA failure'); assert.equal(hole.by.L0.pass, false); assert.match(hole.by.L0.gate, /detail 0/); assert.match(hole.by.L0.value, /Q4/);
}

// 4. the CLI end to end
{
  const out = mkdtempSync(join(tmpdir(), 'budget-'));
  const runTool = (name: string, a: string[]) => { const r = spawnTsx(join(here, `${name}.ts`), a, { cwd: out }); return { code: r.status, out: `${r.stdout}${r.stderr}`, res: parseResult(r.stdout) }; };
  const run = (...a: string[]) => runTool('mesh-stats', a);
  const dragon = join(here, 'fixtures', 'dragon.qa.ts'), crate = join(here, 'fixtures', 'crate.qa.ts');

  const lods = run('--module', dragon, '--lods', '--open', 'wingL,wingR', '--symmetric');
  assert.equal(lods.code, 0, lods.out); assert.equal(lods.res?.ok, true); assert.equal((lods.res?.levels as unknown[]).length, 3);
  assert.ok((lods.res?.unverified as string[]).some((u) => /not measured in a renderer/.test(u)), 'the report says nothing was measured on a GPU');
  const noLods = run('--module', crate, '--export', 'buildCrateTris'); assert.equal(noLods.code, 0, noLods.out); assert.ok((noLods.res?.skipped as string[]).some((s) => s.startsWith('L1 to L4')));

  const big = join(out, 'big.json'), t: number[] = []; for (let i = 0; i < 4000; i++) t.push(i, 0, 0, i + 1, 0, 0, i, 1, 0.5);
  writeFileSync(big, JSON.stringify({ blob: t }));
  const over = run('--tris', big, '--profile', 'mobile', '--kind', 'prop');
  assert.equal(over.code, 2, over.out); assert.equal(over.res?.ok, false); assert.match(over.out, /FAIL {2}B1 triangles: 4000 triangles/);
  assert.equal(run('--tris', big, '--profile', 'desktop', '--kind', 'prop').code, 0, 'the same asset fits a desktop prop');

  const meta = join(out, 'meta.json'); writeFileSync(meta, JSON.stringify({ parts: { blob: { material: 'm', bone: 'root' } }, bones: 120, textures: [4096] }));
  const withMeta = run('--tris', big, '--profile', 'desktop', '--meta', meta); assert.equal(withMeta.code, 0, withMeta.out); assert.equal((withMeta.res?.stats as { materials: number }).materials, 1); assert.equal((withMeta.res?.stats as { drawCallsExact: boolean }).drawCallsExact, true);
  assert.equal(run('--tris', big, '--profile', 'web', '--meta', meta).code, 2, 'web: the 4096 texture and 120 bones fail');
  const glb = join(out, 'a.glb'); writeFileSync(glb, new Uint8Array(6 * 1048576));
  assert.equal(run('--tris', big, '--profile', 'web', '--kind', 'hero', '--glb', glb).code, 2, 'a 6 MiB hero GLB is over 5 on web');
  const measured = run('--tris', big, '--kind', 'hero', '--meta', meta, '--glb', glb);
  assert.equal(measured.code, 0, measured.out);
  assert.equal(measured.res?.platform, null);
  assert.equal(measured.res?.triangleLimit, null);
  assert.deepEqual(measured.res?.gates, []);
  const metrics = measured.res?.stats as Stats & { glbBytes: number };
  assert.equal(metrics.triangles, 4000);
  assert.equal(metrics.bones, 120);
  assert.equal(metrics.textures[0].w, 4096);
  assert.equal(metrics.glbBytes, 6 * 1048576);
  assert.doesNotMatch(measured.out, /Within budget/);

  assert.equal(run().code, 1); assert.equal(run('--tris', big, '--profile', 'phone').code, 1); assert.equal(run('--tris', big, '--kind', 'boss').code, 1);
  assert.equal(run('--tris', big, '--lods').code, 1, '--lods needs a builder'); assert.equal(run('--tris', big, '--meta', join(out, 'nope.json')).code, 1); assert.equal(run('--tris', big, '--glb', join(out, 'nope.glb')).code, 1);
  const missing = run('--module', join(out, 'nope.ts')); assert.equal(missing.code, 1); assert.match(String(missing.res?.error), /cannot build or read/);

  // 5. v4.2 category kinds (creature, vehicle, building) & L0 LOD budget respects profile+kind (not locked at 2000)
  assert.equal(gate({ materials: 5 }, 'B2', { platform: 'web', kind: 'vehicle' }).pass, true, 'web vehicle allows up to 6 materials (paint, rubber, metal, glass, lights)');
  assert.equal(gate({ materials: 7 }, 'B2', { platform: 'web', kind: 'vehicle' }).pass, false);
  assert.equal(gate({ materials: 5 }, 'B2', { platform: 'web', kind: 'building' }).pass, true, 'web building allows up to 6 materials');
  assert.equal(gate({ triangles: 25000 }, 'B1', { platform: 'web', kind: 'creature' }).pass, true);
  assert.equal(gate({ triangles: 20000 }, 'B1', { platform: 'web', kind: 'building' }).pass, true);
  const heavyMod = join(out, 'heavyCreature.ts');
  writeFileSync(heavyMod, `
    import { box } from ${JSON.stringify(join(here, 'fixtures', 'crate.qa.ts'))};
    export function buildHeavy(p: { detail?: number } = {}) {
      const d = p.detail ?? 2;
      const count = d === 2 ? 256 : d === 1 ? 128 : 64; // 3,084 -> 1,548 -> 780 triangles including the end box
      const tris: number[] = [];
      for (let i = 0; i < count; i++) { const x = i * 2; tris.push(...box(x, 0, 0, x + 1, 1, 1)); }
      // keep identical outer bounds at all LODs by anchoring end box at fixed X
      const endX = 512; tris.push(...box(endX, 0, 0, endX + 1, 1, 1));
      return { body: tris };
    }
  `);
  const heavyRes = run('--module', heavyMod, '--export', 'buildHeavy', '--profile', 'web', '--kind', 'creature', '--lods');
  assert.equal(heavyRes.code, 0, `>2000-tri creature must pass L0 under web/creature budget:\n${heavyRes.out}`);
  assert.equal(heavyRes.res?.ok, true);

  // One real closed asset exercises the same limit through all three CLIs. Stats also checks every LOD.
  const full = 3084;
  const builder = ['--module', heavyMod, '--export', 'buildHeavy'];
  for (const tool of ['qa-asset', 'mesh-stats', 'export-glb']) {
    const check = (file: string, ...args: string[]) => {
      const path = join(out, `${file}.glb`);
      const extra = tool === 'qa-asset' ? ['--no-render'] : tool === 'mesh-stats' ? ['--lods'] : ['--out', path];
      return { ...runTool(tool, [...builder, ...extra, ...args]), path };
    };
    const untargeted = check('untargeted');
    assert.equal(untargeted.code, 0, untargeted.out);
    assert.equal(untargeted.res?.triangleLimit, null);
    assert.equal(untargeted.res?.triangles ?? (untargeted.res?.stats as Stats).triangles, full);
    assert.ok((untargeted.res?.skipped as string[]).some((s) => /^(Q5 budget|B1 triangle limit)/.test(s)));

    const profile = check('profile', '--profile', 'mobile', '--kind', 'prop');
    assert.equal(profile.code, 2, profile.out);
    assert.equal(profile.res?.triangleLimit, 3000);
    assert.match(profile.out, /(?:Q5 budget|B1 triangles).*3000/);

    const raised = check('raised', '--profile', 'mobile', '--kind', 'prop', '--budget', String(full));
    assert.equal(raised.code, 0, raised.out);
    assert.equal(raised.res?.triangleLimit, full);
    assert.equal(raised.res?.platform, 'mobile', 'a triangle override leaves the target platform selected');

    const tooLow = check('below-limit', '--budget', String(full - 1));
    assert.equal(tooLow.code, 2, tooLow.out);
    assert.equal(tooLow.res?.triangleLimit, full - 1);
    assert.equal(tooLow.res?.platform, null);

    const invalid = check('invalid', '--budget', '0');
    assert.equal(invalid.code, 1, invalid.out);
    assert.match(String(invalid.res?.error), /--budget needs a positive number/);

    if (tool === 'mesh-stats') {
      assert.deepEqual(untargeted.res?.gates?.map((g) => g.gate.split(' ')[0]), ['L1', 'L2', 'L3', 'L4']);
      assert.equal(raised.res?.gates?.find((g) => g.gate.startsWith('B1'))?.pass, true);
      assert.equal(raised.res?.gates?.find((g) => g.gate.startsWith('B5'))?.pass, true);
      assert.equal(tooLow.res?.gates?.find((g) => g.gate.startsWith('B1'))?.pass, false);
      assert.match(tooLow.res?.gates?.find((g) => g.gate.startsWith('L0'))?.value ?? '', /Q5 budget: 3084 of 3083/);
    }
    if (tool === 'export-glb') {
      assert.ok(existsSync(untargeted.path) && existsSync(raised.path));
      assert.equal(tooLow.res?.file, null);
      assert.ok(!existsSync(profile.path) && !existsSync(tooLow.path) && !existsSync(invalid.path));
    }
  }

  // 6. v4.6 direct --module support on (params, THREE) builders auto-extracts materials, bones, and exact draw calls
  const threeAsset = join(out, 'threeAsset.ts');
  writeFileSync(threeAsset, `
    export function buildCreatureAsset(_p: unknown, THREE: any) {
      const root = new THREE.Group();
      const bRoot = new THREE.Bone(); bRoot.name = 'rootBone';
      const bHead = new THREE.Bone(); bHead.name = 'headBone'; bRoot.add(bHead);
      const bWing = new THREE.Bone(); bWing.name = 'wingBone'; bRoot.add(bWing);
      const bTail = new THREE.Bone(); bTail.name = 'tailBone'; bRoot.add(bTail);
      const bodyMat = new THREE.MeshStandardMaterial({ name: 'body' });
      const glowMat = new THREE.MeshBasicMaterial({ name: 'glow' });
      const m1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), bodyMat); m1.name = 'torso';
      const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), glowMat); m2.name = 'eyes';
      bRoot.add(m1, m2);
      root.add(bRoot);
      return { root, animations: [] };
    }
  `);
  const modStats = run('--module', threeAsset, '--profile', 'web', '--kind', 'creature');
  assert.equal(modStats.code, 0, modStats.out);
  const modS = modStats.res?.stats as Stats;
  assert.equal(modS.drawCallsExact, true);
  assert.equal(modS.materials, 2);
  assert.equal(modS.bones, 4);
  assert.equal(modS.drawCalls, 2);
}
console.log('BUDGET OK');
~~~

## scripts/color-qc.test.ts

~~~typescript source-excerpt
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
~~~

## scripts/glb.test.ts

~~~typescript source-excerpt
// scripts/glb.test.ts: the writer must round-trip a good asset AND the gates must fail on each defect they exist for. Run: npx tsx scripts/glb.test.ts
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partsToGlb, readGlb, glbGates, faceNormal, type Parts } from './glb';
import { parseGlbHeader } from './asset-builder';
import { parseResult, spawnTsx } from './result';
import { box, buildCrateTris } from './fixtures/crate.qa';

const here = dirname(fileURLToPath(import.meta.url));
const gateOf = (bytes: Uint8Array, source: Parts, id: string) => { const g = glbGates(bytes, source).find((x) => x.gate.startsWith(id)); assert.ok(g, `gate ${id} missing`); return g!; };
const crate = buildCrateTris({ seed: 3 }) as Parts, cube = box(-0.5, 0, -0.5, 0.5, 1, 0.5);
const setU32 = (b: Uint8Array, at: number, v: number) => new DataView(b.buffer, b.byteOffset).setUint32(at, v, true);

// 0. faceNormal: +Z triangle, and a degenerate one
assert.deepEqual(faceNormal([0, 0, 0, 1, 0, 0, 0, 1, 0], 0), [0, 0, 1]);
assert.deepEqual(faceNormal([0, 0, 0, 0, 0, 0, 0, 0, 0], 0), [0, 0, 0]);

// 1. a good asset: the container is well formed and every gate passes
{
  const glb = partsToGlb(crate);
  assert.equal(glb.length % 4, 0, 'whole file is 4-byte aligned');
  const dv = new DataView(glb.buffer), info = readGlb(glb);
  assert.equal(dv.getUint32(0, true), 0x46546c67); assert.equal(dv.getUint32(4, true), 2); assert.equal(dv.getUint32(8, true), glb.length);
  assert.deepEqual(info.json.nodes.map((n: any) => n.name), ['body', 'battens'], 'node names are the part names, in order');
  assert.equal(info.json.accessors.length, 4); assert.deepEqual(info.json.accessors[0].min.length, 3);
  const g = glbGates(glb, crate); assert.deepEqual(g.filter((x) => !x.pass), []); assert.equal(g.length, 6);
  assert.deepEqual(info.parts.body, Array.from(new Float32Array(crate.body)), 'positions round-trip at float32');
}

// 2. determinism: same parts, same bytes; seed 0 is its own asset
{
  const a = partsToGlb(buildCrateTris({ seed: 7 }) as Parts), b = partsToGlb(buildCrateTris({ seed: 7 }) as Parts);
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
  assert.notDeepEqual(Buffer.from(partsToGlb(buildCrateTris({ seed: 0 }) as Parts)), Buffer.from(partsToGlb(buildCrateTris({ seed: 1 }) as Parts)));
}

// 3. the writer refuses bad input
assert.throws(() => partsToGlb({}), /no parts/);
assert.throws(() => partsToGlb({ a: [] }), /whole number of triangles/);
assert.throws(() => partsToGlb({ a: [0, 0, 0, 1, 0, 0] }), /whole number of triangles/);
assert.throws(() => partsToGlb({ a: [...cube, NaN, 0, 0, 0, 0, 0, 0, 0, 0] }), /NaN or Infinity/);

// 4. each defect trips its own gate (the reader must name what is wrong, not crash)
{
  const good = partsToGlb({ cube });
  const badMagic = good.slice(); badMagic[0] = 0x58; assert.match(glbGates(badMagic, { cube })[0].value, /magic/);
  const badVersion = good.slice(); setU32(badVersion, 4, 1); assert.match(glbGates(badVersion, { cube })[0].value, /version 1/);
  const badLength = good.slice(); setU32(badLength, 8, good.length + 4); assert.match(glbGates(badLength, { cube })[0].value, /header length/);
  assert.equal(glbGates(good.slice(0, 30), { cube })[0].pass, false, 'truncated file');
  assert.equal(glbGates(new Uint8Array(5), { cube })[0].pass, false, 'shorter than a header');
  const badJson = good.slice(); badJson[20] = 0x7e;   // replaces the opening brace const r = glbGates(badJson, { cube })[0]; assert.equal(r.pass, false); assert.match(r.gate, /E2/);

  const other = partsToGlb({ cube: cube.map((v) => v + 0.25) });                                // valid GLB, but not made from this input
  assert.equal(gateOf(other, { cube }, 'E4').pass, false, 'round-trip catches changed vertices');
  assert.equal(gateOf(partsToGlb({ cube: cube.slice(9) }), { cube }, 'E6').pass, false, 'a lost triangle is counted');
  assert.equal(gateOf(partsToGlb({ renamed: cube }), { cube }, 'E2').pass, false, 'node names must equal part names');

  // flip a stored normal: E5 (normal against winding)
  const info = readGlb(good), nv = info.json.bufferViews[1], at = good.length - info.bin.length + nv.byteOffset;   // BIN is the last chunk, normals are the 2nd bufferView
  const flipped = good.slice(), fdv = new DataView(flipped.buffer); for (let k = 0; k < 3; k++) fdv.setFloat32(at + k * 4, -fdv.getFloat32(at + k * 4, true), true);   // negate the first vertex normal
  assert.equal(gateOf(flipped, { cube }, 'E5').pass, false, 'a changed normal is reported');
  // POSITION min is checked against the data
  const j = JSON.stringify(info.json), tampered = j.replace(/"min":\[[^\]]*\]/, '"min":[9,9,9]');
  assert.notEqual(j, tampered);
  const enc = new TextEncoder().encode(tampered), jl = new DataView(good.buffer).getUint32(12, true); assert.ok(enc.length <= jl, 'tampered JSON fits the original chunk');
  const bad = good.slice(); bad.fill(0x20, 20, 20 + jl); bad.set(enc, 20); assert.equal(gateOf(bad, { cube }, 'E3').pass, false, 'wrong min/max');
}

// 5. inside-out input is visible in the GLB too: the normal follows the winding, so the volume sign is recoverable from the file
{
  const flip = cube.slice(); for (let i = 0; i < flip.length; i += 9) for (let k = 0; k < 3; k++) { flip[i + 3 + k] = cube[i + 6 + k]; flip[i + 6 + k] = cube[i + 3 + k]; }
  const info = readGlb(partsToGlb({ flip })), n = info.normals.flip, p = info.parts.flip;
  let outward = 0; for (let i = 0; i < p.length; i += 9) { const cx = (p[i] + p[i + 3] + p[i + 6]) / 3, cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3 - 0.5, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3; outward += n[i] * cx + n[i + 1] * cy + n[i + 2] * cz > 0 ? 1 : -1; }
  assert.equal(outward, -12, 'every normal of an inside-out cube points inward');
}

// 6. the CLI end to end: file on disk, exit codes, @@RESULT, QA refusal, --skip-qa, usage and load errors
{
  const out = mkdtempSync(join(tmpdir(), 'glb-')), cli = join(here, 'export-glb.ts');
  const run = (...a: string[]) => { const r = spawnTsx(cli, a, { cwd: out }); const o = `${r.stdout}${r.stderr}`; return { code: r.status, out: o, res: parseResult(r.stdout) }; };
  const crateFile = join(here, 'fixtures', 'crate.qa.ts'), file = join(out, 'crate.glb');

  const ok = run('--module', crateFile, '--export', 'buildCrateTris', '--params', '{"seed":0}', '--out', file);
  assert.equal(ok.code, 0, ok.out); assert.equal(ok.res?.ok, true); assert.equal(ok.res?.file, file);
  assert.deepEqual((ok.res?.gates as { pass: boolean }[]).filter((g) => !g.pass), []);
  assert.deepEqual(Array.from(readFileSync(file)), Array.from(partsToGlb(buildCrateTris({ seed: 0 }) as Parts)), 'the file equals the library output for the same seed');
  assert.ok((ok.res?.unverified as string[]).some((u) => u.includes('real viewer')), 'the report must say no third-party loader was run');

  const flip = cube.slice(); for (let i = 0; i < flip.length; i += 9) for (let k = 0; k < 3; k++) { flip[i + 3 + k] = cube[i + 6 + k]; flip[i + 6 + k] = cube[i + 3 + k]; }
  const bad = join(out, 'bad.json'); writeFileSync(bad, JSON.stringify({ body: flip }));
  const refused = run('--tris', bad, '--out', join(out, 'bad.glb'));
  assert.equal(refused.code, 2, refused.out); assert.equal(refused.res?.file, null, 'no file for an inside-out asset'); assert.match(refused.out, /Q3/);
  const forced = run('--tris', bad, '--skip-qa', '--out', join(out, 'forced.glb'));
  assert.equal(forced.code, 0, forced.out); assert.ok((forced.res?.unverified as string[]).some((u) => u.includes('--skip-qa')), '--skip-qa must be reported');

  const sheet = join(out, 'sheet.json'); writeFileSync(sheet, JSON.stringify({ flag: [0, 0, 0, 1, 0, 0, 0, 1, 0] }));
  assert.equal(run('--tris', sheet, '--out', join(out, 'sheet.glb')).code, 2, 'a sheet fails Q4 unless named in --open');
  assert.equal(run('--tris', sheet, '--open', 'flag', '--out', join(out, 'sheet.glb')).code, 0, '--open lets a sheet through');

  assert.equal(run().code, 1); assert.equal(run('--tris', bad, '--color', '2,0,0').code, 1, 'colour out of range');
  const missing = run('--module', join(out, 'nope.ts')); assert.equal(missing.code, 1); assert.match(String(missing.res?.error), /cannot build or read/);

}

// 7. Rigged export from an external working directory, with no NODE_PATH in the child.
{
  const out = mkdtempSync(join(tmpdir(), 'glb external '));
  const rigCli = join(here, 'export-rigged-glb.ts');
  const env = { ...process.env };
  delete env.NODE_PATH;
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const checkTrack = async (file: string, clipName: string, trackName: string, times: number[]) => {
    const disk = readFileSync(join(out, file));
    const buffer = disk.buffer.slice(disk.byteOffset, disk.byteOffset + disk.byteLength);
    const { animations } = await new GLTFLoader().parseAsync(buffer, '');
    assert.deepEqual(animations.map((clip) => clip.name), [clipName]);
    assert.deepEqual(animations[0].tracks.map((track) => track.name), [trackName]);
    assert.deepEqual(Array.from(animations[0].tracks[0].times), times);
  };
  const runRigged = (module: string, file: string, ...args: string[]) => {
    const res = spawnTsx(rigCli, ['--module', module, '--out', file, ...args], { cwd: out, env });
    assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
    const result = parseResult(res.stdout)!;
    assert.equal(result.ok, true);
    const disk = readFileSync(join(out, file));
    assert.equal(result.out, join(out, file));
    assert.equal(disk.toString('ascii', 0, 4), 'glTF');
    assert.equal(result.bytes, disk.length);
    assert.deepEqual(result.after, result.before);
    assert.ok(result.gates?.length && result.gates.every((gate) => gate.pass));
    return result;
  };

  const injected = 'riggedSample.ts';
  writeFileSync(join(out, injected), `
    export function buildSample(params: { size: number }, THREE: any) {
      if (process.env.NODE_PATH !== undefined || params.size !== 0.5) throw new Error('unexpected export environment');
      const root = new THREE.Group(); root.name = 'sample_root';
      const pivot = new THREE.Group(); pivot.name = 'head'; pivot.position.set(0, 1, 0); root.add(pivot);
      const geo = new THREE.BoxGeometry(params.size, params.size, params.size).toNonIndexed();
      const colors = new Float32Array(geo.attributes.position.count * 3).fill(0.5);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
      mesh.name = 'head_mesh'; pivot.add(mesh);
      const clip = new THREE.AnimationClip('Nod', 1.0, [
        new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0, 0, 0, 1, 0.1, 0, 0, 0.995, 0, 0, 0, 1]),
      ]);
      return { root, animations: [clip] };
    }
  `);
  const rigParsed = runRigged(injected, 'sample-rigged.glb', '--export', 'buildSample', '--params', '{"size":0.5}');
  assert.deepEqual(rigParsed.clips, ['Nod']);
  assert.deepEqual(rigParsed.before, { tris: 12, meshes: 1, skins: 0, bones: 0, vertexColorMeshes: 1 });
  assert.equal(rigParsed.gates?.find((gate) => gate.gate === 'RG6 track binding')?.pass, true);
  assert.equal(rigParsed.gates?.find((gate) => gate.gate === 'RG7 clip motion')?.pass, true);
  await checkTrack('sample-rigged.glb', 'Nod', 'head.quaternion', [0, 0.5, 1]);
  const blocked = spawnTsx(rigCli, ['--module', injected, '--params', '{"size":0.5}', '--out', join(injected, 'bad.glb')], { cwd: out, env });
  assert.equal(blocked.status, 1);
  assert.match(String(parseResult(blocked.stdout)?.error), /cannot write or re-open/);

  const rigidModule = 'voxelRigid.ts';
  writeFileSync(join(out, rigidModule), `
    export function buildVoxel(params: { mode?: string }, THREE: any) {
      const root = new THREE.Group(); root.name = 'voxel_root';
      const armL = new THREE.Group(); armL.name = 'armL'; armL.position.set(0.5, 1, 0);
      root.add(armL);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), new THREE.MeshStandardMaterial({ color: '#4c9f50' }));
      mesh.name = 'armL_mesh';
      armL.add(mesh);
      if (params.mode === 'euler') {
        const track = new THREE.NumberKeyframeTrack('armL.rotation[x]', [0, 0.5, 1], [0, 0.6, 0]);
        return { root, animations: [new THREE.AnimationClip('Walk', 1, [track])] };
      }
      const track = new THREE.QuaternionKeyframeTrack('armL.quaternion', [0, 0.5, 1], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
      return { root, animations: [new THREE.AnimationClip('Hold', 1, [track])] };
    }
  `);
  const eulerRes = spawnTsx(rigCli, ['--module', rigidModule, '--params', '{"mode":"euler"}', '--out', 'voxel-euler.glb'], { cwd: out, env });
  assert.equal(eulerRes.status, 2, eulerRes.stdout + eulerRes.stderr);
  const eulerJson = parseResult(eulerRes.stdout)!;
  assert.equal(eulerJson.ok, false);
  const eulerRg6 = eulerJson.gates?.find((g) => g.gate === 'RG6 track binding');
  const eulerRg7 = eulerJson.gates?.find((g) => g.gate === 'RG7 clip motion');
  assert.equal(eulerRg6?.pass, false);
  assert.match(String(eulerRg6?.value), /rotation/);
  assert.equal(eulerRg7?.pass, false);

  const holdFail = spawnTsx(rigCli, ['--module', rigidModule, '--params', '{"mode":"hold"}', '--out', 'voxel-hold.glb'], { cwd: out, env });
  assert.equal(holdFail.status, 2, holdFail.stdout + holdFail.stderr);
  const holdJson = parseResult(holdFail.stdout)!;
  assert.equal(holdJson.gates?.find((g) => g.gate === 'RG7 clip motion')?.pass, false);
  const holdPass = runRigged(rigidModule, 'voxel-hold-ok.glb', '--params', '{"mode":"hold"}', '--static-clips', 'Hold');
  assert.equal(holdPass.gates?.find((g) => g.gate === 'RG7 clip motion')?.pass, true);

  if (typeof nodeModule.registerHooks === 'function') {
    writeFileSync(join(out, 'dimensions.ts'), 'export const size: number = 2;');
    const skin = 'bare-import.ts';
    writeFileSync(join(out, skin), `
      import * as THREE from 'three';
      import { size } from './dimensions';
      export function buildSkin() {
        if (process.env.NODE_PATH !== undefined) throw new Error('NODE_PATH was set');
        const root = new THREE.Group();
        const geometry = new THREE.BoxGeometry(size, size, size);
        const count = geometry.attributes.position.count;
        const weights = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) weights[i * 4] = 1;
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
        geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
        const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
        const joint = new THREE.Bone();
        joint.name = 'joint';
        mesh.add(joint);
        mesh.bind(new THREE.Skeleton([joint]));
        root.add(mesh);
        root.userData.animations = [new THREE.AnimationClip('Joint move', 1, [
          new THREE.VectorKeyframeTrack('joint.position', [0, 1], [0, 0, 0, 0, 0.1, 0]),
        ])];
        return root;
      }
    `);
    const skinned = runRigged(join(out, skin), 'sample-skinned.glb');
    assert.deepEqual(skinned.clips, ['Joint move']);
    assert.deepEqual(skinned.before, { tris: 12, meshes: 1, skins: 1, bones: 1, vertexColorMeshes: 0 });
    assert.equal(skinned.gates?.find((gate) => gate.gate === 'RG5 skin/bones')?.pass, true);
    await checkTrack('sample-skinned.glb', 'Joint move', 'joint.position', [0, 1]);

    const esm = join(out, 'esm');
    mkdirSync(esm);
    writeFileSync(join(esm, 'package.json'), '{"type":"module"}');
    writeFileSync(join(esm, 'size.txt'), '2');
    writeFileSync(join(esm, 'asset.js'), `
      import { readFileSync } from 'node:fs';
      import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
      export default function build() {
        const size = Number(readFileSync(new URL('./size.txt', import.meta.url), 'utf8'));
        if (size !== 2 || process.env.NODE_PATH !== undefined) throw new Error('unexpected export environment');
        return new Mesh(new BoxGeometry(size, size, size), new MeshStandardMaterial());
      }
    `);
    const js = runRigged(join('esm', 'asset.js'), join('results', 'sample-js.glb'));
    assert.deepEqual(js.before, { tris: 12, meshes: 1, skins: 0, bones: 0, vertexColorMeshes: 0 });
    assert.equal(js.gates?.find((gate) => gate.gate === 'RG8 topology')?.pass, true);
    assert.ok(!js.gates?.some((gate) => gate.gate.startsWith('RG6') || gate.gate.startsWith('RG7')));

    // RG8 catches overlapping/open edges after GLB reload and honors --open for intentional sheets
    const openSheet = 'openSheet.ts';
    writeFileSync(join(out, openSheet), `
      export function buildSheet(_p: unknown, THREE: any) {
        const root = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
        box.name = 'body';
        const geo = new THREE.PlaneGeometry(0.5, 0.5);
        const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
        flag.name = 'flag_sheet';
        root.add(box, flag);
        return root;
      }
    `);
    const rg8Fail = spawnTsx(rigCli, ['--module', openSheet, '--out', 'sheet-fail.glb'], { cwd: out, env });
    assert.equal(rg8Fail.status, 2, rg8Fail.stdout + rg8Fail.stderr);
    assert.equal(parseResult(rg8Fail.stdout)?.gates?.find((g) => g.gate === 'RG8 topology')?.pass, false);
    const rg8OpenOk = runRigged(openSheet, 'sheet-open-ok.glb', '--open', 'flag_sheet');
    assert.equal(rg8OpenOk.gates?.find((g) => g.gate === 'RG8 topology')?.pass, true);

    // 8. v4.6 userData bloat prevention + RG1 JSON guard + RG9 posed skin integrity
    const bloatMod = 'bloatRig.ts';
    writeFileSync(join(out, bloatMod), `
      export function buildBloat(_p: unknown, THREE: any) {
        const root = new THREE.Group();
        const rootBone = new THREE.Bone(); rootBone.name = 'hips';
        const child = new THREE.Bone(); child.name = 'head'; child.position.set(0, 1, 0);
        rootBone.add(child);
        const geo = new THREE.BoxGeometry(0.4, 0.8, 0.4);
        const count = geo.attributes.position.count;
        const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) sw[i * 4] = 1;
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
        mesh.name = 'body';
        mesh.add(rootBone);
        mesh.bind(new THREE.Skeleton([rootBone, child]));
        root.add(mesh);
        const clip = new THREE.AnimationClip('Nod', 1, [
          new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0, 0, 0, 1, 0.25, 0, 0, 0.968, 0, 0, 0, 1]),
        ]);
        // Simulate common leak: attaching live bones & animations onto userData
        root.userData = { bones: { hips: rootBone, head: child }, animations: [clip], tag: 'clean-note' };
        return { root, animations: [clip] };
      }
    `);
    const antiBloat = runRigged(bloatMod, 'anti-bloat.glb');
    const diskBloat = readFileSync(join(out, 'anti-bloat.glb'));
    const bloatHeader = parseGlbHeader(diskBloat);
    assert.ok(bloatHeader.jsonBytes < 16 * 1024, `expected stripped JSON chunk < 16 KB, got ${bloatHeader.jsonBytes}`);
    assert.equal(antiBloat.gates?.find((g) => g.gate === 'RG1 written')?.pass, true);
    const reloadedBloat = await new GLTFLoader().parseAsync(diskBloat.buffer.slice(diskBloat.byteOffset, diskBloat.byteOffset + diskBloat.byteLength), '');
    const bloatRawJson = diskBloat.toString('utf8', 20, 20 + bloatHeader.jsonBytes);
    assert.match(bloatRawJson, /"clean-note"/);
    assert.doesNotMatch(bloatRawJson, /"bones":\{/);
    assert.equal(reloadedBloat.scene.userData.bones, undefined);

    // RG9 fails on cell-split skinned vertices that rip apart under rotation, passes on shared world weights
    const tearMod = 'tearTail.ts';
    writeFileSync(join(out, tearMod), `
      import * as THREE from 'three';
      export function buildTear(p: { broken?: boolean }) {
        const root = new THREE.Group();
        const b0 = new THREE.Bone(); b0.name = 'tail0'; b0.position.set(0, 0.5, 0);
        const b1 = new THREE.Bone(); b1.name = 'tail1'; b1.position.set(0, 0, -0.5);
        b0.add(b1);
        // Two closed boxes meeting seamlessly at z = -0.5
        const mkBox = (z0: number, z1: number) => new THREE.BoxGeometry(0.2, 0.2, z1 - z0).translate(0, 0.5, (z0 + z1) / 2);
        const gA = mkBox(-0.5, 0), gB = mkBox(-1.0, -0.5);
        const merge = (a: any, b: any) => {
          const pA = a.attributes.position.array, pB = b.attributes.position.array;
          const nA = a.attributes.normal.array, nB = b.attributes.normal.array;
          const pos = new Float32Array(pA.length + pB.length); pos.set(pA, 0); pos.set(pB, pA.length);
          const nor = new Float32Array(nA.length + nB.length); nor.set(nA, 0); nor.set(nB, nA.length);
          const nonIdx = new THREE.BufferGeometry();
          const ia = a.index.array, ib = b.index.array;
          const uPos = [], uNor = [];
          for (let i = 0; i < ia.length; i++) { const k = ia[i] * 3; uPos.push(pA[k], pA[k+1], pA[k+2]); uNor.push(nA[k], nA[k+1], nA[k+2]); }
          for (let i = 0; i < ib.length; i++) { const k = ib[i] * 3; uPos.push(pB[k], pB[k+1], pB[k+2]); uNor.push(nB[k], nB[k+1], nB[k+2]); }
          nonIdx.setAttribute('position', new THREE.Float32BufferAttribute(uPos, 3));
          nonIdx.setAttribute('normal', new THREE.Float32BufferAttribute(uNor, 3));
          return nonIdx;
        };
        const geo = merge(gA, gB);
        const pos = geo.attributes.position;
        const si = new Uint16Array(pos.count * 4), sw = new Float32Array(pos.count * 4);
        const splitIdx = gA.index.count;
        for (let i = 0; i < pos.count; i++) {
          const wz = pos.getZ(i);
          if (p.broken) {
            // Broken per-segment weighting: gA corners at z=-0.5 get 100% b0 while gB corners at z=-0.5 get 100% b1!
            si[i * 4] = i < splitIdx ? 0 : 1;
            sw[i * 4] = 1;
          } else {
            const w1 = wz < -0.55 ? 1 : wz > -0.45 ? 0 : (-0.45 - wz) / 0.1;
            si[i * 4] = 0; si[i * 4 + 1] = 1;
            sw[i * 4] = 1 - w1; sw[i * 4 + 1] = w1;
          }
        }
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
        const skin = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
        skin.name = 'tail';
        skin.add(b0);
        skin.bind(new THREE.Skeleton([b0, b1]));
        root.add(skin);
        const fly = new THREE.AnimationClip('Fly', 1, [
          new THREE.QuaternionKeyframeTrack('tail1.quaternion', [0, 0.5, 1], [0, 0, 0, 1, 0.866, 0, 0, 0.5, 0, 0, 0, 1]),
        ]);
        return { root, animations: [fly] };
      }
    `);
    const tearFail = spawnTsx(rigCli, ['--module', tearMod, '--params', '{"broken":true}', '--open', 'tail', '--out', 'tear-fail.glb'], { cwd: out, env });
    assert.equal(tearFail.status, 2, tearFail.stdout + tearFail.stderr);
    const tearJson = parseResult(tearFail.stdout)!;
    const rg9Fail = tearJson.gates?.find((g) => g.gate === 'RG9 posed skin integrity');
    assert.equal(rg9Fail?.pass, false, `expected RG9 failure on torn tail seam, got: ${JSON.stringify(tearJson.gates)}`);
    assert.match(String(rg9Fail?.value), /Fly@/);

    const tearOk = runRigged(tearMod, 'tear-ok.glb', '--params', '{"broken":false}', '--open', 'tail');
    assert.equal(tearOk.gates?.find((g) => g.gate === 'RG9 posed skin integrity')?.pass, true);
    console.log('External rigged export: injected TS, bare-import skinned TS, ESM JS, RG8 topology, RG1 bloat guard, RG9 posed skin integrity');
  } else {
    console.log('External rigged export: injected TS passed. Bare imports require Node 22.15+ or 24+ for the skill fallback.');
  }
}
console.log('GLB OK');
~~~

## scripts/qacheck.test.ts

~~~typescript source-excerpt
// scripts/qacheck.test.ts: the gates must pass on a good asset AND fail on each defect they exist for. Run: npx tsx scripts/qacheck.test.ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qaGates, determinismGates, normalizeParts, edgeReport, symmetryGap, degenerateTris, signedVolume, type Parts, type QAOptions } from './qacheck';
import { renderSheet } from './review';
import { parseResult, spawnTsx } from './result';
import { box, buildCrateTris } from './fixtures/crate.qa';

const here = dirname(fileURLToPath(import.meta.url));
const gateOf = (parts: Parts, id: string, o: QAOptions = {}) => { const g = qaGates(parts, o).gates.find((x) => x.gate.startsWith(id)); assert.ok(g, `gate ${id} missing`); return g!; };
const flipAll = (t: number[]) => { const o = t.slice(); for (let i = 0; i < o.length; i += 9) for (let k = 0; k < 3; k++) { o[i + 3 + k] = t[i + 6 + k]; o[i + 6 + k] = t[i + 3 + k]; } return o; };   // swap vertices 1 and 2
const cube = box(-0.5, 0, -0.5, 0.5, 1, 0.5);

// 0. the helper itself: a box has volume 1 and is closed
assert.ok(Math.abs(signedVolume(cube) - 1) < 1e-9);
assert.deepEqual(edgeReport(cube), { boundary: 0, duplicated: 0, edges: 36 });

// 1. a good asset passes every gate that applies (symmetric, grounded, closed)
{
  const { gates, skipped } = qaGates(buildCrateTris({ seed: 3 }), { symmetric: true, budget: 2000 });
  assert.equal(gates.length, 7);
  assert.deepEqual(gates.filter((g) => !g.pass), []);
  assert.ok(skipped.some((s) => s.includes('footprint')), 'the report must say that footprint centring was not checked');
}

// 2. each defect trips its own gate
assert.equal(gateOf({ a: flipAll(cube) }, 'Q3').pass, false, 'inside-out: negative volume');
assert.equal(gateOf({ a: flipAll(cube) }, 'Q4').pass, true, 'consistently inside-out is closed: Q3 owns that defect');
{ const mixed = cube.slice(); mixed.splice(0, 9, ...flipAll(cube.slice(0, 9))); assert.equal(gateOf({ a: mixed }, 'Q4').pass, false, 'one flipped triangle'); }
{ const hole = gateOf({ a: cube.slice(9) }, 'Q4'); assert.equal(hole.pass, false); assert.match(hole.value, /3 open edges/); }
{ const nan = qaGates({ a: [...cube, NaN, 0, 0, 0, 0, 0, 0, 0, 0] }); assert.equal(nan.gates.length, 1, 'later gates are skipped after Q1 fails'); assert.equal(nan.gates[0].pass, false); }
assert.equal(qaGates({ a: [] }).gates[0].pass, false, 'empty asset');
assert.equal(qaGates({ a: [0, 0, 0, 1, 0, 0] }).gates[0].pass, false, 'not whole triangles');
{ const withDegenerate = { a: [...cube, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2] }; assert.equal(gateOf(withDegenerate, 'Q2').pass, false); assert.equal(gateOf(withDegenerate, 'Q2', { maxDegenerate: 1 }).pass, true); assert.deepEqual(degenerateTris(withDegenerate.a), [12]); }
{ const up = cube.map((v, i) => (i % 3 === 1 ? v + 0.5 : v)); assert.equal(gateOf({ a: up }, 'Q6').pass, false, 'floating'); assert.equal(gateOf({ a: up }, 'Q6', { groundY: 0.5 }).pass, true, 'slab top at 0.5'); }
{ const right = cube.map((v, i) => (i % 3 === 0 ? v + 1 : v)); assert.equal(gateOf({ a: right }, 'Q6').pass, true); assert.equal(gateOf({ a: right }, 'Q6', { footprint: true }).pass, false, 'footprint off-centre'); }
assert.equal(qaGates({ a: cube.map((v, i) => (i % 3 === 1 ? v + 3 : v)) }, { grounding: false }).gates.some((g) => g.gate.startsWith('Q6')), false, 'grounding: false removes Q6');
assert.equal(gateOf({ a: cube }, 'Q5', { budget: 10 }).pass, false);
assert.equal(gateOf({ a: cube }, 'Q5', { budget: 12 }).pass, true);
{
  const counted = qaGates({ a: cube });
  assert.equal(counted.stats.triangles, 12);
  assert.ok(counted.skipped.some((s) => s.startsWith('Q5 budget')));
  assert.ok(counted.gates.every((g) => !g.gate.startsWith('Q5')));
}
{ const lopsided = { a: cube, b: box(0.7, 0, 0, 0.9, 0.2, 0.2) }; assert.equal(gateOf(lopsided, 'Q7', { symmetric: true }).pass, false); assert.ok(symmetryGap(cube) === 0); }

// 3. sheets: a quad has no volume, so it needs `open`; a closed part next to it is still checked
{
  const sheet = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
  const parts = { body: cube, flag: sheet };
  assert.equal(gateOf(parts, 'Q3').pass, false); assert.equal(gateOf(parts, 'Q4').pass, false);
  assert.equal(gateOf(parts, 'Q3', { open: ['flag'] }).pass, true); assert.equal(gateOf(parts, 'Q4', { open: ['flag'] }).pass, true);
  assert.equal(gateOf({ body: flipAll(cube), flag: sheet }, 'Q3', { open: ['flag'] }).pass, false, 'open must not hide an inside-out closed part');
  assert.match(gateOf(parts, 'Q3', { open: ['all'] }).value, /skipped/);
}

// 4. shapes accepted from a builder
assert.deepEqual(Object.keys(normalizeParts(cube)), ['asset']);
assert.deepEqual(Object.keys(normalizeParts({ tris: cube, colors: ['#fff'] })), ['asset']);
assert.deepEqual(Object.keys(normalizeParts({ body: cube, legs: cube, note: 'x' })), ['body', 'legs']);
assert.throws(() => normalizeParts('nope'), /builder must return/);
assert.throws(() => normalizeParts({ a: 'x' }), /builder must return/);

// 5. determinism and seed 0 (Q8, Q9)
{
  const ok = await determinismGates(buildCrateTris); assert.deepEqual(ok.filter((g) => !g.pass), []); assert.match(ok[1].value, /own asset/);
  const rnd = await determinismGates(() => ({ a: cube.map((v) => v + Math.random() * 1e-3) })); assert.equal(rnd[0].pass, false, 'Math.random in a builder');
  const orSeed = await determinismGates((p) => buildCrateTris({ ...p, seed: (p.seed as number) || 12345 })); assert.equal(orSeed[0].pass, true); assert.equal(orSeed[1].pass, false, 'seed || 12345'); assert.match(orSeed[1].value, /same asset as seed 12345/);
  const noSeed = await determinismGates(() => ({ a: cube })); assert.equal(noSeed[1].pass, true); assert.match(noSeed[1].value, /does not depend/);
  const nan = await determinismGates((p) => ({ a: p.seed === 0 ? [NaN, 0, 0, 0, 0, 0, 0, 0, 0] : cube })); assert.equal(nan[1].pass, false, 'seed 0 gives NaN');
}

// 6. review image: back faces show up as magenta, sheets are drawn two-sided, a good asset has none
{
  const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
  const good = renderSheet({ body: cube }); assert.equal(good.width, 640); assert.equal(total(good.wrong), 0, 'outward cube has no magenta');
  assert.ok(good.rgba.some((v, i) => i % 4 === 0 && v !== 245), 'something was drawn');
  const bad = renderSheet({ body: flipAll(cube) }); assert.ok(total(bad.wrong) > 500, 'inside-out cube is visibly magenta'); assert.ok('body' in bad.wrong);
  const sheet = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
  assert.equal(total(renderSheet({ flag: sheet }, { open: ['flag'] }).wrong), 0, 'open sheet is two-sided');
  assert.equal(total(renderSheet({ flag: sheet }).wrong), 0, 'a sheet facing the cameras is plain shaded even when not listed as open');
  assert.ok(total(renderSheet({ flag: flipAll(sheet) }).wrong) > 0, 'a sheet facing away from the cameras (-Z) shows its back as magenta unless listed as open');
  assert.equal(total(renderSheet({ flag: flipAll(sheet) }, { open: ['flag'] }).wrong), 0);
  assert.deepEqual(renderSheet({ body: cube }).rgba, renderSheet({ body: cube }).rgba, 'rendering is deterministic');
}

// 7. the CLI end to end: exit codes and the last-line contract
{
  const run = (...a: string[]) => { const r = spawnTsx(join(here, 'qa-asset.ts'), a, { cwd: here, timeout: 120_000 }); return { code: r.status, res: parseResult(r.stdout ?? ''), out: r.stdout ?? '' }; };
  const out = mkdtempSync(join(tmpdir(), 'qa-'));
  const crate = join(here, 'fixtures/crate.qa.ts');

  const raw = run('--module', crate, '--export', 'buildCrateTris', '--no-render');
  assert.equal(raw.code, 0, raw.out); assert.ok(!(raw.res?.gates as { gate: string }[]).some((g) => g.gate.startsWith('Q6')), 'module mode does not run Q6 by default'); assert.ok((raw.res?.skipped as string[]).some((s) => s.startsWith('Q6 grounding')), 'and says so');
  const good = run('--module', crate, '--export', 'buildCrateTris', '--symmetric', '--grounded', '--budget', '2000', '--out', out);
  assert.equal(good.code, 0, good.out); assert.equal(good.res?.ok, true); assert.equal((good.res?.gates as unknown[]).length, 10, 'Q1..Q10 with --symmetric');
  if (good.res?.review) assert.ok(existsSync(good.res.review as string), 'review.png written'); else assert.ok((good.res?.unverified as string[]).some((u) => u.startsWith('review.png')), 'no PNG must be reported as UNVERIFIED');
  assert.ok((good.res?.wrongFacePixels as number) <= 4, 'a healthy asset has at most the noise limit of magenta pixels');

  const bad = join(out, 'bad.qa.ts'); writeFileSync(bad, `export const build = () => ({ body: [${flipAll(cube).join(',')}].map((v) => v + Math.random() * 1e-3) });`);
  const broken = run('--module', bad, '--out', out);                                  // single export: --export is optional
  assert.equal(broken.code, 2, broken.out); assert.equal(broken.res?.ok, false);
  const failedGates = (broken.res?.gates as { gate: string; pass: boolean }[]).filter((g) => !g.pass).map((g) => g.gate.split(' ')[0]);
  for (const id of ['Q3', 'Q8', 'Q10']) assert.ok(failedGates.includes(id), `${id} must fail, failed: ${failedGates}`);
  assert.ok((broken.res?.wrongFacePixels as number) > 500, 'inside-out shows as magenta');

  const trisFile = join(out, 'tris.json'); writeFileSync(trisFile, JSON.stringify({ tris: cube, colors: ['#8a6a45'] }));
  const viaTris = run('--tris', trisFile, '--out', out);
  assert.equal(viaTris.code, 0, viaTris.out); assert.equal((viaTris.res?.gates as unknown[]).length, 6, 'Q1..Q4, Q6 and Q10 without a budget'); assert.ok((viaTris.res?.unverified as string[]).some((u) => u.includes('Q8')), 'Q8/Q9 cannot run on tris.json');

  const usage = run(); assert.equal(usage.code, 1); assert.equal(usage.res?.ok, false);
  const missing = run('--module', join(out, 'nope.ts')); assert.equal(missing.code, 1); assert.match(String(missing.res?.error), /cannot build or read/);
  const needsThree = join(out, 'three.qa.ts'); writeFileSync(needsThree, `import * as THREE from 'three'; export const build = () => new THREE.BoxGeometry();`);
  const three = run('--module', needsThree); assert.equal(three.code, 1); assert.match(String(three.res?.error), /--tris|three/);

  // Direct Three.js (params, THREE) builder support without needing tris.json
  const threeAsset = join(out, 'three-asset.qa.ts');
  writeFileSync(threeAsset, `
    export function buildCube(params: { seed?: number }, THREE: any) {
      const seed = params.seed ?? 1;
      const w = 1 + (seed % 13) * 0.05;
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 1, 1), new THREE.MeshStandardMaterial());
      mesh.name = 'body';
      mesh.position.y = 0.5;
      group.add(mesh);
      return { root: group, animations: [] };
    }
  `);
  const direct = run('--module', threeAsset, '--grounded', '--footprint', '--symmetric', '--budget', '100', '--out', out);
  assert.equal(direct.code, 0, direct.out);
  assert.equal(direct.res?.ok, true);
  assert.equal((direct.res?.gates as unknown[]).length, 10, 'direct Three.js module runs Q1..Q10');
}
console.log('QACHECK OK');
~~~

## scripts/refcheck.test.ts

~~~typescript source-excerpt
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
~~~

## scripts/rigcheck.test.ts

~~~typescript source-excerpt
// scripts/rigcheck.test.ts: R1 to R7 must pass on valid rigged metadata and catch every defect class.
// Run: npx tsx scripts/rigcheck.test.ts
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { rigGates, type RigMeta } from './rigcheck';
import { parseResult, spawnTsx } from './result';

const here = dirname(fileURLToPath(import.meta.url));
const baseMeta = (): RigMeta => ({
  rig: {
    rootNode: 'char_root',
    pivotNames: ['root_body_pivot', 'head_pivot', 'armL_pivot', 'armR_pivot', 'tail_0_pivot'],
    hierarchy: [
      { parent: 'root_body_pivot', child: 'head_pivot' },
      { parent: 'root_body_pivot', child: 'armL_pivot' },
      { parent: 'root_body_pivot', child: 'armR_pivot' },
      { parent: 'root_body_pivot', child: 'tail_0_pivot' },
    ],
    restLocalPositions: {
      root_body_pivot: [0, 0.24, 0], head_pivot: [0, 0.24, 0],
      armL_pivot: [0.12, 0.2, 0], armR_pivot: [-0.12, 0.2, 0], tail_0_pivot: [0, 0.03, -0.1],
    },
  },
  animations: [
    { name: 'CuriousIdle', durationSeconds: 3.6, loop: true, expression: 'neutral', tracks: [
      { name: 'root_body_pivot.position', times: [0, 0.5, 1.0], values: [0, 0.24, 0, 0, 0.25, 0, 0, 0.24, 0] },
      { name: 'head_pivot.quaternion', times: [0, 1.0], values: [0, 0, 0, 1, 0, 0.1, 0, 0.995] },
    ] },
    { name: 'BouncyRun', durationSeconds: 0.72, loop: true, expression: 'happy' },
    { name: 'Slide', durationSeconds: 0.85, loop: false, expression: 'focused' },
  ],
  face: {
    defaultExpressionInGlb: 'neutral',
    textureResolution: [512, 512],
    expressions: ['neutral', 'happy', 'focused'],
    animationExpressionMapping: { CuriousIdle: 'neutral', BouncyRun: 'happy', Slide: 'focused' },
  },
  qa: { maxHorizDrift: 0, slideDropPct: 26, slideMinY: -0.008 },
});

const failedNames = (m: RigMeta) => rigGates(m).gates.filter((g) => !g.pass).map((g) => g.gate);

// 1. valid character passes all 7 gates
assert.deepEqual(failedNames(baseMeta()), [], 'valid rig passes R1 to R7');
const valid = rigGates(baseMeta());
assert.equal(valid.gates.length, 7, 'valid rig evaluates all seven gates');
assert.deepEqual(valid.skipped, [], 'valid rig has complete evidence');

// 2. each defect triggers its own gate
const cyclic = baseMeta(); cyclic.rig!.hierarchy!.push({ parent: 'head_pivot', child: 'root_body_pivot' });
assert.ok(failedNames(cyclic).includes('R1 hierarchy'), 'cycle caught by R1');

const badRest = baseMeta(); badRest.rig!.restLocalPositions!.head_pivot = [0, NaN, 0];
assert.ok(failedNames(badRest).includes('R2 rest-pose'), 'NaN rest position caught by R2');

const hasRef = baseMeta(); hasRef.animations!.push({ name: 'RefPose', durationSeconds: 1.0 });
assert.ok(failedNames(hasRef).includes('R3 clips'), 'RefPose leak caught by R3');

const drift = baseMeta(); drift.animations![0].tracks![0].values = [0, 0.24, 0, 0.15, 0.25, 0, 0, 0.24, 0];
assert.ok(failedNames(drift).includes('R4 tracks & drift'), 'horizontal drift caught by R4');

const nonMono = baseMeta(); nonMono.animations![0].tracks![0].times = [0, 0.5, 0.5];
assert.ok(failedNames(nonMono).includes('R4 tracks & drift'), 'duplicate timestamp caught by R4');

const shortTrack = baseMeta(); shortTrack.animations![0].tracks![0].values = [0, 0.24, 0];
assert.ok(failedNames(shortTrack).includes('R4 tracks & drift'), 'three position timestamps require nine values');

const shortRotation = baseMeta(); shortRotation.animations![0].tracks![1].values = [0, 0, 0, 1];
assert.ok(failedNames(shortRotation).includes('R4 tracks & drift'), 'two quaternion timestamps require eight values');

const negativeDrift = baseMeta(); negativeDrift.qa!.maxHorizDrift = -1;
assert.ok(failedNames(negativeDrift).includes('R4 tracks & drift'), 'negative drift magnitude is invalid');

const badExpr = baseMeta(); badExpr.face!.animationExpressionMapping!.Slide = 'angry';
assert.ok(failedNames(badExpr).includes('R5 expressions'), 'unmapped expression caught by R5');

const partialFace = baseMeta(); delete partialFace.face!.textureResolution;
const partialFaceResult = rigGates(partialFace);
assert.ok(!partialFaceResult.gates.some((g) => g.gate === 'R5 expressions'), 'missing resolution cannot pass the full expression gate');
assert.ok(partialFaceResult.skipped.some((s) => s.includes('textureResolution')), 'missing expression resolution is reported');
partialFace.face!.animationExpressionMapping!.Slide = 'angry';
assert.ok(failedNames(partialFace).includes('R5 expressions'), 'a known mapping failure stays a failure with partial data');

const badSlide = baseMeta(); badSlide.qa!.slideMinY = -0.04;
assert.ok(failedNames(badSlide).includes('R6 slide clearance'), 'floor-clipping slide caught by R6');

const partialSlide = baseMeta(); delete partialSlide.qa!.slideMinY;
const partialResult = rigGates(partialSlide);
assert.ok(!partialResult.gates.some((g) => g.gate === 'R6 slide clearance'), 'one valid slide measure cannot pass the full gate');
assert.ok(partialResult.skipped.some((s) => s.includes('slideMinY')), 'missing slide measure is reported');
partialSlide.qa!.slideDropPct = 10;
assert.ok(failedNames(partialSlide).includes('R6 slide clearance'), 'a known slide failure stays a failure with partial data');

// 3. CLI end-to-end
const dir = mkdtempSync(join(tmpdir(), 'rigcheck-'));
const goodFile = join(dir, 'good.json'), badFile = join(dir, 'bad.json');
writeFileSync(goodFile, JSON.stringify(baseMeta()));
writeFileSync(badFile, JSON.stringify(badSlide));
const run = (...a: string[]) => spawnTsx(join(here, 'rig-check.ts'), a);
const ok = run('--meta', goodFile); assert.equal(ok.status, 0, ok.stdout + ok.stderr);
assert.equal(parseResult(ok.stdout)!.ok, true);
const no = run('--meta', badFile); assert.equal(no.status, 2, no.stdout + no.stderr);
assert.equal(parseResult(no.stdout)!.ok, false);
const miss = run(); assert.equal(miss.status, 1);

// 4. v4.2: malformed hierarchy map fails cleanly (no crash), creature multi-pivot rig (44 pivots), motionMode=free, general clipMinY
{
  const badMap = baseMeta();
  (badMap.rig as unknown as Record<string, unknown>).hierarchy = { head_pivot: 'root_body_pivot' };
  const mapRes = rigGates(badMap);
  assert.ok(mapRes.gates.some((g) => g.gate === 'R1 hierarchy' && !g.pass && /array of \{ parent, child \}/.test(g.value)), 'non-array hierarchy reports clean R1 failure');

  // 44-pivot kraken/spider creature rig
  const krakenPivots = ['root'];
  const krakenEdges: { parent: string; child: string }[] = [];
  const krakenRest: Record<string, number[]> = { root: [0, 1, 0] };
  for (let arm = 0; arm < 8; arm++) {
    let prev = 'root';
    for (let seg = 0; seg < 5; seg++) {
      const name = `tentacle_${arm}_${seg}`;
      krakenPivots.push(name);
      krakenEdges.push({ parent: prev, child: name });
      krakenRest[name] = [0.2, 0, 0.2];
      prev = name;
    }
  }
  const krakenMeta: RigMeta = {
    rig: { pivotNames: krakenPivots, hierarchy: krakenEdges, restLocalPositions: krakenRest },
    animations: [{
      name: 'SwimSway', durationSeconds: 2.0, loop: true,
      tracks: [
        { name: 'root.position', times: [0, 1, 2], values: [0, 1, 0, 0.25, 1.15, -0.18, 0, 1, 0] },
        { name: 'tentacle_0_0.quaternion', times: [0, 1, 2], values: [0, 0, 0, 1, 0, 0.2, 0, 0.98, 0, 0, 0, 1] },
      ],
    }],
    qa: { clipMinY: 0.05 },
  };
  assert.ok(rigGates(krakenMeta).gates.some((g) => g.gate === 'R1 hierarchy' && !g.pass), 'hero default max 16 rejects 41 pivots');
  const krakenPass = rigGates(krakenMeta, { kind: 'creature', motionMode: 'free' });
  assert.deepEqual(krakenPass.gates.filter((g) => !g.pass), [], 'creature kind + free motion passes 41-pivot kraken with root sway & floor clearance');
  const krakenFile = join(dir, 'kraken.json');
  writeFileSync(krakenFile, JSON.stringify(krakenMeta));
  const kCli = run('--meta', krakenFile, '--kind', 'creature', '--motion', 'free');
  assert.equal(kCli.status, 0, kCli.stdout + kCli.stderr);
}

// 5. v4.3.3: Euler rotation tracks fail R4; static clips fail R7 unless listed in staticClips / --static-clips
{
  const eulerMeta = baseMeta();
  eulerMeta.animations![0].tracks!.push({ name: 'head_pivot.rotation[x]', times: [0, 1], values: [0, 0.5] });
  const eulerRes = rigGates(eulerMeta);
  const r4 = eulerRes.gates.find((g) => g.gate === 'R4 tracks & drift')!;
  assert.equal(r4.pass, false, 'Euler rotation track must fail R4');
  assert.match(r4.value, /Euler|\.quaternion/);

  const staticMeta = baseMeta();
  staticMeta.animations = [{
    name: 'Hold', durationSeconds: 1.0, loop: true, expression: 'neutral',
    tracks: [{ name: 'head_pivot.quaternion', times: [0, 0.5, 1.0], values: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }],
  }];
  assert.ok(failedNames(staticMeta).includes('R7 clip motion'), 'static clip holding first key fails R7');
  const holdFile = join(dir, 'hold.json');
  writeFileSync(holdFile, JSON.stringify(staticMeta));
  const holdFail = run('--meta', holdFile);
  assert.equal(holdFail.status, 2, 'CLI fails on static clip without --static-clips');

  const holdCliOk = run('--meta', holdFile, '--static-clips', 'Hold');
  assert.equal(holdCliOk.status, 0, holdCliOk.stdout + holdCliOk.stderr);
  assert.equal(parseResult(holdCliOk.stdout)!.ok, true);

  staticMeta.qa!.staticClips = ['Hold'];
  assert.deepEqual(failedNames(staticMeta), [], 'qa.staticClips allows intentional static clip');
}

// 6. v4.6 direct --module inspection without intermediate metadata JSON script
{
  const modFile = join(dir, 'creatureMod.ts');
  writeFileSync(modFile, `
    export function buildCreature(_p: unknown, THREE: any) {
      const root = new THREE.Group(); root.name = 'creature_root';
      const hips = new THREE.Bone(); hips.name = 'hips'; hips.position.set(0, 0.6, 0);
      const tail = new THREE.Bone(); tail.name = 'tail'; tail.position.set(0, 0, -0.4);
      hips.add(tail);
      const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(0, 0.6, 0);
      const count = geo.attributes.position.count;
      const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) sw[i * 4] = 1;
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
      mesh.name = 'body';
      mesh.add(hips);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton([hips, tail]));
      root.add(mesh);
      const fly = new THREE.AnimationClip('Fly', 1, [
        new THREE.QuaternionKeyframeTrack('tail.quaternion', [0, 0.5, 1], [0, 0, 0, 1, 0, 0.25, 0, 0.968, 0, 0, 0, 1]),
      ]);
      return { root, animations: [fly] };
    }
  `);
  const modRun = run('--module', modFile, '--export', 'buildCreature', '--kind', 'creature', '--motion', 'free');
  assert.equal(modRun.status, 0, modRun.stdout + modRun.stderr);
  const modRes = parseResult(modRun.stdout)!;
  assert.equal(modRes.ok, true);
  assert.equal(modRes.gates?.find((g) => g.gate === 'R7 clip motion')?.pass, true);
}

console.log('RIGCHECK OK');
~~~

## scripts/studio.test.ts

~~~typescript source-excerpt
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePngRgba } from './png';
import { parseResult, spawnTsx } from './result';
import type { StudioPose } from './studio/types';

declare global {
  interface Window {
    studioVfxProbe: { readbacks: number; pose?: StudioPose };
  }
}

async function verifyStudioVfx(browserPath: string, studio: string, withoutVfx: string) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: browserPath, headless: true, timeout: 15_000,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.studioVfxProbe = { readbacks: 0 };
      const readback = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        if (this.id === 'view') window.studioVfxProbe.readbacks++;
        return readback.apply(this, args);
      };
    });
    const open = async (file: string) => {
      await page.goto(pathToFileURL(file).href);
      await page.waitForFunction(() => document.documentElement.dataset.studioState !== 'loading');
      assert.deepEqual(await page.evaluate(() => window.threejsStudio?.getErrors()), []);
    };
    const probe = () => page.evaluate(() => window.studioVfxProbe);
    const toggle = page.getByLabel('Studio VFX');
    const scrub = (seconds: number) => page.locator('#scrub').evaluate((element, value) => {
      const slider = element as HTMLInputElement;
      slider.value = String(value);
      slider.dispatchEvent(new Event('input'));
    }, seconds);

    await open(studio);
    assert.equal(await toggle.isChecked(), true, 'Bundled VFX must start enabled');
    assert.equal((await probe()).pose?.clip, null);
    await page.selectOption('#clip', { label: 'Pulse' });
    assert.equal((await probe()).pose?.clip, 'Pulse');
    await scrub(0.5);
    assert.equal((await probe()).pose?.time, 0.5);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => (window.studioVfxProbe.pose?.time ?? 0) > 0.5);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await toggle.uncheck();
    const pausedPose = (await probe()).pose;
    await scrub(0.75);
    assert.deepEqual((await probe()).pose, pausedPose);
    await toggle.check();
    assert.equal((await probe()).pose?.time, 0.75);
    assert.equal((await probe()).readbacks, 0);

    const capture = (vfx: boolean) => page.evaluate((enabled) => window.threejsStudio!.setFrame!({
      view: '34-front', clip: 'Pulse', time: 0.5, vfx: enabled,
    }).vfx, vfx);
    assert.equal(await capture(true), 'visible');
    assert.equal(await capture(false), 'off');
    assert.equal(await toggle.isChecked(), false);
    assert.equal((await probe()).readbacks, 2);

    await open(withoutVfx);
    assert.equal(await toggle.isVisible(), false);
    assert.equal((await probe()).readbacks, 0);
  } finally {
    await browser.close();
  }
}

const temp = realpathSync(tmpdir());
const dir = mkdtempSync(join(temp, 'three studio '));
try {
  const module = join(dir, 'asset builder.ts');
  const out = join(dir, 'review', 'index.html');
  const params = { seed: 0, label: '</script><script>throw new Error("unexpected")</script>' };
  writeFileSync(join(dir, 'material.ts'), `export const colour = '#9012ac';`);
  writeFileSync(module, `
    import * as THREE from 'three';
    import { colour } from './material';
    export function build({ seed, label }: { seed: number, label: string }) {
      const root = new THREE.Mesh(new THREE.BoxGeometry(1 + seed, 1, 1), new THREE.MeshStandardMaterial({ color: colour }));
      root.name = label;
      return root;
    }
  `);
  const pack = spawnTsx(fileURLToPath(new URL('./pack-studio.ts', import.meta.url)), [
    '--module', module, '--params', JSON.stringify(params), '--background', 'light', '--out', out,
  ], { timeout: 15_000 });
  assert.equal(pack.status, 0, pack.stdout + pack.stderr);
  const packed = parseResult(pack.stdout);
  assert.equal(packed?.ok, true);
  assert.equal(packed?.background, 'light');
  assert.deepEqual(packed?.params, params);
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<canvas id="view"/);
  for (const view of ['34-front', '34-back', 'front', 'side', 'back', 'top']) {
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
  assert.match(html, /id="bloom-toggle"/);
  assert.match(html, /id="bg-toggle"/);
  assert.match(html, /id="export-glb"/);
  assert.match(html, /id="verify-glb"/);
  assert.match(html, /#9012ac/);
  assert.match(html, /Three\.js license/);
  assert.equal(html.match(/<\/script\s*>/gi)?.length, 1);
  assert.doesNotMatch(html, /<script\b[^>]+src\s*=/i);

  const png = join(dir, 'studio-contact-sheet.png');
  const capture = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
    '--studio', out, '--out', png, '--motion-view', 'side', '--background', 'light', '--browser', join(dir, 'browser-does-not-exist'),
  ], { timeout: 15_000 });
  assert.equal(capture.status, 2, capture.stdout + capture.stderr);
  const captured = parseResult(capture.stdout);
  assert.equal(captured?.status, 'UNVERIFIED');
  assert.equal(captured?.motionView, 'side');
  assert.equal(captured?.background, 'light');
  assert.equal(captured?.out, null);
  assert.equal(existsSync(png), false);

  const badView = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
    '--studio', out, '--out', png, '--motion-view', 'invalid-view',
  ], { timeout: 15_000 });
  assert.equal(badView.status, 1);
  const badBg = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
    '--studio', out, '--out', png, '--background', 'neon',
  ], { timeout: 15_000 });
  assert.equal(badBg.status, 1);
  console.log('Studio self-contained bundle and browser-unavailable result verified.');

  const browserPath = process.env.THREE_STUDIO_TEST_BROWSER;
  if (browserPath) {
    const animated = join(dir, 'animated.ts');
    const effects = join(dir, 'effect.ts');
    const withVfx = join(dir, 'vfx.html');
    writeFileSync(animated, `
      export function build(params, THREE) {
        const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#9012ac' }));
        root.name = 'pulseBox';
        root.userData = { bones: { pulseBox: root }, animations: [] };
        const track = new THREE.VectorKeyframeTrack('pulseBox.position', [0, 0.5, 1], [0, 0, 0, 0, 0.2, 0, 0, 0, 0]);
        return { root, animations: [new THREE.AnimationClip('Pulse', 1, [track])] };
      }
    `);
    writeFileSync(effects, `
      export function createEffect({ group, THREE }) {
        const pulse = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24), new THREE.MeshBasicMaterial({ color: '#43edff' }));
        pulse.position.set(0.48, 0.15, 0.4);
        group.add(pulse);
        return { update(pose) {
          (window.studioVfxProbe ??= { readbacks: 0 }).pose = pose;
          group.visible = pose.clip === 'Pulse' && pose.time > 0;
        } };
      }
    `);
    const bundledVfx = spawnTsx(fileURLToPath(new URL('./pack-studio.ts', import.meta.url)), [
      '--module', animated, '--vfx', effects, '--out', withVfx,
    ], { timeout: 15_000 });
    assert.equal(bundledVfx.status, 0, bundledVfx.stdout + bundledVfx.stderr);
    await verifyStudioVfx(browserPath, withVfx, out);
    console.log('Studio VFX defaults, playback, scrub, toggle, and capture readbacks verified in browser.');

    // Verify --initial-clip + --autoplay + --bloom AND capture-studio --motion-vfx (clean + VFX tiles) + --extras
    const autoHtml = join(dir, 'autoplay.html');
    const autoPack = spawnTsx(fileURLToPath(new URL('./pack-studio.ts', import.meta.url)), [
      '--module', animated, '--vfx', effects, '--initial-clip', 'Pulse', '--autoplay', '--bloom', '--out', autoHtml,
    ], { timeout: 15_000 });
    assert.equal(autoPack.status, 0, autoPack.stdout + autoPack.stderr);
    const autoRes = parseResult(autoPack.stdout)!;
    assert.equal(autoRes.initialClip, 'Pulse');
    assert.equal(autoRes.autoplay, true);
    assert.equal(autoRes.bloom, true);

    const multiPng = join(dir, 'multi-sheet.png');
    const multiCap = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
      '--studio', autoHtml, '--out', multiPng, '--locomotion', 'Pulse', '--motion-view', 'side', '--motion-vfx',
      '--action', 'Pulse', '--peak', '0.5', '--vfx', '--extras', 'Pulse@0.25:front:vfx,Pulse@0.75:top:clean',
      '--browser', browserPath,
    ], { timeout: 30_000 });
    assert.equal(multiCap.status, 0, multiCap.stdout + multiCap.stderr);
    const multiRes = parseResult(multiCap.stdout)!;
    assert.equal(multiRes.status, 'PASS');
    assert.equal((multiRes.tiles as unknown[]).length, 7);
    const tileLabels = (multiRes.tiles as { label: string; evidence: { vfx: string } | null }[]);
    assert.equal(tileLabels.find((t) => t.label === 'Mid locomotion (clean)')?.evidence?.vfx, 'off');
    assert.equal(tileLabels.find((t) => t.label === 'Mid locomotion (VFX)')?.evidence?.vfx, 'visible');
    const sheetPng = decodePngRgba(readFileSync(multiPng))!;
    assert.equal(sheetPng.width, 1920);
    assert.equal(sheetPng.height, 2400);

    // Verify Bloom toggle and Verify GLB in live browser
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
      executablePath: browserPath, headless: true, timeout: 15_000,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(autoHtml).href);
      await page.waitForFunction(() => document.documentElement.dataset.studioState !== 'loading');
      const bloomInfo = await page.evaluate(() => window.threejsStudio!.info!());
      assert.equal(bloomInfo.bloomAvailable, true);
      assert.equal(bloomInfo.bloom, true);
      const bloomBtn = page.locator('#bloom-toggle');
      assert.equal(await bloomBtn.getAttribute('aria-pressed'), 'true');
      await bloomBtn.click();
      assert.equal(await bloomBtn.getAttribute('aria-pressed'), 'false');
      await bloomBtn.click();
      assert.equal(await bloomBtn.getAttribute('aria-pressed'), 'true');
      await page.locator('#verify-glb').click();
      await page.waitForFunction(() => /^(GLB OK|GLB FAIL|Verify failed)/.test(document.getElementById('glb-status')?.textContent ?? ''));
      const verifyText = await page.locator('#glb-status').textContent();
      assert.match(verifyText ?? '', /^GLB OK .*JSON \d+\.\d+ KB/);
      assert.deepEqual(await page.evaluate(() => window.threejsStudio?.getErrors()), []);
    } finally {
      await browser.close();
    }
    console.log('Studio autoplay, --bloom toggle, Verify GLB, shadows, --motion-vfx clean+VFX, and 7-tile capture verified in browser.');
  }
} finally {
  assert.equal(dirname(dir), temp);
  rmSync(dir, { recursive: true, force: true });
}
~~~

## tools/tools.test.ts

~~~typescript source-excerpt
// npx tsx tools.test.ts   Tests the tooling itself. Every checker needs a case where it must FAIL, or green means nothing.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER, resultLine, parseResult, spawnTsx } from '../scripts/result';
import { parseFrontmatter, validateSkill, mentions, tokensOf, findSkills } from './validate-skills';
import { tokenize, stem, rank, pick } from './trigger-check';
import { missingThree } from './run-tests';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'tools-test-'));
const put = (root: string, rel: string, text: string) => { const p = join(root, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, text); };
const tsx = (file: string, args: string[], cwd = here) => spawnTsx(join(here, file), args, { cwd });

// ---- output contract
{
  const r = { tool: 'x', ok: false, gates: [{ gate: 'g', value: 'v', pass: false, hint: 'h\nwith newline' }] };
  const line = resultLine(r); assert.ok(line.startsWith(MARKER) && !line.includes('\n'), 'one line');
  assert.deepEqual(parseResult(`noise\n${resultLine({ tool: 'old', ok: true })}\nmore\n${line}\n`), r, 'last marker wins, newline in hint survives');
  assert.equal(parseResult('no marker here'), null); assert.equal(parseResult(`${MARKER}{not json`), null); assert.equal(parseResult(`${MARKER}{"tool":1,"ok":true}`), null);
}

// ---- frontmatter + token estimate
{
  const f = parseFrontmatter('---\nname: a-b\ndescription: "quoted text"\n---\nbody')!; assert.equal(f.fm.name, 'a-b'); assert.equal(f.fm.description, 'quoted text'); assert.equal(f.body, 'body');
  assert.equal(parseFrontmatter('no frontmatter'), null);
  assert.ok(parseFrontmatter('---\nname: a\ndescription: >\n  folded\n---\n')!.problems.length >= 1, 'block scalar rejected');
  assert.equal(tokensOf('abcdefgh'), 2); assert.equal(tokensOf('é'), 1);
}

// ---- mention extraction ignores code fences for inline paths, reads imports, skips placeholders and URLs
{
  const md = '[ok](references/a.md#x) [web](https://e.com/a.md) `src/real.ts` `src/<name>.test.ts` `src/*.ts` `~/.claude/skills`\n```ts\nimport x from \'./prng\';\nimport y from \'./mine\'; // project-specific\nconst s = `src/in-fence.ts`;\n```\n';
  const m = mentions(md);
  assert.deepEqual(m.links, ['references/a.md']); assert.deepEqual(m.paths, ['src/real.ts']); assert.deepEqual(m.imports, ['./prng']);
}
{
  const md = [
    '~~~~markdown source-excerpt',
    '[Original link](references/missing.md) `src/missing.ts`',
    '```ts',
    "import { original } from './missing';",
    '```',
    '~~~',
    '~~~~',
    '~~~typescript source-excerpt',
    "import { helper } from '../harness/helper';",
    '~~~',
    '[Actual link](references/runtime.md)',
    '```ts',
    "import { local } from './real';",
    '```',
  ].join('\n');
  const result = mentions(md);
  assert.deepEqual(result.links, ['references/runtime.md'], 'check links in prose outside source excerpts');
  assert.deepEqual(result.paths, [], 'keep canonical paths inside the archived source');
  assert.deepEqual(result.imports, ['./real'], 'check runnable examples, including after nested source fences');
}

// ---- validate: a good skill passes, a broken one reports every problem
const GOOD_SKILL = '---\nname: good-skill\ndescription: Builds small things from seeds.\n---\n# Good\nSee `references/a.md` and [more](references/a.md). Code in `src/x.ts`.\n';
{
  const d = join(tmp(), 'good-skill');
  put(d, 'SKILL.md', GOOD_SKILL); put(d, 'references/a.md', '# A\n\nContents: one · two\n'); put(d, 'src/x.ts', 'export const x = 1;\n');
  const r = validateSkill(d); assert.deepEqual(r.issues, [], JSON.stringify(r.issues));
  assert.deepEqual(findSkills(join(d, '..')), [d], 'a directory of skills is expanded');
}
{
  const d = join(tmp(), 'folder-name');
  put(d, 'SKILL.md', `---\nname: other-name\ndescription: ${'x'.repeat(401)}: and a colon\n---\n${'line\n'.repeat(600)}[dead](references/missing.md) \`src/ghost.ts\` \`references/b.md\`\n`);
  put(d, 'references/a.md', '# A with no contents line\n'); put(d, 'references/b.md', '# B\nContents: b\n');
  const r = validateSkill(d, { maxTokens: 100, maxLines: 500, maxDesc: 400 }), has = (check: string, re: RegExp) => assert.ok(r.issues.some((i) => i.level === 'error' && i.check === check && re.test(i.msg)), `${check} ${re}: ${JSON.stringify(r.issues)}`);
  has('name', /must equal the folder name/); has('description', /is 4\d\d chars/); has('description', /": "/); has('budget', /tokens/); has('budget', /lines/);
  has('link', /references\/missing\.md/); has('mention', /src\/ghost\.ts/); has('contents', /Contents/); has('orphan', /not linked from SKILL\.md/);
  assert.ok(!r.issues.some((i) => i.check === 'orphan' && i.file.endsWith('b.md')), 'b.md is linked, so it is not an orphan');
  assert.ok(r.issues.filter((i) => i.file.endsWith('a.md')).every((i) => ['contents', 'orphan'].includes(i.check)));
}
{
  const d = join(tmp(), 'no-front'); put(d, 'SKILL.md', '# nothing');
  assert.ok(validateSkill(d).issues.some((i) => i.check === 'frontmatter'));
  const e = join(tmp(), 'no-file'); mkdirSync(e); assert.ok(validateSkill(e).issues.some((i) => i.check === 'skill-file'));
  const x = join(tmp(), 'bad-desc'); put(x, 'SKILL.md', '---\nname: bad-desc\ndescription: has <b>tags</b>\n---\n'); assert.ok(validateSkill(x).issues.some((i) => /tags/.test(i.msg)));
}

// ---- trigger-check scoring
{
  assert.equal(stem('assets'), 'asset'); assert.equal(stem('bodies'), 'body'); assert.equal(stem('class'), 'class'); assert.equal(stem('meshes'), 'mesh'); assert.equal(stem('boxes'), 'box'); assert.equal(stem('faces'), 'face');
  assert.deepEqual(tokenize('Low-Poly meshes'), ['lowpoly', 'low', 'poly', 'mesh']); assert.ok(tokenize('buildTreeAsset').includes('tree'), 'camelCase is split');
  const docs = [{ name: 'a', text: 'procedural low poly trees' }, { name: 'b', text: 'spreadsheet formulas' }];
  const r = rank('make a low poly tree', docs); assert.equal(r[0].name, 'a'); assert.equal(pick(r, 0.1).winner, 'a');
  assert.equal(pick(rank('weather today', docs), 0.1).winner, null, 'nothing matches -> no winner');
  assert.equal(pick(r, 1e9).winner, null, 'below min -> no winner');
}
{
  const dir = tmp(), self = join(here, '..');
  put(dir, 'ok.json', JSON.stringify({ min: 1, decoys: [{ name: 'xlsx-skill', description: 'spreadsheet formulas and csv files' }], cases: [{ prompt: 'low-poly tree generator', expect: '$self' }, { prompt: 'fix spreadsheet formulas', expect: 'xlsx-skill' }, { prompt: 'weather today', expect: null }] }));
  const ok = tsx('trigger-check.ts', [join(dir, 'ok.json')]); assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.equal(parseResult(ok.stdout)!.ok, true);
  put(dir, 'wrong.json', JSON.stringify({ min: 1, decoys: [{ name: 'xlsx-skill', description: 'spreadsheet formulas and csv files' }], cases: [{ prompt: 'fix spreadsheet formulas', expect: '$self' }, { prompt: 'low-poly tree generator', expect: null }] }));
  const bad = tsx('trigger-check.ts', [join(dir, 'wrong.json')]), br = parseResult(bad.stdout)!; assert.equal(bad.status, 2, 'wrong expectations must exit 2'); assert.equal(br.ok, false); assert.equal(br.gates!.filter((g) => !g.pass).length, 2);
  put(dir, 'unknown.json', JSON.stringify({ cases: [{ prompt: 'x', expect: 'nobody' }] })); assert.equal(tsx('trigger-check.ts', [join(dir, 'unknown.json')]).status, 1, 'unknown expected skill is a usage error, not a pass');
  assert.equal(tsx('trigger-check.ts', [join(dir, 'missing.json')]).status, 1); void self;
}

// ---- run-tests classification: pass, fail, skip (only for a missing `three`), and --strict
{
  assert.ok(missingThree("Error: Cannot find module 'three'\nRequire stack:")); assert.ok(missingThree("Cannot find package 'three/addons' imported from x")); assert.ok(missingThree("ERR_MODULE_NOT_FOUND: Cannot import 'three'".replace('Cannot import', 'Cannot find package')));
  assert.ok(!missingThree("Cannot find module './three-helper'")); assert.ok(!missingThree("Cannot find module 'threejs-other'"));
  const dir = tmp();
  put(dir, 'package.json', '{ "type": "module" }'); put(dir, 'a.test.ts', 'console.log("fine");'); put(dir, 'b.test.ts', 'throw new Error("boom");'); put(dir, 'c.test.ts', "import 'three-not-installed-here';");
  put(dir, 'd.test.ts', "import 'three';");
  const r = tsx('run-tests.ts', [dir]), res = parseResult(r.stdout)!;
  const status = Object.fromEntries((res.tests as { file: string; status: string }[]).map((t) => [t.file, t.status]));
  assert.equal(status['a.test.ts'], 'pass'); assert.equal(status['b.test.ts'], 'fail'); assert.equal(status['c.test.ts'], 'fail', 'a different missing module is a failure, not a skip');
  assert.ok(['skip', 'pass'].includes(status['d.test.ts']), 'three missing -> skip (or pass where three is installed)');
  assert.equal(r.status, 2); assert.equal(res.ok, false);
  const only = tsx('run-tests.ts', [dir, '--only', 'a.test']); assert.equal(only.status, 0); assert.equal(parseResult(only.stdout)!.ok, true);
  if (status['d.test.ts'] === 'skip') { const s = tsx('run-tests.ts', [dir, '--only', 'd.test']); assert.equal(s.status, 0, 'skip is ok without --strict'); assert.equal(tsx('run-tests.ts', [dir, '--only', 'd.test', '--strict']).status, 2, 'skip fails with --strict'); }
  assert.equal(tsx('run-tests.ts', [dir, '--only', 'nothing-matches']).status, 1);
}

console.log('TOOLS OK');
~~~

## tools/trigger-cases.json

~~~json source-excerpt
{
  "min": 1.0,
  "decoys": [
    {
      "name": "gltf-model-loader",
      "description": "Load, inspect and display existing glTF and GLB model files in Three.js with GLTFLoader, Draco and KTX2 compression, embedded animation clips and the materials stored in the file."
    },
    {
      "name": "threejs-blender-bridge",
      "description": "Drive Blender through its Python API to model, UV unwrap, bake textures and export GLB assets for Three.js, with headless renders for review."
    },
    {
      "name": "three-scene-ui",
      "description": "Set up Three.js scenes around existing meshes: cameras, OrbitControls, lights, shadows, postprocessing and bloom, a React Three Fiber canvas and a settings panel."
    },
    {
      "name": "frontend-design",
      "description": "Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults."
    },
    {
      "name": "xlsx",
      "description": "Use this skill any time a spreadsheet file is the primary input or output: open, read, edit or fix an xlsx or csv file, compute formulas, format, chart and clean messy tabular data."
    }
  ],
  "cases": [
    { "prompt": "Write a low-poly procedural tree generator in Three.js with a seed slider", "expect": "$self" },
    { "prompt": "I need a rigged low poly humanoid biped with a walk animation made from code", "expect": "$self" },
    { "prompt": "Generate a flat-shaded vertex color dragon with mirrored wings, deterministic from a seed", "expect": "$self" },
    { "prompt": "Here is a reference image of a robot, build it as a procedural low-poly mesh that matches the silhouette", "expect": "$self" },
    { "prompt": "Export my procedural asset as standalone Three.js code that gives the same mesh", "expect": "$self" },
    { "prompt": "Compose a village from generated houses and trees with deterministic placement", "expect": "$self" },
    { "prompt": "Help me explore options for a procedural low-poly spider or kraken creature with multi-limb rigs in Three.js", "expect": "$self" },
    { "prompt": "Create a procedural low-poly vehicle with spinning wheels, vertex colors, and seeded variations in Three.js", "expect": "$self" },
    { "prompt": "Build a deterministic procedural low-poly building with custom geometry and recessed windows", "expect": "$self" },
    { "prompt": "Create a procedural Three.js sea serpent with a smooth skinned tail, a looping swim clip, and rigged GLB export", "expect": "$self" },
    { "prompt": "Build a seeded low-poly creature in Three.js and generate a studio preview from the same asset builder as the GLB", "expect": "$self" },
    { "prompt": "Model a claymation character from a reference image in Three.js with rounded seams and a rigged roar", "expect": "$self" },
    { "prompt": "Create a seeded voxel shop asset in Three.js with crisp block joins and editable colors", "expect": "$self" },
    { "prompt": "Generate a realistic procedural wood chair in Three.js with directional grain and GLB export", "expect": "$self" },
    { "prompt": "Load a .glb model with GLTFLoader and play its embedded animation", "expect": "gltf-model-loader" },
    { "prompt": "Open Blender, bake the textures and export a GLB for Three.js", "expect": "threejs-blender-bridge" },
    { "prompt": "Add OrbitControls, bloom postprocessing and soft shadows to my existing scene", "expect": "three-scene-ui" },
    { "prompt": "Design a landing page with a distinctive typographic style", "expect": "frontend-design" },
    { "prompt": "Summarize the monthly totals in this spreadsheet and fix the formulas", "expect": "xlsx" },
    { "prompt": "What is the weather like in Jakarta today", "expect": null },
    { "prompt": "Translate this paragraph into French", "expect": null }
  ]
}
~~~

## THIRD_PARTY_NOTICES.md

~~~markdown source-excerpt
# Third-Party Notices

This file records the upstream sources credited by the project and the license notices for the referenced versions.

## zinkkrysty/three-js-asset-studio

The original `.agents/skills/threejs-asset-generator/SKILL.md` and helper utilities informed the following parts of this project. The upstream repository has no published root license file. This project's MIT license covers original contributions by Luciansvon. [Upstream repository](https://github.com/zinkkrysty/three-js-asset-studio)

- **Skill identity & pipeline contract:** The `threejs-asset-generator` skill name and "single source of truth" contract where one generator function drives both live preview and standalone code export.
- **Generator & parameter schema shape:** `AssetGeneratorSchema` (`id`, `name`, `category`, `description`, `parameters`, `presetConfigs`, `generate`, `generateCode`) and typed UI parameter definitions (`src/types.ts`).
- **Seeded PRNG & watertight vertex jitter:** Mulberry32-based deterministic PRNG (`createPRNG`, `src/prng.ts` — later extended in v4 with `seed = 0` support and `.fork()`) and seam-grouped vertex displacement (`applyVertexJitter`, `src/jitter.ts`).
- **Low-poly look & geometry rules:** `flatShading: true` material/palette rules (`references/look.md`), custom `BufferGeometry` outward CCW winding conventions, attribute matching for merging, and contoured inset overlays (`references/geometry.md`, `src/overlay.ts`).
- **Composite assets & lifecycle conventions:** Exported sub-asset builders, fixed vs. controlled vs. PRNG placement with clearance checks (`references/composite.md`), `Y = 0` grounding and shadow flags (`references/lifecycle.md`).
- **Standalone unminified code export pattern:** Vite `?raw` source embedding, TypeScript stripping, and zero-dependency inline helper bundling (`references/export.md`).

## EL4CTEO/blender-skills

The following workflows were adapted from v1.3.2 (commit `9e7e04a`) and implemented independently in TypeScript and Node. [Upstream source](https://github.com/EL4CTEO/blender-skills/tree/9e7e04a) · [Upstream MIT license](https://github.com/EL4CTEO/blender-skills/blob/9e7e04a/LICENSE)

- **Compact skill layout:** Splitting the monolithic prompt into a concise router (`SKILL.md`) backed by modular `references/` guides and `src/` modules.
- **Automated skill verification tooling:** Unified `tools/check.ts` workflow (`validate-skills.ts`, `trigger-check.ts`, `run-tests.ts`) and the structured `@@RESULT` JSON + exit-code contract (`scripts/result.ts`).
- **Mesh QA gates & visual review:** Pure geometry QA gate checks (`scripts/qacheck.ts`, Q1–Q10), the 2x2 orthographic software preview renderer (`scripts/review.ts`, `scripts/qa-asset.ts`), and the "Done" verification rules (`references/qa-gates.md`).
- **Platform budgets & LOD checks:** Aligned polygon, material, texture-memory, bone, draw-call, and GLB size limits per platform/kind (`scripts/budget.ts`, `scripts/mesh-stats.ts`, `references/budget.md`) plus `detail`-level LOD checks (`src/lod.ts`).
- **GLB export verification workflow:** Pre-export QA enforcement and post-write round-trip checks (`scripts/glb.ts`, `scripts/export-glb.ts`, E1–E6, `references/glb-export.md`).

```text
MIT License

Copyright (c) 2026 EL4CTEO

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Three.js

Three.js supplies the rendering, animation, geometry and glTF APIs. The notice below accompanies the r180 dependency used by the harness. [Upstream license](https://github.com/mrdoob/three.js/blob/r180/LICENSE)

```text
The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
~~~
