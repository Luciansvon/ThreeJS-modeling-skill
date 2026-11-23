import type * as THREE from 'three';

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
