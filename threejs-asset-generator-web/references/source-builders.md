# Builder and geometry source

Contents: src/biped.ts · src/detail.ts · src/detailThree.ts · src/dragonKernel.ts · src/fingerprint.ts · src/geometry.ts · src/jitter.ts · src/lifecycle.ts · src/lod.ts · src/lowpoly.ts · src/organic.ts · src/overlay.ts · src/params.ts · src/prng.ts · src/rig.ts · src/skinnedRig.ts · src/texture.ts · src/tri.ts · src/types.ts

Generated from the canonical harness files. Search by original file path and use the [web runtime guide](runtime.md) to choose which commands or helpers to use in this session.

## src/biped.ts

~~~typescript source-excerpt
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
~~~

## src/detail.ts

~~~typescript source-excerpt
// src/detail.ts: pure helpers, NO THREE import (Node-testable, exporter-safe)
import type { V3, Tris } from './tri';

export type Rng = () => number;
export type UVs = number[];                                  // 2 numbers per vertex, same order as Tris
export type Rect = { u0: number; v0: number; u1: number; v1: number };

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const TAU = Math.PI * 2;

/* ───────── 1. Atlas UV ───────── */

/** Cell 0 is the TOP-LEFT of the image (row-major). Same for .webp and generated atlases. pad shrinks the rect to stop bleeding. */
export function atlasRect(cell: number, cols: number, rows = cols, pad = 0.002): Rect {
  const c = cell % cols, r = Math.floor(cell / cols);
  return { u0: c / cols + pad, u1: (c + 1) / cols - pad, v1: 1 - r / rows - pad, v0: 1 - (r + 1) / rows + pad };
}
const inRect = (r: Rect | undefined, x: number, y: number): [number, number] =>
  r ? [r.u0 + (r.u1 - r.u0) * x, r.v0 + (r.v1 - r.v0) * y] : [x, y];

/**
 * Tube with UV. u = around (0..1), v = along the path by arc length (0..1). Caps use a polar disc.
 * `ring(i, angle, t)` gives the radius; angle 0 = frame axis u (for a path along +Z that is +X, π/2 = +Y).
 * With `cell` the uv land inside that atlas cell. Triangle order matches tubeTris (outward CCW).
 */
export function ringTube(path: V3[], ring: (i: number, angle: number, t: number) => number, sides = 8, caps = true, cell?: Rect) {
  const n = path.length, tris: Tris = [], uv: UVs = [];
  const T = path.map((_, i) => norm(sub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)])));
  const arc = [0]; for (let i = 1; i < n; i++) arc.push(arc[i - 1] + len(sub(path[i], path[i - 1])));
  const total = arc[n - 1] || 1;
  let u = norm(cross(Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], T[0]));
  const rings: V3[][] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) u = norm(sub(u, mul(T[i], dot(u, T[i]))));
    const v = cross(T[i], u);
    rings.push(Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * TAU, r = Math.max(ring(i, a, i / (n - 1 || 1)), 1e-4);
      return add(path[i], add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r)));
    }));
  }
  const tri = (a: V3, ua: [number, number], b: V3, ub: [number, number], c: V3, uc: [number, number]) => {
    tris.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc);
  };
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides, uj = j / sides, uk = (j + 1) / sides, vi = arc[i] / total, vn = arc[i + 1] / total;
      const A = inRect(cell, uj, vi), B = inRect(cell, uk, vi), C = inRect(cell, uk, vn), D = inRect(cell, uj, vn);
      tri(rings[i][j], A, rings[i][k], B, rings[i + 1][k], C);
      tri(rings[i][j], A, rings[i + 1][k], C, rings[i + 1][j], D);
    }
  if (caps)
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides, aj = (j / sides) * TAU, ak = ((j + 1) / sides) * TAU;
      const c = inRect(cell, 0.5, 0.5), pj = inRect(cell, 0.5 + 0.5 * Math.cos(aj), 0.5 + 0.5 * Math.sin(aj)), pk = inRect(cell, 0.5 + 0.5 * Math.cos(ak), 0.5 + 0.5 * Math.sin(ak));
      tri(path[0], c, rings[0][k], pk, rings[0][j], pj);
      tri(path[n - 1], c, rings[n - 1][j], pj, rings[n - 1][k], pk);
    }
  return { tris, uv };
}

export const tubeWithUV = (path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true, cell?: Rect) =>
  ringTube(path, (i, _a, t) => (typeof radius === 'function' ? radius(t) : radius[i]), sides, caps, cell);

/** Lathe around Y. profile = [radius, y] from bottom to top. u = around, v = arc length along the profile. Ends with radius > 0 get a cap. */
export function latheWithUV(profile: [number, number][], segments = 8, cell?: Rect) {
  const n = profile.length, tris: Tris = [], uv: UVs = [];
  const arc = [0]; for (let i = 1; i < n; i++) arc.push(arc[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = arc[n - 1] || 1;
  const P = (i: number, j: number): V3 => { const a = (j / segments) * TAU; return [profile[i][0] * Math.cos(a), profile[i][1], -profile[i][0] * Math.sin(a)]; };
  const tri = (a: V3, ua: [number, number], b: V3, ub: [number, number], c: V3, uc: [number, number]) => { tris.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments, uj = j / segments, uk = (j + 1) / segments, v0 = arc[i] / total, v1 = arc[i + 1] / total;
      const A = inRect(cell, uj, v0), B = inRect(cell, uk, v0), C = inRect(cell, uk, v1), D = inRect(cell, uj, v1);
      if (profile[i][0] > 1e-6 || profile[i + 1][0] > 1e-6) {
        if (profile[i][0] > 1e-6) tri(P(i, j), A, P(i, k), B, P(i + 1, k), C);      // skip the degenerate half at a pole
        if (profile[i + 1][0] > 1e-6) tri(P(i, j), A, P(i + 1, k), C, P(i + 1, j), D);
      }
    }
  const cap = (i: number, up: boolean) => {
    if (profile[i][0] <= 1e-6) return;
    const c: V3 = [0, profile[i][1], 0], cc = inRect(cell, 0.5, 0.5);
    for (let j = 0; j < segments; j++) {
      const k = (j + 1) % segments, aj = (j / segments) * TAU, ak = ((j + 1) / segments) * TAU;
      const pj = inRect(cell, 0.5 + 0.5 * Math.cos(aj), 0.5 + 0.5 * Math.sin(aj)), pk = inRect(cell, 0.5 + 0.5 * Math.cos(ak), 0.5 + 0.5 * Math.sin(ak));
      if (up) tri(c, cc, P(i, j), pj, P(i, k), pk); else tri(c, cc, P(i, k), pk, P(i, j), pj);
    }
  };
  cap(0, false); cap(n - 1, true);
  return { tris, uv };
}

/* ───────── 2. Chamfer + procedural sculpt ───────── */

/**
 * Box with 45° chamfered edges and corners (44 triangles, closed, outward CCW). bevel is clamped to 95% of the smallest half-size.
 * bevel = 0 (or negligibly small) returns a plain box of 12 triangles, never degenerate slivers. A negative, NaN or infinite bevel,
 * or a non-positive size, throws a RangeError.
 */
export function chamferBoxTris(center: V3, size: V3, bevel: number): Tris {
  if (!Number.isFinite(bevel) || bevel < 0) throw new RangeError(`chamferBoxTris: bevel must be a finite number >= 0 (got ${bevel})`);
  if (!size.every((s) => s > 0 && Number.isFinite(s))) throw new RangeError(`chamferBoxTris: every size component must be > 0 (got ${size.join(', ')})`);
  const h = size.map((s) => s / 2) as V3, b = Math.min(bevel, Math.min(...h) * 0.95), out: Tris = [];
  const plain = b <= Math.min(...h) * 1e-4;                                  // no bevel: faces only (12 triangles)
  const P = (s: V3, axis: number): V3 => [0, 1, 2].map((k) => center[k] + s[k] * (k === axis ? h[k] : h[k] - b)) as V3;
  const poly = (pts: V3[], n: V3) => {
    n = norm(n);
    const cen = mul(pts.reduce((a, p) => add(a, p), [0, 0, 0] as V3), 1 / pts.length);
    const e1 = norm(cross(Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n)), e2 = cross(n, e1);   // e1 × e2 = n
    const ang = (p: V3) => Math.atan2(dot(sub(p, cen), e2), dot(sub(p, cen), e1));
    const s = [...pts].sort((p, q) => ang(p) - ang(q));
    for (let i = 1; i < s.length - 1; i++) out.push(...s[0], ...s[i], ...s[i + 1]);
  };
  const S = [-1, 1];
  for (let a = 0; a < 3; a++) for (const sa of S) {                          // 6 faces
    const pts: V3[] = [];
    for (const sb of S) for (const sc of S) { const s = [0, 0, 0]; s[a] = sa; s[(a + 1) % 3] = sb; s[(a + 2) % 3] = sc; pts.push(P(s as V3, a)); }
    const n: V3 = [0, 0, 0]; n[a] = sa; poly(pts, n);
  }
  if (plain) return out;
  for (let a = 0; a < 3; a++) { const bx = (a + 1) % 3, c = (a + 2) % 3;     // 12 edge strips
    for (const sa of S) for (const sb of S) {
      const pts: V3[] = [];
      for (const sc of S) { const s = [0, 0, 0]; s[a] = sa; s[bx] = sb; s[c] = sc; pts.push(P(s as V3, a), P(s as V3, bx)); }
      const n: V3 = [0, 0, 0]; n[a] = sa; n[bx] = sb; poly(pts, n);
    }
  }
  for (const sx of S) for (const sy of S) for (const sz of S) poly([P([sx, sy, sz], 0), P([sx, sy, sz], 1), P([sx, sy, sz], 2)], [sx, sy, sz]);   // 8 corners
  return out;
}

/** Smooth bump: 1 at `center`, 0 at distance `width`. Cosine falloff, so no creases. */
export const sculptFalloff = (x: number, center: number, width: number) => {
  const d = Math.abs(x - center) / Math.max(width, 1e-6);
  return d >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * d));
};
/** Same, on a circle (angles in radians, wraps around). */
export const angleFalloff = (a: number, center: number, width: number) => {
  const d = Math.abs(Math.atan2(Math.sin(a - center), Math.cos(a - center)));
  return sculptFalloff(d, 0, width);
};

/** amount +0.3 = bulge 30%, -0.2 = dent 20%. t = 0..1 along the spine. Without angle the sculpt wraps the whole ring. */
export type Sculpt = { t: number; width: number; amount: number; angle?: number; angleWidth?: number };

/**
 * Organic body: elliptical sections (rx = width, ry = height) along a spine, plus controlled bulges and dents
 * (cheeks, belly, brow, haunch). For a spine along +Z: angle 0 = +X (left), π/2 = +Y (up), π = right, 3π/2 = down.
 * Keep rx(t), ry(t) > 0.02 at the ends. Returns tris + uv (feed uv to a fur/skin atlas cell).
 */
export function loftSculptedBody(spine: V3[], rx: (t: number) => number, ry: (t: number) => number, sculpts: Sculpt[] = [], sides = 10, caps = true, cell?: Rect) {
  return ringTube(spine, (_i, a, t) => {
    const X = rx(t), Y = ry(t);
    let f = 1;
    for (const s of sculpts) f += s.amount * sculptFalloff(t, s.t, s.width) * (s.angle === undefined ? 1 : angleFalloff(a, s.angle, s.angleWidth ?? 0.9));
    return ((X * Y) / Math.hypot(Y * Math.cos(a), X * Math.sin(a))) * Math.max(f, 0.1);
  }, sides, caps, cell);
}

/* ───────── 3. Fake ambient occlusion (pure factor) ───────── */

/** Dark pocket around `at` (under a chin, under a cap, inside a cabin). facing: only faces looking that way are darkened. */
export type AOZone = { at: V3; radius: number; strength: number; facing?: V3 };
export type AOOptions = {
  zones?: AOZone[];
  downBias?: number;                                          // 0..1, darkens faces looking down (under-belly, under-cap)
  groundY?: number; groundHeight?: number; groundStrength?: number;   // contact shade near the floor
  floor?: number;                                             // never darker than this factor (default 0.35)
};
/** Multiplier 0.35..1 for one triangle. Combine multiplicatively, so overlapping pockets stack but never go black. */
export function aoFactor(centroid: V3, normal: V3, o: AOOptions): number {
  let f = 1;
  for (const z of o.zones ?? []) {
    const d = len(sub(centroid, z.at));
    if (d >= z.radius) continue;
    let w = (1 - d / z.radius) ** 2;
    if (z.facing) w *= Math.max(0, dot(normal, norm(z.facing)));
    f *= 1 - z.strength * w;
  }
  if (o.downBias) f *= 1 - o.downBias * clamp01(-normal[1]);
  if (o.groundHeight) f *= 1 - (o.groundStrength ?? 0.4) * clamp01(1 - (centroid[1] - (o.groundY ?? 0)) / o.groundHeight);
  return Math.max(o.floor ?? 0.35, f);
}

/* ───────── 4. Surface sockets ───────── */

export type Hit = { point: V3; normal: V3; t: number; tri: number };

/** Nearest ray hit on a triangle array (both sides; normal is always the outward geometric normal). Cast from inside to go outward. */
export function raycastTris(tris: Tris, origin: V3, dir: V3): Hit | null {
  const d = norm(dir); let best: Hit | null = null;
  for (let i = 0; i < tris.length; i += 9) {
    const a: V3 = [tris[i], tris[i + 1], tris[i + 2]], b: V3 = [tris[i + 3], tris[i + 4], tris[i + 5]], c: V3 = [tris[i + 6], tris[i + 7], tris[i + 8]];
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, s = sub(origin, a), u = dot(s, p) * inv;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(d, q) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = dot(e2, q) * inv;
    if (t > 1e-9 && (!best || t < best.t)) best = { point: add(origin, mul(d, t)), normal: norm(cross(e1, e2)), t, tri: i / 9 };
  }
  return best;
}

/** Deterministic, area-weighted points on a surface. filter(point, normal) picks where (e.g. top of a cap: n[1] > 0.3). minDist spaces them out. */
export function scatterOnSurface(tris: Tris, rng: Rng, count: number, o: { filter?: (p: V3, n: V3) => boolean; minDist?: number; maxTries?: number } = {}): Hit[] {
  const nT = tris.length / 9, cum: number[] = []; let sum = 0;
  for (let i = 0; i < nT; i++) {
    const a: V3 = [tris[i * 9], tris[i * 9 + 1], tris[i * 9 + 2]], b: V3 = [tris[i * 9 + 3], tris[i * 9 + 4], tris[i * 9 + 5]], c: V3 = [tris[i * 9 + 6], tris[i * 9 + 7], tris[i * 9 + 8]];
    sum += len(cross(sub(b, a), sub(c, a))) / 2; cum.push(sum);
  }
  const hits: Hit[] = [];
  for (let tries = 0, max = o.maxTries ?? count * 30; hits.length < count && tries < max && sum > 0; tries++) {
    const x = rng() * sum; let lo = 0, hi = nT - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
    const i = lo * 9, r1 = Math.sqrt(rng()), r2 = rng();
    const a: V3 = [tris[i], tris[i + 1], tris[i + 2]], b: V3 = [tris[i + 3], tris[i + 4], tris[i + 5]], c: V3 = [tris[i + 6], tris[i + 7], tris[i + 8]];
    const pt = add(add(mul(a, 1 - r1), mul(b, r1 * (1 - r2))), mul(c, r1 * r2)), n = norm(cross(sub(b, a), sub(c, a)));
    if (o.filter && !o.filter(pt, n)) continue;
    if (o.minDist && hits.some((h) => len(sub(h.point, pt)) < o.minDist!)) continue;
    hits.push({ point: pt, normal: n, t: 0, tri: lo });
  }
  return hits;
}

export const mirrorHit = (h: Hit, axis: 0 | 1 | 2 = 0): Hit => {
  const p = [...h.point] as V3, n = [...h.normal] as V3; p[axis] *= -1; n[axis] *= -1; return { ...h, point: p, normal: n };
};

/**
 * Places a detail authored at the origin, base on y = 0, pointing +Y, front +Z, onto a hit.
 * local +Y becomes the surface normal; local +Z points toward `up` projected on the surface (rotate with spin).
 * sink pushes the base into the surface (fraction of scale), so the detail never floats. Rotation + positive scale keep the winding.
 */
export function placeTris(local: Tris, hit: Hit, o: { scale?: number | V3; sink?: number; spin?: number; up?: V3 } = {}): Tris {
  const sc: V3 = typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale ?? [1, 1, 1];
  const n = norm(hit.normal);
  let ref = o.up ?? [0, 1, 0]; if (Math.abs(dot(norm(ref), n)) > 0.95) ref = [0, 0, 1]; if (Math.abs(dot(norm(ref), n)) > 0.95) ref = [1, 0, 0];
  let z = norm(sub(ref, mul(n, dot(ref, n)))), x = cross(n, z);
  if (o.spin) { const c = Math.cos(o.spin), s = Math.sin(o.spin); const z2 = add(mul(z, c), mul(x, s)); z = z2; x = cross(n, z); }
  const base = sub(hit.point, mul(n, (o.sink ?? 0.15) * Math.max(sc[1], 1e-9)));
  const out = new Array<number>(local.length);
  for (let i = 0; i < local.length; i += 3) {
    const p = add(base, add(add(mul(x, local[i] * sc[0]), mul(n, local[i + 1] * sc[1])), mul(z, local[i + 2] * sc[2])));
    out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2];
  }
  return out;
}

/* ───────── 5. Procedural atlas painter (pure bytes, no THREE) ───────── */

export type AtlasKind = 'flat' | 'noise' | 'grain' | 'fur' | 'spots' | 'gills' | 'scales';
export interface AtlasCell {
  kind: AtlasKind;
  base: number;                 // 0xRRGGBB
  accent?: number;              // color where the pattern mask is 1 (default: base darkened)
  tone?: number;                // 0..1 brightness noise (default 0.12)
  density?: number;             // pattern frequency / spot count (default 8)
  rough?: number;               // 0..1 roughness where mask = 0 (default 0.85)
  roughAccent?: number;         // roughness where mask = 1 (default = rough). Eyes: rough 0.9, accent 0.1
  bump?: number;                // 0..1 height strength (default 0.5)
}

/** Small seeded stream (mulberry32). Used to give every atlas cell its own isolated stream. */
const mulberry = (seed: number): Rng => {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next();                                                   // warm-up: neighbouring seeds start decorrelated
  return next;
};

/** Colour of grid slots that no cell fills (cells.length < cols x rows): opaque mid grey, never transparent black. */
export const ATLAS_UNUSED = { color: 0x808080, rough: 0.85, bump: 0.5 };

/**
 * One RGBA byte image per map. Cell 0 is top-left (matches atlasRect).
 * Stream isolation: `rng` is drawn exactly ONCE (a base seed). Cell i then uses its own stream derived from (base, i), so changing the
 * kind, density or colour of one cell never changes the pixels of any other cell (SKILL.md §2). Inserting or removing a cell shifts the
 * indices after it, so append new cells at the end. Unused grid slots are filled with ATLAS_UNUSED.
 */
export function paintAtlas(rng: Rng, cells: AtlasCell[], cols: number, cellPx = 32) {
  if (!(cols >= 1) || !Number.isInteger(cols)) throw new RangeError(`paintAtlas: cols must be an integer >= 1 (got ${cols})`);
  const rows = Math.max(1, Math.ceil(cells.length / cols)), W = cols * cellPx, H = rows * cellPx;
  const color = new Uint8Array(W * H * 4), rough = new Uint8Array(W * H * 4), bump = new Uint8Array(W * H * 4);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t, ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const un = rgb(ATLAS_UNUSED.color), unR = Math.round(255 * ATLAS_UNUSED.rough), unB = Math.round(255 * ATLAS_UNUSED.bump);
  for (let i = 0; i < W * H; i++) {                       // fill everything first, cells overwrite their own slot
    color[i * 4] = un[0]; color[i * 4 + 1] = un[1]; color[i * 4 + 2] = un[2];
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = unR; bump[i * 4] = bump[i * 4 + 1] = bump[i * 4 + 2] = unB;
    color[i * 4 + 3] = rough[i * 4 + 3] = bump[i * 4 + 3] = 255;
  }
  const base = Math.floor(rng() * 4294967296) >>> 0;       // the only draw from the caller's stream
  cells.forEach((cell, ci) => {
    const r = mulberry((base + Math.imul(ci + 1, 0x9e3779b1)) >>> 0);   // this cell's private stream
    const cx0 = (ci % cols) * cellPx, cy0 = Math.floor(ci / cols) * cellPx;
    const tone = cell.tone ?? 0.12, dens = cell.density ?? 8, r0 = cell.rough ?? 0.85, r1 = cell.roughAccent ?? r0, bmp = cell.bump ?? 0.5;
    const b = rgb(cell.base), ac = cell.accent !== undefined ? rgb(cell.accent) : b.map((v) => Math.round(v * 0.55));
    const colRand = Array.from({ length: cellPx }, () => r());
    const spots = cell.kind === 'spots' ? Array.from({ length: Math.max(0, Math.round(dens)) }, () => [r(), r(), 0.05 + 0.08 * r()]) : [];
    for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
      const fx = (x + 0.5) / cellPx, fy = (y + 0.5) / cellPx, nz = r();
      let m = 0, h = 0.5;
      switch (cell.kind) {
        case 'noise': m = nz; h = nz; break;
        case 'grain': m = 0.5 + 0.5 * Math.sin((fx * dens + colRand[x] * 1.5 + nz * 0.3) * Math.PI * 2); h = m; break;
        case 'fur': m = ((fy * dens * 0.5 + colRand[x]) % 1) < 0.35 ? 1 : 0; h = m; break;
        case 'spots': m = Math.max(0, ...spots.map(([sx, sy, sr]) => 1 - ss(sr * 0.7, sr, Math.hypot(fx - sx, fy - sy)))); h = m; break;
        case 'gills': m = (0.5 + 0.5 * Math.cos(Math.atan2(fy - 0.5, fx - 0.5) * dens)) * ss(0.05, 0.3, Math.hypot(fx - 0.5, fy - 0.5)); h = m; break;
        case 'scales': { const gy = fy * dens, row = Math.floor(gy), gx = fx * dens + (row % 2) * 0.5; m = ss(0.3, 0.5, Math.hypot((gx % 1) - 0.5, (gy % 1) - 0.5)); h = 1 - m; break; }
        default: break;
      }
      const k = 1 - tone * nz;
      const flipO = ((H - 1 - (cy0 + y)) * W + (cx0 + x)) * 4;          // data row 0 is v = 0 (bottom); image top is v = 1
      for (let c = 0; c < 3; c++) color[flipO + c] = Math.round(lerp(b[c], ac[c], m) * k);
      const rv = Math.round(255 * lerp(r0, r1, m)), hv = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (h - 0.5) * 2 * bmp)));
      rough[flipO] = rough[flipO + 1] = rough[flipO + 2] = rv;            // roughnessMap reads G
      bump[flipO] = bump[flipO + 1] = bump[flipO + 2] = hv;
    }
  });
  return { W, H, color, rough, bump };
}
~~~

## src/detailThree.ts

~~~typescript source-excerpt
// src/detailThree.ts: THREE side of the detail helpers (AO baking, atlas DataTextures, material maps)
import * as THREE from 'three';
import { lowPolyMaterial, type Colorizer } from './lowpoly';
import { aoFactor, latheWithUV, tubeWithUV, paintAtlas, type AtlasCell, type AOOptions, type Rect, type Rng, type UVs } from './detail';
import type { Tris, V3 } from './tri';

/** Tris + uv from the pure kernels -> geometry. Use with PartBuilder({ uv: 'keep' }) so the uv survive bakeFlat and mergeFlat. */
export function trisUVToGeometry(tris: Tris, uv: UVs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
export const latheGeoWithUV = (profile: [number, number][], segments = 8, cell?: Rect) => { const r = latheWithUV(profile, segments, cell); return trisUVToGeometry(r.tris, r.uv); };
export const tubeGeoWithUV = (path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true, cell?: Rect) => { const r = tubeWithUV(path, radius, sides, caps, cell); return trisUVToGeometry(r.tris, r.uv); };

/* ───── Fake AO ───── */

/**
 * Wraps any Colorizer and darkens it per triangle (asset-space centroid + normal, as in paint()).
 * The factor is applied in linear space. Use this for rigged parts, where bone-local geometry no longer matches the zones.
 */
export function aoShade(base: Colorizer, o: AOOptions): Colorizer {
  const c = new THREE.Color();
  return (tri) => {
    c.set((typeof base === 'function' ? base(tri) : base) as THREE.ColorRepresentation);
    const f = aoFactor([tri.centroid.x, tri.centroid.y, tri.centroid.z], [tri.normal.x, tri.normal.y, tri.normal.z], o);
    return c.multiplyScalar(f);
  };
}

/** Post-pass on a merged, non-indexed geometry that already has `color`, in the same space as the zones (static assets). Apply ONCE, before building the mesh. */
export function applyAO(geo: THREE.BufferGeometry, o: AOOptions) {
  const pos = geo.attributes.position, col = geo.attributes.color as THREE.BufferAttribute;
  if (geo.index || !col) throw new Error('applyAO needs a non-indexed geometry with a color attribute (bakeFlat + paint first)');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    const f = aoFactor([(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3], [n.x, n.y, n.z], o);
    for (let k = 0; k < 3; k++) col.setXYZ(t + k, col.getX(t + k) * f, col.getY(t + k) * f, col.getZ(t + k) * f);
  }
  col.needsUpdate = true;
  return geo;
}

/* ───── Atlas textures (DOM-free, deterministic) ───── */

const dataTex = (data: Uint8Array, W: number, H: number, srgb: boolean) => {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;      // roughness / bump are data, never sRGB
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
};

/** Seeded atlas as DataTextures: no DOM, survives Node tests. Give it its own forked stream: rng.fork('atlas'). */
export function seededAtlas(rng: Rng, cells: AtlasCell[], cols: number, cellPx = 32) {
  const a = paintAtlas(rng, cells, cols, cellPx);
  return { map: dataTex(a.color, a.W, a.H, true), roughnessMap: dataTex(a.rough, a.W, a.H, false), bumpMap: dataTex(a.bump, a.W, a.H, false), cols, rows: Math.ceil(cells.length / cols) };
}

/** Standard material for an atlas: vertex color x map, roughness comes from the map (roughness 1 = map value is absolute). */
export function atlasMaterial(maps: { map?: THREE.Texture; roughnessMap?: THREE.Texture; bumpMap?: THREE.Texture; metalnessMap?: THREE.Texture }, o: { bumpScale?: number; roughness?: number; metalness?: number } = {}) {
  return lowPolyMaterial({ ...maps, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0, bumpScale: o.bumpScale ?? 1 });
}

/* ───── Browser-only (preview/app side). Never call these inside a generator: they need DOM or network. ───── */

/** .webp / .png atlas (+ optional grayscale maps). Pass the result into the generator as a parameter, the builder never loads files. */
export async function loadAtlasWebp(url: string, o: { rough?: string; bump?: string } = {}) {
  const L = new THREE.TextureLoader();
  const map = await L.loadAsync(url); map.colorSpace = THREE.SRGBColorSpace;
  const data = async (u?: string) => { if (!u) return undefined; const t = await L.loadAsync(u); t.colorSpace = THREE.NoColorSpace; return t; };
  return { map, roughnessMap: await data(o.rough), bumpMap: await data(o.bump) };
}

/** Grayscale roughness/bump map derived from a color texture (luminance, optional contrast/invert). Browser canvas. */
export function grayMapFromTexture(tex: THREE.Texture, o: { contrast?: number; invert?: boolean } = {}) {
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height), k = o.contrast ?? 1;
  for (let i = 0; i < d.data.length; i += 4) {
    let v = (0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2]) / 255;
    v = Math.min(1, Math.max(0, 0.5 + (v - 0.5) * k)); if (o.invert) v = 1 - v;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.round(v * 255);
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

/** Draw an atlas in the browser: draw(ctx, cell, x, y, size) once per cell. Preview side only; the exporter cannot rebuild it. */
export function canvasAtlas(cols: number, rows: number, cellPx: number, draw: (ctx: CanvasRenderingContext2D, cell: number, x: number, y: number, size: number) => void) {
  const cv = document.createElement('canvas'); cv.width = cols * cellPx; cv.height = rows * cellPx;
  const ctx = cv.getContext('2d')!;
  for (let i = 0; i < cols * rows; i++) draw(ctx, i, (i % cols) * cellPx, Math.floor(i / cols) * cellPx, cellPx);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
~~~

## src/dragonKernel.ts

~~~typescript source-excerpt
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
~~~

## src/fingerprint.ts

~~~typescript source-excerpt
import * as THREE from 'three';
export function assetFingerprint(root: THREE.Object3D) {
  let tris = 0, h = 0;
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
    for (let i = 0; i < p.count; i++)
      h = (h + Math.round(p.getX(i) * 1e3) * 31 + Math.round(p.getY(i) * 1e3) * 17 + Math.round(p.getZ(i) * 1e3) * 13) | 0;
  });
  return { tris, h };
}
~~~

## src/geometry.ts

~~~typescript source-excerpt
import * as THREE from 'three';
export function trianglesToGeometry(flatXYZ: number[]) {          // 9 numbers per triangle
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flatXYZ), 3));
  return g;
}
export function signedVolume(geo: THREE.BufferGeometry) {         // closed meshes only
  const pos = geo.attributes.position, idx = geo.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const tris = (idx ? idx.count : pos.count) / 3;
  let vol = 0;
  for (let t = 0; t < tris; t++) {
    const i = (k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    a.fromBufferAttribute(pos, i(0)); b.fromBufferAttribute(pos, i(1)); c.fromBufferAttribute(pos, i(2));
    vol += a.dot(n.crossVectors(b, c)) / 6;
  }
  return vol;                                                      // > 0 outward CCW
}
~~~

## src/jitter.ts

~~~typescript source-excerpt
import * as THREE from 'three';
export function applyVertexJitter(geo: THREE.BufferGeometry, amount: number, rng: () => number, pinBottom = false) {
  if (amount <= 0) return geo;
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const minY = geo.boundingBox!.min.y;
  const eps = (geo.boundingBox!.max.y - minY) * 0.02 + 1e-6;
  const seen = new Map<string, number[]>(), Q = 1e4;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (pinBottom && y - minY < eps) continue;            // keep the base flat on the ground
    const key = `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
    let d = seen.get(key);
    if (!d) { d = [(rng() - 0.5) * amount, (rng() - 0.5) * amount, (rng() - 0.5) * amount]; seen.set(key, d); }
    pos.setXYZ(i, x + d[0], y + d[1], z + d[2]);
  }
  pos.needsUpdate = true;
  geo.computeBoundingBox(); geo.computeBoundingSphere();  // stale bounds cause frustum-culling pop-out
  return geo;                                             // normals are rebuilt by bakeFlat()
}
~~~

## src/lifecycle.ts

~~~typescript source-excerpt
import * as THREE from 'three';
export function groundAsset(content: THREE.Object3D, center = true) {
  const box = new THREE.Box3().setFromObject(content, true);
  const c = box.getCenter(new THREE.Vector3());
  content.position.add(new THREE.Vector3(center ? -c.x : 0, -box.min.y, center ? -c.z : 0));
  const root = new THREE.Group();
  root.add(content);
  return root;
}

export function disposeAsset(root: THREE.Object3D) {
  const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    geos.add(o.geometry);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => mats.add(m));
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m: any) => { for (const k of ['map', 'roughnessMap', 'bumpMap', 'metalnessMap', 'normalMap', 'aoMap', 'emissiveMap']) m[k]?.dispose(); m.dispose(); });   // textures (§6.7) are not freed by material.dispose()
  root.removeFromParent();
}
~~~

## src/lod.ts

~~~typescript source-excerpt
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

/** Scale factors { rx, rz } so a lower-sided polygon ring keeps the same X/Z bounding box as refSides (prevents L3 bounds shrink when dropping 8 -> 6 -> 4 sides). */
export function lodRadiusScale(sides: number, refSides = 8, angleOffset = Math.PI / sides, refOffset = Math.PI / refSides): { rx: number; rz: number } {
  const ext = (n: number, off: number) => {
    let mx = 0, mz = 0;
    for (let j = 0; j < n; j++) {
      const th = (j / n) * Math.PI * 2 + off;
      mx = Math.max(mx, Math.abs(Math.sin(th)));
      mz = Math.max(mz, Math.abs(Math.cos(th)));
    }
    return { mx: mx || 1, mz: mz || 1 };
  };
  const r = ext(refSides, refOffset), c = ext(sides, angleOffset);
  return { rx: r.mx / c.mx, rz: r.mz / c.mz };
}
~~~

## src/lowpoly.ts

~~~typescript source-excerpt
// src/lowpoly.ts
import * as THREE from 'three';
import { trianglesToGeometry } from './geometry';

export const lowPolyMaterial = (o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, ...o });

/** Non-indexed + per-face normals. uv is dropped unless keepUV, so every part has the same attribute set (§6.7). */
export function bakeFlat(geo: THREE.BufferGeometry, keepUV = false) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!keepUV) g.deleteAttribute('uv');    // textured assets opt in through PartBuilder({ uv })
  g.computeVertexNormals();                // non-indexed => one normal per face
  return g;
}

/** Reverses winding of a non-indexed geometry: swaps vertices 1 and 2 of every triangle in every attribute. */
export function flipWinding(g: THREE.BufferGeometry) {
  for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
    const s = attr.itemSize, a = attr.array as Float32Array;
    for (let t = 0; t < attr.count; t += 3)
      for (let k = 0; k < s; k++) {
        const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k, tmp = a[i1];
        a[i1] = a[i2]; a[i2] = tmp;
      }
    attr.needsUpdate = true;
  }
  return g;
}

export type TriInfo = { normal: THREE.Vector3; centroid: THREE.Vector3; index: number };
/** A fixed color, or a function called once per triangle (flat color per face). */
export type Colorizer = THREE.ColorRepresentation | ((tri: TriInfo) => THREE.ColorRepresentation);

export function paint(geo: THREE.BufferGeometry, color: Colorizer) {
  const pos = geo.attributes.position, n = pos.count, arr = new Float32Array(n * 3);
  const fixed = typeof color === 'function' ? null : new THREE.Color(color);
  if (!fixed && geo.index) throw new Error('paint(fn) needs a non-indexed geometry (run bakeFlat first)');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3();
  const info: TriInfo = { normal: new THREE.Vector3(), centroid: new THREE.Vector3(), index: 0 };
  const col = new THREE.Color();
  for (let t = 0; t < n; t += 3) {
    if (fixed) col.copy(fixed);
    else {
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      info.centroid.copy(a).add(b).add(c).divideScalar(3);
      info.normal.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
      info.index = t / 3;
      col.set((color as (tri: TriInfo) => THREE.ColorRepresentation)(info));
    }
    for (let k = 0; k < 3; k++) { const i = (t + k) * 3; arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Concatenates non-indexed geometries that all carry position, normal and color (and uv, all or none). Core three only. */
export function mergeFlat(parts: THREE.BufferGeometry[]) {
  const names = ['position', 'normal', 'color', ...(parts[0]?.attributes.uv ? ['uv'] : [])] as const;
  let total = 0;
  for (const g of parts) {
    if (g.index) throw new Error('mergeFlat: indexed geometry (run bakeFlat first)');
    for (const n of names) if (!g.attributes[n]) throw new Error(`mergeFlat: missing "${n}" (run bakeFlat + paint; uv must be all or none)`);
    if (!names.includes('uv' as never) && g.attributes.uv) throw new Error('mergeFlat: uv on some parts only');
    total += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  for (const n of names) {
    const size = parts[0].attributes[n].itemSize, out = new Float32Array(total * size);
    let o = 0;
    for (const g of parts) { out.set(g.attributes[n].array as Float32Array, o); o += g.attributes[n].count * size; }
    merged.setAttribute(n, new THREE.BufferAttribute(out, size));
  }
  return merged;
}

/** Adds uv by projecting each triangle along its dominant normal axis (asset space, deterministic). Needs normals (bakeFlat first). */
export function boxProjectUV(g: THREE.BufferGeometry, scale = 1) {
  const pos = g.attributes.position, nor = g.attributes.normal, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const [u, v] = ax >= ay && ax >= az ? [pos.getZ(i), pos.getY(i)] : ay >= az ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export interface PartOptions { uv?: false | 'keep' | 'box'; uvScale?: number }   // default: no uv (flat vertex color)

export class PartBuilder {
  private parts: THREE.BufferGeometry[] = [];
  constructor(private opt: PartOptions = {}) {}
  /** geo is consumed; apply jitter BEFORE add(). Placement and mirroring go through `matrix`. */
  add(geo: THREE.BufferGeometry, color: Colorizer, matrix?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) {
      g.applyMatrix4(matrix);
      if (matrix.determinant() < 0) flipWinding(g);   // a mirror reverses winding; restore outward CCW (§6.1)
    }
    if (this.opt.uv === 'keep' && !g.attributes.uv) throw new Error('PartBuilder({ uv: "keep" }): this part has no uv. Give it uv (tubeWithUV, latheWithUV, BoxGeometry ...) or put it in a PartBuilder without uv.');
    const baked = bakeFlat(g, this.opt.uv === 'keep');
    if (this.opt.uv === 'box') boxProjectUV(baked, this.opt.uvScale ?? 1);   // asset-space projection: same on every part (§6.7)
    this.parts.push(paint(baked, color));
    return this;
  }
  /** Same as add(), for a flat triangle array from a pure kernel (§6.2). */
  addTris(tris: number[], color: Colorizer, matrix?: THREE.Matrix4) {
    return this.add(trianglesToGeometry(tris), color, matrix);
  }
  build(material: THREE.Material, o: { name?: string; castShadow?: boolean; receiveShadow?: boolean } = {}) {
    if (!this.parts.length) throw new Error('PartBuilder.build: no parts added');
    const merged = mergeFlat(this.parts);
    this.parts.forEach((g) => g.dispose());
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = o.name ?? 'part';
    mesh.castShadow = o.castShadow ?? true;
    mesh.receiveShadow = o.receiveShadow ?? false;
    return mesh;
  }
}
~~~

## src/organic.ts

~~~typescript source-excerpt
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

/** Closed tube along a polyline. Frames are parallel-transported, so the tube never twists. Pass `upHint` to control initial frame alignment on steep/vertical fins. */
export function tubeTris(path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true,
  shape?: (angle: number, t: number) => number, upHint?: V3): Tris {   // shape: radius multiplier by angle (rad) and t in 0..1 along the path
  const n = path.length, out: Tris = [];
  const r = (i: number) => (typeof radius === 'function' ? radius(i / (n - 1)) : radius[i]);
  const T = path.map((_, i) => norm(sub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)])));
  const hint = upHint && Math.abs(dot(norm(upHint), T[0])) < 0.98 ? norm(upHint) : (Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] as V3 : [1, 0, 0] as V3);
  let u = norm(cross(hint, T[0]));   // any normal to the first tangent
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
~~~

## src/overlay.ts

~~~typescript source-excerpt
/** pts: [x, z] pairs with positive signed area (counter-clockwise in x/z). Miter join. */
export function insetPolygon(pts: number[][], d: number) {
  const n = pts.length, out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1]], e2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(e1[0], e1[1]), l2 = Math.hypot(e2[0], e2[1]);
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];     // inward normals
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    out.push([p1[0] + (n1[0] + n2[0]) * k, p1[1] + (n1[1] + n2[1]) * k]);
  }
  return out;                          // keep d under half the narrowest feature on concave outlines
}
~~~

## src/params.ts

~~~typescript source-excerpt
// src/params.ts
import type { ParamDef } from './types';

export function resolveParams(schema: { parameters: ParamDef[] }, input: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const def of schema.parameters) {
    let v: any = input[def.id] ?? def.default;
    if (def.type === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) v = def.default;
      if (def.min != null) v = Math.max(def.min, v);
      if (def.max != null) v = Math.min(def.max, v);
      if (def.step) v = Math.round((v - (def.min ?? 0)) / def.step) * def.step + (def.min ?? 0);
      v = Number(v.toFixed(6));
    } else if (def.type === 'boolean') v = Boolean(v);
    else if (def.type === 'select') { if (!def.options!.includes(v)) v = def.default; }
    else if (def.type === 'color') { if (!/^#[0-9a-f]{6}$/i.test(String(v))) v = def.default; }
    out[def.id] = v;
  }
  return out;
}
~~~

## src/prng.ts

~~~typescript source-excerpt
// src/prng.ts
export function hashString(str: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function createPRNG(seed = 1) {
  let s = seed >>> 0;                              // 0 is a valid seed and must differ from 1
  const next: any = () => {                       // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.seed = seed >>> 0;
  // fork(label) depends only on (seed, label), never on how much the parent has consumed
  next.fork = (label: string) =>
    createPRNG((hashString(String(label)) ^ Math.imul(next.seed, 0x9e3779b1)) >>> 0);
  return next as (() => number) & { seed: number; fork: (label: string) => any };
}

export type Rng = ReturnType<typeof createPRNG>;
~~~

## src/rig.ts

~~~typescript source-excerpt
// src/rig.ts
import * as THREE from 'three';
import { PartBuilder } from './lowpoly';
import type { V3, Tris } from './tri';

export interface BoneDef { name: string; pivot: V3; parent?: string }          // pivot in asset space; parents first

export const mirrorBone = (b: BoneDef, name: string, parent = b.parent): BoneDef =>
  ({ name, pivot: [-b.pivot[0], b.pivot[1], b.pivot[2]], parent });

export class RigBuilder {
  private builders = new Map<string, PartBuilder>();                            // insertion order: deterministic
  constructor(private bones: BoneDef[]) {
    const seen = new Set<string>();
    for (const b of bones) {
      if (seen.has(b.name)) throw new Error(`RigBuilder: duplicate bone "${b.name}"`);
      if (b.parent && !seen.has(b.parent)) throw new Error(`RigBuilder: parent "${b.parent}" must be listed before "${b.name}"`);
      seen.add(b.name);
    }
  }
  private pivot(bone: string): V3 {
    const b = this.bones.find((x) => x.name === bone);
    if (!b) throw new Error(`RigBuilder: unknown bone "${bone}"`);
    return b.pivot;
  }
  private part(bone: string, material: string) {
    const key = `${bone}|${material}`;
    if (!this.builders.has(key)) this.builders.set(key, new PartBuilder());
    return this.builders.get(key)!;
  }
  private local(bone: string, matrix?: THREE.Matrix4) {
    const [x, y, z] = this.pivot(bone);
    const m = new THREE.Matrix4().makeTranslation(-x, -y, -z);                  // shift last, so a mirror matrix applies first
    return matrix ? m.multiply(matrix) : m;
  }
  add(bone: string, material: string, geo: THREE.BufferGeometry, color: Parameters<PartBuilder['add']>[1], matrix?: THREE.Matrix4) {
    this.part(bone, material).add(geo, color, this.local(bone, matrix));
    return this;
  }
  addTris(bone: string, material: string, tris: Tris, color: Parameters<PartBuilder['add']>[1], matrix?: THREE.Matrix4) {
    this.part(bone, material).addTris(tris, color, this.local(bone, matrix));
    return this;
  }
  build(materials: Record<string, THREE.Material>) {
    const root = new THREE.Group(); root.name = 'rig';
    const nodes: Record<string, THREE.Group> = {}, at = (n: string) => this.pivot(n);
    for (const b of this.bones) {
      const g = new THREE.Group(); g.name = b.name;
      const p = b.parent ? at(b.parent) : [0, 0, 0];
      g.position.set(b.pivot[0] - p[0], b.pivot[1] - p[1], b.pivot[2] - p[2]);
      (b.parent ? nodes[b.parent] : root).add(g);
      nodes[b.name] = g;
    }
    for (const [key, pb] of this.builders) {
      const [bone, mat] = key.split('|');
      if (!materials[mat]) throw new Error(`RigBuilder: no material "${mat}"`);
      nodes[bone].add(pb.build(materials[mat], { name: `${bone}_${mat}` }));   // mesh names differ from bone names
    }
    root.userData.bones = nodes;
    return root;
  }
}

export type Euler3 = [number, number, number];
/** Keyframes are rotations relative to the rest pose. Make the last key equal the first for a loop. */
export function makeClip(name: string, duration: number, tracks: Record<string, { times: number[]; euler: Euler3[] }>) {
  const q = new THREE.Quaternion(), e = new THREE.Euler(), out: THREE.KeyframeTrack[] = [];
  for (const bone of Object.keys(tracks).sort()) {                               // sorted: fixed order
    const { times, euler } = tracks[bone], vals: number[] = [];
    for (const [x, y, z] of euler) { q.setFromEuler(e.set(x, y, z)); vals.push(q.x, q.y, q.z, q.w); }
    out.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
  }
  return new THREE.AnimationClip(name, duration, out);
}
~~~

## src/skinnedRig.ts

~~~typescript source-excerpt
import * as THREE from 'three';
import type { Meta } from '../scripts/budget';
import type { RigMeta } from '../scripts/rigcheck';
import type { Tris, V3 } from './tri';

type Triplet = Readonly<V3>;
type Bones = Readonly<Record<string, THREE.Bone>>;

export interface SkinBoneSpec {
  name: string;
  parent?: string;
  worldPos: Triplet;
}

// Generated bones start with identity rotation and scale. Keep their authored
// local positions out of userData so they do not become GLB metadata.
const restPosition = Symbol('authoredRestPosition');
type AuthoredBone = THREE.Bone & { [restPosition]?: THREE.Vector3 };
const authoredPosition = (bone: THREE.Bone) => (bone as AuthoredBone)[restPosition];
const defaultFps = 30;

function readTriplet(value: Triplet, label: string): Triplet {
  const [x, y, z] = value;
  if (value.length !== 3 || ![x, y, z].every(Number.isFinite)) throw new Error(`${label} needs three finite values`);
  return [x, y, z];
}

function checkBoneName(name: string) {
  if (!name || THREE.PropertyBinding.sanitizeNodeName(name) !== name) {
    throw new Error(`Bone name "${name}" is not a valid animation target`);
  }
}

/** Build a single tree with identity rest rotations from parents-first, asset-space joints. */
export function buildBoneHierarchy(specs: readonly SkinBoneSpec[]) {
  const bones: Record<string, THREE.Bone> = Object.create(null);
  const worldPositions = new Map<string, THREE.Vector3>();
  const boneOrder: string[] = [];
  let rootBone: THREE.Bone | undefined;

  for (const { name, parent, worldPos } of specs) {
    checkBoneName(name);
    if (bones[name]) throw new Error(`Duplicate bone "${name}"`);
    if (parent !== undefined && !bones[parent]) throw new Error(`Parent "${parent}" must be listed before "${name}"`);
    if (parent === undefined && rootBone) throw new Error('Expected a single root bone');

    const bone: AuthoredBone = new THREE.Bone();
    const world = new THREE.Vector3(...readTriplet(worldPos, `${name}.worldPos`));
    bone.name = name;
    bone.position.copy(world);
    if (parent === undefined) rootBone = bone;
    else {
      bone.position.sub(worldPositions.get(parent)!);
      bones[parent].add(bone);
    }
    bone[restPosition] = bone.position.clone();
    bones[name] = bone;
    boneOrder.push(name);
    worldPositions.set(name, world);
  }

  if (!rootBone) throw new Error('Expected a root bone');
  rootBone.updateMatrixWorld(true);
  return { rootBone, bones, boneOrder };
}

export interface CurveSkinSamples {
  /** One curve parameter per position attribute entry, stored when that vertex is authored. */
  vertexT: ArrayLike<number>;
  /** One strictly increasing curve parameter per chainBoneNames entry. */
  boneT: ArrayLike<number>;
}

function checkCurveT(t: number, label: string) {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error(`${label} must be in [0, 1]`);
}

/** Set normalized weights for the two neighboring bones along the authored curve. */
export function attachCurveSkinWeights(
  geo: THREE.BufferGeometry,
  boneOrder: readonly string[],
  chainBoneNames: readonly string[],
  { vertexT, boneT }: CurveSkinSamples,
) {
  const position = geo.getAttribute('position');
  if (!position || vertexT.length !== position.count) throw new Error('vertexT must match the position vertex count');
  if (!chainBoneNames.length || chainBoneNames.length !== boneT.length) throw new Error('boneT must match a nonempty chain');
  const boneIndices = new Map(boneOrder.map((name, index) => [name, index]));
  if (boneIndices.size !== boneOrder.length || boneOrder.length > 65_536) throw new Error('boneOrder must contain unique names and fit Uint16 indices');
  if (new Set(chainBoneNames).size !== chainBoneNames.length) throw new Error('Chain bone names must be unique');

  const chain = chainBoneNames.map((name, index) => {
    const boneIndex = boneIndices.get(name);
    if (boneIndex === undefined) throw new Error(`Chain bone "${name}" is missing from boneOrder`);
    const t = boneT[index];
    checkCurveT(t, `boneT[${index}]`);
    if (index > 0 && t <= boneT[index - 1]) throw new Error('boneT must be strictly increasing');
    return boneIndex;
  });

  const indices = new Uint16Array(position.count * 4);
  const weights = new Float32Array(position.count * 4);
  const last = chain.length - 1;
  for (let vertex = 0; vertex < position.count; vertex++) {
    const t = vertexT[vertex];
    checkCurveT(t, `vertexT[${vertex}]`);
    const offset = vertex * 4;
    if (t <= boneT[0] || t >= boneT[last]) {
      indices[offset] = chain[t <= boneT[0] ? 0 : last];
      weights[offset] = 1;
      continue;
    }

    let lower = 0, upper = last;
    while (upper - lower > 1) {
      const middle = Math.floor((lower + upper) / 2);
      if (t < boneT[middle]) upper = middle;
      else lower = middle;
    }
    const mix = (t - boneT[lower]) / (boneT[upper] - boneT[lower]);
    indices[offset] = chain[lower];
    indices[offset + 1] = chain[upper];
    weights[offset] = 1 - mix;
    weights[offset + 1] = mix;
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  return geo;
}

type PoseChannels = Readonly<Record<string, Triplet | undefined>>;
export interface SkinPose {
  rotations?: PoseChannels;
  scales?: PoseChannels;
  rootOffset?: Triplet;
}

export interface SkinClipOptions {
  fps?: number;
  eulerOrder?: THREE.EulerOrder;
}

function frameTimes(duration: number, fps: number): number[] {
  const frameCount = Math.ceil(duration * fps);
  const end = Math.fround(duration);
  if (!(end > 0 && Number.isFinite(end) && fps > 0) || !Number.isSafeInteger(frameCount) || frameCount >= 0xffffffff) {
    throw new Error('Clip duration and fps must give a positive, finite sampling interval');
  }

  const times = [0];
  let last = 0;
  for (let frame = 1; frame < frameCount; frame++) {
    const time = frame / fps;
    const key = Math.fround(time); // Three.js stores key times as Float32.
    if (key >= end) break;
    if (key <= last) throw new Error('Sampling interval is too small for Three.js timestamps');
    times.push(time);
    last = key;
  }
  times.push(duration);
  return times;
}

function copyPoseChannels(channels: PoseChannels | undefined, bones: Bones, label: string): PoseChannels {
  const values: Record<string, Triplet | undefined> = Object.create(null);
  for (const [name, value] of Object.entries(channels ?? {})) {
    if (!Object.hasOwn(bones, name)) throw new Error(`Unknown ${label} bone "${name}"`);
    if (value !== undefined) values[name] = readTriplet(value, `${name}.${label}`);
  }
  return values;
}

/** Bake local Euler deltas, local scales and a rest-relative root offset into a looping clip. */
export function bakeClip30fps(
  name: string,
  duration: number,
  bones: Bones,
  evalPose: (u: number) => SkinPose,
  { fps = defaultFps, eulerOrder = 'YXZ' }: SkinClipOptions = {},
) {
  if (!name.trim()) throw new Error('Expected a clip name');
  const times = frameTimes(duration, fps);
  if (!['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'].includes(eulerOrder)) throw new Error(`Invalid Euler order "${eulerOrder}"`);
  for (const [boneName, bone] of Object.entries(bones)) {
    checkBoneName(boneName);
    if (bone.name !== boneName) throw new Error(`Bone key "${boneName}" must match the bone's name`);
  }

  const poses = times.slice(0, -1).map((time) => {
    const pose = evalPose(time / duration);
    return {
      rootOffset: pose.rootOffset && readTriplet(pose.rootOffset, 'rootOffset'),
      rotations: copyPoseChannels(pose.rotations, bones, 'rotation'),
      scales: copyPoseChannels(pose.scales, bones, 'scale'),
    };
  });
  poses.push(poses[0]);

  const tracks: THREE.KeyframeTrack[] = [];
  if (poses.some((pose) => pose.rootOffset)) {
    const pivots = new Set<THREE.Object3D>(Object.values(bones));
    const roots = [...pivots].filter((bone) => !bone.parent || !pivots.has(bone.parent)) as THREE.Bone[];
    if (roots.length !== 1) throw new Error('rootOffset needs a single root bone');
    const root = roots[0];
    const rest = authoredPosition(root) ?? root.position;
    const values = poses.flatMap(({ rootOffset: offset = [0, 0, 0] }) => [rest.x + offset[0], rest.y + offset[1], rest.z + offset[2]]);
    tracks.push(new THREE.VectorKeyframeTrack(`${root.name}.position`, times, values));
  }

  const euler = new THREE.Euler(0, 0, 0, eulerOrder);
  const delta = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
  const previous = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  for (const [boneName, bone] of Object.entries(bones)) {
    const authored = authoredPosition(bone) !== undefined;
    if (poses.some((pose) => pose.rotations[boneName] !== undefined)) {
      const rest = authored ? identity : bone.quaternion;
      const values: number[] = [];
      for (const { rotations } of poses) {
        quaternion.copy(rest);
        const rotation = rotations[boneName];
        if (rotation) quaternion.multiply(delta.setFromEuler(euler.set(...rotation)));
        if (values.length && previous.dot(quaternion) < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
        values.push(...quaternion.toArray());
        previous.copy(quaternion);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
    }
    if (poses.some((pose) => pose.scales[boneName] !== undefined)) {
      const rest = authored ? [1, 1, 1] : bone.scale.toArray();
      const values = poses.flatMap((pose) => pose.scales[boneName] ?? rest);
      tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.scale`, times, values));
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

export interface BuiltSkinRig {
  root: THREE.Object3D;
  bones: Bones;
  animations?: readonly THREE.AnimationClip[];
  motionMode?: NonNullable<RigMeta['qa']>['motionMode'];
}

/** Copy only the scene properties needed to evaluate geometry. Geometry and materials are read-only. */
function copyQaScene(root: THREE.Object3D) {
  const nodes = new Map<THREE.Object3D, THREE.Object3D>();
  function copyNode(source: THREE.Object3D): THREE.Object3D {
    const mesh = source as THREE.Mesh;
    const bone = source as THREE.Bone;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.BatchedMesh).isBatchedMesh) {
      throw new Error(`QA needs a triangle Mesh or SkinnedMesh, found ${mesh.type} "${mesh.name}"`);
    }

    let node: THREE.Object3D;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) node = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
    else if (mesh.isMesh) node = new THREE.Mesh(mesh.geometry, mesh.material);
    else if (bone.isBone) node = new THREE.Bone();
    else node = new THREE.Object3D();
    if (mesh.morphTargetInfluences) (node as THREE.Mesh).morphTargetInfluences = mesh.morphTargetInfluences.slice();
    node.name = source.name;
    node.visible = source.visible;
    const authored = authoredPosition(bone);
    node.position.copy(authored ?? source.position);
    if (!authored) {
      node.quaternion.copy(source.quaternion);
      node.scale.copy(source.scale);
      node.matrix.copy(source.matrix);
      node.matrixWorld.copy(source.matrixWorld);
      node.matrixAutoUpdate = source.matrixAutoUpdate;
      node.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
    }
    nodes.set(source, node);
    for (const child of source.children) node.add(copyNode(child));
    return node;
  }

  const copy = copyNode(root);
  for (const [source, node] of nodes) {
    const skin = source as THREE.SkinnedMesh;
    if (!skin.isSkinnedMesh) continue;
    if (!skin.skeleton || !skin.geometry.hasAttribute('skinIndex') || !skin.geometry.hasAttribute('skinWeight')) {
      throw new Error(`SkinnedMesh "${skin.name}" must have a bound skeleton and skin attributes`);
    }
    const bones = skin.skeleton.bones.map((sourceBone) => {
      const bone = nodes.get(sourceBone) as THREE.Bone | undefined;
      if (!bone?.isBone) throw new Error(`All bones for "${skin.name}" must be inside the asset root`);
      return bone;
    });
    const clone = node as THREE.SkinnedMesh;
    clone.bindMode = skin.bindMode;
    clone.bind(new THREE.Skeleton(bones, skin.skeleton.boneInverses), skin.bindMatrix);
  }
  return { root: copy, nodes };
}

interface MeshPart {
  name: string;
  mesh: THREE.Mesh;
  material: THREE.Material;
  bone?: string;
  start: number;
  end: number;
}

function collectMeshParts(root: THREE.Object3D, bones: Map<THREE.Object3D, string>): MeshPart[] {
  const parts: MeshPart[] = [];
  const names = new Set(['__proto__']);
  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.hasAttribute('position')) return;
    const { geometry, material } = mesh;
    const count = geometry.index?.count ?? geometry.getAttribute('position').count;
    const range = geometry.drawRange;
    const groups = Array.isArray(material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
    let parent = mesh.parent;
    while (parent && !bones.has(parent)) parent = parent.parent;
    for (const group of groups) {
      const partMaterial = Array.isArray(material) ? material[group.materialIndex ?? 0] : material;
      if (!partMaterial?.visible) continue;
      const start = Math.max(group.start, range.start);
      const stop = Math.min(count, group.start + group.count, range.start + range.count);
      const end = start + Math.floor((stop - start) / 3) * 3;
      if (end <= start) continue;
      const base = mesh.name || `mesh_${parts.length + 1}`;
      let name = base;
      for (let suffix = 2; names.has(name); suffix++) name = `${base}_${suffix}`;
      names.add(name);
      parts.push({ name, mesh, material: partMaterial, bone: parent ? bones.get(parent) : undefined, start, end });
    }
  });
  return parts;
}

function meshMetadata(parts: readonly MeshPart[], pivotNames: string[]): Meta {
  const materials = new Map<THREE.Material, string>();
  const textures = new Map<THREE.Texture, NonNullable<Meta['textures']>[number]>();
  const described = parts.map(({ name, material, bone }) => {
    if (!materials.has(material)) {
      materials.set(material, `${materials.size + 1}:${material.name || material.type}`);
      for (const property of Object.values(material)) {
        const texture = property as THREE.Texture | undefined;
        if (!texture?.isTexture || textures.has(texture)) continue;
        const image = texture.image;
        const width = image?.videoWidth || image?.naturalWidth || image?.width;
        const height = image?.videoHeight || image?.naturalHeight || image?.height;
        if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) continue;
        textures.set(texture, {
          name: texture.name || `texture_${textures.size + 1}`, width, height,
          mips: texture.generateMipmaps || (texture.mipmaps?.length ?? 0) > 1,
        });
      }
    }
    return [name, { material: materials.get(material)!, ...(bone === undefined ? {} : { bone }) }] as const;
  });
  return { parts: Object.fromEntries(described), bones: pivotNames.length, textures: [...textures.values()] };
}

function visitVertices({ mesh, start, end }: MeshPart, visitor: (vertex: THREE.Vector3) => void) {
  const vertex = new THREE.Vector3();
  const index = mesh.geometry.index;
  for (let i = start; i < end; i++) {
    mesh.getVertexPosition(index ? index.getX(i) : i, vertex).applyMatrix4(mesh.matrixWorld);
    visitor(vertex);
  }
}

function samplingTimes(clip: THREE.AnimationClip) {
  const times = new Set(frameTimes(clip.duration, defaultFps).slice(0, -1).map(Math.fround));
  times.add(clip.duration);
  for (const track of clip.tracks) {
    for (const time of track.times) if (time > 0 && time < clip.duration) times.add(time);
  }
  return [...times].sort((a, b) => a - b);
}

function hasClosedTrack(track: THREE.KeyframeTrack) {
  const width = track.getValueSize();
  const first = track.values.slice(0, width);
  const last = track.values.slice(-width);
  return first.every((value, i) => value === last[i])
    || (track.ValueTypeName === 'quaternion' && first.every((value, i) => -value === last[i]));
}

/** Produce JSON-ready QA/stats/rig-check inputs. Sample the detached asset in export space. */
export function extractQaArtifacts(built: BuiltSkinRig): { tris: Record<string, Tris>; meshMeta: Meta; rigMetadata: RigMeta } {
  const { root, nodes } = copyQaScene(built.root);
  const bones = new Map<THREE.Object3D, string>();
  const byName = new Map<string, THREE.Object3D>();
  for (const [name, original] of Object.entries(built.bones)) {
    const bone = nodes.get(original) as THREE.Bone | undefined;
    if (!bone?.isBone || bone.name !== name) throw new Error(`Bone "${name}" must match a bone under the asset root`);
    bones.set(bone, name);
    byName.set(name, bone);
  }
  const pivotNames = [...byName.keys()];
  const hierarchy = [...bones].flatMap(([bone, child]) => {
    const parent = bone.parent && bones.get(bone.parent);
    return parent ? [{ parent, child }] : [];
  });
  const restLocalPositions = Object.fromEntries([...bones].map(([bone, name]) => [name, bone.position.toArray()]));
  const clips: readonly THREE.AnimationClip[] = built.animations ?? built.root.userData.animations ?? built.root.animations;
  const parts = collectMeshParts(root, bones);
  if (!parts.length) throw new Error('Asset has no visible triangle meshes');

  root.updateMatrixWorld(true);
  const tris = Object.fromEntries(parts.map((part) => {
    const vertices: Tris = [];
    visitVertices(part, (vertex) => vertices.push(vertex.x, vertex.y, vertex.z));
    return [part.name, vertices];
  }));
  const qa: NonNullable<RigMeta['qa']> = { motionMode: built.motionMode ?? 'in-place' };
  const mixer = new THREE.AnimationMixer(root);
  let clipMinY = Infinity;
  const measure = (vertex: THREE.Vector3) => { clipMinY = Math.min(clipMinY, vertex.y); };
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const { nodeName: target, objectName, propertyName, propertyIndex } = THREE.PropertyBinding.parseTrackName(track.name);
      if (!target || !byName.has(target) || THREE.PropertyBinding.findNode(root, target) !== byName.get(target)
        || objectName !== undefined || propertyIndex !== undefined || !['position', 'quaternion', 'scale'].includes(propertyName)) {
        throw new Error(`Track "${track.name}" must animate position, quaternion or scale on a unique rig bone by name`);
      }
    }
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (const time of samplingTimes(clip)) {
      mixer.setTime(time);
      root.updateMatrixWorld(true);
      for (const part of parts) visitVertices(part, measure);
    }
    action.stop();
  }
  if (clips.length) {
    if (!Number.isFinite(clipMinY)) throw new Error('Could not measure a finite clipMinY from the posed geometry');
    qa.clipMinY = clipMinY;
  }

  return {
    tris,
    meshMeta: meshMetadata(parts, pivotNames),
    rigMetadata: {
      rig: { rootNode: root.name || undefined, pivotNames, hierarchy, restLocalPositions },
      animations: clips.map((clip) => ({
        name: clip.name,
        durationSeconds: clip.duration,
        loop: clip.tracks.every(hasClosedTrack),
        tracks: clip.tracks.map((track) => ({ name: track.name, times: Array.from(track.times), values: Array.from(track.values) })),
      })),
      qa,
    },
  };
}
~~~

## src/texture.ts

~~~typescript source-excerpt
import * as THREE from 'three';
export function seededNoiseTexture(rng: () => number, size = 32, variation = 0.2) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const v = Math.round(255 * (1 - variation * rng())); data.set([v, v, v, 255], i * 4); }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;                       // bytes are sRGB; the shader converts
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;                         // crisp texels suit the low-poly look
  tex.needsUpdate = true;
  return tex;
}
// const tex = seededNoiseTexture(rng.fork('tex'));   own stream, like every other feature
~~~

## src/tri.ts

~~~typescript source-excerpt
// src/tri.ts: no THREE import
export type V3 = [number, number, number];
export type Tris = number[];                         // 9 numbers per triangle, CCW seen from outside

export function signedVolumeOf(t: Tris) {            // closed meshes only; > 0 means outward CCW
  let v = 0;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

export function mirrorTris(t: Tris, axis: 0 | 1 | 2 = 0): Tris {
  const out = new Array<number>(t.length);
  for (let i = 0; i < t.length; i += 9)
    for (let v = 0; v < 3; v++) {
      const src = i + v * 3, dst = i + (v === 0 ? 0 : 3 - v) * 3;      // swap vertices 1 and 2: winding stays outward
      for (let k = 0; k < 3; k++) out[dst + k] = t[src + k] * (k === axis ? -1 : 1);
    }
  return out;
}
~~~

## src/types.ts

~~~typescript source-excerpt
import type * as THREE from 'three';
// src/types.ts
export type ParamType = 'number' | 'boolean' | 'color' | 'select';
export interface ParamDef {
  id: string; label: string; type: ParamType;
  default: number | boolean | string;
  min?: number; max?: number; step?: number;   // number
  options?: string[];                          // select
  group?: string;                              // UI section
  visibleIf?: { id: string; equals: unknown }; // UI only, never affects geometry
}
export interface AssetGeneratorSchema {
  id: string; name: string; category: string; description: string;
  parameters: ParamDef[];
  presetConfigs?: Record<string, Record<string, unknown>>; // partial overrides, validated by resolveParams
  generate: (params: Record<string, unknown>) => THREE.Group;
  generateCode: (params: Record<string, unknown>) => string | Promise<string>;
}
~~~
