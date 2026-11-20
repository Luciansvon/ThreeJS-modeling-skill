// scripts/refcheck.ts: pure reference-vs-result measurements. No THREE, no DOM, no image library. Node-testable.
// Views (creature/asset faces +Z, y up):  front = camera at +Z (u = x)  ·  side = camera at +X (u = -z, +Z faces LEFT)  ·  top = camera at +Y (u = x, v = -z, +Z faces DOWN)
export type View = 'front' | 'side' | 'top';
export type Mask = { w: number; h: number; data: Uint8Array };              // 1 = inside the shape
export type Tris = number[];                                                // 9 numbers per triangle
export const RES = 64;                                                      // masks are compared on a RES x RES grid

export const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const unhex = (h: string): [number, number, number] => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function boundsOf(t: Tris) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], t[i + k]); max[k] = Math.max(max[k], t[i + k]); }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}
/** Size ratios relative to height: { w: x/y, d: z/y }. Compare with the ratios you measured on the reference. */
export function proportions(t: Tris) { const s = boundsOf(t).size; return { w: s[0] / (s[1] || 1), d: s[2] / (s[1] || 1) }; }

/** Crops to the tight bounding box of the shape, scales it to fit res x res keeping its aspect, centres it. aspect = bbox width / height. */
export function frameMask(m: Mask, res = RES): { mask: Mask; aspect: number } {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out = new Uint8Array(res * res);
  if (x1 < 0) return { mask: { w: res, h: res, data: out }, aspect: 1 };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = res / Math.max(bw, bh), ow = Math.round(bw * s), oh = Math.round(bh * s), ox = Math.floor((res - ow) / 2), oy = Math.floor((res - oh) / 2);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) out[(oy + y) * res + ox + x] = m.data[(y0 + Math.min(bh - 1, Math.floor((y + 0.5) / s))) * m.w + x0 + Math.min(bw - 1, Math.floor((x + 0.5) / s))];
  return { mask: { w: res, h: res, data: out }, aspect: bw / bh };
}

/** Orthographic silhouette of a triangle array, already framed (see frameMask). */
export function silhouette(t: Tris, view: View, res = RES) {
  const n = t.length / 3, U = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = t[i * 3], y = t[i * 3 + 1], z = t[i * 3 + 2];
    if (view === 'front') { U[i] = x; V[i] = y; } else if (view === 'side') { U[i] = -z; V[i] = y; } else { U[i] = x; V[i] = -z; }
  }
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) { u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]); v0 = Math.min(v0, V[i]); v1 = Math.max(v1, V[i]); }
  const S = Math.max(256, res * 4), k = (S - 1) / (Math.max(u1 - u0, v1 - v0) || 1), data = new Uint8Array(S * S);
  const px = (i: number) => (U[i] - u0) * k, py = (i: number) => (v1 - V[i]) * k;          // image row 0 is the top
  for (let q = 0; q + 2 < n; q += 3) {
    const ax = px(q), ay = py(q), bx = px(q + 1), by = py(q + 1), cx = px(q + 2), cy = py(q + 2);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(area) < 1e-9) continue;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(S - 1, Math.ceil(Math.max(ay, by, cy))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx))); x++) {
        const X = x + 0.5, Y = y + 0.5, w0 = ((bx - X) * (cy - Y) - (by - Y) * (cx - X)) / area, w1 = ((cx - X) * (ay - Y) - (cy - Y) * (ax - X)) / area, w2 = 1 - w0 - w1;
        if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) data[y * S + x] = 1;
      }
  }
  return frameMask({ w: S, h: S, data }, res);
}

/** Foreground mask from RGBA bytes. Transparent image: alpha. Opaque image: pixels that differ from the corner background colour by more than tol (RGB distance). */
export function maskFromRGBA(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, o: { tol?: number; alphaCut?: number } = {}): Mask {
  const data = new Uint8Array(w * h), tol = o.tol ?? 40, border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);                      // background = per-channel median of the whole border,
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);               // so one stray corner pixel or a watermark cannot skew it
  const med = (k: number) => { const v = border.map((p) => rgba[p * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const transparent = med(3) < 250, bg = [med(0), med(1), med(2)];
  for (let i = 0; i < w * h; i++) data[i] = transparent ? (rgba[i * 4 + 3] >= (o.alphaCut ?? 128) ? 1 : 0) : dist([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], bg) > tol ? 1 : 0;
  return keepLargest({ w, h, data });
}
/** Drops specks: keeps only the biggest 8-connected blob (a shadow or watermark will not stretch the frame). */
export function keepLargest(m: Mask): Mask {
  const lab = new Int32Array(m.w * m.h), sizes: number[] = [0]; let id = 0;
  for (let s = 0; s < lab.length; s++) {
    if (!m.data[s] || lab[s]) continue;
    id++; let cnt = 0; const st = [s]; lab[s] = id;
    while (st.length) {
      const p = st.pop()!; cnt++; const x = p % m.w, y = (p - x) / m.w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue; const q = ny * m.w + nx; if (m.data[q] && !lab[q]) { lab[q] = id; st.push(q); } }
    }
    sizes[id] = cnt;
  }
  let best = 0; for (let i = 1; i <= id; i++) if (sizes[i] > (sizes[best] || 0)) best = i;
  return { w: m.w, h: m.h, data: Uint8Array.from(lab, (v) => (v && v === best ? 1 : 0)) };
}

export const flipH = (m: Mask): Mask => { const d = new Uint8Array(m.data.length); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) d[y * m.w + x] = m.data[y * m.w + (m.w - 1 - x)]; return { ...m, data: d }; };
export const flipV = (m: Mask): Mask => { const d = new Uint8Array(m.data.length); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) d[y * m.w + x] = m.data[(m.h - 1 - y) * m.w + x]; return { ...m, data: d }; };

export function maskIoU(a: Mask, b: Mask) {
  let i = 0, u = 0; for (let k = 0; k < a.data.length; k++) { const p = a.data[k], q = b.data[k]; if (p && q) i++; if (p || q) u++; }
  return u ? i / u : 1;
}
/** Best IoU over the allowed mirror images of the reference mask (the reference may face the other way). */
export function bestIoU(model: Mask, ref: Mask, view: View) {
  const tries: [string, Mask][] = [['none', ref], ['flipH', flipH(ref)], ...(view === 'top' ? [['flipV', flipV(ref)] as [string, Mask]] : [])];
  return tries.map(([flip, m]) => ({ flip, iou: maskIoU(model, m), ref: m })).sort((p, q) => q.iou - p.iou)[0];
}
/** RGBA picture: reference only = red, model only = blue, both = light grey, empty = white. Write it as PNG and look at it. */
export function diffRGBA(model: Mask, ref: Mask) {
  const out = new Uint8Array(model.w * model.h * 4);
  for (let i = 0; i < model.data.length; i++) { const m = model.data[i], r = ref.data[i], c = m && r ? [225, 225, 225] : r ? [235, 70, 70] : m ? [70, 120, 245] : [255, 255, 255]; out.set([c[0], c[1], c[2], 255], i * 4); }
  return out;
}

/** Most common colours (4 bits per channel buckets, merged by distance). Pass mask to ignore the background. Returns hex + share, biggest first. */
export function dominantColors(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, k = 6, mask?: Mask) {
  const b = new Map<number, { n: number; r: number; g: number; b: number }>(); let total = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask && !mask.data[i]) continue; if (rgba[i * 4 + 3] < 128) continue;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], bl = rgba[i * 4 + 2], key = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4), e = b.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += bl; b.set(key, e); total++;
  }
  const list = [...b.values()].sort((p, q) => q.n - p.n).map((e) => ({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n], n: e.n })), out: { rgb: number[]; n: number }[] = [];
  for (const c of list) { const near = out.find((o) => dist(o.rgb, c.rgb) < 40); if (near) near.n += c.n; else out.push({ ...c }); }
  return out.sort((p, q) => q.n - p.n).slice(0, k).map((c) => ({ hex: hex(c.rgb[0], c.rgb[1], c.rgb[2]), share: total ? c.n / total : 0 }));
}
/** For every reference colour above minShare: distance (0..441) to the nearest colour you use. Returns the worst one. */
export function paletteGap(refColors: { hex: string; share: number }[], used: string[], minShare = 0.05) {
  const u = used.map(unhex); let worst = { hex: '', gap: 0, nearest: '' };
  for (const c of refColors) { if (c.share < minShare) continue; const r = unhex(c.hex); let best = Infinity, who = ''; used.forEach((h, i) => { const d = dist(r, u[i]); if (d < best) { best = d; who = h; } }); if (best > worst.gap) worst = { hex: c.hex, gap: best, nearest: who }; }
  return worst;
}

export type RefData = { views: Partial<Record<View, { w: number; h: number; data: string; aspect: number }>>; palette: { hex: string; share: number }[]; proportions?: { w?: number; d?: number } };
export const maskToB64 = (m: Mask) => Buffer.from(m.data).toString('base64');
export const maskFromB64 = (s: string, res = RES): Mask => ({ w: res, h: res, data: new Uint8Array(Buffer.from(s, 'base64')) });

export type Gate = { gate: string; value: string; pass: boolean; hint: string };
export const THRESH = { iou: 0.85, aspect: 0.08, prop: 0.1, palette: 60 };
/** Runs every gate that the reference data can answer, cheapest first. */
export function compareToRef(tris: Tris, ref: RefData, usedColors: string[] = [], th = THRESH) {
  const gates: Gate[] = [], diffs: Partial<Record<View, Uint8Array>> = {};
  const p = proportions(tris);
  if (ref.proportions?.w) { const e = Math.abs(p.w / ref.proportions.w - 1); gates.push({ gate: 'G1 width/height', value: `${p.w.toFixed(2)} vs ${ref.proportions.w.toFixed(2)} (${(e * 100).toFixed(0)}% off)`, pass: e <= th.prop, hint: p.w > ref.proportions.w ? 'too wide: narrow x or lengthen y' : 'too narrow: widen x or shorten y' }); }
  if (ref.proportions?.d) { const e = Math.abs(p.d / ref.proportions.d - 1); gates.push({ gate: 'G1 depth/height', value: `${p.d.toFixed(2)} vs ${ref.proportions.d.toFixed(2)} (${(e * 100).toFixed(0)}% off)`, pass: e <= th.prop, hint: p.d > ref.proportions.d ? 'too deep: shorten z' : 'too shallow: lengthen z' }); }
  for (const view of ['front', 'side', 'top'] as View[]) {
    const r = ref.views[view]; if (!r) continue;
    const { mask, aspect } = silhouette(tris, view), refMask = maskFromB64(r.data), best = bestIoU(mask, refMask, view), ae = Math.abs(aspect / r.aspect - 1);
    gates.push({ gate: `G2 ${view} aspect`, value: `${aspect.toFixed(2)} vs ${r.aspect.toFixed(2)} (${(ae * 100).toFixed(0)}% off)`, pass: ae <= th.aspect, hint: 'fix overall proportions before details' });
    gates.push({ gate: `G2 ${view} silhouette IoU`, value: `${best.iou.toFixed(2)}${best.flip !== 'none' ? ` (reference mirrored: ${best.flip})` : ''}`, pass: best.iou >= th.iou, hint: 'open the diff PNG: red = missing in model, blue = extra in model' });
    diffs[view] = diffRGBA(mask, best.ref);
  }
  if (usedColors.length && ref.palette.length) { const g = paletteGap(ref.palette, usedColors); gates.push({ gate: 'G3 palette', value: g.hex ? `${g.hex} nearest ${g.nearest}, distance ${g.gap.toFixed(0)}` : 'all main colours covered', pass: g.gap <= th.palette, hint: `retune the colour nearest to ${g.hex}` }); }
  return { gates, diffs };
}
export const formatGates = (g: Gate[]) => g.map((x) => `${x.pass ? 'PASS' : 'FAIL'}  ${x.gate}: ${x.value}${x.pass ? '' : '  -> ' + x.hint}`).join('\n');
