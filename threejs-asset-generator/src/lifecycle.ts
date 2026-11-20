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
