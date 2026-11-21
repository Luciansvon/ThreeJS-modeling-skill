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

export function collectPoseVertices(root: THREE.Object3D, maxPerMesh = 1500): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.hasAttribute('position')) return;
    const total = mesh.geometry.getAttribute('position').count;
    const step = Math.max(1, Math.ceil(total / maxPerMesh));
    for (let i = 0; i < total; i += step) {
      points.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
    }
  });
  return points;
}

function viewDirection(view: StudioView, frontSide: StudioConfig['frontSide']): THREE.Vector3 {
  const side = frontSide === 'left' ? 1 : -1;
  switch (view) {
    case '34-front': return new THREE.Vector3(side, 0.65, 1.35).normalize();
    case '34-back': return new THREE.Vector3(-side, 0.65, -1.35).normalize();
    case 'front': return new THREE.Vector3(0, 0.20, 1).normalize();
    case 'side': return new THREE.Vector3(side, 0.20, 0).normalize();
    case 'back': return new THREE.Vector3(0, 0.20, -1).normalize();
    case 'top': return new THREE.Vector3(0, 1, 0.001).normalize();
  }
}

function boxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new THREE.Vector3(x, y, z));
  return corners;
}

export function frameCamera(
  camera: THREE.PerspectiveCamera, controls: OrbitControls,
  bounds: THREE.Box3, view: StudioView, config: StudioConfig,
  samplePoints?: readonly THREE.Vector3[],
) {
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.001);
  const direction = viewDirection(view, config.frontSide);
  camera.position.copy(center).addScaledVector(direction, radius);
  camera.lookAt(center);
  const inverseRotation = camera.quaternion.clone().invert();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;

  // Project actual posed vertices (or box corners as fallback) so tight silhouettes fill the stage cleanly.
  const points = samplePoints?.length ? samplePoints : boxCorners(bounds);
  const projected = new THREE.Vector3();
  let distance = radius * 0.1;
  for (const point of points) {
    projected.copy(point).sub(center).applyQuaternion(inverseRotation);
    const inset = config.margin * Math.max(Math.abs(projected.x) / tanX, Math.abs(projected.y) / tanY);
    distance = Math.max(distance, projected.z + Math.max(inset, radius * 0.05));
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
