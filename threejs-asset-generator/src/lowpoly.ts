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
