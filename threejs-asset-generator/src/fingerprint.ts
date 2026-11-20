import * as THREE from 'three';
export function assetFingerprint(root: THREE.Object3D) {
  let tris = 0, h = 0;
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
    for (let i = 0; i < p.count; i++)
      h = (h + Math.round(p.getX(i) * 1e3) * 31 + Math.round(p.getY(i) * 1e3) * 17 + Math.round(p.getZ(i) * 1e3) * 13) | 0;
  });
  return { tris, h };
}
