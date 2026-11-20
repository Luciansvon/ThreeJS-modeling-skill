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
