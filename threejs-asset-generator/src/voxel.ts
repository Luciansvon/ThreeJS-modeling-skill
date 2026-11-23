// src/voxel.ts: deterministic, manifold-safe voxel grid builder with corner AO, sRGB shading, curve sculpting, and world-corner skinning.
import type * as THREE from 'three';

export interface VoxelGridOptions {
  voxelSize?: number;
  origin?: readonly [number, number, number];
  /** 'even': cell x spans [x*s, (x+1)*s], mirrored at -1-x. 'odd': cell x spans [(x-0.5)*s, (x+0.5)*s], mirrored at -x. */
  symAxis?: 'even' | 'odd';
}

export interface VoxelCell {
  x: number;
  y: number;
  z: number;
  color: string;
  material: string;
  group?: string;
}

export type VoxelColorInput = string | ((x: number, y: number, z: number) => string | null | undefined);
export type VoxelPoint = readonly [number, number, number];
export type VoxelSkinInfluence = { bone: string; weight: number };

export interface VoxelMaterialOptions {
  roughness?: number;
  metalness?: number;
  glowToneMapped?: boolean;
}

export interface VoxelGeometryOptions {
  by?: 'material' | 'group';
  vertexT?: (wx: number, wy: number, wz: number, cell: VoxelCell) => number;
  /** Pure world-corner curve sampler; adjacent voxels at a shared corner always receive identical t. */
  worldVertexT?: (wx: number, wy: number, wz: number) => number;
  greedy?: boolean;
  /** Baked voxel corner AO on matte buckets (default true; auto-disabled for glow/emissive & greedy). */
  ao?: boolean;
  /** Subtle directional face shading (defaults to `ao`). */
  dirShade?: boolean;
  /** Light multipliers for 0, 1, 2, 3 corner occluders (default [1.0, 0.89, 0.78, 0.66]). */
  aoLevels?: readonly [number, number, number, number];
  /** Linear RGB multiplier for glow/emissive buckets so selective Bloom lights up emissive parts (default 1). */
  glowBoost?: number;
}

type ThreeModule = typeof THREE;
type FaceSpec = {
  dir: readonly [number, number, number];
  normal: readonly [number, number, number];
  t1: 0 | 1 | 2;
  t2: 0 | 1 | 2;
  dirShade: number;
  corners: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
};

// Outward CCW unit-cube faces for [0..1]^3 in right-handed +Y up, +Z forward space.
const FACES: readonly FaceSpec[] = [
  { dir: [1, 0, 0], normal: [1, 0, 0], t1: 1, t2: 2, dirShade: 0.96, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], normal: [-1, 0, 0], t1: 1, t2: 2, dirShade: 0.94, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], normal: [0, 1, 0], t1: 0, t2: 2, dirShade: 1.00, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], normal: [0, -1, 0], t1: 0, t2: 2, dirShade: 0.85, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], normal: [0, 0, 1], t1: 0, t2: 1, dirShade: 0.98, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], normal: [0, 0, -1], t1: 0, t2: 1, dirShade: 0.92, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const DEFAULT_AO_LEVELS: readonly [number, number, number, number] = [1.0, 0.89, 0.78, 0.66];
const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
const sortCells = (a: VoxelCell, b: VoxelCell) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isGlowBucket = (materialName: string) => /glow|emissive/i.test(materialName);

/** Shifts a hex color safely in sRGB HSL so darkening deep tones never jumps to pastel/lavender. */
export function shadeHexSRGB(hex: string, lightnessDelta: number, satScale = 1): string {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex color "${hex}"`);
  if (!Number.isFinite(lightnessDelta) || !Number.isFinite(satScale) || satScale < 0) {
    throw new Error('shadeHexSRGB expects finite lightnessDelta and non-negative satScale');
  }
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  let nextL = l + lightnessDelta;
  if (lightnessDelta < 0) {
    nextL = l <= 0 ? 0 : nextL < 0.015 ? Math.max(0.004, l * Math.max(0.2, 1 + lightnessDelta)) : nextL;
    nextL = Math.min(l, nextL);
  } else if (lightnessDelta > 0) {
    nextL = Math.min(0.985, Math.max(l, nextL));
  }
  const nextS = clamp01(s * satScale);
  const q = nextL < 0.5 ? nextL * (1 + nextS) : nextL + nextS - nextL * nextS;
  const p = 2 * nextL - q;
  const hue2rgb = (t: number) => {
    const u = ((t % 1) + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  const nr = nextS === 0 ? nextL : hue2rgb(h + 1 / 3);
  const ng = nextS === 0 ? nextL : hue2rgb(h);
  const nb = nextS === 0 ? nextL : hue2rgb(h - 1 / 3);
  const toHex = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

/** Dual-material voxel preset: flat-shaded matte body + unlit bright emissive accents (2 draw calls total, all glow hues in vertex colors). */
export function createVoxelMaterials(
  three: ThreeModule,
  options: VoxelMaterialOptions = {},
): {
  body: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
} {
  return {
    body: new three.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: options.roughness ?? 0.84,
      metalness: options.metalness ?? 0.04,
    }),
    glow: new three.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: options.glowToneMapped ?? false,
    }),
  };
}

/** HDR emissive standard material tier for selective UnrealBloomPass accents (glTF-safe base + emissive). */
export function createHdrGlowMaterial(
  three: ThreeModule,
  hex: string,
  emissiveIntensity = 1.6,
): THREE.MeshStandardMaterial {
  return new three.MeshStandardMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity,
    roughness: 0.35,
    metalness: 0.0,
    toneMapped: false,
  });
}

/**
 * Binds normalized top-4 skin weights keyed strictly by quantized rest world corner `(wx, wy, wz)`,
 * guaranteeing adjacent faces never diverge or tear apart ("kropos") during extreme rotation.
 */
export function attachWorldSkinWeights(
  three: ThreeModule,
  geo: THREE.BufferGeometry,
  boneOrder: readonly string[],
  sampler: (wx: number, wy: number, wz: number) => readonly VoxelSkinInfluence[],
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  if (!pos) throw new Error('attachWorldSkinWeights requires a geometry with a position attribute');
  const boneIndex = new Map(boneOrder.map((name, idx) => [name, idx]));
  if (boneIndex.size !== boneOrder.length || boneOrder.length > 65_536) {
    throw new Error('boneOrder must contain unique bone names and fit Uint16 indices');
  }
  const indices = new Uint16Array(pos.count * 4);
  const weights = new Float32Array(pos.count * 4);
  const cache = new Map<string, readonly [number, number, number, number, number, number, number, number]>();

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i), wy = pos.getY(i), wz = pos.getZ(i);
    const key = `${Math.round(wx * 10_000)},${Math.round(wy * 10_000)},${Math.round(wz * 10_000)}`;
    let packed = cache.get(key);
    if (!packed) {
      const merged = new Map<number, number>();
      for (const inf of sampler(wx, wy, wz)) {
        if (!Number.isFinite(inf.weight) || inf.weight <= 0) continue;
        const bi = boneIndex.get(inf.bone);
        if (bi === undefined) throw new Error(`Unknown bone "${inf.bone}" in attachWorldSkinWeights`);
        merged.set(bi, (merged.get(bi) ?? 0) + inf.weight);
      }
      const top = [...merged.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] - b[0])).slice(0, 4);
      if (!top.length) throw new Error(`attachWorldSkinWeights returned no positive bone weights near (${wx}, ${wy}, ${wz})`);
      const sum = top.reduce((acc, [, w]) => acc + w, 0);
      const bIdx = [0, 0, 0, 0], bWt = [0, 0, 0, 0];
      for (let k = 0; k < top.length; k++) {
        bIdx[k] = top[k][0];
        bWt[k] = top[k][1] / sum;
      }
      packed = [bIdx[0], bIdx[1], bIdx[2], bIdx[3], bWt[0], bWt[1], bWt[2], bWt[3]];
      cache.set(key, packed);
    }
    const off = i * 4;
    indices[off] = packed[0]; indices[off + 1] = packed[1]; indices[off + 2] = packed[2]; indices[off + 3] = packed[3];
    weights[off] = packed[4]; weights[off + 1] = packed[5]; weights[off + 2] = packed[6]; weights[off + 3] = packed[7];
  }

  geo.setAttribute('skinIndex', new three.Uint16BufferAttribute(indices, 4));
  geo.setAttribute('skinWeight', new three.Float32BufferAttribute(weights, 4));
  return geo;
}

/** Deterministic sparse integer voxel grid guaranteeing 1 cell per coordinate and zero non-manifold interior cuts. */
export class VoxelGrid {
  readonly voxelSize: number;
  origin: readonly [number, number, number];
  readonly symAxis: 'even' | 'odd';
  private cells = new Map<string, VoxelCell>();

  constructor(options: VoxelGridOptions = {}) {
    const s = options.voxelSize ?? 0.05;
    if (!Number.isFinite(s) || s <= 0) throw new Error('voxelSize must be a positive finite number');
    this.voxelSize = s;
    this.origin = options.origin ?? [0, 0, 0];
    this.symAxis = options.symAxis ?? 'even';
  }

  get size() {
    return this.cells.size;
  }

  /** Shifts vertical origin so the lowest populated voxel face sits cleanly at groundY (default 0). */
  ground(groundY = 0): this {
    let minIy = Infinity;
    for (const c of this.cells.values()) if (c.y < minIy) minIy = c.y;
    if (Number.isFinite(minIy)) {
      this.origin = [this.origin[0], groundY - minIy * this.voxelSize, this.origin[2]];
    }
    return this;
  }

  private mirrorIndexX(ix: number): number {
    return this.symAxis === 'odd' ? -ix : -1 - ix;
  }

  private cellCenterX(ix: number): number {
    return this.symAxis === 'odd' ? ix : ix + 0.5;
  }

  private boundsForCell(ix: number, iy: number, iz: number) {
    return this.cornerWorld(ix, iy, iz);
  }

  private cornerWorld(gx: number, gy: number, gz: number) {
    const s = this.voxelSize;
    const [ox, oy, oz] = this.origin;
    const shift = this.symAxis === 'odd' ? 0.5 : 0;
    return [ox + (gx - shift) * s, oy + gy * s, oz + (gz - shift) * s] as const;
  }

  private stampSphere(cx: number, cy: number, cz: number, r: number, color: VoxelColorInput, material: string, group?: string) {
    if (r <= 0.5) {
      const ix = Math.round(cx), iy = Math.round(cy), iz = Math.round(cz);
      const c = typeof color === 'function' ? color(ix, iy, iz) : color;
      if (c) this.set(ix, iy, iz, c, material, group);
      return;
    }
    const r2 = r * r;
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    const z0 = Math.floor(cz - r), z1 = Math.ceil(cz + r);
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy, dz = z - cz;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            const c = typeof color === 'function' ? color(x, y, z) : color;
            if (c) this.set(x, y, z, c, material, group);
          }
        }
      }
    }
  }

  set(x: number, y: number, z: number, color: string, material = 'body', group?: string): this {
    const ix = Math.round(x), iy = Math.round(y), iz = Math.round(z);
    if (![ix, iy, iz].every(Number.isFinite)) throw new Error('Voxel coordinates must be finite');
    this.cells.set(keyOf(ix, iy, iz), { x: ix, y: iy, z: iz, color, material, group });
    return this;
  }

  has(x: number, y: number, z: number): boolean {
    return this.cells.has(keyOf(Math.round(x), Math.round(y), Math.round(z)));
  }

  get(x: number, y: number, z: number): VoxelCell | undefined {
    return this.cells.get(keyOf(Math.round(x), Math.round(y), Math.round(z)));
  }

  delete(x: number, y: number, z: number): boolean {
    return this.cells.delete(keyOf(Math.round(x), Math.round(y), Math.round(z)));
  }

  fillBox(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    color: VoxelColorInput, material = 'body', group?: string,
  ): this {
    const ax = Math.min(Math.round(x0), Math.round(x1)), bx = Math.max(Math.round(x0), Math.round(x1));
    const ay = Math.min(Math.round(y0), Math.round(y1)), by = Math.max(Math.round(y0), Math.round(y1));
    const az = Math.min(Math.round(z0), Math.round(z1)), bz = Math.max(Math.round(z0), Math.round(z1));
    for (let z = az; z <= bz; z++) {
      for (let y = ay; y <= by; y++) {
        for (let x = ax; x <= bx; x++) {
          const c = typeof color === 'function' ? color(x, y, z) : color;
          if (c) this.set(x, y, z, c, material, group);
        }
      }
    }
    return this;
  }

  fillEllipsoid(
    cx: number, cy: number, cz: number,
    rx: number, ry: number, rz: number,
    color: VoxelColorInput, material = 'body', group?: string,
  ): this {
    return this.fillSuperEllipsoid(cx, cy, cz, rx, ry, rz, color, { power: 2, material, group });
  }

  /** Fills an organic super-ellipsoid `|dx|^p + |dy|^p + |dz|^p <= 1` (`p = 2` sphere/ovoid, `p > 2.4` rounded heroic chest/skull). */
  fillSuperEllipsoid(
    cx: number, cy: number, cz: number,
    rx: number, ry: number, rz: number,
    color: VoxelColorInput,
    options: { power?: number; material?: string; group?: string } = {},
  ): this {
    if (rx <= 0 || ry <= 0 || rz <= 0) throw new Error('Ellipsoid radii must be positive');
    const power = options.power ?? 2;
    if (!Number.isFinite(power) || power <= 0) throw new Error('Super-ellipsoid power must be a positive finite number');
    const material = options.material ?? 'body';
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    const z0 = Math.floor(cz - rz), z1 = Math.ceil(cz + rz);
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = Math.abs(x - cx) / rx, dy = Math.abs(y - cy) / ry, dz = Math.abs(z - cz) / rz;
          const dist = power === 2
            ? dx * dx + dy * dy + dz * dz
            : Math.pow(dx, power) + Math.pow(dy, power) + Math.pow(dz, power);
          if (dist <= 1) {
            const c = typeof color === 'function' ? color(x, y, z) : color;
            if (c) this.set(x, y, z, c, material, options.group);
          }
        }
      }
    }
    return this;
  }

  /** Fills a gap-free tapered cylindrical voxel tube between two grid points `p0` and `p1`. */
  fillTube(
    p0: VoxelPoint, p1: VoxelPoint, r0: number, r1: number,
    color: VoxelColorInput, material = 'body', group?: string,
  ): this {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const dist = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.35));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.stampSphere(p0[0] + dx * t, p0[1] + dy * t, p0[2] + dz * t, r0 + (r1 - r0) * t, color, material, group);
    }
    return this;
  }

  /** Fills a gap-free smooth cubic Bezier curve in integer voxel space (for curved horns, tails, wings, and snouts). */
  fillCubicBezier(
    p0: VoxelPoint, p1: VoxelPoint, p2: VoxelPoint, p3: VoxelPoint,
    r0: number, r1: number,
    color: VoxelColorInput,
    options: { steps?: number; material?: string; group?: string; radiusFn?: (t: number) => number } = {},
  ): this {
    const segLen = (a: VoxelPoint, b: VoxelPoint) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const polyLen = segLen(p0, p1) + segLen(p1, p2) + segLen(p2, p3);
    const steps = Math.max(2, options.steps ?? Math.max(12, Math.ceil(polyLen * 2)));
    const material = options.material ?? 'body';
    const pointAt = (t: number): VoxelPoint => {
      const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
      const a = mt2 * mt, b = 3 * mt2 * t, c = 3 * mt * t2, d = t2 * t;
      return [
        a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
        a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
        a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
      ];
    };
    const radiusAt = (t: number) => options.radiusFn ? options.radiusFn(t) : r0 + (r1 - r0) * t;
    let prev = pointAt(0), prevR = radiusAt(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const curr = pointAt(t), currR = radiusAt(t);
      this.fillTube(prev, curr, prevR, currR, color, material, options.group);
      prev = curr; prevR = currR;
    }
    return this;
  }

  /** Mirrors missing X partners deterministically so X = 0 symmetry holds exactly. */
  mirrorX(): this {
    const snapshot = [...this.cells.values()].sort(sortCells);
    for (const cell of snapshot) {
      const mx = this.mirrorIndexX(cell.x);
      const k = keyOf(mx, cell.y, cell.z);
      if (!this.cells.has(k)) {
        const group = cell.group?.endsWith('_L') ? `${cell.group.slice(0, -2)}_R`
          : cell.group?.endsWith('_R') ? `${cell.group.slice(0, -2)}_L`
            : cell.group;
        this.cells.set(k, { x: mx, y: cell.y, z: cell.z, color: cell.color, material: cell.material, group });
      }
    }
    return this;
  }

  private bucketKey(cell: VoxelCell, by: 'material' | 'group'): string {
    return by === 'group' ? (cell.group ?? cell.material) : cell.material;
  }

  /**
   * Resolves 2x2 diagonal checkerboard pairs within each shell bucket (XY, XZ, YZ planes) that otherwise
   * create non-manifold Q4 duplicated edges, while keeping X-symmetry invariant under mirrorX().
   */
  fixDiagonalPinches(by: 'material' | 'group' = 'material', maxPasses = 16): number {
    let added = 0;
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = 0;
      const buckets = new Map<string, Set<string>>();
      const all = [...this.cells.values()].sort(sortCells);
      for (const c of all) {
        const b = this.bucketKey(c, by);
        let set = buckets.get(b);
        if (!set) buckets.set(b, (set = new Set()));
        set.add(keyOf(c.x, c.y, c.z));
      }

      const pickCorner = (
        a: readonly [number, number, number],
        b: readonly [number, number, number],
      ): readonly [number, number, number] | null => {
        const aFree = !this.cells.has(keyOf(...a)), bFree = !this.cells.has(keyOf(...b));
        if (!aFree && !bFree) return null;
        if (aFree !== bFree) return aFree ? a : b;
        const ax = Math.abs(this.cellCenterX(a[0])), bx = Math.abs(this.cellCenterX(b[0]));
        if (Math.abs(ax - bx) > 1e-6) return ax < bx ? a : b;
        return a[1] !== b[1] ? (a[1] < b[1] ? a : b) : (a[2] <= b[2] ? a : b);
      };

      const pending: Array<{ coord: readonly [number, number, number]; donor: VoxelCell }> = [];
      for (const c of all) {
        const bucket = this.bucketKey(c, by);
        const set = buckets.get(bucket)!;
        const { x, y, z } = c;
        const pairs: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]][] = [
          [[x + 1, y + 1, z], [x + 1, y, z], [x, y + 1, z]],
          [[x + 1, y, z + 1], [x + 1, y, z], [x, y, z + 1]],
          [[x, y + 1, z + 1], [x, y + 1, z], [x, y, z + 1]],
          [[x - 1, y + 1, z], [x - 1, y, z], [x, y + 1, z]],
          [[x - 1, y, z + 1], [x - 1, y, z], [x, y, z + 1]],
          [[x, y - 1, z + 1], [x, y - 1, z], [x, y, z + 1]],
        ];
        for (const [diag, c1, c2] of pairs) {
          if (set.has(keyOf(...diag)) && !set.has(keyOf(...c1)) && !set.has(keyOf(...c2))) {
            const picked = pickCorner(c1, c2);
            if (picked) pending.push({ coord: picked, donor: c });
          }
        }
      }

      for (const { coord: [nx, ny, nz], donor } of pending) {
        const k = keyOf(nx, ny, nz);
        if (!this.cells.has(k)) {
          this.cells.set(k, { x: nx, y: ny, z: nz, color: donor.color, material: donor.material, group: donor.group });
          added++;
          changed++;
        }
      }
      if (!changed) break;
    }
    return added;
  }

  private collectGreedyQuads(
    bucket: string,
    list: VoxelCell[],
    occupied: Map<string, string>,
  ): Array<{
    normal: readonly [number, number, number];
    color: string;
    corners: readonly [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
    ];
  }> {
    const s = this.voxelSize;
    const wX = (ix: number) => this.boundsForCell(ix, 0, 0)[0];
    const wY = (iy: number) => this.boundsForCell(0, iy, 0)[1];
    const wZ = (iz: number) => this.boundsForCell(0, 0, iz)[2];
    const quads: Array<{
      normal: readonly [number, number, number];
      color: string;
      corners: readonly [
        readonly [number, number, number],
        readonly [number, number, number],
        readonly [number, number, number],
        readonly [number, number, number],
      ];
    }> = [];

    const specs = [
      {
        face: FACES[0], // +X
        coord: (c: VoxelCell) => [c.x, c.z, c.y] as const,
        quadCorners: (sl: number, u0: number, u1: number, v0: number, v1: number) => {
          const px = wX(sl) + s, za = wZ(u0), zb = wZ(u1) + s, ya = wY(v0), yb = wY(v1) + s;
          return [[px, ya, zb], [px, ya, za], [px, yb, za], [px, yb, zb]] as const;
        },
      },
      {
        face: FACES[1], // -X
        coord: (c: VoxelCell) => [c.x, c.z, c.y] as const,
        quadCorners: (sl: number, u0: number, u1: number, v0: number, v1: number) => {
          const px = wX(sl), za = wZ(u0), zb = wZ(u1) + s, ya = wY(v0), yb = wY(v1) + s;
          return [[px, ya, za], [px, ya, zb], [px, yb, zb], [px, yb, za]] as const;
        },
      },
      {
        face: FACES[2], // +Y
        coord: (c: VoxelCell) => [c.y, c.x, c.z] as const,
        quadCorners: (sl: number, u0: number, u1: number, v0: number, v1: number) => {
          const py = wY(sl) + s, xa = wX(u0), xb = wX(u1) + s, za = wZ(v0), zb = wZ(v1) + s;
          return [[xa, py, zb], [xb, py, zb], [xb, py, za], [xa, py, za]] as const;
        },
      },
      {
        face: FACES[3], // -Y
        coord: (c: VoxelCell) => [c.y, c.x, c.z] as const,
        quadCorners: (sl: number, u0: number, u1: number, v0: number, v1: number) => {
          const py = wY(sl), xa = wX(u0), xb = wX(u1) + s, za = wZ(v0), zb = wZ(v1) + s;
          return [[xa, py, za], [xb, py, za], [xb, py, zb], [xa, py, zb]] as const;
        },
      },
      {
        face: FACES[4], // +Z
        coord: (c: VoxelCell) => [c.z, c.x, c.y] as const,
        quadCorners: (sl: number, u0: number, u1: number, v0: number, v1: number) => {
          const pz = wZ(sl) + s, xa = wX(u0), xb = wX(u1) + s, ya = wY(v0), yb = wY(v1) + s;
          return [[xa, ya, pz], [xb, ya, pz], [xb, yb, pz], [xa, yb, pz]] as const;
        },
      },
      {
        face: FACES[5], // -Z
        coord: (c: VoxelCell) => [c.z, c.x, c.y] as const,
        quadCorners: (sl: number, u0: number, u1: number, v0: number, v1: number) => {
          const pz = wZ(sl), xa = wX(u0), xb = wX(u1) + s, ya = wY(v0), yb = wY(v1) + s;
          return [[xb, ya, pz], [xa, ya, pz], [xa, yb, pz], [xb, yb, pz]] as const;
        },
      },
    ] as const;

    for (const sp of specs) {
      const slices = new Map<number, Map<string, { u: number; v: number; color: string }>>();
      for (const c of list) {
        if (occupied.get(keyOf(c.x + sp.face.dir[0], c.y + sp.face.dir[1], c.z + sp.face.dir[2])) === bucket) continue;
        const [sl, u, v] = sp.coord(c);
        let plane = slices.get(sl);
        if (!plane) slices.set(sl, (plane = new Map()));
        plane.set(`${u},${v}`, { u, v, color: c.color });
      }
      for (const sl of [...slices.keys()].sort((a, b) => a - b)) {
        const plane = slices.get(sl)!;
        const visited = new Set<string>();
        const entries = [...plane.values()].sort((a, b) => (a.v - b.v) || (a.u - b.u));
        for (const start of entries) {
          const k0 = `${start.u},${start.v}`;
          if (visited.has(k0)) continue;
          const col = start.color;
          let u1 = start.u;
          while (true) {
            const nk = `${u1 + 1},${start.v}`;
            const next = plane.get(nk);
            if (!next || visited.has(nk) || next.color !== col) break;
            u1++;
          }
          let v1 = start.v;
          while (true) {
            let rowOk = true;
            for (let u = start.u; u <= u1; u++) {
              const nk = `${u},${v1 + 1}`;
              const next = plane.get(nk);
              if (!next || visited.has(nk) || next.color !== col) { rowOk = false; break; }
            }
            if (!rowOk) break;
            v1++;
          }
          for (let v = start.v; v <= v1; v++) {
            for (let u = start.u; u <= u1; u++) visited.add(`${u},${v}`);
          }
          quads.push({
            normal: sp.face.normal,
            color: col,
            corners: sp.quadCorners(sl, start.u, u1, start.v, v1),
          });
        }
      }
    }
    return quads;
  }

  /**
   * Builds per-shell triangle arrays with shared interior face culling strictly inside each shell bucket,
   * guaranteeing zero open-edge leaks between materials and watertight Q3/Q4 shells (default `greedy: false`).
   * Set `greedy: true` to merge adjacent same-color coplanar faces (40-60% fewer triangles for lightweight runtime/mobile builds).
   */
  buildParts(by: 'material' | 'group' = 'material', options: { greedy?: boolean } = {}): Record<string, number[]> {
    const groups = new Map<string, VoxelCell[]>();
    const occupied = new Map<string, string>();
    for (const c of [...this.cells.values()].sort(sortCells)) {
      const b = this.bucketKey(c, by);
      occupied.set(keyOf(c.x, c.y, c.z), b);
      let list = groups.get(b);
      if (!list) groups.set(b, (list = []));
      list.push(c);
    }

    const parts: Record<string, number[]> = {};
    const s = this.voxelSize;
    for (const [bucket, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const tris: number[] = [];
      if (options.greedy) {
        for (const q of this.collectGreedyQuads(bucket, list, occupied)) {
          const p = q.corners;
          tris.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
        }
      } else {
        for (const c of list) {
          const [x0, y0, z0] = this.boundsForCell(c.x, c.y, c.z);
          for (const face of FACES) {
            if (occupied.get(keyOf(c.x + face.dir[0], c.y + face.dir[1], c.z + face.dir[2])) === bucket) continue;
            const p = face.corners.map(([cx, cy, cz]) => [x0 + cx * s, y0 + cy * s, z0 + cz * s] as const);
            tris.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
          }
        }
      }
      parts[bucket] = tris;
    }
    return parts;
  }

  private cornerAO(
    cell: VoxelCell,
    face: FaceSpec,
    corner: readonly [number, number, number],
    levels: readonly [number, number, number, number],
  ): number {
    const n = face.dir;
    const s1 = corner[face.t1] ? 1 : -1;
    const s2 = corner[face.t2] ? 1 : -1;
    const bx = cell.x + n[0], by = cell.y + n[1], bz = cell.z + n[2];
    const side1 = this.cells.has(keyOf(bx + (face.t1 === 0 ? s1 : 0), by + (face.t1 === 1 ? s1 : 0), bz + (face.t1 === 2 ? s1 : 0)));
    const side2 = this.cells.has(keyOf(bx + (face.t2 === 0 ? s2 : 0), by + (face.t2 === 1 ? s2 : 0), bz + (face.t2 === 2 ? s2 : 0)));
    const cornerOcc = this.cells.has(keyOf(
      bx + (face.t1 === 0 ? s1 : 0) + (face.t2 === 0 ? s2 : 0),
      by + (face.t1 === 1 ? s1 : 0) + (face.t2 === 1 ? s2 : 0),
      bz + (face.t1 === 2 ? s1 : 0) + (face.t2 === 2 ? s2 : 0),
    ));
    const occ = side1 && side2 ? 3 : (Number(side1) + Number(side2) + Number(cornerOcc));
    return levels[occ];
  }

  /**
   * Builds indexed flat-shaded Three.js BufferGeometries with sRGB->linear vertex colors (`new three.Color(hex)`),
   * default corner voxel AO + directional face shading on matte buckets, and bit-identical corner coordinates for `worldVertexT`.
   */
  buildGeometries(
    three: ThreeModule,
    options: VoxelGeometryOptions = {},
  ): Record<string, { geometry: THREE.BufferGeometry; materialName: string; vertexT?: number[]; tris: number[]; colors: string[] }> {
    const by = options.by ?? 'material';
    const hasVertexT = Boolean(options.worldVertexT || options.vertexT);
    const useGreedy = Boolean(options.greedy && !hasVertexT);
    const aoLevels = options.aoLevels ?? DEFAULT_AO_LEVELS;
    const glowBoost = options.glowBoost ?? 1;
    const groups = new Map<string, VoxelCell[]>();
    const occupied = new Map<string, string>();
    for (const c of [...this.cells.values()].sort(sortCells)) {
      const b = this.bucketKey(c, by);
      occupied.set(keyOf(c.x, c.y, c.z), b);
      let list = groups.get(b);
      if (!list) groups.set(b, (list = []));
      list.push(c);
    }

    const out: Record<string, { geometry: THREE.BufferGeometry; materialName: string; vertexT?: number[]; tris: number[]; colors: string[] }> = {};
    const colorCache = new Map<string, THREE.Color>();
    const resolveColor = (hex: string) => {
      let c = colorCache.get(hex);
      if (!c) colorCache.set(hex, (c = new three.Color(hex)));
      return c;
    };

    for (const [bucket, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const materialName = list[0].material;
      const glow = isGlowBucket(materialName);
      const useAo = !useGreedy && (glow ? options.ao === true : (options.ao ?? true));
      const useDir = !useGreedy && (glow ? options.dirShade === true : (options.dirShade ?? (options.ao ?? true)));
      const rgbBoost = glow ? glowBoost : 1;

      const positions: number[] = [];
      const normals: number[] = [];
      const colorsArr: number[] = [];
      const indices: number[] = [];
      const tris: number[] = [];
      const vertexT = hasVertexT ? [] as number[] : undefined;
      const usedHex = new Set<string>();
      let vOffset = 0;

      if (useGreedy) {
        for (const q of this.collectGreedyQuads(bucket, list, occupied)) {
          const col = resolveColor(q.color);
          usedHex.add(q.color);
          const p = q.corners;
          for (const pt of p) {
            positions.push(pt[0], pt[1], pt[2]);
            normals.push(q.normal[0], q.normal[1], q.normal[2]);
            colorsArr.push(col.r * rgbBoost, col.g * rgbBoost, col.b * rgbBoost);
          }
          indices.push(vOffset, vOffset + 1, vOffset + 2, vOffset, vOffset + 2, vOffset + 3);
          tris.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
          vOffset += 4;
        }
      } else {
        const s = this.voxelSize;
        for (const cell of list) {
          const [x0, y0, z0] = this.boundsForCell(cell.x, cell.y, cell.z);
          const col = resolveColor(cell.color);
          usedHex.add(cell.color);

          for (const face of FACES) {
            if (occupied.get(keyOf(cell.x + face.dir[0], cell.y + face.dir[1], cell.z + face.dir[2])) === bucket) continue;
            const p = face.corners.map(([cx, cy, cz]) => [x0 + cx * s, y0 + cy * s, z0 + cz * s] as const);
            const aoVals = useAo
              ? face.corners.map((c) => this.cornerAO(cell, face, c, aoLevels))
              : [1, 1, 1, 1];
            const dirFactor = useDir ? face.dirShade : 1;

            for (let i = 0; i < 4; i++) {
              const pt = p[i];
              const shade = aoVals[i] * dirFactor * rgbBoost;
              positions.push(pt[0], pt[1], pt[2]);
              normals.push(face.normal[0], face.normal[1], face.normal[2]);
              colorsArr.push(col.r * shade, col.g * shade, col.b * shade);
              if (vertexT) {
                if (options.worldVertexT) {
                  const [cx, cy, cz] = face.corners[i];
                  const wp = this.cornerWorld(cell.x + cx, cell.y + cy, cell.z + cz);
                  vertexT.push(options.worldVertexT(wp[0], wp[1], wp[2]));
                } else {
                  vertexT.push(options.vertexT!(pt[0], pt[1], pt[2], cell));
                }
              }
            }
            const flipDiag = useAo && (aoVals[0] + aoVals[2] < aoVals[1] + aoVals[3]);
            if (flipDiag) {
              indices.push(vOffset + 1, vOffset + 2, vOffset + 3, vOffset + 1, vOffset + 3, vOffset);
              tris.push(...p[1], ...p[2], ...p[3], ...p[1], ...p[3], ...p[0]);
            } else {
              indices.push(vOffset, vOffset + 1, vOffset + 2, vOffset, vOffset + 2, vOffset + 3);
              tris.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
            }
            vOffset += 4;
          }
        }
      }

      const geometry = new three.BufferGeometry();
      geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new three.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new three.Float32BufferAttribute(colorsArr, 3));
      geometry.setIndex(indices);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      out[bucket] = {
        geometry,
        materialName,
        ...(vertexT ? { vertexT } : {}),
        tris,
        colors: [...usedHex].sort(),
      };
    }

    return out;
  }

  /** Convenience wrapper returning a grounded/named Group of Meshes using caller-supplied materials. */
  buildMeshes(
    three: ThreeModule,
    materials: Record<string, THREE.Material>,
    options: Omit<VoxelGeometryOptions, 'vertexT' | 'worldVertexT'> & { castShadow?: boolean } = {},
  ): { group: THREE.Group; meshes: Record<string, THREE.Mesh>; parts: Record<string, number[]>; colors: string[] } {
    const built = this.buildGeometries(three, options);
    const group = new three.Group();
    const meshes: Record<string, THREE.Mesh> = {};
    const parts: Record<string, number[]> = {};
    const allColors = new Set<string>();

    for (const [bucket, entry] of Object.entries(built)) {
      const mat = materials[entry.materialName];
      if (!mat) throw new Error(`VoxelGrid.buildMeshes: missing material "${entry.materialName}" for bucket "${bucket}"`);
      const mesh = new three.Mesh(entry.geometry, mat);
      mesh.name = bucket;
      mesh.castShadow = options.castShadow ?? !isGlowBucket(entry.materialName);
      group.add(mesh);
      meshes[bucket] = mesh;
      parts[bucket] = entry.tris;
      for (const hex of entry.colors) allColors.add(hex);
    }

    return { group, meshes, parts, colors: [...allColors].sort() };
  }
}
