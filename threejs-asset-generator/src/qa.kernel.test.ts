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
