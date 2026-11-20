import type { Tris, V3 } from './tri';
import { mirrorTris } from './tri';
import { sampleSpline, tubeTris, spikeTris, fanTris } from './organic';
import type { ParamDef } from './types';
import type { Rng } from './prng';
import { detailParam, lodLevel, lodPick } from './lod';

// Example kernel. Replace parameters and wingRim with your project's own.
export const dragonParameters: ParamDef[] = [
  { id: 'seed', label: 'Seed', type: 'number', default: 1, min: 0, max: 999999, step: 1 },
  { id: 'hasSpikes', label: 'Spikes', type: 'boolean', default: true },
  detailParam,                                                  // LOD 0 to 2; the default (2) is the original asset, unchanged
];

// Project-specific wing outline: sheet rim from shoulder outwards (forward +Z, left = +X).
const wingRim = (rng: Rng): V3[] => Array.from({ length: 5 }, (_, i) => [
  1.2 + i * 0.6 + rng() * 0.1, 2.2 - Math.abs(i - 2) * 0.15 + rng() * 0.1, 0.2 - i * 0.25,
] as V3);

// dragonKernel.ts: forward +Z, left = +X (SKILL.md §0)
export function buildDragonKernel(p: Record<string, unknown>, rng: Rng) {
  const d = lodLevel(p.detail);                                                               // LOD: rings, sides and leg joints shrink with `detail`; spikes follow the ring count
  const spine = sampleSpline([[0, 1.2, -3], [0, 1.4, -1], [0, 1.5, 1], [0, 1.9, 2.6]], lodPick(d, [1, 2, 4]));   // tail to head
  const body = tubeTris(spine, (t) => 0.08 + 0.45 * Math.sin(Math.PI * t), lodPick(d, [4, 6, 8]));   // even side count: with an odd one the ring has a vertex on one side and a flat on the other, so the body is not mirror-symmetric (QA gate Q7)

  const spikeRng = rng.fork('spikes');                       // own stream: toggling spikes never moves anything else
  const spikes: Tris = [];
  if (p.hasSpikes) spine.forEach((c, i) => {
    if (i % 2) return;                                       // every second ring
    const rad = 0.08 + 0.45 * Math.sin((Math.PI * i) / (spine.length - 1));
    spikes.push(...spikeTris([c[0], c[1] + rad * 0.9, c[2]], [0, 1, 0.3], 0.25 + spikeRng() * 0.15, 0.07));
  });

  const legL = d === 0
    ? tubeTris([[0.5, 1.0, 0.8], [0.8, 0, 1.3]], [0.18, 0.08], 3)                                            // lowest LOD: straight leg, no knee
    : tubeTris([[0.5, 1.0, 0.8], [0.8, 0.6, 1.1], [0.8, 0, 1.3]], [0.18, 0.12, 0.08], lodPick(d, [3, 4, 5]));   // hip, knee, foot
  const legs = [...legL, ...mirrorTris(legL)];

  const wingL = fanTris([0.4, 1.9, 0.6], wingRim(rng.fork('wing')));   // project-specific rim; sheet, no volume
  return { body, spikes, legs, wingL, wingR: mirrorTris(wingL) };
}
