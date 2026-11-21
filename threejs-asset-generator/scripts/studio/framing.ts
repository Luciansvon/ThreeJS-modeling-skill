import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { StudioConfig, StudioView } from './types';

export const samplesPerClip = 25;

export function poseBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) {
    throw new Error('The asset pose has no finite bounds to frame');
  }
  return bounds;
}

export function boundsRecord(box: THREE.Box3) {
  return { min: box.min.toArray(), max: box.max.toArray() };
}

export function frameCamera(
  camera: THREE.PerspectiveCamera, controls: OrbitControls,
  bounds: THREE.Box3, view: StudioView, config: StudioConfig,
) {
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.001);
  const side = config.frontSide === 'left' ? 1 : -1;
  const front = view === '34-front';
  const direction = new THREE.Vector3(front ? side : -side, 0.65, front ? 1.35 : -1.35).normalize();
  camera.position.copy(center).addScaledVector(direction, radius);
  camera.lookAt(center);
  const inverseRotation = camera.quaternion.clone().invert();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;

  // Project all 8 world bounds corners into camera space. Fit inside the canvas, below and above the HUD.
  const corner = new THREE.Vector3();
  let distance = radius * 0.1;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corner.set(x, y, z).sub(center).applyQuaternion(inverseRotation);
        const inset = config.margin * Math.max(Math.abs(corner.x) / tanX, Math.abs(corner.y) / tanY);
        distance = Math.max(distance, corner.z + Math.max(inset, radius * 0.05));
      }
    }
  }

  camera.near = radius / 1000;
  camera.far = distance + radius * 100;
  camera.updateProjectionMatrix();
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.target.copy(center);
  controls.minDistance = radius / 20;
  controls.maxDistance = Math.max(distance * 5, radius * 20);
  controls.update();
}
