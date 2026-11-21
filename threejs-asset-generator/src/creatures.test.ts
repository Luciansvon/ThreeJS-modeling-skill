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
