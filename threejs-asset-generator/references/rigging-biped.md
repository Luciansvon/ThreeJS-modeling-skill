# Rigging, biped helpers, directed extrude, UV textures

Reference for `threejs-asset-generator`. Read it before writing a character, anything that must animate, a humanoid, an extruded or beveled shape, or a textured asset. `SKILL.md §N` means a section of the main file; 6.2 and 6.3 are in `creatures.md`.

Contents: 6.4 Rigged parts and skinned chains (`rig.ts`, `skinnedRig.ts`, clips and QA) · 6.5 Biped helpers and 6.6 Directed extrude and bevel (`biped.ts`, tested) · 6.7 UV and seeded textures · tests. Detail pass (atlas, AO, sockets) in `detail.md`.

## 6.4 Rigged parts & choosing rigid vs skinned

Choose the rigging strategy by silhouette and flexibility needs:
- **Rigid per-bone pivots (`RigBuilder`, `THREE.Group` hierarchy):** Best for humanoids, robots, hard-shelled arthropods (spiders, crabs), vehicles (wheels, steering, turrets, doors), and articulated building parts (gates, windmills). Parts merge per `(bone, material)` and rotate cleanly around each joint without deforming facets.
- **Flat-shaded `THREE.SkinnedMesh` (continuous organic bending):** Recommended for long serpentine bodies (dragons, snakes), flexible tentacles (kraken, octopus), tails, and organic necks that must curve smoothly in S-waves without breaking into stiff segments. Keep the low-poly faceted look by using `flatShading: true` on the material, building a clean 6–8 sided lofted body in rest pose along `+Z` (or natural curve), weighting each ring smoothly across adjacent spine bones (`skinIndex`, `skinWeight`), and attaching rigid details (horns, claws, armor plates, eyes, whiskers, fins) directly to their parent `THREE.Bone`. A single `SkinnedMesh` also keeps draw calls to 1–2 even on a 40+ bone kraken!

Rules:
- Author every part in the **rest pose in asset space** (A-pose for humanoids, §0 axes). With `RigBuilder`, each part shifts by `-pivot` so the bone's local origin is its joint.
- Bones are listed **parents first** and have unique names; mixer tracks address them by name. The root bone (`hips` / `root`) carries body bob and (for `--motion free` hovering/leaping creatures) subtle natural X/Z sway or lunge.
- **Category-appropriate bone counts:** Humanoids fit in ~10–16 bones; serpentine creatures and articulated dragons typically need **16–26 bones** (including articulated jaw, whiskers, and 5–8 spine/tail segments); multi-limb creatures such as spiders (~28 bones: 8 legs × 3 joints + body/fangs) or krakens (~40–52 bones: 8 tentacles × 5–6 segments + mantle) should use `--kind creature` in `rig-check.ts` (up to 64 pivots) and prefer `SkinnedMesh` on flexible limbs so draw calls stay low.
- For rigid pivots, close visible joint gaps with overlapping spherical/ellipsoid joint caps or slightly flared child rings so bending 35–45° never opens seams.
- Mirror with `mirrorBone` for the pivot and a mirror matrix for the parts. The mirror matrix is applied before the pivot shift inside `RigBuilder`, and `PartBuilder` restores the winding (SKILL.md §6.1).
- `groundAsset(rig)` and `disposeAsset(rig)` work as they are. Ground in rest pose; foot IK, hovering elevation, or hip bob afterwards is the animation's job.

### Animation quality standards (anti-stiff motion)

Do not ship robotic 8-sample sine oscillations for hero or creature animations:
- **Sample density:** Bake clips at **24–30 fps** (or smooth `smoothstep`/cubic-eased pose evaluators) with shortest-path quaternion hemisphere alignment (`prev.dot(curr) < 0` → negate) so `AnimationMixer` and exported `.glb` clips play silk-smooth.
- **Anticipation → Climax → Recovery:** Action clips (attacks, roars, leaps, bursts) must coil/wind up first, snap rapidly into an expressive peak pose (e.g. jaw wide open, arms flung out, chest lifted), hold briefly with micro-tremor, and relax cleanly back to idle.
- **Traveling wave & follow-through:** On spines, tails, tentacles, and whiskers, propagate phase lag sequentially down the chain (`phase = idx * 0.55`) with amplitude growing gradually toward the tip (`0.06` at chest → `0.25–0.45` at tail tip).
- **Secondary life:** Add subtle eye blinks (scaling an `eyes` node in Y), articulated lower-jaw roar, breathing chest rise, and whisker/fin flutter.
- **Seamless transitions:** For looping clips, sample exact `t = 0` at the final frame (`pose(duration) === pose(0)`). For chained actions (e.g. `Charge` → `Burst` → `Idle`), match the exact end pose of clip A to the start pose of clip B so crossfade or cut transitions have zero pop.
- **Mechanical & vehicle motion:** Use continuous 360° wheel/propeller rotation tracks around local X/Z, separate steering parent pivots (`wheelSteerFL` → `wheelSpinFL`) for front wheels, and bounded hinge angles on doors/hatches so they never clip through the chassis.

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

### Skinned chains, rest pose, and `YXZ` motion

For a dragon, snake, fish, or tentacle, author the bind pose with a tail extending along local `-Z` for a creature facing `+Z`. Put the curl into the clips. If the reference requires a curled bind pose, use local X pitch in the clip to straighten the chain toward `-Z` before Y yaw swings it toward `±X`. With the default `YXZ` order and zero Z roll, pitch is applied before yaw. An initially upright `+Y` segment needs `-π/2` pitch to point to `-Z`. Do not use yaw alone on an upright tail. Scrub the clip and check the tip moves to both sides.

- `buildBoneHierarchy(specs)` returns `rootBone`, `bones` by name, and `boneOrder` in input order. Each spec has `name`, optional `parent`, and `worldPos` in asset space. List a single root and put each parent before its children. Use `boneOrder` to construct the `THREE.Skeleton`.
- `attachCurveSkinWeights(geometry, boneOrder, chainBoneNames, { vertexT, boneT })` assigns up to two adjacent bones per vertex. Record one `vertexT` per position entry as you generate the rings. Use the same normalized curve parameter for the increasing `boneT` values. Duplicated vertices from seams, caps, or flat shading keep their authored `t`. Close folds can place widely separated values of `t` at the same point in space.
- `bakeClip30fps(name, duration, bones, evalPose, { fps, eulerOrder })` defaults to 30 fps and `YXZ`. It samples at `frame / fps` and adds the clip endpoint. The evaluator receives `0 <= u < 1` and can return `rotations` (local Euler deltas in radians), `scales` (absolute local values), and `rootOffset` (local offset from the root rest position). Missing channels use rest values. The last key uses the first pose. Quaternion signs follow the shortest path between frames, so a full turn can close with opposite signs representing the same orientation.
- `extractQaArtifacts({ root, bones, animations, motionMode })` returns named `tris`, `meshMeta`, and `rigMetadata`. Clips can also come from `root.userData.animations` or `root.animations`. Use `motionMode: 'free'` for intentional X/Z root motion. The default is `'in-place'`.

Build, bind, ground, and extract a simple tail. This tube uses `getPointAt()` so its ring indices give the authored arc-length parameters. Save the example alongside `src/skinnedRig.ts` to run it.

```ts
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { attachCurveSkinWeights, bakeClip30fps, buildBoneHierarchy, extractQaArtifacts } from './skinnedRig';

const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1.2));
const chain = ['tailBase', 'tailMid', 'tailTip'];
const boneT = [0, 0.5, 1];
const { rootBone, bones, boneOrder } = buildBoneHierarchy(chain.map((name, i) => ({
  name,
  parent: chain[i - 1],
  worldPos: curve.getPointAt(boneT[i]).toArray(),
})));

const segments = 12;
const sides = 6;
const geometry = new THREE.TubeGeometry(curve, segments, 0.12, sides, false);
const vertexT = Array.from({ length: geometry.getAttribute('position').count }, (_, i) => Math.floor(i / (sides + 1)) / segments);
attachCurveSkinWeights(geometry, boneOrder, chain, { vertexT, boneT });
const tail = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ flatShading: true }));
tail.name = 'tail';
const root = new THREE.Group().add(rootBone, tail);
root.updateMatrixWorld(true);
tail.bind(new THREE.Skeleton(boneOrder.map((name) => bones[name])));
root.position.y -= new THREE.Box3().setFromObject(root, true).min.y;

const swim = bakeClip30fps('Swim', 1.2, bones, (u) => ({
  rotations: { tailBase: [0, 0.28 * Math.sin(2 * Math.PI * u), 0], tailMid: [0, 0.44 * Math.sin(2 * Math.PI * u - 0.55), 0] },
  rootOffset: [0, 0, 0],
}));
root.userData.animations = [swim];
const artifacts = extractQaArtifacts({ root, bones });
for (const [name, data] of Object.entries(artifacts)) writeFileSync(`${name}.json`, JSON.stringify(data));
```

Run the checks from the skill folder. The example tube has open ends, so pass `--open tail` only for that part.

```bash
npx tsx scripts/qa-asset.ts --tris tris.json --open tail
npx tsx scripts/mesh-stats.ts --tris tris.json --meta meshMeta.json --profile web --kind creature
npx tsx scripts/rig-check.ts --meta rigMetadata.json --kind creature
```

QA samples a detached copy in export space. Keep the asset's ground offset on its wrapper. Helper-built bones use their authored local positions with identity rest rotations and scales. Supply manually built bones in their rest pose. Extraction uses visible `Mesh` and `SkinnedMesh` triangles, including indexed geometry and material groups. Keep all skeleton bones under `root` and address their position, quaternion, or scale by unique bone name. Instanced or batched meshes and tracks on non-bone objects require separate QA. Mesh metadata uses the stats CLI's bone/material grouping and dimensions of loaded material textures. Floor clearance is the lowest transformed vertex from both rigid and skinned parts at 30 fps and at every clip key, including the endpoints. View deformations between samples in preview.

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

## Tests

Run `npx tsx src/biped.test.ts` for the pure kernels. Run `npx tsx src/skinnedRig.test.ts` with Three.js installed to check folded-curve weights, tail motion, loop closure, and the QA artifacts.

Add to a project's tests as well: `RigBuilder` builds the same bone names and mesh count for the same params (run it with `three` installed), every bone mesh has `signedVolume > 0` per closed part before the merge, and `generate(params)` fingerprints equal the exported module's (SKILL.md §11), both at rest pose and after `mixer.setTime(0.25)`.
