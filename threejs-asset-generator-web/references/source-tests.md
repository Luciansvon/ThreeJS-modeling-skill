# Test source and third-party notices

Contents: src/biped.test.ts · src/creatures.test.ts · src/detail.pure.test.ts · src/detailThree.test.ts · src/lod.test.ts · src/qa.kernel.test.ts · src/skinnedRig.test.ts · scripts/budget.test.ts · scripts/glb.test.ts · scripts/qacheck.test.ts · scripts/refcheck.test.ts · scripts/rigcheck.test.ts · scripts/studio.test.ts · tools/tools.test.ts · tools/trigger-cases.json · THIRD_PARTY_NOTICES.md

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
import { tubeTris, planarBladeTris, radialArrayTris } from './organic';
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

## scripts/budget.test.ts

~~~typescript source-excerpt
// scripts/budget.test.ts: the budget gates must pass inside the limits AND fail just outside them; the LOD gates must fail on each defect they exist for. Run: npx tsx scripts/budget.test.ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, textureMiB, assetStats, budgetGates, lodGates, type Stats } from './budget';
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
  const out = mkdtempSync(join(tmpdir(), 'budget-')), cli = join(here, 'mesh-stats.ts');
  const run = (...a: string[]) => { const r = spawnTsx(cli, a, { cwd: out }); return { code: r.status, out: `${r.stdout}${r.stderr}`, res: parseResult(r.stdout) }; };
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
  assert.equal(run('--tris', big, '--meta', meta).code, 2, 'web: the 4096 texture and 120 bones fail');
  const glb = join(out, 'a.glb'); writeFileSync(glb, new Uint8Array(6 * 1048576));
  assert.equal(run('--tris', big, '--kind', 'hero', '--glb', glb).code, 2, 'a 6 MiB hero GLB is over 5');

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
      const count = d === 2 ? 240 : d === 1 ? 120 : 60; // 2880 -> 1440 -> 720 tris (>2000 at detail 2)
      const tris: number[] = [];
      for (let i = 0; i < count; i++) { const x = i * 2; tris.push(...box(x, 0, 0, x + 1, 1, 1)); }
      // keep identical outer bounds at all LODs by anchoring end box at fixed X
      const endX = 240 * 2; tris.push(...box(endX, 0, 0, endX + 1, 1, 1));
      return { body: tris };
    }
  `);
  const heavyRes = run('--module', heavyMod, '--export', 'buildHeavy', '--profile', 'web', '--kind', 'creature', '--lods');
  assert.equal(heavyRes.code, 0, `>2000-tri creature must pass L0 under web/creature budget:\n${heavyRes.out}`);
  assert.equal(heavyRes.res?.ok, true);
}
console.log('BUDGET OK');
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
  await checkTrack('sample-rigged.glb', 'Nod', 'head.quaternion', [0, 0.5, 1]);
  const blocked = spawnTsx(rigCli, ['--module', injected, '--params', '{"size":0.5}', '--out', join(injected, 'bad.glb')], { cwd: out, env });
  assert.equal(blocked.status, 1);
  assert.match(String(parseResult(blocked.stdout)?.error), /cannot write or re-open/);

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
    console.log('External rigged export: injected TS, bare-import skinned TS, ESM JS');
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
  const { gates, skipped } = qaGates(buildCrateTris({ seed: 3 }), { symmetric: true });
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
assert.equal(gateOf({ a: cube }, 'Q5').pass, true);
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
  const good = run('--module', crate, '--export', 'buildCrateTris', '--symmetric', '--grounded', '--out', out);
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
  assert.equal(viaTris.code, 0, viaTris.out); assert.equal((viaTris.res?.gates as unknown[]).length, 7, 'Q1..Q6 and Q10'); assert.ok((viaTris.res?.unverified as string[]).some((u) => u.includes('Q8')), 'Q8/Q9 cannot run on tris.json');

  const usage = run(); assert.equal(usage.code, 1); assert.equal(usage.res?.ok, false);
  const missing = run('--module', join(out, 'nope.ts')); assert.equal(missing.code, 1); assert.match(String(missing.res?.error), /cannot build or read/);
  const needsThree = join(out, 'three.qa.ts'); writeFileSync(needsThree, `import * as THREE from 'three'; export const build = () => new THREE.BoxGeometry();`);
  const three = run('--module', needsThree); assert.equal(three.code, 1); assert.match(String(three.res?.error), /--tris|three/);
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
  assert.match(sweep.gates[1].value, /^1\.00 .+azimuth 50° \[\+12°\], elevation 10° \[-6°\]/);
  assert.match(sweep.gates[3].value, /reference mirrored: flipH/);
  assert.deepEqual(sweep.diffs['34'], diffRGBA(frontAngle.mask, frontAngle.mask));
  assert.deepEqual(sweep.diffs['34_back'], diffRGBA(rearAngle.mask, rearAngle.mask));
  assert.deepEqual(angledAsset, before, 'compare must leave the triangles intact');
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

for (const view of ['front', 'side', 'top'] as const) {
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
  console.log('Reference CLI OK: nested single and sheet masks, shared triangle JSON, and both angled views');
}
console.log('REFCHECK OK');
~~~

## scripts/rigcheck.test.ts

~~~typescript source-excerpt
// scripts/rigcheck.test.ts: R1 to R6 must pass on valid rigged metadata and catch every defect class.
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

// 1. valid character passes all 6 gates
assert.deepEqual(failedNames(baseMeta()), [], 'valid rig passes R1 to R6');
const valid = rigGates(baseMeta());
assert.equal(valid.gates.length, 6, 'valid rig evaluates all six gates');
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

console.log('RIGCHECK OK');
~~~

## scripts/studio.test.ts

~~~typescript source-excerpt
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResult, spawnTsx } from './result';

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
    '--module', module, '--params', JSON.stringify(params), '--out', out,
  ], { timeout: 15_000 });
  assert.equal(pack.status, 0, pack.stdout + pack.stderr);
  const packed = parseResult(pack.stdout);
  assert.equal(packed?.ok, true);
  assert.deepEqual(packed?.params, params);
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<canvas id="view"/);
  assert.match(html, /#9012ac/);
  assert.match(html, /Three\.js license/);
  assert.equal(html.match(/<\/script\s*>/gi)?.length, 1);
  assert.doesNotMatch(html, /<script\b[^>]+src\s*=/i);

  const png = join(dir, 'studio-contact-sheet.png');
  const capture = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
    '--studio', out, '--out', png, '--browser', join(dir, 'browser-does-not-exist'),
  ], { timeout: 15_000 });
  assert.equal(capture.status, 2, capture.stdout + capture.stderr);
  const captured = parseResult(capture.stdout);
  assert.equal(captured?.status, 'UNVERIFIED');
  assert.equal(captured?.out, null);
  assert.equal(existsSync(png), false);
  console.log('Studio self-contained bundle and browser-unavailable result verified.');
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

This repository builds on and adapts ideas/methodology from the following upstream open-source projects:

---

## 1. zinkkrysty/three-js-asset-studio
- **Source:** https://github.com/zinkkrysty/three-js-asset-studio
- **Role:** Origin of the base `threejs-asset-generator` skill architecture (`.agents/skills/threejs-asset-generator/SKILL.md`), `AssetGeneratorSchema` contract, seeded Mulberry32 PRNG pattern, seam-grouped vertex jitter convention, flat-shaded low-poly rules, composite asset pattern, and standalone code export concept.
- **License note:** No `LICENSE` file is published in the upstream GitHub repository at the time of referencing (described as an open-source studio in its README). Attributed here for transparency.

---

## 2. EL4CTEO/blender-skills
- **Source:** https://github.com/EL4CTEO/blender-skills
- **Version / Commit Referenced:** `v1.3.2` (`9e7e04a`)
- **Role:** Methodology for compact router-style skill organization, automated validation/trigger/test tooling, pure mesh QA gates, 4-panel visual review sheets, platform polygon/memory budgets, LOD verification, and GLB round-trip export gates (re-implemented independently in TypeScript/Node for Three.js without Blender).
- **License:** MIT License

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
~~~
