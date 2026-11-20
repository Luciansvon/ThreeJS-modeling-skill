// src/organic.ts: no THREE import
import type { V3, Tris } from './tri';
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/** Catmull-Rom through the control points; returns (pts.length - 1) * perSegment + 1 points. */
export function sampleSpline(pts: V3[], perSegment = 4): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 +
        (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3)) as V3);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Closed tube along a polyline. Frames are parallel-transported, so the tube never twists. */
export function tubeTris(path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true,
  shape?: (angle: number, t: number) => number): Tris {   // shape: radius multiplier by angle (rad) and t in 0..1 along the path
  const n = path.length, out: Tris = [];
  const r = (i: number) => (typeof radius === 'function' ? radius(i / (n - 1)) : radius[i]);
  const T = path.map((_, i) => norm(sub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)])));
  let u = norm(cross(Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], T[0]));   // any normal to the first tangent
  const rings: V3[][] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) u = norm(sub(u, mul(T[i], dot(u, T[i]))));    // carry the previous normal into the new plane
    const v = cross(T[i], u);                                // (u, v, T) is right-handed: u × v = T
    rings.push(Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * Math.PI * 2, rr = r(i) * (shape ? shape(a, i / (n - 1)) : 1);
      return add(path[i], add(mul(u, Math.cos(a) * rr), mul(v, Math.sin(a) * rr)));
    }));
  }
  const push = (a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c);
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      push(rings[i][j], rings[i][k], rings[i + 1][k]); push(rings[i][j], rings[i + 1][k], rings[i + 1][j]);   // outward CCW
    }
  if (caps)
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      push(path[0], rings[0][k], rings[0][j]);                      // start cap faces −T
      push(path[n - 1], rings[n - 1][j], rings[n - 1][k]);          // end cap faces +T
    }
  return out;
}

/** Cone-like spike (horn, thorn, claw, tooth). The tip keeps a tiny radius so no triangle is degenerate. */
export const spikeTris = (base: V3, dir: V3, length: number, radius: number, sides = 4): Tris =>
  tubeTris([base, add(base, mul(norm(dir), length))], [radius, radius * 0.04], sides);

/** Open sheet from an apex to a rim polyline (membranes, sails, leaves). Rim runs CCW seen from the visible side. */
export function fanTris(apex: V3, rim: V3[]): Tris {
  const out: Tris = [];
  for (let i = 0; i < rim.length - 1; i++) out.push(...apex, ...rim[i], ...rim[i + 1]);
  return out;
}
