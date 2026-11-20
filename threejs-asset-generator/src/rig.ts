// src/rig.ts
import * as THREE from 'three';
import { PartBuilder } from './lowpoly';
import type { V3, Tris } from './tri';

export interface BoneDef { name: string; pivot: V3; parent?: string }          // pivot in asset space; parents first

export const mirrorBone = (b: BoneDef, name: string, parent = b.parent): BoneDef =>
  ({ name, pivot: [-b.pivot[0], b.pivot[1], b.pivot[2]], parent });

export class RigBuilder {
  private builders = new Map<string, PartBuilder>();                            // insertion order: deterministic
  constructor(private bones: BoneDef[]) {
    const seen = new Set<string>();
    for (const b of bones) {
      if (seen.has(b.name)) throw new Error(`RigBuilder: duplicate bone "${b.name}"`);
      if (b.parent && !seen.has(b.parent)) throw new Error(`RigBuilder: parent "${b.parent}" must be listed before "${b.name}"`);
      seen.add(b.name);
    }
  }
  private pivot(bone: string): V3 {
    const b = this.bones.find((x) => x.name === bone);
    if (!b) throw new Error(`RigBuilder: unknown bone "${bone}"`);
    return b.pivot;
  }
  private part(bone: string, material: string) {
    const key = `${bone}|${material}`;
    if (!this.builders.has(key)) this.builders.set(key, new PartBuilder());
    return this.builders.get(key)!;
  }
  private local(bone: string, matrix?: THREE.Matrix4) {
    const [x, y, z] = this.pivot(bone);
    const m = new THREE.Matrix4().makeTranslation(-x, -y, -z);                  // shift last, so a mirror matrix applies first
    return matrix ? m.multiply(matrix) : m;
  }
  add(bone: string, material: string, geo: THREE.BufferGeometry, color: Parameters<PartBuilder['add']>[1], matrix?: THREE.Matrix4) {
    this.part(bone, material).add(geo, color, this.local(bone, matrix));
    return this;
  }
  addTris(bone: string, material: string, tris: Tris, color: Parameters<PartBuilder['add']>[1], matrix?: THREE.Matrix4) {
    this.part(bone, material).addTris(tris, color, this.local(bone, matrix));
    return this;
  }
  build(materials: Record<string, THREE.Material>) {
    const root = new THREE.Group(); root.name = 'rig';
    const nodes: Record<string, THREE.Group> = {}, at = (n: string) => this.pivot(n);
    for (const b of this.bones) {
      const g = new THREE.Group(); g.name = b.name;
      const p = b.parent ? at(b.parent) : [0, 0, 0];
      g.position.set(b.pivot[0] - p[0], b.pivot[1] - p[1], b.pivot[2] - p[2]);
      (b.parent ? nodes[b.parent] : root).add(g);
      nodes[b.name] = g;
    }
    for (const [key, pb] of this.builders) {
      const [bone, mat] = key.split('|');
      if (!materials[mat]) throw new Error(`RigBuilder: no material "${mat}"`);
      nodes[bone].add(pb.build(materials[mat], { name: `${bone}_${mat}` }));   // mesh names differ from bone names
    }
    root.userData.bones = nodes;
    return root;
  }
}

export type Euler3 = [number, number, number];
/** Keyframes are rotations relative to the rest pose. Make the last key equal the first for a loop. */
export function makeClip(name: string, duration: number, tracks: Record<string, { times: number[]; euler: Euler3[] }>) {
  const q = new THREE.Quaternion(), e = new THREE.Euler(), out: THREE.KeyframeTrack[] = [];
  for (const bone of Object.keys(tracks).sort()) {                               // sorted: fixed order
    const { times, euler } = tracks[bone], vals: number[] = [];
    for (const [x, y, z] of euler) { q.setFromEuler(e.set(x, y, z)); vals.push(q.x, q.y, q.z, q.w); }
    out.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
  }
  return new THREE.AnimationClip(name, duration, out);
}
