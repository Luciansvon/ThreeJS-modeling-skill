import assert from 'node:assert/strict';
import { createPRNG } from './prng';
import { resolveParams } from './params';
import { signedVolumeOf, mirrorTris } from './tri';
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
