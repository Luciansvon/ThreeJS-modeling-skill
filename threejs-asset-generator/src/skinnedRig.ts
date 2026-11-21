import * as THREE from 'three';
import type { Meta } from '../scripts/budget';
import type { RigMeta } from '../scripts/rigcheck';
import type { Tris, V3 } from './tri';

type Triplet = Readonly<V3>;
type Bones = Readonly<Record<string, THREE.Bone>>;

export interface SkinBoneSpec {
  name: string;
  parent?: string;
  worldPos: Triplet;
}

// Generated bones start with identity rotation and scale. Keep their authored
// local positions out of userData so they do not become GLB metadata.
const restPosition = Symbol('authoredRestPosition');
type AuthoredBone = THREE.Bone & { [restPosition]?: THREE.Vector3 };
const authoredPosition = (bone: THREE.Bone) => (bone as AuthoredBone)[restPosition];
const defaultFps = 30;

function readTriplet(value: Triplet, label: string): Triplet {
  const [x, y, z] = value;
  if (value.length !== 3 || ![x, y, z].every(Number.isFinite)) throw new Error(`${label} needs three finite values`);
  return [x, y, z];
}

function checkBoneName(name: string) {
  if (!name || THREE.PropertyBinding.sanitizeNodeName(name) !== name) {
    throw new Error(`Bone name "${name}" is not a valid animation target`);
  }
}

/** Build a single tree with identity rest rotations from parents-first, asset-space joints. */
export function buildBoneHierarchy(specs: readonly SkinBoneSpec[]) {
  const bones: Record<string, THREE.Bone> = Object.create(null);
  const worldPositions = new Map<string, THREE.Vector3>();
  const boneOrder: string[] = [];
  let rootBone: THREE.Bone | undefined;

  for (const { name, parent, worldPos } of specs) {
    checkBoneName(name);
    if (bones[name]) throw new Error(`Duplicate bone "${name}"`);
    if (parent !== undefined && !bones[parent]) throw new Error(`Parent "${parent}" must be listed before "${name}"`);
    if (parent === undefined && rootBone) throw new Error('Expected a single root bone');

    const bone: AuthoredBone = new THREE.Bone();
    const world = new THREE.Vector3(...readTriplet(worldPos, `${name}.worldPos`));
    bone.name = name;
    bone.position.copy(world);
    if (parent === undefined) rootBone = bone;
    else {
      bone.position.sub(worldPositions.get(parent)!);
      bones[parent].add(bone);
    }
    bone[restPosition] = bone.position.clone();
    bones[name] = bone;
    boneOrder.push(name);
    worldPositions.set(name, world);
  }

  if (!rootBone) throw new Error('Expected a root bone');
  rootBone.updateMatrixWorld(true);
  return { rootBone, bones, boneOrder };
}

export interface CurveSkinSamples {
  /** One curve parameter per position attribute entry, stored when that vertex is authored. */
  vertexT: ArrayLike<number>;
  /** One strictly increasing curve parameter per chainBoneNames entry. */
  boneT: ArrayLike<number>;
}

function checkCurveT(t: number, label: string) {
  if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error(`${label} must be in [0, 1]`);
}

/** Set normalized weights for the two neighboring bones along the authored curve. */
export function attachCurveSkinWeights(
  geo: THREE.BufferGeometry,
  boneOrder: readonly string[],
  chainBoneNames: readonly string[],
  { vertexT, boneT }: CurveSkinSamples,
) {
  const position = geo.getAttribute('position');
  if (!position || vertexT.length !== position.count) throw new Error('vertexT must match the position vertex count');
  if (!chainBoneNames.length || chainBoneNames.length !== boneT.length) throw new Error('boneT must match a nonempty chain');
  const boneIndices = new Map(boneOrder.map((name, index) => [name, index]));
  if (boneIndices.size !== boneOrder.length || boneOrder.length > 65_536) throw new Error('boneOrder must contain unique names and fit Uint16 indices');
  if (new Set(chainBoneNames).size !== chainBoneNames.length) throw new Error('Chain bone names must be unique');

  const chain = chainBoneNames.map((name, index) => {
    const boneIndex = boneIndices.get(name);
    if (boneIndex === undefined) throw new Error(`Chain bone "${name}" is missing from boneOrder`);
    const t = boneT[index];
    checkCurveT(t, `boneT[${index}]`);
    if (index > 0 && t <= boneT[index - 1]) throw new Error('boneT must be strictly increasing');
    return boneIndex;
  });

  const indices = new Uint16Array(position.count * 4);
  const weights = new Float32Array(position.count * 4);
  const last = chain.length - 1;
  for (let vertex = 0; vertex < position.count; vertex++) {
    const t = vertexT[vertex];
    checkCurveT(t, `vertexT[${vertex}]`);
    const offset = vertex * 4;
    if (t <= boneT[0] || t >= boneT[last]) {
      indices[offset] = chain[t <= boneT[0] ? 0 : last];
      weights[offset] = 1;
      continue;
    }

    let lower = 0, upper = last;
    while (upper - lower > 1) {
      const middle = Math.floor((lower + upper) / 2);
      if (t < boneT[middle]) upper = middle;
      else lower = middle;
    }
    const mix = (t - boneT[lower]) / (boneT[upper] - boneT[lower]);
    indices[offset] = chain[lower];
    indices[offset + 1] = chain[upper];
    weights[offset] = 1 - mix;
    weights[offset + 1] = mix;
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  return geo;
}

type PoseChannels = Readonly<Record<string, Triplet | undefined>>;
export interface SkinPose {
  rotations?: PoseChannels;
  scales?: PoseChannels;
  rootOffset?: Triplet;
}

export interface SkinClipOptions {
  fps?: number;
  eulerOrder?: THREE.EulerOrder;
  loop?: boolean;
}

function frameTimes(duration: number, fps: number): number[] {
  const frameCount = Math.ceil(duration * fps);
  const end = Math.fround(duration);
  if (!(end > 0 && Number.isFinite(end) && fps > 0) || !Number.isSafeInteger(frameCount) || frameCount >= 0xffffffff) {
    throw new Error('Clip duration and fps must give a positive, finite sampling interval');
  }

  const times = [0];
  let last = 0;
  for (let frame = 1; frame < frameCount; frame++) {
    const time = frame / fps;
    const key = Math.fround(time); // Three.js stores key times as Float32.
    if (key >= end) break;
    if (key <= last) throw new Error('Sampling interval is too small for Three.js timestamps');
    times.push(time);
    last = key;
  }
  times.push(duration);
  return times;
}

function copyPoseChannels(channels: PoseChannels | undefined, bones: Bones, label: string): PoseChannels {
  const values: Record<string, Triplet | undefined> = Object.create(null);
  for (const [name, value] of Object.entries(channels ?? {})) {
    if (!Object.hasOwn(bones, name)) throw new Error(`Unknown ${label} bone "${name}"`);
    if (value !== undefined) values[name] = readTriplet(value, `${name}.${label}`);
  }
  return values;
}

/** Bake local Euler deltas, local scales and a rest-relative root offset into a looping (or one-shot with loop: false) clip. */
export function bakeClip30fps(
  name: string,
  duration: number,
  bones: Bones,
  evalPose: (u: number) => SkinPose,
  { fps = defaultFps, eulerOrder = 'YXZ', loop = true }: SkinClipOptions = {},
) {
  if (!name.trim()) throw new Error('Expected a clip name');
  const times = frameTimes(duration, fps);
  if (!['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'].includes(eulerOrder)) throw new Error(`Invalid Euler order "${eulerOrder}"`);
  for (const [boneName, bone] of Object.entries(bones)) {
    checkBoneName(boneName);
    if (bone.name !== boneName) throw new Error(`Bone key "${boneName}" must match the bone's name`);
  }

  const samplePose = (u: number) => {
    const pose = evalPose(u);
    return {
      rootOffset: pose.rootOffset && readTriplet(pose.rootOffset, 'rootOffset'),
      rotations: copyPoseChannels(pose.rotations, bones, 'rotation'),
      scales: copyPoseChannels(pose.scales, bones, 'scale'),
    };
  };
  const poses = times.slice(0, -1).map((time) => samplePose(time / duration));
  poses.push(loop ? poses[0] : samplePose(1));

  const tracks: THREE.KeyframeTrack[] = [];
  if (poses.some((pose) => pose.rootOffset)) {
    const pivots = new Set<THREE.Object3D>(Object.values(bones));
    const roots = [...pivots].filter((bone) => !bone.parent || !pivots.has(bone.parent)) as THREE.Bone[];
    if (roots.length !== 1) throw new Error('rootOffset needs a single root bone');
    const root = roots[0];
    const rest = authoredPosition(root) ?? root.position;
    const values = poses.flatMap(({ rootOffset: offset = [0, 0, 0] }) => [rest.x + offset[0], rest.y + offset[1], rest.z + offset[2]]);
    tracks.push(new THREE.VectorKeyframeTrack(`${root.name}.position`, times, values));
  }

  const euler = new THREE.Euler(0, 0, 0, eulerOrder);
  const delta = new THREE.Quaternion();
  const quaternion = new THREE.Quaternion();
  const previous = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  for (const [boneName, bone] of Object.entries(bones)) {
    const authored = authoredPosition(bone) !== undefined;
    if (poses.some((pose) => pose.rotations[boneName] !== undefined)) {
      const rest = authored ? identity : bone.quaternion;
      const values: number[] = [];
      for (const { rotations } of poses) {
        quaternion.copy(rest);
        const rotation = rotations[boneName];
        if (rotation) quaternion.multiply(delta.setFromEuler(euler.set(...rotation)));
        if (values.length && previous.dot(quaternion) < 0) quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
        values.push(...quaternion.toArray());
        previous.copy(quaternion);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
    }
    if (poses.some((pose) => pose.scales[boneName] !== undefined)) {
      const rest = authored ? [1, 1, 1] : bone.scale.toArray();
      const values = poses.flatMap((pose) => pose.scales[boneName] ?? rest);
      tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.scale`, times, values));
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

export interface BuiltSkinRig {
  root: THREE.Object3D;
  bones: Bones;
  animations?: readonly THREE.AnimationClip[];
  motionMode?: NonNullable<RigMeta['qa']>['motionMode'];
}

/** Copy only the scene properties needed to evaluate geometry. Geometry and materials are read-only. */
function copyQaScene(root: THREE.Object3D) {
  const nodes = new Map<THREE.Object3D, THREE.Object3D>();
  function copyNode(source: THREE.Object3D): THREE.Object3D {
    const mesh = source as THREE.Mesh;
    const bone = source as THREE.Bone;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.BatchedMesh).isBatchedMesh) {
      throw new Error(`QA needs a triangle Mesh or SkinnedMesh, found ${mesh.type} "${mesh.name}"`);
    }

    let node: THREE.Object3D;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) node = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
    else if (mesh.isMesh) node = new THREE.Mesh(mesh.geometry, mesh.material);
    else if (bone.isBone) node = new THREE.Bone();
    else node = new THREE.Object3D();
    if (mesh.morphTargetInfluences) (node as THREE.Mesh).morphTargetInfluences = mesh.morphTargetInfluences.slice();
    node.name = source.name;
    node.visible = source.visible;
    const authored = authoredPosition(bone);
    node.position.copy(authored ?? source.position);
    if (!authored) {
      node.quaternion.copy(source.quaternion);
      node.scale.copy(source.scale);
      node.matrix.copy(source.matrix);
      node.matrixWorld.copy(source.matrixWorld);
      node.matrixAutoUpdate = source.matrixAutoUpdate;
      node.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
    }
    nodes.set(source, node);
    for (const child of source.children) node.add(copyNode(child));
    return node;
  }

  const copy = copyNode(root);
  for (const [source, node] of nodes) {
    const skin = source as THREE.SkinnedMesh;
    if (!skin.isSkinnedMesh) continue;
    if (!skin.skeleton || !skin.geometry.hasAttribute('skinIndex') || !skin.geometry.hasAttribute('skinWeight')) {
      throw new Error(`SkinnedMesh "${skin.name}" must have a bound skeleton and skin attributes`);
    }
    const bones = skin.skeleton.bones.map((sourceBone) => {
      const bone = nodes.get(sourceBone) as THREE.Bone | undefined;
      if (!bone?.isBone) throw new Error(`All bones for "${skin.name}" must be inside the asset root`);
      return bone;
    });
    const clone = node as THREE.SkinnedMesh;
    clone.bindMode = skin.bindMode;
    clone.bind(new THREE.Skeleton(bones, skin.skeleton.boneInverses), skin.bindMatrix);
  }
  return { root: copy, nodes };
}

interface MeshPart {
  name: string;
  mesh: THREE.Mesh;
  material: THREE.Material;
  bone?: string;
  start: number;
  end: number;
}

function collectMeshParts(root: THREE.Object3D, bones: Map<THREE.Object3D, string>): MeshPart[] {
  const parts: MeshPart[] = [];
  const names = new Set(['__proto__']);
  root.traverseVisible((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.hasAttribute('position')) return;
    const { geometry, material } = mesh;
    const count = geometry.index?.count ?? geometry.getAttribute('position').count;
    const range = geometry.drawRange;
    const groups = Array.isArray(material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
    let parent = mesh.parent;
    while (parent && !bones.has(parent)) parent = parent.parent;
    for (const group of groups) {
      const partMaterial = Array.isArray(material) ? material[group.materialIndex ?? 0] : material;
      if (!partMaterial?.visible) continue;
      const start = Math.max(group.start, range.start);
      const stop = Math.min(count, group.start + group.count, range.start + range.count);
      const end = start + Math.floor((stop - start) / 3) * 3;
      if (end <= start) continue;
      const base = mesh.name || `mesh_${parts.length + 1}`;
      let name = base;
      for (let suffix = 2; names.has(name); suffix++) name = `${base}_${suffix}`;
      names.add(name);
      parts.push({ name, mesh, material: partMaterial, bone: parent ? bones.get(parent) : undefined, start, end });
    }
  });
  return parts;
}

function meshMetadata(parts: readonly MeshPart[], pivotNames: string[]): Meta {
  const materials = new Map<THREE.Material, string>();
  const textures = new Map<THREE.Texture, NonNullable<Meta['textures']>[number]>();
  const described = parts.map(({ name, material, bone }) => {
    if (!materials.has(material)) {
      materials.set(material, `${materials.size + 1}:${material.name || material.type}`);
      for (const property of Object.values(material)) {
        const texture = property as THREE.Texture | undefined;
        if (!texture?.isTexture || textures.has(texture)) continue;
        const image = texture.image;
        const width = image?.videoWidth || image?.naturalWidth || image?.width;
        const height = image?.videoHeight || image?.naturalHeight || image?.height;
        if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) continue;
        textures.set(texture, {
          name: texture.name || `texture_${textures.size + 1}`, width, height,
          mips: texture.generateMipmaps || (texture.mipmaps?.length ?? 0) > 1,
        });
      }
    }
    return [name, { material: materials.get(material)!, ...(bone === undefined ? {} : { bone }) }] as const;
  });
  return { parts: Object.fromEntries(described), bones: pivotNames.length, textures: [...textures.values()] };
}

function visitVertices({ mesh, start, end }: MeshPart, visitor: (vertex: THREE.Vector3) => void) {
  const vertex = new THREE.Vector3();
  const index = mesh.geometry.index;
  for (let i = start; i < end; i++) {
    mesh.getVertexPosition(index ? index.getX(i) : i, vertex).applyMatrix4(mesh.matrixWorld);
    visitor(vertex);
  }
}

function samplingTimes(clip: THREE.AnimationClip) {
  const times = new Set(frameTimes(clip.duration, defaultFps).slice(0, -1).map(Math.fround));
  times.add(clip.duration);
  for (const track of clip.tracks) {
    for (const time of track.times) if (time > 0 && time < clip.duration) times.add(time);
  }
  return [...times].sort((a, b) => a - b);
}

function hasClosedTrack(track: THREE.KeyframeTrack) {
  const width = track.getValueSize();
  const first = track.values.slice(0, width);
  const last = track.values.slice(-width);
  return first.every((value, i) => value === last[i])
    || (track.ValueTypeName === 'quaternion' && first.every((value, i) => -value === last[i]));
}

/** Produce JSON-ready QA/stats/rig-check inputs. Sample the detached asset in export space. */
export function extractQaArtifacts(built: BuiltSkinRig): { tris: Record<string, Tris>; meshMeta: Meta; rigMetadata: RigMeta } {
  const { root, nodes } = copyQaScene(built.root);
  const bones = new Map<THREE.Object3D, string>();
  const byName = new Map<string, THREE.Object3D>();
  for (const [name, original] of Object.entries(built.bones)) {
    const bone = nodes.get(original) as THREE.Bone | undefined;
    if (!bone?.isBone || bone.name !== name) throw new Error(`Bone "${name}" must match a bone under the asset root`);
    bones.set(bone, name);
    byName.set(name, bone);
  }
  const pivotNames = [...byName.keys()];
  const hierarchy = [...bones].flatMap(([bone, child]) => {
    const parent = bone.parent && bones.get(bone.parent);
    return parent ? [{ parent, child }] : [];
  });
  const restLocalPositions = Object.fromEntries([...bones].map(([bone, name]) => [name, bone.position.toArray()]));
  const clips: readonly THREE.AnimationClip[] = built.animations ?? built.root.userData.animations ?? built.root.animations;
  const parts = collectMeshParts(root, bones);
  if (!parts.length) throw new Error('Asset has no visible triangle meshes');

  root.updateMatrixWorld(true);
  const tris = Object.fromEntries(parts.map((part) => {
    const vertices: Tris = [];
    visitVertices(part, (vertex) => vertices.push(vertex.x, vertex.y, vertex.z));
    return [part.name, vertices];
  }));
  const qa: NonNullable<RigMeta['qa']> = { motionMode: built.motionMode ?? 'in-place' };
  const mixer = new THREE.AnimationMixer(root);
  let clipMinY = Infinity;
  const measure = (vertex: THREE.Vector3) => { clipMinY = Math.min(clipMinY, vertex.y); };
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const { nodeName: target, objectName, propertyName, propertyIndex } = THREE.PropertyBinding.parseTrackName(track.name);
      if (!target || !byName.has(target) || THREE.PropertyBinding.findNode(root, target) !== byName.get(target)
        || objectName !== undefined || propertyIndex !== undefined || !['position', 'quaternion', 'scale'].includes(propertyName)) {
        throw new Error(`Track "${track.name}" must animate position, quaternion or scale on a unique rig bone by name`);
      }
    }
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (const time of samplingTimes(clip)) {
      mixer.setTime(time);
      root.updateMatrixWorld(true);
      for (const part of parts) visitVertices(part, measure);
    }
    action.stop();
  }
  if (clips.length) {
    if (!Number.isFinite(clipMinY)) throw new Error('Could not measure a finite clipMinY from the posed geometry');
    qa.clipMinY = clipMinY;
  }

  return {
    tris,
    meshMeta: meshMetadata(parts, pivotNames),
    rigMetadata: {
      rig: { rootNode: root.name || undefined, pivotNames, hierarchy, restLocalPositions },
      animations: clips.map((clip) => ({
        name: clip.name,
        durationSeconds: clip.duration,
        loop: clip.tracks.every(hasClosedTrack),
        tracks: clip.tracks.map((track) => ({ name: track.name, times: Array.from(track.times), values: Array.from(track.values) })),
      })),
      qa,
    },
  };
}
