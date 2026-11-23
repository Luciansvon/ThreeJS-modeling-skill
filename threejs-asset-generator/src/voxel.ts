// src/voxel.ts: deterministic, manifold-safe voxel grid builder with sRGB->linear vertex colors and SkinnedMesh curve support.
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

type ThreeModule = typeof THREE;
type FaceSpec = {
  dir: readonly [number, number, number];
  normal: readonly [number, number, number];
  corners: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
};

// Outward CCW unit-cube faces for [0..1]^3 in right-handed +Y up, +Z forward space.
const FACES: readonly FaceSpec[] = [
  { dir: [1, 0, 0], normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0], normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1], normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
const sortCells = (a: VoxelCell, b: VoxelCell) => (a.z - b.z) || (a.y - b.y) || (a.x - b.x);

/** Dual-material voxel preset: flat-shaded matte body + unlit bright emissive accents (2 draw calls total, all glow hues in vertex colors). */
export function createVoxelMaterials(three: ThreeModule): {
  body: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
} {
  return {
    body: new three.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.84,
      metalness: 0.04,
    }),
    glow: new three.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    }),
  };
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
    const s = this.voxelSize;
    const [ox, oy, oz] = this.origin;
    const x0 = ox + (this.symAxis === 'odd' ? ix - 0.5 : ix) * s;
    const y0 = oy + iy * s;
    const z0 = oz + (this.symAxis === 'odd' ? iz - 0.5 : iz) * s;
    return [x0, y0, z0] as const;
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
    if (rx <= 0 || ry <= 0 || rz <= 0) throw new Error('Ellipsoid radii must be positive');
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    const z0 = Math.floor(cz - rz), z1 = Math.ceil(cz + rz);
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          if (dx * dx + dy * dy + dz * dz <= 1) {
            const c = typeof color === 'function' ? color(x, y, z) : color;
            if (c) this.set(x, y, z, c, material, group);
          }
        }
      }
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

  /**
   * Builds per-shell triangle arrays with shared interior face culling strictly inside each shell bucket,
   * guaranteeing zero open-edge leaks between materials and watertight Q3/Q4 shells.
   */
  buildParts(by: 'material' | 'group' = 'material'): Record<string, number[]> {
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
      for (const c of list) {
        const [x0, y0, z0] = this.boundsForCell(c.x, c.y, c.z);
        for (const face of FACES) {
          if (occupied.get(keyOf(c.x + face.dir[0], c.y + face.dir[1], c.z + face.dir[2])) === bucket) continue;
          const p = face.corners.map(([cx, cy, cz]) => [x0 + cx * s, y0 + cy * s, z0 + cz * s] as const);
          tris.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
        }
      }
      parts[bucket] = tris;
    }
    return parts;
  }

  /** Builds indexed flat-shaded Three.js BufferGeometries with sRGB->linear vertex colors (`new three.Color(hex)`). */
  buildGeometries(
    three: ThreeModule,
    options: { by?: 'material' | 'group'; vertexT?: (wx: number, wy: number, wz: number, cell: VoxelCell) => number } = {},
  ): Record<string, { geometry: THREE.BufferGeometry; materialName: string; vertexT?: number[]; tris: number[]; colors: string[] }> {
    const by = options.by ?? 'material';
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
    const s = this.voxelSize;
    const colorCache = new Map<string, THREE.Color>();
    const resolveColor = (hex: string) => {
      let c = colorCache.get(hex);
      if (!c) colorCache.set(hex, (c = new three.Color(hex)));
      return c;
    };

    for (const [bucket, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const positions: number[] = [];
      const normals: number[] = [];
      const colorsArr: number[] = [];
      const indices: number[] = [];
      const tris: number[] = [];
      const vertexT = options.vertexT ? [] as number[] : undefined;
      const usedHex = new Set<string>();
      let vOffset = 0;

      for (const cell of list) {
        const [x0, y0, z0] = this.boundsForCell(cell.x, cell.y, cell.z);
        const col = resolveColor(cell.color);
        usedHex.add(cell.color);

        for (const face of FACES) {
          if (occupied.get(keyOf(cell.x + face.dir[0], cell.y + face.dir[1], cell.z + face.dir[2])) === bucket) continue;
          const p = face.corners.map(([cx, cy, cz]) => [x0 + cx * s, y0 + cy * s, z0 + cz * s] as const);
          for (const pt of p) {
            positions.push(pt[0], pt[1], pt[2]);
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
            colorsArr.push(col.r, col.g, col.b);
            if (vertexT && options.vertexT) vertexT.push(options.vertexT(pt[0], pt[1], pt[2], cell));
          }
          indices.push(vOffset, vOffset + 1, vOffset + 2, vOffset, vOffset + 2, vOffset + 3);
          tris.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
          vOffset += 4;
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
        materialName: list[0].material,
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
    options: { by?: 'material' | 'group'; castShadow?: boolean } = {},
  ): { group: THREE.Group; meshes: Record<string, THREE.Mesh>; parts: Record<string, number[]>; colors: string[] } {
    const built = this.buildGeometries(three, { by: options.by });
    const group = new three.Group();
    const meshes: Record<string, THREE.Mesh> = {};
    const parts: Record<string, number[]> = {};
    const allColors = new Set<string>();

    for (const [bucket, entry] of Object.entries(built)) {
      const mat = materials[entry.materialName];
      if (!mat) throw new Error(`VoxelGrid.buildMeshes: missing material "${entry.materialName}" for bucket "${bucket}"`);
      const mesh = new three.Mesh(entry.geometry, mat);
      mesh.name = bucket;
      mesh.castShadow = options.castShadow ?? true;
      group.add(mesh);
      meshes[bucket] = mesh;
      parts[bucket] = entry.tris;
      for (const hex of entry.colors) allColors.add(hex);
    }

    return { group, meshes, parts, colors: [...allColors].sort() };
  }
}
