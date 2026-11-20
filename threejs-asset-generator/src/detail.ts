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
