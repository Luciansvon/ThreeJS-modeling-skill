# Rigging, biped helpers, directed extrude, UV textures

Reference for `threejs-asset-generator`. Read it before writing a character, anything that must animate, a humanoid, an extruded or beveled shape, or a textured asset. `SKILL.md §N` means a section of the main file; 6.2 and 6.3 are in `creatures.md`.

Contents: 6.4 Rigid and skinned rigs, clips, and facial motion (`rig.ts`, `skinnedRig.ts`) · 6.5 Biped helpers and 6.6 Directed extrude and bevel (`biped.ts`) · 6.7 UV and seeded textures · tests. Detail pass (atlas, AO, sockets) in `detail.md`.

## 6.4 Rigged parts & choosing rigid vs skinned

Choose the rig by how each part moves and how its joins should look.

- **Rigid pivots.** Use named `THREE.Group` pivots where pieces keep their shape, such as robot limbs, armored segments, or a door. `RigBuilder` merges faceted parts per pivot and material. For smooth rigid parts, attach the geometry with its authored normals to the pivot.
- **Continuous bending.** Use `THREE.SkinnedMesh` for a long tail, flexible neck, or other surface that stretches across joints. Weight each ring across adjacent spine bones using `skinIndex` and `skinWeight`. Attach rigid details like horns or claws directly to their parent bone. Choose [faceted or smooth normals](look.md) independently of the weights.

Rules:
- Author every part in the **rest pose in asset space** (A-pose for humanoids, §0 axes). With `RigBuilder`, each part shifts by `-pivot` so the bone's local origin is its joint.
- Bones are listed **parents first** and have unique names; mixer tracks address them by name. The root bone (`hips` / `root`) carries body bob and (for `--motion free` hovering/leaping creatures) subtle natural X/Z sway or lunge.
- **Category-appropriate bone counts:** Humanoids fit in ~10–16 bones; serpentine creatures and articulated dragons typically need **16–26 bones** (including articulated jaw, whiskers, and 5–8 spine/tail segments); multi-limb creatures such as spiders (~28 bones: 8 legs × 3 joints + body/fangs) or krakens (~40–52 bones: 8 tentacles × 5–6 segments + mantle) should use `--kind creature` in `rig-check.ts` (up to 64 pivots) and prefer `SkinnedMesh` on flexible limbs so draw calls stay low.
- Match the join to the style. Use compatible tangents, blended weights, or overlapping rounded parts for a continuous surface. Keep constructed seams readable for hard or blocky parts. Check the join at the clip's maximum bend for gaps, collision, and pinching.
- Mirror with `mirrorBone` for the pivot and a mirror matrix for the parts. The mirror matrix is applied before the pivot shift inside `RigBuilder`, and `PartBuilder` restores the winding (SKILL.md §6.1).
- Ground in rest pose, using `groundAsset(rig)` for a rigid build. Keep skinned ground offsets on the asset wrapper. Author foot IK, hovering elevation, or hip bob in the clips.
- **Exported rotation tracks:** Always author exported rotations with `QuaternionKeyframeTrack` targeting `<nodeName>.quaternion` (`makeClip` and `bakeClip30fps` do this automatically). `GLTFExporter` only exports `position`, `quaternion`, `scale`, and `morphTargetInfluences`; `.rotation` or `.rotation[x]` scalar Euler tracks animate in preview but are dropped during GLB export while the clip name remains, leaving the model frozen in its rest pose. Give every animated pivot a unique name satisfying `THREE.PropertyBinding.sanitizeNodeName(name) === name` that resolves uniquely from the root via `THREE.PropertyBinding.findNode`.
- **Hinged voxel parts:** For rigged or hinged voxel builds, merge blocks and cull hidden interior faces **only within the same rigid part on the same pivot**. Keep exterior faces where adjacent parts belong to different pivots so bending joints never open hollow gaps, and inspect seams at peak clip rotation.

### Reference pose vs natural locomotion posture (all creature archetypes)

Whatever neutral stance a turnaround sheet uses (T-pose, A-pose, upright cobra-like sit, stiff parallel legs, flat-spread wings) sets **proportions and rest/bind pose ONLY**—never animate locomotion by gently jiggling the static reference pose in place. For static non-animated assets from a neutral sheet, ask whether to keep the sheet pose or pose naturally; for animated models, transition immediately into natural posture per archetype:

| Archetype | Reference trap to avoid | Required natural locomotion & idle posture |
|---|---|---|
| **Bipeds & chibi monsters** | Floating in T-pose with straight outstretched arms | Lower arms into relaxed ready stance, bend knees/elbows slightly, drive walk/run from hip bob and counter-rotating torso/shoulders. |
| **Quadrupeds** *(wolves, cats, dinos)* | Sliding like a stiff table on 4 parallel straight legs | Break legs into asymmetric stride/cantilever gait with spine flex/extension, weight transfer, head bob, and tail counter-balance. |
| **Serpentine & sky dragons** *(snakes, eels)* | Staying upright like a coiled cobra while "flying" | **Pitch/flatten the spine horizontally along the travel axis (`~~~>`)** for flying/swimming clips (back up `+Y`, belly down `-Y`, head level forward `+Z`, tail uncurled trailing `-Z`), driving a clear traveling sinusoidal wave from neck through torso to tail tip. |
| **Winged flyers** *(birds, dragons, bats)* | Keeping stiff straight wings splayed flat | Fold wings cleanly in ground idle; pitch torso forward in flight with phase-delayed wingbeats (shoulder leads, wrist/tips trail) and opposing body lift. |
| **Aquatic & tentacled** *(fish, sharks, octopi)* | Rigid plank body or stiff symmetrical arms | Align along the horizontal swim axis with traveling lateral or undulating waves increasing in amplitude toward the tail or tentacle tips. |
| **Multi-legged** *(spiders, crabs, insects)* | All legs swinging identically in robotic unison | Drive alternating tripod or metachronal stepping waves across opposite legs with opposing body bounce and subtle yaw/roll. |

**Mandatory motion posture sanity check:** Inspect the mid-locomotion frame from a **side view** (and 3/4 view) in rendered studio preview (`references/studio-preview.md`). If the overall spine/body silhouette during flight, swim, walk, or run still matches the static reference sheet stance, fix the clip posture before delivery.

### Clip timing and motion

- For smooth procedural movement, start with 24–30 fps and shortest-path quaternion interpolation. Match timing to the brief, including held poses for a stop-motion look when requested.
- Give actions a readable setup, peak, and recovery, and layer expressive micro-motion (breathing chest/shoulder heave, blinks, ear/tail/cloth/hair secondary sway, weight shift, and landing settle). Have no artificial limits on creative animation polish or complementary preview VFX (`references/studio-preview.md`).
- Reuse the first pose at the end of a loop. For a one-shot or chained action, author the final pose to meet the next clip. Watch the transition during playback.
- Put wheels and propellers on spin pivots, steering on a parent pivot, and doors on bounded hinges. Check clearances across the intended range.

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
const N = 30, times = Array.from({ length: N + 1 }, (_, i) => i / N), TAU = Math.PI * 2;
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

### Facial motion and root isolation

Use the treatment that reads in the reference and delivery framing. A jaw hinge suits an opening mouth. Use weights on a skinned jaw or morph targets for soft cheeks, lips, or eyelids when they need to deform. Use a face texture change for artwork-driven expressions.

For a rigid roar, place `hingeInHeadSpace` at the jaw joint. Author the lower jaw, lower teeth, and attached lip relative to that hinge. Keep the upper teeth and palate on `head`. This example assumes the face points along `+Z`, so positive rotation about local `+X` lowers the jaw.

```ts
const jaw = new THREE.Group();
jaw.name = 'lowerJawPivot';
jaw.position.copy(hingeInHeadSpace);
head.add(jaw);
jaw.add(lowerJawMesh);

const axis = new THREE.Vector3(1, 0, 0);
const values = [0, 0.12, 0.65, 0].flatMap((angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle).toArray());
const roar = new THREE.AnimationClip('Roar', 1.2, [
  new THREE.QuaternionKeyframeTrack('lowerJawPivot.quaternion', [0, 0.24, 0.65, 1.2], values),
]);
```

Include `roar` in the exported clips. In the reloaded GLB, scrub the closed start, the open mouth at 0.65 s, and the closed recovery. Observe that only the lower jaw follows the hinge, the opening has visible depth, and the lips and teeth meet cleanly when closed. Play the full clip to check timing. For a morph, check the deformed surface at the corresponding frames. [Rig and playback checks](rig-check.md)

When root travel obscures a local motion problem, play a copy of the clip from rest with the relevant root track filtered out, such as `hips.position`. Compare both versions at the same timestamps. Repair the responsible track and replay the full clip and working motions before exporting.

### Skinned chains, rest pose, and `YXZ` motion

For a dragon, snake, fish, or tentacle, author the bind pose with a tail extending along local `-Z` for a creature facing `+Z`. Put the curl into the clips. If the reference requires a curled bind pose, use local X pitch in the clip to straighten the chain toward `-Z` before Y yaw swings it toward `±X`. With the default `YXZ` order and zero Z roll, pitch is applied before yaw. An initially upright `+Y` segment needs `-π/2` pitch to point to `-Z`. Do not use yaw alone on an upright tail. Scrub the clip and check the tip moves to both sides.

- `buildBoneHierarchy(specs)` returns `rootBone`, `bones` by name, and `boneOrder` in input order. Each spec has `name`, optional `parent`, and `worldPos` in asset space. List a single root and put each parent before its children. Use `boneOrder` to construct the `THREE.Skeleton`.
- `attachCurveSkinWeights(geometry, boneOrder, chainBoneNames, { vertexT, boneT })` assigns up to two adjacent bones per vertex. Record one `vertexT` per position entry as you generate the rings (for pure kernel tubes built with `tubeTrisWithT` in `src/organic.ts`, use its returned `{ tris, vertexT }` directly instead of guessing nearest bones in Euclidean space). Use the same normalized curve parameter for the increasing `boneT` values. Duplicated vertices from seams, caps, or flat shading keep their authored `t`. Close folds can place widely separated values of `t` at the same point in space.
- `bakeClip30fps(name, duration, bones, evalPose, { fps, eulerOrder, loop })` defaults to 30 fps, `YXZ`, and `loop = true`. It samples at `frame / fps` and adds the clip endpoint. The evaluator receives `0 <= u < 1` (and `u = 1` when `loop: false` for one-shot or chained clips) and can return `rotations` (local Euler deltas in radians), `scales` (absolute local values), and `rootOffset` (local offset from the root rest position). Missing channels use rest values. Looping clips reuse the first pose at the last key; pass `loop: false` so `evalPose(1)` authors the final key. Quaternion signs follow the shortest path between frames, so a full turn can close with opposite signs representing the same orientation.
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

Use texture where the brief or viewing distance calls for visible grain, markings, labels, or surface response. Untextured parts can use solid or vertex colors. `PartBuilder` defaults to UV-free geometry.

- `new PartBuilder({ uv: 'box', uvScale: 1 })` projects UVs in **asset space** along each triangle's dominant normal, after placement and mirroring (`boxProjectUV`, SKILL.md §4). It works for primitives and kernel triangles alike, is deterministic, and keeps the texel size equal on every part.
- `{ uv: 'keep' }` keeps authored UVs (for example from `BoxGeometry`). All parts of one mesh must then have UVs; `PartBuilder.add` throws on a part without uv, and `mergeFlat` throws on mixed sets. Kernel triangles carry none, so do not mix them in.
- For a textured rigid rig, build the textured parts with a separate UV-preserving `PartBuilder` and add the resulting meshes to the named pivots from `RigBuilder.build()`. Put their geometry in pivot-local coordinates. The default per-bone builder drops UV attributes.
- Set the map on the material: `lowPolyMaterial({ map })`. Vertex color multiplies the map, so keep colors light when the texture carries the detail.
- Build procedural pixels from a seeded function. Load supplied or image-generated maps and prepare any canvas outside the builder, then pass the fixed texture in. See [texture choices](look.md#choose-the-texture-path) and the atlas and data-map recipes in `references/detail.md`.

Code: `src/texture.ts`. API:

- `export function seededNoiseTexture(rng: () => number, size = 32, variation = 0.2)`


- `disposeAsset` frees the supported material maps (SKILL.md §9). Manage the lifetime explicitly when a loaded texture is shared with another live asset.
- Textured parts may be merged with `mergeFlat` only if they share the material **and** all have `uv`.

## Tests

Run `npx tsx src/biped.test.ts` for the pure kernels. Run `npx tsx src/skinnedRig.test.ts` with Three.js installed to check folded-curve weights, tail motion, loop closure, and the QA artifacts.

Add to a project's tests as well: `RigBuilder` builds the same bone names and mesh count for the same params (run it with `three` installed), every bone mesh has `signedVolume > 0` per closed part before the merge, and `generate(params)` fingerprints equal the exported module's (SKILL.md §11), both at rest pose and after `mixer.setTime(0.25)`.
