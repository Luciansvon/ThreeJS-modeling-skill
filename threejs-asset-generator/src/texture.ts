import * as THREE from 'three';
export function seededNoiseTexture(rng: () => number, size = 32, variation = 0.2) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) { const v = Math.round(255 * (1 - variation * rng())); data.set([v, v, v, 255], i * 4); }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;                       // bytes are sRGB; the shader converts
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;                         // crisp texels suit the low-poly look
  tex.needsUpdate = true;
  return tex;
}
// const tex = seededNoiseTexture(rng.fork('tex'));   own stream, like every other feature
