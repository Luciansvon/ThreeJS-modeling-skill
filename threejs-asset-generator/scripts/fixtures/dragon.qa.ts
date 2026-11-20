// scripts/fixtures/dragon.qa.ts: wraps the real dragon kernel (src/dragonKernel.ts, which needs (params, rng)) into the (params) => parts shape that
// qa-asset.ts, export-glb.ts and mesh-stats.ts accept. Template for any kernel with a different signature. Accepts `detail` (0 to 2, src/lod.ts).
import { createPRNG } from '../../src/prng';
import { resolveParams } from '../../src/params';
import { dragonParameters, buildDragonKernel } from '../../src/dragonKernel';

export const buildDragon = (raw: Record<string, unknown> = {}) => {
  const p = resolveParams({ parameters: dragonParameters }, raw);
  return buildDragonKernel(p, createPRNG(p.seed as number));          // seed 0 is a real seed: resolveParams keeps it
};
