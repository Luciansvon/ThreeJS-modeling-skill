// src/lod.ts: deterministic LOD through one `detail` parameter (0 = low, 1 = medium, 2 = full). No THREE.
// Rules (references/budget.md): each level costs about half the triangles of the one above, the same parts and materials, the same pivot and bounds.
// LOD is a different resolution of the SAME seeded asset: fewer segments and fewer small details, never decimation, never a different random stream.
import type { ParamDef } from './types';

export const DETAIL_MAX = 2;
/** Add to a schema as is. Default 2 = full detail, so adding it to an existing asset leaves its output unchanged. */
export const detailParam: ParamDef = { id: 'detail', label: 'Detail (LOD)', type: 'number', default: DETAIL_MAX, min: 0, max: DETAIL_MAX, step: 1, group: 'Quality' };

/** Raw value -> integer level 0..2. `??`, not `||`: detail 0 is a real level. Anything that is not a finite number falls back to full detail. */
export function lodLevel(raw: unknown): 0 | 1 | 2 {
  const n = Number(raw ?? DETAIL_MAX);
  return (Number.isFinite(n) ? Math.min(DETAIL_MAX, Math.max(0, Math.round(n))) : DETAIL_MAX) as 0 | 1 | 2;
}

/** Picks the value for a level from [low, medium, full]. */
export const lodPick = <T>(raw: unknown, byLevel: readonly [T, T, T]): T => byLevel[lodLevel(raw)];
