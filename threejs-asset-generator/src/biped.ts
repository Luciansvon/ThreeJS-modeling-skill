// src/biped.ts: no THREE import
import type { V3, Tris } from './tri';
import { add, sub, mul, dot, cross, norm, sampleSpline, tubeTris } from './organic';

export type V2 = [number, number];
export interface Frame { u: V3; v: V3; d: V3 }          // u × v = d, v ≈ up

/** Right-handed frame whose d points along `dir` and v is as close to `up` as possible. */
export function frameFrom(dir: V3, up: V3 = [0, 1, 0]): Frame {
  const d = norm(dir);
  if (Math.abs(dot(d, norm(up))) > 0.98) up = [0, 0, 1];
  const u = norm(cross(up, d)), v = cross(d, u);
  return { u, v, d };
}

export interface LoftStage { dist: number; scale: number | V2; shift?: V2 }

/**
 * Loft a convex or star-shaped 2D outline through stages along `dir`.
 * outline: CCW in the (u, v) plane seen from the +d side. Scale is about the outline's (0, 0), so an outline
 * with its flat side on y = 0 (a sole) keeps that side flat while tapering. Both ends are capped (closed, outward CCW).
 */
export function loftTris(outline: V2[], origin: V3, dir: V3, stages: LoftStage[], up: V3 = [0, 1, 0]): Tris {
  const { u, v, d } = frameFrom(dir, up), out: Tris = [];
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length, cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  const rings: V3[][] = stages.map((s) => {
    const [sx, sy] = typeof s.scale === 'number' ? [s.scale, s.scale] : s.scale;
    const [dx, dy] = s.shift ?? [0, 0], base = add(origin, mul(d, s.dist));
    return outline.map((p) => add(base, add(mul(u, p[0] * sx + dx), mul(v, p[1] * sy + dy))));
  });
  const centers = stages.map((s) => {
    const [sx, sy] = typeof s.scale === 'number' ? [s.scale, s.scale] : s.scale;
    return add(add(origin, mul(d, s.dist)), add(mul(u, cx * sx + (s.shift?.[0] ?? 0)), mul(v, cy * sy + (s.shift?.[1] ?? 0))));
  });
  const push = (a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c);
  const m = outline.length;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < m; j++) {
      const k = (j + 1) % m;
      push(rings[i][j], rings[i][k], rings[i + 1][k]); push(rings[i][j], rings[i + 1][k], rings[i + 1][j]);
    }
  const last = rings.length - 1;
  for (let j = 0; j < m; j++) {
    const k = (j + 1) % m;
    push(centers[0], rings[0][k], rings[0][j]);
    push(centers[last], rings[last][j], rings[last][k]);
  }
  return out;
}

/** Straight extrusion with optional taper (end scale) and a chamfered bevel at both ends. */
export function extrudeTris(outline: V2[], origin: V3, dir: V3, length: number,
  o: { taper?: number | V2; bevel?: number; bevelDepth?: number; up?: V3 } = {}): Tris {
  const taper = o.taper ?? 1, [tx, ty] = typeof taper === 'number' ? [taper, taper] : taper;
  const at = (z: number, k: number): LoftStage => {
    const t = z / length;
    return { dist: z, scale: [(1 + (tx - 1) * t) * k, (1 + (ty - 1) * t) * k] };
  };
  const bd = Math.min(o.bevelDepth ?? length * 0.12, length * 0.4), b = o.bevel ?? 0;
  const stages = b > 0 ? [at(0, 1 - b), at(bd, 1), at(length - bd, 1), at(length, 1 - b)] : [at(0, 1), at(length, 1)];
  return loftTris(outline, origin, dir, stages, o.up);
}

/** Regular n-gon outline, handy for pleats (n large, radius alternating) and ears. */
export const ngon = (n: number, rx: number, ry = rx): V2[] =>
  Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * rx, Math.sin((i / n) * Math.PI * 2) * ry] as V2);

/** Oriented box from center, forward and up (feet, hands, belt buckles). Closed, outward CCW. */
export const boxTris = (center: V3, forward: V3, up: V3, size: V3): Tris =>
  loftTris([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [x * size[0] / 2, y * size[1] / 2] as V2),
    sub(center, mul(norm(forward), size[2] / 2)), forward, [{ dist: 0, scale: 1 }, { dist: size[2], scale: 1 }], up);

/** Two-bone IK: returns the middle joint (elbow or knee). `bend` is the side the joint bows toward. */
export function twoBoneIK(root: V3, target: V3, l1: number, l2: number, bend: V3): V3 {
  const dir = sub(target, root);
  const dist = Math.min(Math.max(Math.hypot(dir[0], dir[1], dir[2]), Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const d = norm(dir), a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const side = norm(sub(bend, mul(d, dot(bend, d))));
  return add(add(root, mul(d, a)), mul(side, h));
}

export interface BipedProportions { height: number; legRatio: number; armRatio: number; headRatio: number; bulk: number }
export interface BipedJoints {
  hip: V3; chest: V3; neck: V3; head: V3;
  shoulderL: V3; elbowL: V3; handL: V3;
  hipL: V3; kneeL: V3; footL: V3;                      // left = +X; mirror x for the right side
}

/** Rest pose (A-pose, facing +Z, feet on Y = 0). Joints are points, never nested rotations. */
export function bipedRest(p: BipedProportions): BipedJoints {
  const H = p.height, leg = H * p.legRatio, head = H * p.headRatio;
  const hipY = leg, chestY = hipY + (H - leg - head) * 0.65, neckY = H - head;
  const sx = H * 0.16 * p.bulk, hx = H * 0.07 * p.bulk, arm = H * p.armRatio;
  const shoulder: V3 = [sx, chestY, 0];
  const dirA = norm([0.45, -1, 0.05]);
  const elbow = add(shoulder, mul(dirA, arm * 0.5)), hand = add(shoulder, mul(dirA, arm));
  return {
    hip: [0, hipY, 0], chest: [0, chestY, 0], neck: [0, neckY, 0], head: [0, neckY + head * 0.5, 0.02 * H],
    shoulderL: shoulder, elbowL: elbow, handL: hand,
    hipL: [hx, hipY, 0], kneeL: [hx * 1.05, leg * 0.5, H * 0.03], footL: [hx * 1.1, 0, 0],
  };
}

export const mirrorPoint = (p: V3): V3 => [-p[0], p[1], p[2]];

/** Foot wedge from ankle: toes point along `forward`, sole at the ankle's Y. */
export const footTris = (ankle: V3, forward: V3, len: number, width: number, height: number): Tris =>
  extrudeTris([[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]].map(([x, y]) => [x * width, y * height] as V2),
    sub(ankle, mul(norm(forward), len * 0.25)), forward, len, { taper: [0.6, 0.5], bevel: 0.15 });

/** Hand: palm block + thumb spike direction supplied by caller. */
export const handTris = (wrist: V3, dir: V3, len: number, width: number, thick: number, up: V3 = [0, 1, 0]): Tris =>
  extrudeTris([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => [x * width, y * thick] as V2),
    wrist, dir, len, { taper: [0.7, 0.7], bevel: 0.2, up });

/** Clothing that hugs a limb: a slightly fatter tube over the [t0, t1] part of the limb's path. */
export function sleeveTris(path: V3[], radius: (t: number) => number, t0: number, t1: number, inflate = 0.02, sides = 6,
  shape?: (a: number, t: number) => number): Tris {
  const dense = sampleSpline(path, 4), n = dense.length;
  const i0 = Math.round(t0 * (n - 1)), i1 = Math.max(i0 + 1, Math.round(t1 * (n - 1)));
  const sub_ = dense.slice(i0, i1 + 1), m = sub_.length - 1;
  return tubeTris(sub_, (s) => radius(t0 + (t1 - t0) * s) + inflate, sides, true, shape && ((a, s) => shape(a, t0 + (t1 - t0) * s)));
}

/** Face feature helpers, all in head space. `dir` is the outward direction of the face (usually +Z). */
export const eyeTris = (c: V3, dir: V3, size: number, up: V3 = [0, 1, 0]) =>
  extrudeTris([[-1, 0], [0, -0.6], [1, 0], [0, 0.6]].map(([x, y]) => [x * size, y * size] as V2), c, dir, size * 0.4, { taper: 0.5, up });

export const noseTris = (base: V3, dir: V3, length: number, width: number, up: V3 = [0, 1, 0]) =>
  extrudeTris(ngon(4, width / 2), base, dir, length, { taper: 0.35, up });

/** Pointed ear with a raised rim: outer shell plus a smaller inner lip you paint a different color. */
export function earTris(base: V3, out: V3, length: number, width: number, up: V3 = [0, 1, 0], droop = 0.2) {
  const d = norm(add(norm(out), mul(norm(up), -droop)));
  const shell = extrudeTris([[-0.5, 0], [0.5, 0], [0, 1]].map(([x, y]) => [x * width, y * width * 0.9] as V2), base, d, length,
    { taper: [0.25, 0.2], bevel: 0.15, up });
  const inner = extrudeTris([[-0.5, 0.05], [0.5, 0.05], [0, 0.9]].map(([x, y]) => [x * width * 0.55, y * width * 0.7] as V2),
    add(base, mul(frameFrom(d, up).v, width * 0.05)), d, length * 0.7, { taper: [0.2, 0.15], up });
  return { shell, inner };
}

/** Outward-CCW tapered box centered in X/Z, extending from y = 0 to y = h. */
export function taperedBoxTris(wBot: number, dBot: number, wTop: number, dTop: number, h: number): Tris {
  const bx = wBot / 2, bz = dBot / 2, tx = wTop / 2, tz = dTop / 2;
  const v: V3[] = [
    [-bx, 0,  bz], [ bx, 0,  bz], [ bx, 0, -bz], [-bx, 0, -bz],   // 0..3 bottom
    [-tx, h,  tz], [ tx, h,  tz], [ tx, h, -tz], [-tx, h, -tz],   // 4..7 top
  ];
  const out: Tris = [];
  const quad = (a: number, b: number, c: number, d: number) =>
    out.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  quad(0, 1, 5, 4); quad(1, 2, 6, 5); quad(2, 3, 7, 6); quad(3, 0, 4, 7);   // +Z, +X, -Z, -X
  quad(4, 5, 6, 7); quad(3, 2, 1, 0);                                       // top, bottom
  return out;
}
