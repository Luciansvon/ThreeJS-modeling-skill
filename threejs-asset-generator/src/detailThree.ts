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
