import * as THREE from 'three';
export function applyVertexJitter(geo: THREE.BufferGeometry, amount: number, rng: () => number, pinBottom = false) {
  if (amount <= 0) return geo;
  const pos = geo.attributes.position;
  geo.computeBoundingBox();
  const minY = geo.boundingBox!.min.y;
  const eps = (geo.boundingBox!.max.y - minY) * 0.02 + 1e-6;
  const seen = new Map<string, number[]>(), Q = 1e4;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (pinBottom && y - minY < eps) continue;            // keep the base flat on the ground
    const key = `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
    let d = seen.get(key);
    if (!d) { d = [(rng() - 0.5) * amount, (rng() - 0.5) * amount, (rng() - 0.5) * amount]; seen.set(key, d); }
    pos.setXYZ(i, x + d[0], y + d[1], z + d[2]);
  }
  pos.needsUpdate = true;
  geo.computeBoundingBox(); geo.computeBoundingSphere();  // stale bounds cause frustum-culling pop-out
  return geo;                                             // normals are rebuilt by bakeFlat()
}
