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
