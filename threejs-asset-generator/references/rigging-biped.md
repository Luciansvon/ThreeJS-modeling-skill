# Rigging, biped helpers, directed extrude, UV textures

Reference for `threejs-asset-generator`. Read it before writing a character, anything that must animate, a humanoid, an extruded or beveled shape, or a textured asset. `SKILL.md §N` means a section of the main file; 6.2 and 6.3 are in `creatures.md`.

Contents: 6.4 Rigged parts (`rig.ts`, clips) · 6.5 Biped helpers and 6.6 Directed extrude and bevel (`biped.ts`, tested) · 6.7 UV and seeded textures · tests. Detail pass (atlas, AO, sockets): `detail.md`.

## 6.4 Rigged parts

`PartBuilder` merges everything of one material into one static mesh, so a merged character cannot move. Split by **bone**: parts merge per (bone, material), and bones are plain `THREE.Group` pivots. Everything is still a pure seeded function; animation only rotates the groups.

Rules:
- Author every part in the **rest pose in asset space** (A-pose for humanoids, §0 axes). `RigBuilder` shifts each part by `-pivot`, so the bone's local origin is its joint and a rotation about the bone turns the part about the joint.
- Bones are listed **parents first** and have unique names; mixer tracks address them by name. The root bone (hips) is where body bob goes.
- Draw calls = bones × materials. A humanoid fits in about 10 bones: `hips, spine, head, upperArmL/R, foreArmL/R, thighL/R, shinL/R`. Put hands into the forearm bone and feet into the shin bone. Do not rig what never moves (belts, pouches go into the bone they hang from).
- Close the visible gap at a joint with a small sphere or a slightly wider `tubeTris` end on the child bone, not with overlapping random geometry.
- Mirror with `mirrorBone` for the pivot and a mirror matrix for the parts. The mirror matrix is applied before the pivot shift inside `RigBuilder`, and `PartBuilder` restores the winding (SKILL.md §6.1).
- `groundAsset(rig)` and `disposeAsset(rig)` work as they are. Ground in rest pose; foot IK or hip bob afterwards is the animation's job.
- Not covered on purpose: `SkinnedMesh` (smooth bending needs weights and breaks the flat-shaded look at joints). Rigid per-bone meshes match the low-poly style and keep the pipeline untouched.

Code: `src/rig.ts`. API:

- `export interface BoneDef { name: string; pivot: V3; parent?: string }          // pivot in asset space; parents first`
- `export const mirrorBone = (b: BoneDef, name: string, parent = b.parent): BoneDef`
- `export class RigBuilder`
- `.constructor(private bones: BoneDef[])`
- `.add(bone: string, material: string, geo: THREE.BufferGeometry, color: Parameters<PartBuilder['add']>[1], matrix?: THREE.Matrix4)`
- `.addTris(bone: string, material: string, tris: Tris, color: Parameters<PartBuilder['add']>[1], matrix?: THREE.Matrix4)`
- `.build(materials: Record<string, THREE.Material>)`
- `export type Euler3 = [number, number, number];`
- `export function makeClip(name: string, duration: number, tracks: Record<string, { times: number[]; euler: Euler3[] }>)`


Usage (a goblin-like humanoid; `J` comes from `bipedRest`, 6.5):

```ts
const J = bipedRest({ height: 1.1, legRatio: 0.38, armRatio: 0.4, headRatio: 0.3, bulk: 1 });
const armL: BoneDef = { name: 'upperArmL', pivot: J.shoulderL, parent: 'spine' };
const foreL: BoneDef = { name: 'foreArmL', pivot: J.elbowL, parent: 'upperArmL' };
const thighL: BoneDef = { name: 'thighL', pivot: J.hipL, parent: 'hips' };
const shinL: BoneDef = { name: 'shinL', pivot: J.kneeL, parent: 'thighL' };
const bones: BoneDef[] = [
  { name: 'hips', pivot: J.hip }, { name: 'spine', pivot: J.hip, parent: 'hips' }, { name: 'head', pivot: J.neck, parent: 'spine' },
  armL, foreL, mirrorBone(armL, 'upperArmR'), mirrorBone(foreL, 'foreArmR', 'upperArmR'),
  thighL, shinL, mirrorBone(thighL, 'thighR', 'hips'), mirrorBone(shinL, 'shinR', 'thighR'),
];
const rig = new RigBuilder(bones), MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const skin = '#6a9a3a';
// left side in asset space, then the same triangles mirrored onto the right bone
const upperArm = tubeTris([J.shoulderL, J.elbowL], [0.05, 0.04], 6);
const foreArm = [...tubeTris([J.elbowL, J.handL], [0.04, 0.03], 6), ...handTris(J.handL, sub(J.handL, J.elbowL), 0.08, 0.06, 0.03)];
rig.addTris('upperArmL', 'skin', upperArm, skin).addTris('upperArmR', 'skin', upperArm, skin, MIRROR);
rig.addTris('foreArmL', 'skin', foreArm, skin).addTris('foreArmR', 'skin', foreArm, skin, MIRROR);
// head, torso, legs the same way. Ears: const { shell, inner } = earTris(...); shell and inner go to 'head' (inner in a darker color).
const root = groundAsset(rig.build({ skin: lowPolyMaterial({ roughness: 0.85 }) }));
```

Animation: with forward +Z, a positive X rotation swings a hanging limb **backward** (`+Y` turns toward `+Z`, so `-Y` turns toward `-Z`). Use negative X for "forward".

```ts
const N = 8, times = Array.from({ length: N + 1 }, (_, i) => i / N), TAU = Math.PI * 2;
const swing = (amp: number, phase: number): Euler3[] => times.map((t) => [-Math.sin(TAU * t + phase) * amp, 0, 0]);
const bend = (amp: number, phase: number): Euler3[] => times.map((t) => [Math.max(0, Math.sin(TAU * t + phase)) * amp, 0, 0]);   // knees and elbows only fold one way
const walk = makeClip('walk', 1, {
  thighL: { times, euler: swing(0.6, 0) }, thighR: { times, euler: swing(0.6, Math.PI) },
  shinL: { times, euler: bend(0.8, Math.PI * 0.5) }, shinR: { times, euler: bend(0.8, Math.PI * 1.5) },
  upperArmL: { times, euler: swing(0.5, Math.PI) }, upperArmR: { times, euler: swing(0.5, 0) },
  hips: { times, euler: times.map((t) => [0, Math.sin(TAU * t) * 0.08, 0] as Euler3) },
});
const mixer = new THREE.AnimationMixer(root); mixer.clipAction(walk).play();   // in the render loop: mixer.update(dt)
```

Pose without a clip (nod, wave, idle): set `root.userData.bones.head.rotation.x = 0.2` directly. For a static pose baked into the asset, apply it once after `build` and keep it deterministic (a pure function of the params).

## 6.5 Biped helpers and 6.6 Directed extrude and bevel

Pure kernels, no THREE import (`src/biped.ts`, builds on `organic.ts` from `creatures.md` with its vector helpers exported). Left is +X, forward is +Z (SKILL.md §0).

- `frameFrom(dir, up)`: right-handed frame (`u × v = d`, `v` as close to `up` as possible). Every directed helper uses it, which is what makes toes, fingers and ears point where you say.
- `loftTris(outline, origin, dir, stages)`: a 2D outline (CCW seen from the `+dir` side, convex or star-shaped) moved through stages `{ dist, scale, shift }` along `dir`. Closed and capped. Scaling is about the outline's (0, 0): put the flat side of a sole on `y = 0` and it stays flat while tapering.
- `extrudeTris(outline, origin, dir, length, { taper, bevel, bevelDepth, up })`: straight extrusion with end taper (number or `[x, y]`) and a chamfer at both ends. Use it for belts, plates, trouser cuffs, ear shells, fangs.
- `tubeTris(path, radius, sides, caps, shape)`: `shape(angle, t)` multiplies the radius around the ring. `1 + 0.15 * Math.cos(angle * 6)` gives pleats on trousers; a `t`-dependent term gives folds that fade out.
- `sleeveTris(path, radius, t0, t1, inflate, sides, shape)`: clothing over the `[t0, t1]` part of a limb path, same radius profile plus `inflate`, so it sits on the limb without z-fighting. Color it separately (own `PartBuilder` call, same bone).
- `bipedRest(proportions)` returns joint points; `mirrorPoint` for the right side. `twoBoneIK(root, target, l1, l2, bend)` returns the knee or elbow with exact bone lengths and clamps unreachable targets (so a foot planted too far straightens the leg instead of stretching it). Use it to build poses; feed the resulting points to `tubeTris` chains.
- `footTris`, `handTris`, `boxTris`: oriented blocks. `eyeTris`, `noseTris`, `earTris` (returns `{ shell, inner }`; paint the inner lip a darker color) for faces. Keep eyes as separate parts so they can take an emissive material.
- Facing rule for faces: build the head with the face toward +Z, eyes at `±x`, and mirror one eye. Ears go out along `±X` with a small `droop`.

Code: `src/biped.ts`. API:

- `export type V2 = [number, number];`
- `export interface Frame { u: V3; v: V3; d: V3 }          // u × v = d, v ≈ up`
- `export function frameFrom(dir: V3, up: V3 = [0, 1, 0]): Frame`
- `export interface LoftStage { dist: number; scale: number | V2; shift?: V2 }`
- `export function loftTris(outline: V2[], origin: V3, dir: V3, stages: LoftStage[], up: V3 = [0, 1, 0]): Tris`
- `export function extrudeTris(outline: V2[], origin: V3, dir: V3, length: number,`
- `export const ngon = (n: number, rx: number, ry = rx): V2[]`
- `export const boxTris = (center: V3, forward: V3, up: V3, size: V3): Tris`
- `export function twoBoneIK(root: V3, target: V3, l1: number, l2: number, bend: V3): V3`
- `export interface BipedProportions { height: number; legRatio: number; armRatio: number; headRatio: number; bulk: number }`
- `export interface BipedJoints`
- `export function bipedRest(p: BipedProportions): BipedJoints`
- `export const mirrorPoint = (p: V3): V3`
- `export const footTris = (ankle: V3, forward: V3, len: number, width: number, height: number): Tris`
- `export const handTris = (wrist: V3, dir: V3, len: number, width: number, thick: number, up: V3 = [0, 1, 0]): Tris`
- `export function sleeveTris(path: V3[], radius: (t: number) => number, t0: number, t1: number, inflate = 0.02, sides = 6,`
- `export const eyeTris = (c: V3, dir: V3, size: number, up: V3 = [0, 1, 0])`
- `export const noseTris = (base: V3, dir: V3, length: number, width: number, up: V3 = [0, 1, 0])`
- `export function earTris(base: V3, out: V3, length: number, width: number, up: V3 = [0, 1, 0], droop = 0.2)`
- `export function taperedBoxTris(wBot: number, dBot: number, wTop: number, dTop: number, h: number): Tris`


## 6.7 UV and seeded textures

The default pipeline is UV-free vertex color. Use a texture only when color per face is not enough (skin noise, cloth weave, a label).

- `new PartBuilder({ uv: 'box', uvScale: 1 })` projects UVs in **asset space** along each triangle's dominant normal, after placement and mirroring (`boxProjectUV`, SKILL.md §4). It works for primitives and kernel triangles alike, is deterministic, and keeps the texel size equal on every part.
- `{ uv: 'keep' }` keeps authored UVs (for example from `BoxGeometry`). All parts of one mesh must then have UVs; `PartBuilder.add` throws on a part without uv, and `mergeFlat` throws on mixed sets. Kernel triangles carry none, so do not mix them in.
- For a textured rigid rig, build the textured parts with a separate UV-preserving `PartBuilder` and add the resulting meshes to the named pivots from `RigBuilder.build()`. Put their geometry in pivot-local coordinates. The default per-bone builder drops UV attributes.
- Set the map on the material: `lowPolyMaterial({ map })`. Vertex color multiplies the map, so keep colors light when the texture carries the detail.
- Build procedural pixels from a seeded function. Load supplied or image-generated maps and prepare any canvas outside the builder, then pass the fixed texture in. See [texture choices](look.md#choose-the-texture-path) and the atlas and data-map recipes in `references/detail.md`.

Code: `src/texture.ts`. API:

- `export function seededNoiseTexture(rng: () => number, size = 32, variation = 0.2)`


- `disposeAsset` frees `material.map` (SKILL.md §9). A texture shared by several materials is disposed once per material, which is harmless.
- Textured parts may be merged with `mergeFlat` only if they share the material **and** all have `uv`.

## Tests (no Three.js, run with `tsx`)

Test: `src/biped.test.ts` (run `tsx src/biped.test.ts`).

Add to a project's tests as well: `RigBuilder` builds the same bone names and mesh count for the same params (run it with `three` installed), every bone mesh has `signedVolume > 0` per closed part before the merge, and `generate(params)` fingerprints equal the exported module's (SKILL.md §11), both at rest pose and after `mixer.setTime(0.25)`.
