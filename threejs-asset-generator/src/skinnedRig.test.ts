import assert from 'node:assert/strict';
import * as THREE from 'three';
import { assetStats } from '../scripts/budget';
import { boundsOf, flatten, normalizeParts, qaGates } from '../scripts/qacheck';
import { rigGates } from '../scripts/rigcheck';
import { attachCurveSkinWeights, bakeClip30fps, buildBoneHierarchy, extractQaArtifacts } from './skinnedRig';

const close = (actual: number, expected: number, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};

// Early and late rings of a folded chain can overlap in XYZ and still need different weights.
{
  const { rootBone, bones, boneOrder } = buildBoneHierarchy([
    { name: 'hips', worldPos: [1, 0, 0] },
    { name: 'early', parent: 'hips', worldPos: [0, 0, 0] },
    { name: 'fin', parent: 'hips', worldPos: [1, 1, 0] },
    { name: 'fold', parent: 'early', worldPos: [0, 0, -1] },
    { name: 'late', parent: 'fold', worldPos: [0, 0, 0] },
  ]);
  assert.equal(bones.early.parent, rootBone);
  assert.deepEqual(bones.early.position.toArray(), [-1, 0, 0]);
  assert.deepEqual(bones.fin.position.toArray(), [0, 1, 0]);
  assert.deepEqual(bones.late.position.toArray(), [0, 0, 1]);
  assert.deepEqual(bones.late.getWorldPosition(new THREE.Vector3()).toArray(), [0, 0, 0]);
  assert.deepEqual(boneOrder, ['hips', 'early', 'fin', 'fold', 'late']);
  assert.throws(() => buildBoneHierarchy([{ name: 'child', parent: 'unknown', worldPos: [0, 0, 0] }]), /parents? .*before/i);
  assert.throws(() => buildBoneHierarchy([{ name: 'a', worldPos: [0, 0, 0] }, { name: 'b', worldPos: [0, 0, 0] }]), /single root/);
  assert.throws(() => buildBoneHierarchy([{ name: 'a', worldPos: [0, 0, 0] }, { name: 'a', parent: 'a', worldPos: [0, 0, 0] }]), /Duplicate/);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.2, 0, 0, 0.2, 0, 0, 0.2, -0.5, 0, 0.2, -0.5, 0, 0.2, 0,
  ], 3));
  geometry.setIndex([0, 2, 1, 1, 3, 4]);
  const chain = ['early', 'fold', 'late'];
  const samples = { vertexT: [0, 1, 0.3, 0.7, 0.5], boneT: [0.1, 0.5, 0.9] };
  assert.equal(attachCurveSkinWeights(geometry, boneOrder, chain, samples), geometry);
  const index = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  assert.equal(index.count, 5);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => [index.getX(i), index.getY(i)]), [[1, 0], [4, 0], [1, 3], [3, 4], [3, 4]]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => [weight.getX(i), weight.getY(i)]), [[1, 0], [1, 0], [0.5, 0.5], [0.5, 0.5], [1, 0]]);
  assert.throws(() => attachCurveSkinWeights(geometry, boneOrder, chain, { ...samples, vertexT: [0, 1] }), /vertex count/);
  assert.throws(() => attachCurveSkinWeights(geometry, boneOrder, chain, { ...samples, boneT: [0.2, 0.2, 1] }), /strictly increasing/);
  assert.throws(() => attachCurveSkinWeights(geometry, boneOrder, chain, { ...samples, vertexT: [0, 1, -0.1, 0.2, 0.3] }), /\[0, 1\]/);
  assert.equal(geometry.getAttribute('skinWeight'), weight);

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const root = new THREE.Group().add(rootBone, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(boneOrder.map((name) => bones[name])));
  bones.late.position.x += 2;
  root.updateMatrixWorld(true);
  close(mesh.getVertexPosition(0, new THREE.Vector3()).x, 0);
  close(mesh.getVertexPosition(1, new THREE.Vector3()).x, 2);
  close(mesh.getVertexPosition(3, new THREE.Vector3()).x, 1);

  attachCurveSkinWeights(geometry, boneOrder, ['fin'], { vertexT: samples.vertexT, boneT: [0.5] });
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => geometry.getAttribute('skinIndex').getX(i)), [2, 2, 2, 2, 2]);
}

function tailAsset() {
  const { rootBone, bones, boneOrder } = buildBoneHierarchy([
    { name: 'hips', worldPos: [0, 1, 0] },
    { name: 'tail', parent: 'hips', worldPos: [0, 1, -1] },
    { name: 'tailTip', parent: 'tail', worldPos: [0, 2, -1] },
  ]);
  const geometry = new THREE.BoxGeometry(0.2, 1, 0.2).translate(0, 1.5, -1);
  const position = geometry.getAttribute('position');
  const vertexT = Array.from({ length: position.count }, (_, i) => position.getY(i) - 1);
  attachCurveSkinWeights(geometry, boneOrder, ['tail', 'tailTip'], { vertexT, boneT: [0, 1] });

  const map = new THREE.DataTexture(new Uint8Array(8 * 4 * 4), 8, 4);
  map.name = 'tail_atlas';
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ name: 'hide', map }));
  skin.name = 'body';
  const rigid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ name: 'hide', map }));
  rigid.name = 'body';
  rigid.position.set(0, 0.75, 0.2);
  bones.hips.add(rigid);

  const root = new THREE.Group().add(rootBone, skin);
  root.name = 'TailAsset';
  root.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton(boneOrder.map((name) => bones[name])));
  root.position.y = -1; // Ground the wrapper after binding.
  return { root, bones, skin, rigid };
}

// Real Three.js poses. A vertical tail must pitch toward -Z before yaw can move its tip along X.
{
  const { root, bones, skin } = tailAsset();
  const sampled: number[] = [];
  const angle: [number, number, number] = [-Math.PI / 2, 0, 0];
  const swayPose = { rotations: { tail: angle } };
  const sway = bakeClip30fps('TailSway', 1, bones, (u) => {
    sampled.push(u);
    angle[1] = Math.sin(2 * Math.PI * u) * Math.PI / 3;
    return swayPose;
  });
  assert.equal(sampled.length, 30);
  assert.equal(sampled[0], 0);
  assert.equal(sway.tracks[0].times.length, 31);
  assert.equal(sway.tracks[0].times[30], 1);
  assert.deepEqual(sway.tracks[0].values.slice(-4), sway.tracks[0].values.slice(0, 4));
  const yawOnly = bakeClip30fps('YawOnly', 1, bones, () => ({ rotations: { tail: [0, Math.PI / 3, 0] } }));
  const alternate = bakeClip30fps('OtherOrder', 1, bones, () => ({ rotations: { tail: [-Math.PI / 2, Math.PI / 3, 0] } }), { eulerOrder: 'XYZ' });
  const topVertex = Array.from({ length: skin.geometry.getAttribute('position').count }, (_, i) => i)
    .find((i) => skin.geometry.getAttribute('position').getY(i) === 2)!;
  const tipAt = (clip: THREE.AnimationClip, t: number) => {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    mixer.setTime(t);
    root.updateMatrixWorld(true);
    const tip = bones.tailTip.getWorldPosition(new THREE.Vector3());
    const surface = skin.getVertexPosition(topVertex, new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
    mixer.stopAllAction();
    return { tip, surface };
  };
  const neutral = tipAt(sway, 0).tip;
  close(neutral.z, -2);
  close(neutral.y, 0);
  close(tipAt(yawOnly, 0.25).tip.x, 0);
  close(tipAt(alternate, 0.25).tip.x, 0);
  const { tip: left, surface: leftSurface } = tipAt(sway, 0.25);
  const { tip: right, surface: rightSurface } = tipAt(sway, 0.75);
  assert.ok(leftSurface.x < -0.7 && rightSurface.x > 0.7);
  close(left.x, -Math.sqrt(3) / 2, 0.003);
  close(right.x, Math.sqrt(3) / 2, 0.003);
  close(left.y, 0);
  close(right.y, 0);
  close(left.z, right.z);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(sway).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(sway.duration);
  close(bones.tailTip.getWorldPosition(new THREE.Vector3()).distanceTo(neutral), 0);
}

// Delayed channels still get tracks, and angle wraps never take the long quaternion path.
{
  const { bones } = tailAsset();
  const branch = bakeClip30fps('BranchWrap', 0.8, bones, (u) => ({
    rotations: { tail: [0, 0.4 + (u >= 0.5 ? Math.PI * 2 : 0), 0] },
    rootOffset: u > 0 ? [0, 0.2, 0] : undefined,
    scales: u > 0 ? { tailTip: [1, 0.15, 1] } : undefined,
  }), { fps: 20 });
  const [positions, quaternions, scales] = branch.tracks;
  assert.equal(positions.name, 'hips.position');
  assert.equal(quaternions.times.length, 17);
  assert.equal(scales.name, 'tailTip.scale');
  assert.deepEqual(Array.from(positions.values.slice(0, 3)), [0, 1, 0]);
  assert.deepEqual(Array.from(scales.values.slice(0, 3)), [1, 1, 1]);
  close(positions.values[4], 1.2);
  close(scales.values[4], 0.15);
  for (const track of branch.tracks) {
    const size = track.getValueSize();
    assert.deepEqual(track.values.slice(0, size), track.values.slice(-size));
  }
  const spin = bakeClip30fps('FullTurn', 1, bones, (u) => ({ rotations: { tail: [0, u * Math.PI * 2, 0] } }));
  const spinValues = spin.tracks[0].values;
  const a = new THREE.Quaternion(), b = new THREE.Quaternion();
  for (let i = 4; i < spinValues.length; i += 4) {
    assert.ok(a.fromArray(spinValues, i - 4).dot(b.fromArray(spinValues, i)) > 0);
  }
  close(a.fromArray(spinValues, 0).dot(b), -1); // Opposite encodings of the same orientation.
  const times = bakeClip30fps('FractionalDuration', 1.15, bones, (u) => ({ rootOffset: [u, 0, 0] })).tracks[0].times;
  assert.equal(times.length, 36);
  for (let i = 0; i <= 34; i++) assert.equal(times[i], Math.fround(i / 30));
  assert.equal(times[35], Math.fround(1.15));
  const integral = bakeClip30fps('IntegralFrameCount', 0.14, bones, () => ({ rootOffset: [0, 0, 0] }), { fps: 100 });
  assert.equal(integral.tracks[0].times.length, 15); // The floating-point product is slightly above 14.

  const bow = bakeClip30fps('Bow', 1, bones, (u) => ({ rotations: { tail: [u, 0, 0] } }), { loop: false });
  const bowTrack = bow.tracks.find((track) => track.name === 'tail.quaternion')!;
  assert.equal(bowTrack.times[bowTrack.times.length - 1], 1);
  close(bowTrack.values[bowTrack.values.length - 4], Math.sin(0.5));
  assert.equal(extractQaArtifacts({ root: bones.hips, bones, animations: [bow] }).rigMetadata.animations?.[0].loop, false);

  assert.throws(() => bakeClip30fps('Bad', 0, bones, () => ({})), /positive/);
  assert.throws(() => bakeClip30fps('Bad', 1, bones, () => ({ rotations: { unknown: [0, 0, 0] } })), /Unknown rotation bone/);
}

{
  const { root, bones, skin } = tailAsset();
  const dip = bakeClip30fps('FloorDip', 1, bones, (u) => {
    const eased = Math.sin(Math.PI * u) ** 2;
    return { rootOffset: [0, -0.3 * eased, 0], rotations: { tail: [-Math.PI / 2 * eased, 0, 0] } };
  });
  const scene = new THREE.Scene();
  scene.position.y = 100;
  scene.add(root);
  root.userData.animations = [dip];
  root.userData.self = root.userData;

  const preview = new THREE.AnimationMixer(root);
  preview.clipAction(dip).play();
  preview.setTime(0.23);
  scene.updateMatrixWorld(true);
  skin.computeBoundingBox();
  const state = () => ({
    hip: bones.hips.position.toArray(), tail: bones.tail.rotation.toArray(),
    boneWorld: bones.tailTip.matrixWorld.toArray(), bindInverse: skin.bindMatrixInverse.toArray(),
    box: skin.boundingBox!.min.toArray(), mixerTime: preview.time,
  });
  const before = state();
  const artifacts = extractQaArtifacts({ root, bones, motionMode: 'free' });
  assert.deepEqual(state(), before);
  assert.equal(root.parent, scene);
  assert.equal(root.userData.self, root.userData);
  assert.deepEqual(Object.keys(artifacts.tris), ['body', 'body_2']);
  assert.equal(artifacts.tris.body.length, 12 * 9);
  assert.equal(artifacts.tris.body_2.length, 12 * 9);

  const parts = normalizeParts(JSON.parse(JSON.stringify(artifacts.tris)));
  close(boundsOf(flatten(parts)).min[1], 0);
  assert.ok(qaGates(parts).gates.every((gate) => gate.pass));
  const stats = assetStats(parts, JSON.parse(JSON.stringify(artifacts.meshMeta)));
  assert.deepEqual([stats.triangles, stats.meshes, stats.bones, stats.materials, stats.drawCalls], [24, 2, 3, 2, 2]);
  assert.deepEqual(stats.textures.map(({ name, w, h }) => [name, w, h]), [['tail_atlas', 8, 4]]);
  assert.equal(artifacts.meshMeta.parts?.body.bone, 'hips');

  const rig = JSON.parse(JSON.stringify(artifacts.rigMetadata)) as typeof artifacts.rigMetadata;
  assert.deepEqual(rig.rig?.hierarchy, [{ parent: 'hips', child: 'tail' }, { parent: 'tail', child: 'tailTip' }]);
  assert.deepEqual(rig.rig?.restLocalPositions?.hips, [0, 1, 0]);
  assert.equal(rig.animations?.[0].loop, true);
  assert.equal(rig.animations?.[0].tracks?.[0].name, 'hips.position');
  close(rig.qa!.clipMinY!, -0.4);
  const gates = rigGates(rig, { kind: 'creature' }).gates;
  assert.deepEqual(gates.filter((gate) => !gate.pass).map((gate) => gate.gate), ['R6 floor clearance']);

  // A one-shot ending at its deepest point and a narrow dip between default frames must both be sampled.
  const end = new THREE.AnimationClip('EndDip', 1, [new THREE.VectorKeyframeTrack('hips.position', [0, 1], [0, 1, 0, 0, 0.25, 0])]);
  const fast = new THREE.AnimationClip('FastDip', 1, [
    new THREE.VectorKeyframeTrack('hips.position', [0, 0.123, 0.124, 1], [0, 1, 0, 0, 0.1, 0, 0, 1, 0, 0, 1, 0]),
  ]);
  const endRig = extractQaArtifacts({ root, bones, animations: [end] }).rigMetadata;
  assert.equal(endRig.animations?.[0].loop, false);
  close(endRig.qa!.clipMinY!, -0.75);
  close(extractQaArtifacts({ root, bones, animations: [dip, end, fast] }).rigMetadata.qa!.clipMinY!, -0.9);
  assert.equal(extractQaArtifacts({ root, bones, animations: [] }).rigMetadata.qa?.clipMinY, undefined);
  const invalid = new THREE.AnimationClip('Invalid', 1, [new THREE.VectorKeyframeTrack('body.position', [0], [0, 0, 0])]);
  assert.throws(() => extractQaArtifacts({ root, bones, animations: [invalid] }), /unique rig bone/);
  assert.deepEqual(state(), before);
}

{
  const { root, bones } = tailAsset();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, -10, 0, 1, -10, 0, 0, -10, 1,
    0, 2, 0, 1, 2, 0, 0, 2, 1,
    0, -20, 0, 1, -20, 0, 0, -20, 1,
  ], 3));
  geometry.addGroup(0, 6, 0);
  geometry.addGroup(6, 3, 1);
  geometry.setDrawRange(3, 6);
  const sheet = new THREE.Mesh(geometry, [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial({ visible: false })]);
  sheet.name = 'sheet';
  root.add(sheet);
  const { tris } = extractQaArtifacts({ root, bones });
  assert.deepEqual(tris.sheet, [0, 1, 0, 1, 1, 0, 0, 1, 1]);
}

console.log('SKINNED RIG OK (folded weights, YXZ motion, loop wrap, posed QA and metadata contracts)');
