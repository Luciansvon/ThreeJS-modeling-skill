// scripts/clip-motion.ts: per-clip track binding and playback motion sampler. Accepts injected THREE so both Node CLIs and browser studio share it.
import type * as THREE from 'three';

export const MOTION_PROPERTIES = ['position', 'quaternion', 'scale', 'morphTargetInfluences'] as const;
export type MotionProperty = (typeof MOTION_PROPERTIES)[number];
export const DEFAULT_MOTION_THRESHOLDS = { angle: 1e-3, distance: 1e-4 };

export type NodeMotion = {
  node: string;
  property: MotionProperty;
  change: number;
  at: number;
  restChange: number;
};

export type ClipMotion = {
  clip: string;
  duration: number;
  times: number[];
  tracks: number;
  unsupported: string[];
  unbound: string[];
  moving: NodeMotion[];
  static: boolean;
  tPoseNotice?: string;
};

export type ClipMotionOptions = {
  samples?: number;
  thresholds?: { angle?: number; distance?: number };
};

type RestSnapshot = {
  node: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  morphs?: number[];
};

type SampleValue = THREE.Vector3 | THREE.Quaternion | number[];

const SUPPORTED_SET = new Set<string>(MOTION_PROPERTIES);
const LIMB_NAME_RE = /(upper.?arm|fore.?arm|shoulder|arm|wing|thigh|leg)[_.-]?(l|r|left|right)?$/i;
const REST_CLIP_NAME_RE = /refpose|tpose|t_pose|bind/i;

function buildSampleTimes(duration: number, clip: THREE.AnimationClip, samples: number): number[] {
  if (!(Number.isFinite(duration) && duration > 0)) return [0];
  const raw: number[] = [0];
  const steps = Math.max(2, Math.floor(samples));
  for (let i = 1; i < steps - 1; i++) raw.push((duration * i) / (steps - 1));
  raw.push(duration);
  for (const track of clip.tracks) {
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i];
      if (Number.isFinite(t) && t > 0 && t < duration) raw.push(t);
    }
  }
  raw.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const t of raw) {
    if (!unique.length || t - unique[unique.length - 1] > 1e-6) unique.push(t);
  }
  if (unique[unique.length - 1] !== duration) unique[unique.length - 1] = duration;
  return unique;
}

function readValue(node: THREE.Object3D, prop: MotionProperty): SampleValue {
  if (prop === 'quaternion') return node.quaternion.clone();
  if (prop === 'position') return node.position.clone();
  if (prop === 'scale') return node.scale.clone();
  const influences = (node as THREE.Mesh).morphTargetInfluences;
  return Array.isArray(influences) ? influences.slice() : [];
}

function measureDiff(prop: MotionProperty, base: SampleValue, current: SampleValue): number {
  if (prop === 'quaternion') {
    const dot = Math.min(1, Math.abs((base as THREE.Quaternion).dot(current as THREE.Quaternion)));
    return 2 * Math.acos(dot);
  }
  if (prop === 'position' || prop === 'scale') {
    return (base as THREE.Vector3).distanceTo(current as THREE.Vector3);
  }
  const a = base as number[], b = current as number[];
  const len = Math.max(a.length, b.length);
  let max = 0;
  for (let i = 0; i < len; i++) max = Math.max(max, Math.abs((b[i] ?? 0) - (a[i] ?? 0)));
  return max;
}

function measureRestDiff(prop: MotionProperty, rest: RestSnapshot, current: SampleValue): number {
  if (prop === 'quaternion') return measureDiff(prop, rest.quaternion, current);
  if (prop === 'position') return measureDiff(prop, rest.position, current);
  if (prop === 'scale') return measureDiff(prop, rest.scale, current);
  return measureDiff(prop, rest.morphs ?? [], current);
}

/** Sample each AnimationClip independently against a fresh rest pose and report track binding plus per-pivot motion. */
export function clipMotion(
  THREE: typeof import('three'),
  root: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
  opts: ClipMotionOptions = {},
): ClipMotion[] {
  const samples = opts.samples ?? 9;
  const angleThresh = opts.thresholds?.angle ?? DEFAULT_MOTION_THRESHOLDS.angle;
  const distThresh = opts.thresholds?.distance ?? DEFAULT_MOTION_THRESHOLDS.distance;

  const counts = new Map<string, number>();
  const limbNodes: string[] = [];
  root.traverse((obj) => {
    if (!obj.name) return;
    counts.set(obj.name, (counts.get(obj.name) ?? 0) + 1);
    if (LIMB_NAME_RE.test(obj.name)) limbNodes.push(obj.name);
  });

  const results: ClipMotion[] = [];
  for (const clip of clips) {
    const clipName = clip.name || '(unnamed)';
    const duration = Number.isFinite(clip.duration) && clip.duration >= 0 ? clip.duration : 0;
    const times = buildSampleTimes(duration, clip, samples);
    const unsupported: string[] = [];
    const unbound: string[] = [];
    const targets = new Map<string, { node: THREE.Object3D; label: string; prop: MotionProperty }>();

    for (const track of clip.tracks) {
      let parsed: ReturnType<typeof THREE.PropertyBinding.parseTrackName>;
      try {
        parsed = THREE.PropertyBinding.parseTrackName(track.name);
      } catch {
        unbound.push(`${track.name} (unparseable track name)`);
        continue;
      }

      const { nodeName, objectName, objectIndex, propertyName, propertyIndex } = parsed;
      if (!SUPPORTED_SET.has(propertyName)) {
        unsupported.push(`${track.name} (unsupported property "${propertyName}")`);
        continue;
      }
      if (objectName !== undefined && objectName !== 'bones') {
        unsupported.push(`${track.name} (unsupported sub-object "${objectName}")`);
        continue;
      }
      if (propertyIndex !== undefined && propertyName !== 'morphTargetInfluences') {
        unsupported.push(`${track.name} (scalar channel "${propertyName}[${propertyIndex}]" is not exported as a glTF track)`);
        continue;
      }

      const prop = propertyName as MotionProperty;
      let targetNode: THREE.Object3D | null | undefined;
      let label: string;

      if (objectName === 'bones') {
        if (nodeName && (counts.get(nodeName) ?? 0) > 1) {
          unbound.push(`${track.name} (ambiguous node name "${nodeName}": ${counts.get(nodeName)} matches)`);
          continue;
        }
        const meshNode = THREE.PropertyBinding.findNode(root, nodeName) as THREE.SkinnedMesh | null;
        if (!meshNode?.isSkinnedMesh || !objectIndex) {
          unbound.push(`${track.name} (SkinnedMesh "${nodeName || '(root)'}" or bone "${objectIndex}" not found)`);
          continue;
        }
        const bone = meshNode.skeleton?.getBoneByName(objectIndex);
        if (!bone) {
          unbound.push(`${track.name} (bone "${objectIndex}" not found on skeleton)`);
          continue;
        }
        if ((counts.get(bone.name) ?? 0) > 1) {
          unbound.push(`${track.name} (ambiguous bone name "${bone.name}": ${counts.get(bone.name)} matches)`);
          continue;
        }
        targetNode = bone;
        label = bone.name || objectIndex;
      } else {
        if (!nodeName || nodeName === '.') {
          unbound.push(`${track.name} (missing node name)`);
          continue;
        }
        const matches = counts.get(nodeName) ?? 0;
        if (matches > 1) {
          unbound.push(`${track.name} (ambiguous node name "${nodeName}": ${matches} matches)`);
          continue;
        }
        targetNode = THREE.PropertyBinding.findNode(root, nodeName);
        if (!targetNode) {
          unbound.push(`${track.name} (node "${nodeName}" not found under root)`);
          continue;
        }
        label = targetNode.name || nodeName;
      }

      if (prop === 'morphTargetInfluences' && !Array.isArray((targetNode as THREE.Mesh).morphTargetInfluences)) {
        unbound.push(`${track.name} (node "${label}" has no morphTargetInfluences)`);
        continue;
      }

      const key = `${targetNode.uuid}|${prop}`;
      if (!targets.has(key)) targets.set(key, { node: targetNode, label, prop });
    }

    const snapshots = new Map<THREE.Object3D, RestSnapshot>();
    for (const { node } of targets.values()) {
      if (snapshots.has(node)) continue;
      const morphs = (node as THREE.Mesh).morphTargetInfluences;
      snapshots.set(node, {
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        morphs: Array.isArray(morphs) ? morphs.slice() : undefined,
      });
    }

    const firstValues = new Map<string, SampleValue>();
    const maxMotion = new Map<string, { change: number; at: number; restChange: number }>();
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    try {
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        mixer.setTime(t);
        root.updateMatrixWorld(true);
        for (const [key, { node, prop }] of targets) {
          const val = readValue(node, prop);
          const rest = snapshots.get(node)!;
          const restDelta = measureRestDiff(prop, rest, val);
          if (i === 0) {
            firstValues.set(key, val);
            maxMotion.set(key, { change: 0, at: t, restChange: Number.isFinite(restDelta) ? restDelta : 0 });
            continue;
          }
          const delta = measureDiff(prop, firstValues.get(key)!, val);
          const prev = maxMotion.get(key)!;
          if (Number.isFinite(delta) && delta > prev.change) {
            prev.change = delta;
            prev.at = t;
          }
          if (Number.isFinite(restDelta) && restDelta > prev.restChange) {
            prev.restChange = restDelta;
          }
        }
      }
    } finally {
      action.stop();
      mixer.uncacheClip(clip);
      mixer.uncacheRoot(root);
      for (const snap of snapshots.values()) {
        snap.node.position.copy(snap.position);
        snap.node.quaternion.copy(snap.quaternion);
        snap.node.scale.copy(snap.scale);
        if (snap.morphs && Array.isArray((snap.node as THREE.Mesh).morphTargetInfluences)) {
          const dst = (snap.node as THREE.Mesh).morphTargetInfluences!;
          for (let k = 0; k < snap.morphs.length; k++) dst[k] = snap.morphs[k];
        }
      }
      root.updateMatrixWorld(true);
    }

    const moving: NodeMotion[] = [];
    for (const [key, { label, prop }] of targets) {
      const stats = maxMotion.get(key) ?? { change: 0, at: 0, restChange: 0 };
      const threshold = prop === 'quaternion' ? angleThresh : distThresh;
      if (stats.change > threshold) {
        moving.push({
          node: label,
          property: prop,
          change: stats.change,
          at: stats.at,
          restChange: stats.restChange,
        });
      }
    }
    moving.sort((a, b) => b.change - a.change);

    let tPoseNotice: string | undefined;
    if (!REST_CLIP_NAME_RE.test(clipName) && moving.length > 0) {
      const maxRest = Math.max(...moving.map((m) => m.restChange));
      if (maxRest < 0.08) {
        tPoseNotice = `All moving channels stay near the rest pose (max ${maxRest.toFixed(4)}); inspect visually to verify the clip leaves any T-pose.`;
      } else if (limbNodes.length >= 2) {
        const limbSet = new Set(limbNodes);
        const limbRotMoves = moving.some((m) => limbSet.has(m.node) && m.property === 'quaternion' && m.restChange >= 0.08);
        if (!limbRotMoves) {
          tPoseNotice = 'Arm/shoulder/leg pivots stay near rest pose (< 0.08 rad); inspect visually to verify limbs leave any T-pose.';
        }
      }
    }

    results.push({
      clip: clipName,
      duration,
      times,
      tracks: clip.tracks.length,
      unsupported,
      unbound,
      moving,
      static: moving.length === 0,
      ...(tPoseNotice ? { tPoseNotice } : {}),
    });
  }

  return results;
}
