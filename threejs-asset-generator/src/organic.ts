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

/** Closed tube along a polyline with authored normalized curve parameter `vertexT` per vertex (matches `attachCurveSkinWeights`). */
export function tubeTrisWithT(path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true,
  shape?: (angle: number, t: number) => number, upHint?: V3): { tris: Tris; vertexT: number[] } {
  const n = path.length, out: Tris = [], vertexT: number[] = [];
  const tOf = (i: number) => (n > 1 ? i / (n - 1) : 0);
  const r = (i: number) => (typeof radius === 'function' ? radius(tOf(i)) : radius[i]);
  const T = path.map((_, i) => norm(sub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)])));
  const hint = upHint && Math.abs(dot(norm(upHint), T[0])) < 0.98 ? norm(upHint) : (Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] as V3 : [1, 0, 0] as V3);
  let u = norm(cross(hint, T[0]));   // any normal to the first tangent
  const rings: V3[][] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) u = norm(sub(u, mul(T[i], dot(u, T[i]))));    // carry the previous normal into the new plane
    const v = cross(T[i], u);                                // (u, v, T) is right-handed: u × v = T
    rings.push(Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * Math.PI * 2, rr = r(i) * (shape ? shape(a, tOf(i)) : 1);
      return add(path[i], add(mul(u, Math.cos(a) * rr), mul(v, Math.sin(a) * rr)));
    }));
  }
  const push = (a: V3, b: V3, c: V3, ta: number, tb: number, tc: number) => {
    out.push(...a, ...b, ...c);
    vertexT.push(ta, tb, tc);
  };
  for (let i = 0; i < n - 1; i++) {
    const ti = tOf(i), ti1 = tOf(i + 1);
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      push(rings[i][j], rings[i][k], rings[i + 1][k], ti, ti, ti1);
      push(rings[i][j], rings[i + 1][k], rings[i + 1][j], ti, ti1, ti1);   // outward CCW
    }
  }
  if (caps)
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides;
      push(path[0], rings[0][k], rings[0][j], 0, 0, 0);                      // start cap faces −T
      push(path[n - 1], rings[n - 1][j], rings[n - 1][k], 1, 1, 1);          // end cap faces +T
    }
  return { tris: out, vertexT };
}

/** Closed tube along a polyline. Frames are parallel-transported, so the tube never twists. Pass `upHint` to control initial frame alignment on steep/vertical fins. */
export function tubeTris(path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true,
  shape?: (angle: number, t: number) => number, upHint?: V3): Tris {   // shape: radius multiplier by angle (rad) and t in 0..1 along the path
  return tubeTrisWithT(path, radius, sides, caps, shape, upHint).tris;
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

/** Closed razor-sharp planar blade/fin (dorsal spines, tail fans, crests, ears) lying perpendicular to `planeNormal` (default +X so blades stay razor-thin on X=0). Guaranteed outward CCW. */
export function planarBladeTris(
  base: V3, mid: V3, tip: V3,
  halfThick: number, chordBase: number, chordMid: number,
  planeNormal: V3 = [1, 0, 0]
): Tris {
  const nrm = norm(planeNormal);
  const t0 = norm(sub(mid, base));
  const t1 = norm(sub(tip, base));
  const c0 = norm(cross(nrm, t0));
  const c1 = norm(cross(nrm, t1));
  const ring = (center: V3, chordDir: V3, hThick: number, hChord: number): V3[] => [
    add(center, mul(nrm, hThick)),
    add(center, mul(chordDir, hChord)),
    add(center, mul(nrm, -hThick)),
    add(center, mul(chordDir, -hChord)),
  ];
  const r0 = ring(base, c0, Math.max(0.002, halfThick), Math.max(0.004, chordBase));
  const r1 = ring(mid, c1, Math.max(0.002, halfThick * 0.8), Math.max(0.004, chordMid));
  const out: Tris = [];
  const push = (a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c);
  for (let j = 0; j < 4; j++) {
    const k = (j + 1) % 4;
    push(r0[j], r0[k], r1[k]); push(r0[j], r1[k], r1[j]);
    push(r1[j], r1[k], tip);
    push(base, r0[k], r0[j]);
  }
  // Ensure outward CCW regardless of base->mid->tip orientation
  let vol = 0;
  for (let i = 0; i < out.length; i += 9) {
    const ax = out[i], ay = out[i + 1], az = out[i + 2], bx = out[i + 3], by = out[i + 4], bz = out[i + 5], cx = out[i + 6], cy = out[i + 7], cz = out[i + 8];
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  if (vol < 0) {
    for (let i = 0; i < out.length; i += 9) {
      for (let c = 0; c < 3; c++) { const tmp = out[i + 3 + c]; out[i + 3 + c] = out[i + 6 + c]; out[i + 6 + c] = tmp; }
    }
  }
  return out;
}

/** Replicates `tris` evenly `count` times around `axis` (0=X, 1=Y, 2=Z) through `center` (spider legs, kraken tentacles, wheel spokes, pillars). Preserves outward CCW winding. */
export function radialArrayTris(tris: Tris, count: number, axis: 0 | 1 | 2 = 1, center: V3 = [0, 0, 0], startAngle = 0): Tris {
  const out: Tris = [];
  const a1 = (axis + 1) % 3, a2 = (axis + 2) % 3;
  for (let k = 0; k < count; k++) {
    const ang = startAngle + (k / count) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < tris.length; i += 3) {
      const p: V3 = [tris[i] - center[0], tris[i + 1] - center[1], tris[i + 2] - center[2]];
      const r: V3 = [p[0], p[1], p[2]];
      r[a1] = p[a1] * ca - p[a2] * sa;
      r[a2] = p[a1] * sa + p[a2] * ca;
      out.push(r[0] + center[0], r[1] + center[1], r[2] + center[2]);
    }
  }
  return out;
}
