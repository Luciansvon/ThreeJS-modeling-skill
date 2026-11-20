import * as THREE from 'three';
export function trianglesToGeometry(flatXYZ: number[]) {          // 9 numbers per triangle
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flatXYZ), 3));
  return g;
}
export function signedVolume(geo: THREE.BufferGeometry) {         // closed meshes only
  const pos = geo.attributes.position, idx = geo.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const tris = (idx ? idx.count : pos.count) / 3;
  let vol = 0;
  for (let t = 0; t < tris; t++) {
    const i = (k: number) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
    a.fromBufferAttribute(pos, i(0)); b.fromBufferAttribute(pos, i(1)); c.fromBufferAttribute(pos, i(2));
    vol += a.dot(n.crossVectors(b, c)) / 6;
  }
  return vol;                                                      // > 0 outward CCW
}
