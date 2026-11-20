// scripts/fixtures/crate.qa.ts: the smallest builder qa-asset.ts accepts, and a template for your own:  (params) => { part: Tris, ... }
// Self-contained on purpose (no THREE, no imports from src/). Seeded: seed 0 is a real seed, the stream is local, nothing reads Math.random.
export type Tris = number[];

/** Axis-aligned box, 12 triangles, CCW seen from outside (positive signed volume). */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Tris {
  const lo = [x0, y0, z0], hi = [x1, y1, z1], out: number[] = [];
  for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
    const u = (k + 1) % 3, v = (k + 2) % 3, at = s > 0 ? hi[k] : lo[k];                   // e_u x e_v = e_k, so this order is CCW seen from +k
    const pt = (a: number, b: number) => { const p = [0, 0, 0]; p[k] = at; p[u] = a; p[v] = b; return p; };
    let q = [pt(lo[u], lo[v]), pt(hi[u], lo[v]), pt(hi[u], hi[v]), pt(lo[u], hi[v])];
    if (s < 0) q = [q[0], q[3], q[2], q[1]];
    out.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  }
  return out;
}

const mulberry32 = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A crate: a body whose height depends on the seed, and a batten on each side (mirrored, so the asset is symmetric in x). Y = 0 is the floor. */
export function buildCrateTris(raw: { seed?: number; size?: number } = {}) {
  const seed = raw.seed ?? 42, size = Math.min(Math.max(Number(raw.size ?? 1) || 1, 0.3), 3), rng = mulberry32(seed);   // ?? not ||: seed 0 must work
  const h = size * (0.8 + 0.4 * rng()), half = size / 2, t = size * 0.05;
  return {
    body: box(-half, 0, -half, half, h, half),
    battens: [...box(half - t, 0, -half - t, half + t, h, half + t), ...box(-half - t, 0, -half - t, -half + t, h, half + t)],
  };
}
