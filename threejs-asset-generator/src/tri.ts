// src/tri.ts: no THREE import
export type V3 = [number, number, number];
export type Tris = number[];                         // 9 numbers per triangle, CCW seen from outside

export function signedVolumeOf(t: Tris) {            // closed meshes only; > 0 means outward CCW
  let v = 0;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

export function mirrorTris(t: Tris, axis: 0 | 1 | 2 = 0): Tris {
  const out = new Array<number>(t.length);
  for (let i = 0; i < t.length; i += 9)
    for (let v = 0; v < 3; v++) {
      const src = i + v * 3, dst = i + (v === 0 ? 0 : 3 - v) * 3;      // swap vertices 1 and 2: winding stays outward
      for (let k = 0; k < 3; k++) out[dst + k] = t[src + k] * (k === axis ? -1 : 1);
    }
  return out;
}
