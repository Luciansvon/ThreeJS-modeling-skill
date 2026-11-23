import type * as THREE from 'three';
import type { Meta } from './budget';
import type { RigMeta } from './rigcheck';

export function selectBuilder(
  moduleExports: Record<string, unknown>,
  requestedName?: string,
  moduleLabel = 'module',
  option = '--export',
) {
  const functions = Object.keys(moduleExports).filter((key) => typeof moduleExports[key] === 'function');
  const name = requestedName ?? (functions.length === 1 ? functions[0] : moduleExports.default ? 'default' : undefined);
  if (!name || typeof moduleExports[name] !== 'function') {
    throw new Error(`pick the builder with ${option} <name>. Functions exported by ${moduleLabel}: ${functions.join(', ') || 'none'}`);
  }
  return {
    name,
    build: moduleExports[name] as (params: Record<string, unknown>, three: typeof THREE) => unknown,
  };
}

export function unpackAsset(built: unknown): { root: THREE.Object3D; animations: THREE.AnimationClip[] } {
  const result = built as { root?: THREE.Object3D; animations?: THREE.AnimationClip[] } | null | undefined;
  const wrapped = result?.root?.isObject3D === true;
  const root = wrapped ? result.root : (built as THREE.Object3D | undefined);
  if (!root?.isObject3D) {
    throw new Error('builder must return a THREE.Object3D or { root: THREE.Object3D, animations?: AnimationClip[] }');
  }
  const animations = Array.isArray(result?.animations) && (wrapped || result.animations.length > 0)
    ? result.animations
    : Array.isArray(root.userData?.animations) ? root.userData.animations : [];
  return { root, animations };
}

export function countScene(root: THREE.Object3D) {
  let tris = 0, meshes = 0, skins = 0, bones = 0, vertexColorMeshes = 0;
  root.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones++;
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skins++;
    const { isMesh, geometry } = object as THREE.Mesh;
    if (!isMesh || !geometry?.attributes?.position) return;
    meshes++;
    tris += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    if (geometry.attributes.color) vertexColorMeshes++;
  });
  return { tris: Math.round(tris), meshes, skins, bones, vertexColorMeshes };
}

/** Extracts world-space triangle arrays per visible mesh (works for static, rigid, and SkinnedMesh rigs). */
export function extractObjectParts(
  root: THREE.Object3D,
  three: { Vector3: new () => THREE.Vector3 },
): Record<string, number[]> {
  root.updateMatrixWorld(true);
  const parts: Record<string, number[]> = {};
  const used = new Set<string>();
  const v = new three.Vector3();
  let meshIdx = 0;

  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    meshIdx++;
    const baseName = mesh.name || `mesh_${meshIdx}`;
    let name = baseName;
    for (let suffix = 2; used.has(name); suffix++) name = `${baseName}_${suffix}`;
    used.add(name);

    const pos = mesh.geometry.getAttribute('position');
    const idx = mesh.geometry.index;
    const count = idx ? idx.count : pos.count;
    const arr: number[] = [];
    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
    for (let i = 0; i < count; i++) {
      const vi = idx ? idx.getX(i) : i;
      if (isSkinned) (mesh as THREE.SkinnedMesh).getVertexPosition(vi, v).applyMatrix4(mesh.matrixWorld);
      else v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      arr.push(v.x, v.y, v.z);
    }
    if (arr.length >= 9) parts[name] = arr;
  });

  if (!Object.keys(parts).length) throw new Error('asset contains no visible mesh triangles');
  return parts;
}

const RUNTIME_USERDATA_KEYS = new Set(['bones', 'animations', 'anchors', 'mixer', 'rig', 'skeleton']);

function isThreeRuntimeObject(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Boolean(
    v.isObject3D || v.isBone || v.isAnimationClip || v.isSkeleton || v.isMaterial
    || v.isBufferGeometry || v.isTexture || v.isBufferAttribute || v.isVector3
    || v.isQuaternion || v.isMatrix4 || v.isEuler || v.isColor,
  );
}

function isJsonSafeUserDataValue(value: unknown, depth: number, seen: Set<object>): boolean {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 5) return false;
  if (isThreeRuntimeObject(value) || seen.has(value)) return false;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 256) return false;
      return value.every((item) => isJsonSafeUserDataValue(item, depth + 1, seen));
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) return false;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 64) return false;
    return entries.every(([, v]) => isJsonSafeUserDataValue(v, depth + 1, seen));
  } finally {
    seen.delete(value);
  }
}

/**
 * Temporarily strips live Three.js objects, circular graphs, and bloated blobs from every node's
 * `userData` prior to `GLTFExporter`, returning a restore callback to put the originals back afterward.
 */
export function sanitizeUserDataForGltf(root: THREE.Object3D): () => void {
  const saved: Array<{ object: THREE.Object3D; userData: Record<string, unknown> }> = [];
  root.traverse((object) => {
    const raw = object.userData;
    if (!raw || typeof raw !== 'object') return;
    const keys = Object.keys(raw);
    if (!keys.length) return;
    saved.push({ object, userData: raw });
    const clean: Record<string, unknown> = {};
    for (const key of keys) {
      if (RUNTIME_USERDATA_KEYS.has(key)) continue;
      const val = raw[key];
      if (!isJsonSafeUserDataValue(val, 0, new Set())) continue;
      try {
        const encoded = JSON.stringify(val);
        if (encoded !== undefined && encoded.length <= 4096) clean[key] = val;
      } catch {
        // Ignore unserializable userData values cleanly.
      }
    }
    object.userData = clean;
  });
  return () => {
    for (const { object, userData } of saved) object.userData = userData;
  };
}

/** Parses glTF 2.0 binary (GLB) chunk header sizes without loading assets into Three.js. */
export function parseGlbHeader(bytes: ArrayBuffer | Uint8Array): { totalBytes: number; jsonBytes: number; binBytes: number } {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.byteLength < 20) return { totalBytes: u8.byteLength, jsonBytes: 0, binBytes: 0 };
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid GLB header magic');
  const totalBytes = dv.getUint32(8, true);
  const firstLen = dv.getUint32(12, true);
  const firstType = dv.getUint32(16, true);
  const jsonBytes = firstType === 0x4e4f534a ? firstLen : 0;
  let binBytes = 0;
  const binOff = 20 + firstLen;
  if (binOff + 8 <= u8.byteLength && dv.getUint32(binOff + 4, true) === 0x004e4942) {
    binBytes = dv.getUint32(binOff, true);
  }
  return { totalBytes, jsonBytes, binBytes };
}

function closedClipTrack(track: THREE.KeyframeTrack): boolean {
  const width = track.getValueSize();
  if (!width || track.values.length < width) return false;
  const first = track.values.slice(0, width);
  const last = track.values.slice(-width);
  return first.every((v, i) => v === last[i])
    || (track.ValueTypeName === 'quaternion' && first.every((v, i) => -v === last[i]));
}

/** Extracts `parts`, `meshMeta`, and `rigMetadata` directly from a `(params, THREE)` builder return value. */
export function extractModuleMeta(
  built: unknown,
  three: typeof THREE,
  motionMode?: 'in-place' | 'free',
): { parts: Record<string, number[]>; meshMeta: Meta; rigMetadata: RigMeta } {
  const { root, animations } = unpackAsset(built);
  root.updateMatrixWorld(true);
  const parts = extractObjectParts(root, three);

  const rawPivots = new Set<THREE.Object3D>();
  root.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) rawPivots.add(obj);
  });
  for (const clip of animations) {
    for (const track of clip.tracks) {
      const parsed = three.PropertyBinding.parseTrackName(track.name);
      const target = parsed.nodeName ? three.PropertyBinding.findNode(root, parsed.nodeName) : root;
      if (target) rawPivots.add(target);
    }
  }
  if (!rawPivots.size) rawPivots.add(root);

  const parentRoots = [...rawPivots].filter((node) => !node.parent || !rawPivots.has(node.parent));
  if (parentRoots.length > 1) {
    for (const node of [...rawPivots]) {
      let cur = node.parent;
      while (cur) {
        rawPivots.add(cur);
        if (cur === root) break;
        cur = cur.parent;
      }
    }
  }

  const orderedNodes: THREE.Object3D[] = [];
  root.traverse((obj) => { if (rawPivots.has(obj)) orderedNodes.push(obj); });
  const nodeToName = new Map<THREE.Object3D, string>();
  const usedPivotNames = new Set<string>();
  for (let i = 0; i < orderedNodes.length; i++) {
    const node = orderedNodes[i];
    const base = node.name || (node === root ? 'root' : `pivot_${i + 1}`);
    let name = base;
    for (let suffix = 2; usedPivotNames.has(name); suffix++) name = `${base}_${suffix}`;
    usedPivotNames.add(name);
    nodeToName.set(node, name);
  }

  const pivotNames = orderedNodes.map((n) => nodeToName.get(n)!);
  const hierarchy: { parent: string; child: string }[] = [];
  const restLocalPositions: Record<string, number[]> = {};
  for (const node of orderedNodes) {
    const name = nodeToName.get(node)!;
    restLocalPositions[name] = [node.position.x, node.position.y, node.position.z];
    let p = node.parent;
    while (p && !nodeToName.has(p)) p = p.parent;
    if (p) hierarchy.push({ parent: nodeToName.get(p)!, child: name });
  }

  const materials = new Map<THREE.Material, string>();
  const textures = new Map<THREE.Texture, { name: string; width: number; height: number; mips: boolean }>();
  const partMeta: NonNullable<Meta['parts']> = {};
  const usedMeshNames = new Set<string>();
  let meshIdx = 0;
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    meshIdx++;
    const base = mesh.name || `mesh_${meshIdx}`;
    let meshName = base;
    for (let suffix = 2; usedMeshNames.has(meshName); suffix++) meshName = `${base}_${suffix}`;
    usedMeshNames.add(meshName);
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat && !materials.has(mat)) {
      materials.set(mat, `${materials.size + 1}:${mat.name || mat.type}`);
      for (const prop of Object.values(mat)) {
        const tex = prop as THREE.Texture | undefined;
        if (!tex?.isTexture || textures.has(tex)) continue;
        const img = tex.image as { videoWidth?: number; naturalWidth?: number; width?: number; videoHeight?: number; naturalHeight?: number; height?: number } | undefined;
        const width = img?.videoWidth || img?.naturalWidth || img?.width;
        const height = img?.videoHeight || img?.naturalHeight || img?.height;
        if (width && height && Number.isFinite(width) && Number.isFinite(height)) {
          textures.set(tex, {
            name: tex.name || `texture_${textures.size + 1}`,
            width, height,
            mips: tex.generateMipmaps || (tex.mipmaps?.length ?? 0) > 1,
          });
        }
      }
    }
    let owner: THREE.Object3D | null = mesh;
    while (owner && !nodeToName.has(owner)) owner = owner.parent;
    const bone = owner ? nodeToName.get(owner)
      : (mesh as THREE.SkinnedMesh).isSkinnedMesh
        ? (mesh as THREE.SkinnedMesh).skeleton?.bones?.map((b) => nodeToName.get(b)).find(Boolean)
        : undefined;
    partMeta[meshName] = { material: mat ? materials.get(mat)! : 'default', ...(bone ? { bone } : {}) };
  });

  const savedTransforms: Array<{ node: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }> = [];
  root.traverse((node) => savedTransforms.push({
    node, pos: node.position.clone(), quat: node.quaternion.clone(), scale: node.scale.clone(),
  }));

  let clipMinY = Infinity;
  const visibleMeshes: THREE.Mesh[] = [];
  root.traverseVisible((obj) => { if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).geometry?.attributes?.position) visibleMeshes.push(obj as THREE.Mesh); });
  const vTmp = new three.Vector3();
  const sampleFrameY = () => {
    root.updateMatrixWorld(true);
    for (const mesh of visibleMeshes) {
      const pos = mesh.geometry.getAttribute('position');
      const idx = mesh.geometry.index;
      const count = idx ? idx.count : pos.count;
      const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
      for (let i = 0; i < count; i++) {
        const vi = idx ? idx.getX(i) : i;
        if (isSkinned) (mesh as THREE.SkinnedMesh).getVertexPosition(vi, vTmp).applyMatrix4(mesh.matrixWorld);
        else vTmp.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
        if (vTmp.y < clipMinY) clipMinY = vTmp.y;
      }
    }
  };

  try {
    if (animations.length) {
      const mixer = new three.AnimationMixer(root);
      for (const clip of animations) {
        const dur = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
        const times = new Set<number>([0, dur]);
        const steps = Math.min(30, Math.max(4, Math.ceil(dur * 30)));
        for (let i = 1; i < steps; i++) times.add((dur * i) / steps);
        for (const tr of clip.tracks) {
          for (let i = 0; i < tr.times.length; i++) if (tr.times[i] > 0 && tr.times[i] < dur) times.add(tr.times[i]);
        }
        const action = mixer.clipAction(clip).setLoop(three.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        for (const t of [...times].sort((a, b) => a - b)) {
          mixer.setTime(t);
          sampleFrameY();
        }
        action.stop();
        for (const s of savedTransforms) {
          s.node.position.copy(s.pos);
          s.node.quaternion.copy(s.quat);
          s.node.scale.copy(s.scale);
        }
      }
    }
  } finally {
    for (const s of savedTransforms) {
      s.node.position.copy(s.pos);
      s.node.quaternion.copy(s.quat);
      s.node.scale.copy(s.scale);
    }
    root.updateMatrixWorld(true);
  }

  const rootPivotName = nodeToName.get(orderedNodes.find((n) => !n.parent || !rawPivots.has(n.parent)) ?? orderedNodes[0])!;
  const rigMetadata: RigMeta = {
    rig: { rootNode: root.name || undefined, pivotNames, hierarchy, restLocalPositions },
    animations: animations.map((clip) => ({
      name: clip.name,
      durationSeconds: clip.duration,
      loop: clip.tracks.every(closedClipTrack),
      tracks: clip.tracks.map((track) => {
        const parsed = three.PropertyBinding.parseTrackName(track.name);
        const normName = parsed.nodeName === '' ? `${rootPivotName}${track.name.startsWith('.') ? track.name : `.${track.name}`}` : track.name;
        return { name: normName, times: Array.from(track.times), values: Array.from(track.values) };
      }),
    })),
    qa: {
      ...(motionMode ? { motionMode } : {}),
      ...(Number.isFinite(clipMinY) ? { clipMinY } : {}),
    },
  };

  return {
    parts,
    meshMeta: { parts: partMeta, bones: pivotNames.length, textures: [...textures.values()] },
    rigMetadata,
  };
}
