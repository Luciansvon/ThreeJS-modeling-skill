// scripts/review.ts: pure orthographic software renderer for the review image. No THREE, no DOM, no image library (qa-asset.ts writes the PNG).
// Sheet layout (2 x 2):   front (camera +Z)  |  side (camera +X, +Z faces LEFT)
//                         top (camera +Y, +Z faces DOWN)  |  3/4 view (from +X, +Y, +Z)
// Same view conventions as scripts/refcheck.ts. One scale for all four panels, so sizes can be compared.
// Colours: one muted colour per part, Lambert shaded. MAGENTA = a triangle that faces away from the camera but is still the nearest surface,
// i.e. an inside-out or missing face. A grey line marks Y = 0 in the front and side panels.
import type { Parts } from './qacheck';

export const PALETTE = ['#6f8fb5', '#c98b5c', '#7ea36f', '#b87fa8', '#c2b05a', '#6fb0aa', '#a3a3a3', '#b56f6f'];
export const WRONG_FACE: [number, number, number] = [255, 0, 255];
/** Magenta pixels per part that count as rasterisation noise (a 1 px speck appeared on a healthy crate where two closed parts intersect). More than this fails Q10. */
export const WRONG_TOL = 4;
const BG: [number, number, number] = [245, 245, 243], GROUND: [number, number, number] = [196, 196, 190], FRAME: [number, number, number] = [60, 60, 60];
type V = [number, number, number];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const unhex = (h: string): V => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** f = direction towards the camera, r = image right, u = image up. */
function viewBases(): { name: string; f: V; r: V; u: V }[] {
  const yaw = (35 * Math.PI) / 180, pitch = (25 * Math.PI) / 180;
  const f: V = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], r = unit(cross([0, 1, 0], f));
  return [
    { name: 'front', f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
    { name: 'side', f: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
    { name: 'top', f: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1] },
    { name: '3/4', f, r, u: cross(f, r) },
  ];
}

export type Sheet = { rgba: Uint8Array; width: number; height: number; legend: { part: string; color: string }[]; wrong: Record<string, number> };

export function renderSheet(parts: Parts, o: { open?: string[]; panel?: number } = {}): Sheet {
  const P = o.panel ?? 320, names = Object.keys(parts), openAll = (o.open ?? []).includes('all');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const n of names) for (let i = 0; i + 2 < parts[n].length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], parts[n][i + k]); max[k] = Math.max(max[k], parts[n][i + k]); }
  const c: V = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], R = Math.max(0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]), 1e-6), scale = (P * 0.46) / R, eps = 1e-5 * R;
  const W = P * 2, H = P * 2, rgba = new Uint8Array(W * H * 4), wrong: Record<string, number> = {}, base = names.map((_, i) => unhex(PALETTE[i % PALETTE.length]));
  const L = unit([-0.4, 0.7, 0.6]);                                                // light, in the camera frame (right, up, towards camera)

  viewBases().forEach((vw, vi) => {
    const color = new Uint8Array(P * P * 4), depth = new Float32Array(P * P).fill(-Infinity), owner = new Int16Array(P * P).fill(-1), light = unit([vw.r[0] * L[0] + vw.u[0] * L[1] + vw.f[0] * L[2], vw.r[1] * L[0] + vw.u[1] * L[1] + vw.f[1] * L[2], vw.r[2] * L[0] + vw.u[2] * L[1] + vw.f[2] * L[2]]);
    for (let i = 0; i < P * P; i++) color.set([...BG, 255], i * 4);
    if (vw.name === 'front' || vw.name === 'side') {                               // ground line: world point (0, 0, 0)
      const gy = Math.round(P / 2 - scale * dot([-c[0], -c[1], -c[2]], vw.u));
      if (gy >= 0 && gy < P) for (let x = 0; x < P; x++) color.set([...GROUND, 255], (gy * P + x) * 4);
    }
    const sx = new Float64Array(3), sy = new Float64Array(3), sz = new Float64Array(3);
    names.forEach((name, pi) => {
      const t = parts[name], twoSided = openAll || (o.open ?? []).includes(name);
      for (let q = 0; q + 8 < t.length; q += 9) {
        const p: V[] = [0, 1, 2].map((k) => [t[q + k * 3] - c[0], t[q + k * 3 + 1] - c[1], t[q + k * 3 + 2] - c[2]] as V);
        let n = cross([p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]);
        if (Math.hypot(n[0], n[1], n[2]) < 1e-12) continue;
        n = unit(n);
        const facing = dot(n, vw.f) >= 0, back = !facing;
        if (back && twoSided) n = [-n[0], -n[1], -n[2]];
        for (let k = 0; k < 3; k++) { sx[k] = P / 2 + scale * dot(p[k], vw.r); sy[k] = P / 2 - scale * dot(p[k], vw.u); sz[k] = dot(p[k], vw.f); }
        const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sy[1] - sy[0]) * (sx[2] - sx[0]); if (Math.abs(area) < 1e-9) continue;
        const wrongFace = back && !twoSided, lam = Math.abs(dot(n, light)), shade = 0.4 + 0.6 * lam, rgb: V = wrongFace ? WRONG_FACE : [base[pi][0] * shade, base[pi][1] * shade, base[pi][2] * shade];
        const x0 = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2]))), x1 = Math.min(P - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2])));
        const y0 = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2]))), y1 = Math.min(P - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const X = x + 0.5, Y = y + 0.5;
          const w0 = ((sx[1] - X) * (sy[2] - Y) - (sy[1] - Y) * (sx[2] - X)) / area, w1 = ((sx[2] - X) * (sy[0] - Y) - (sy[2] - Y) * (sx[0] - X)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2], at = y * P + x;
          if (wrongFace ? z <= depth[at] + eps : z < depth[at] - eps) continue;  // ties go to correctly facing triangles, so a grazing silhouette pixel is not painted magenta
          depth[at] = z; owner[at] = pi; color.set([rgb[0], rgb[1], rgb[2], 255], at * 4);
        }
      }
    });
    // Copy the panel into the sheet and count the magenta pixels that survived, per owning part (overdrawn magenta is not counted).
    const ox = (vi % 2) * P, oy = Math.floor(vi / 2) * P;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const at = y * P + x, s = at * 4, d = ((oy + y) * W + ox + x) * 4;
      rgba[d] = color[s]; rgba[d + 1] = color[s + 1]; rgba[d + 2] = color[s + 2]; rgba[d + 3] = 255;
      if (owner[at] >= 0 && color[s] === 255 && color[s + 1] === 0 && color[s + 2] === 255) wrong[names[owner[at]]] = (wrong[names[owner[at]]] ?? 0) + 1;
    }
  });
  for (let i = 0; i < W; i++) for (const y of [P - 1, P]) rgba.set([...FRAME, 255], (y * W + i) * 4);       // panel separators
  for (let i = 0; i < H; i++) for (const x of [P - 1, P]) rgba.set([...FRAME, 255], (i * W + x) * 4);
  return { rgba, width: W, height: H, legend: names.map((part, i) => ({ part, color: PALETTE[i % PALETTE.length] })), wrong };
}

