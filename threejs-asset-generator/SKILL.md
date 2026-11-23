---
name: threejs-asset-generator
description: Generate procedural 3D assets in Three.js from a brief or reference image. Build seeded low-poly, voxel, claymation, stylized or realistic models with custom geometry, textures, rigs, animation and VFX. Supports creatures, vehicles, buildings, deterministic composites, standalone code and GLB export.
---

# Three.js Procedural Asset Generator

This harness edition assumes a workspace and Node.js. Use the bundled builders and CLI gates to collect evidence from the actual asset.

Build every asset (single or composite) as a **pure, seeded function**. The live preview and the standalone code export call that same function, so what the user sees is what they export.

**Before modeling, confirm three things:** Before writing full 3D model code on a build, send **one concise numbered message** with recommended defaults. Skip choices already answered explicitly in the session, but **always confirm the brief summary** first:
1. **Brief summary & reference check:** summarize asset, style, requested clips/VFX, and deliverables for confirmation. If a reference uses a static turnaround pose (T-pose/A-pose, upright cobra sit, stiff parallel legs, flat-spread wings), note it sets proportions and bind/rest pose only—animations start from natural creature locomotion posture (`references/rigging-biped.md`). Suggest re-uploading missing or cropped images.
2. **Work mode:** `1) Quick` (`Fast`), `2) Balance` *(recommended default)*, or `3) Quality`—all modes keep full geometry, `new THREE.Color(hex)` accuracy, anchored VFX, and lively motion; `Fast` runs `G3` palette only (0 `G4` overhead), while `Balance`/`Quality` add `G4` CIEDE2000 regional color QC (`references/work-modes.md`).
3. **Preview mode:** `A) Fast Preview` *(recommended default: orbit, zoom, clip scrub)* or `B) Full Preview` *(camera presets, backdrop/VFX toggles, rig/clip inspection, GLB verify)*. Do not build a heavy studio before the user chooses (`references/studio-preview.md`). Offer optional two-stage approval (blockout first) for complex assets.

When requirements remain open, ask only what is missing in the same message: reference & style, surface & materials matched to viewing distance, animation & **unrestricted VFX creativity** (articulated rig + lively multi-beat choreography & VFX references in `references/rigging-biped.md` and `references/studio-preview.md` as creative inspiration, not hard limits—default to rich layered VFX anchored to live moving bones or `Y≈0` ground contacts; preview-only `_studio_vfx` is exempt from export budgets), and target platform/kind/deliverables (`web`, `mobile`, `roblox`, `desktop`; `prop`, `hero`, `creature`, `vehicle`, `building`; `.glb`, code, or both).

**Target:** `three` ≥ r170 as ES modules, checked against the official migration notes through r187 (§12 in `references/export.md`).

**Code is in `src/`**, not in the docs. Run, do not re-read: `tsx src/<name>.test.ts` (pure tests need no `three`). Reference files list each module's API.

**Start with the current task.** For a supplied image, begin with §15 and the intake section of `references/reference-matching.md`. Use the table below to open the section needed for the next decision. Read implementation or test source when adapting a helper or diagnosing a failure.

## Where to read next

| You are doing | Read | Code |
|---|---|---|
| Choosing `Quick`/`Fast`/`Balance`/`Quality`, `G4` color QC policy, shape vs detail review | `references/work-modes.md` | |
| Reference matching, Semantic ROI cache, `G1–G5` (`G4` CIEDE2000 ΔE00) | `references/reference-matching.md` | `scripts/color-qc.ts`, `scripts/ref-intake.ts`, `scripts/ref-compare.ts` |
| Materials, flat shading, `VoxelGrid`, procedural/image textures, vertex jitter (§4, §5) | `references/look.md` | `src/lowpoly.ts`, `src/voxel.ts`, `src/jitter.ts` |
| Custom geometry, winding, mirrored parts, overlays (§6, §7) | `references/geometry.md` | `src/geometry.ts`, `src/overlay.ts` |
| Creature, multi-limb, vehicle, hull, wing, pure triangle kernel (§6.2, §6.3) | `references/creatures.md` | `src/tri.ts`, `src/organic.ts` |
| Anything that animates, humanoid, SkinnedMesh, extrude, texture (§6.4 to §6.7) | `references/rigging-biped.md` | `src/skinnedRig.ts`, `src/rig.ts`, `src/biped.ts`, `src/texture.ts` |
| Flat or blocky look, atlas, chamfer, AO, sockets (§6.8) | `references/detail.md` | `src/detail.ts`, `src/detailThree.ts` |
| Several sub-assets, buildings, interiors (§8) | `references/composite.md` | |
| Grounding, disposal, rebuilds, lights (§9, §10) | `references/lifecycle.md` | `src/lifecycle.ts` |
| Code export, Three.js versions (§11, §12) | `references/export.md` | `src/fingerprint.ts` |
| A `.glb` file of the asset (§16) | `references/glb-export.md` | `scripts/export-glb.ts`, `scripts/export-rigged-glb.ts` |
| Is it too heavy, platform budget, LOD `detail` (§17) | `references/budget.md` | `scripts/mesh-stats.ts`, `src/lod.ts` |
| Rig, animation clips, drift, expressions (§18) | `references/rig-check.md` | `scripts/rig-check.ts` |
| Fast GLB viewer or Full Preview studio | `references/studio-preview.md` | [Fast Preview HTML](assets/fast-preview.html), `scripts/pack-studio.ts`, `scripts/capture-studio.ts` |
| Complete small example | `references/examples.md` | |
| Before saying an asset is done: QA gates, review image (§13) | `references/qa-gates.md` | `scripts/qa-asset.ts` |

## 0. Conventions (decide once, apply everywhere)

| Topic | Rule |
|---|---|
| Units | 1 unit = 1 meter |
| Axes | Y up, right-handed |
| Forward | +Z (same as glTF and `Object3D.lookAt`) |
| Sides | With forward +Z and up +Y, the asset's **right is −X** and its **left is +X** (right = forward × up) |
| Pivot | Origin at the footprint centre, lowest point at Y = 0 (see §9) |
| Face names | Name faces by axis (`+X face`, `top`), never by port/starboard/left/right, so a rule can't contradict the axes |
| Symmetry | Build one side, mirror the copy through `PartBuilder.add` or `mirrorTris` (§6.1). A bare `applyMatrix4` with negative scale leaves the winding inside-out |

Why this matters: pairing "bow = +Z" with "starboard = +X" is mirrored, and a ship built from that pairing has its sides swapped. With forward +Z, starboard is −X and port is +X.

## 1. One pipeline, one source of truth

```
parameter schema (defaults, ranges) → resolveParams() → build…Asset() → THREE.Group
```

- Defaults and ranges live in the schema only. `build…Asset(rawParams)` calls `resolveParams` itself. Three competing defaults (`params.seed || 12345`, schema `default: 42`, composite `?? 101`) make preview, presets and exported code disagree.
- `build…Asset` is pure: same resolved params give identical geometry. No `Math.random`, `Date.now`, DOM access or module-level mutable state.
- Use the same Three.js version throughout the builder and its helpers. The rigged exporter and studio both support a builder receiving `(params, THREE)`.
- Give every builder and parameter list a unique name (`buildTreeAsset`, `treeParameters`). A generic `buildAsset` collides as soon as a composite imports two generators.
- Choose the geometry representation that preserves the intended surface. Plain triangle kernels suit faceted parts. Indexed `BufferGeometry` can share smooth normals and carry skin weights, UVs, or morph targets. Extract triangles from the resulting mesh for geometry QA.

Types: `src/types.ts` (`ParamDef`, `AssetGeneratorSchema`).

Worked example (tree): `references/examples.md`.


## 2. Determinism

Reproducible output is the whole point of a seed, so protect it:

- Use `??`, never `||`, for seeds and any numeric fallback. `seed || 12345` silently turns seed `0` into `12345`.
- Give each feature its own forked stream. With one shared `rng`, changing `segments` or toggling `hasFruits` shifts every later random number and reshuffles unrelated parts of the asset.
- Iterate in a fixed order (arrays, not object keys of unknown order, not `Set` of mixed insertion).

Code: `src/prng.ts`. API:

- `export function hashString(str: string)`
- `export function createPRNG(seed = 1)`
- `export type Rng = ReturnType<typeof createPRNG>;`



## 3. Parameters

`resolveParams` applies defaults, coerces types, clamps to `min`/`max`, snaps to `step`, and rejects bad colors and selects. Use it in the UI, in presets and in `build…Asset`, so no consumer can produce NaN or out-of-range geometry.

Code: `src/params.ts`. API:

- `export function resolveParams(schema: { parameters: ParamDef[] }, input: Record<string, unknown> = {})`


- After resolving, apply **derived constraints** so slider combinations can't produce degenerate shapes (for example `trunkRadius = Math.min(trunkRadius, crownRadius * 0.6)`).
- Keep `seed` max at 99999 or higher. Composite builders derive sub-seeds as `fork(label).seed % 100000`; a smaller max would clamp them all to the same value.
- Toggles (`hasFruits`, `hasTurrets`) change what is built, never which random numbers the other parts receive (§2).

- **Detail toggles** (`aoStrength`, `bevel`, `atlasOn`) are ordinary parameters. They change what the detail pass adds, never which random numbers other parts receive.
- **Atlas stream is forked.** Generate atlases from `rng.fork('atlas')`, so switching `atlasOn` leaves every other part unchanged (`references/detail.md`).


## 13. Checklist (tick per asset, do not ship pre-ticked)

Run `qa-asset.ts --module ./asset.ts --grounded` directly on pure kernels OR `(params, THREE)` builders (`tris.json` optional). Add `--symmetric` for intended symmetry. Never run inline `npx tsx -e` in Windows PowerShell (write a `.ts` script instead to prevent shell hangs). Inspect `review.png` for geometry and colored `capture-studio.ts` renders for appearance.

On revision, check what changed using the least expensive evidence that can reveal a problem. Run applicable checks on the delivered build. Keep detailed logs with the asset and summarize the observed result and material gaps. If a tool is unavailable, continue independent work and report any unresolved requested check at handoff. See `references/qa-gates.md` and, for previews, `references/studio-preview.md`.

Determinism and parameters
- [ ] Defaults and ranges exist only in the schema; `build…Asset` calls `resolveParams`
- [ ] Seeds use `??`; seed `0` works; no `Math.random` or `Date.now`
- [ ] Each feature has its own forked stream; toggles do not reshuffle other parts
- [ ] Derived constraints prevent degenerate shapes; sub-seeds fit the seed range

Reference (only when the user gave an image)
- [ ] Cache semantic region colors in `ref.json` once at intake (`uncertain` if unclear); verify `G3` + `G4` CIEDE2000 (`Balance`/`Quality`, max 1 fix loop); reopen reference alongside studio views per `references/work-modes.md`.

Geometry and look
- [ ] Axes follow §0; faces described by axis; right = −X when forward = +Z
- [ ] Custom geometry has positive `signedVolume`, also after mirroring; `DoubleSide` only on zero-thickness sheets
- [ ] Mirrored parts go through `add()`/`addTris`, `mirrorTris`, or `VoxelGrid.mirrorX()` (`src/voxel.ts`), never a bare negative-scale `applyMatrix4`
- [ ] Normals and linear vertex colors (`new THREE.Color(hex)`, never `/ 255`) preserve contrast in the reloaded asset; use `bakeFlat` and `paint` for faceted parts.
- [ ] Jitter is applied before `add()`, seam-welded, with bounding volumes recomputed
- [ ] Metal parts have an environment map or a lowered `metalness`
- [ ] Overlays use a constant-distance inset and a small lift against z-fighting

Rigging, humanoids, textures (only when they apply)
- [ ] Choose joint pivots or skinning to suit the motion and preserve the chosen surface normals. Inspect joins under deformation. For an expressive face, play the requested gesture on the reloaded asset (§18).
- [ ] Leave any static reference pose and adopt natural creature locomotion posture inspected from side view (`references/rigging-biped.md`); play clips on the rig root with `AnimationMixer` using `QuaternionKeyframeTrack` (`<node>.quaternion`) and unique node names, sampling mid-cycle/peak timestamps before and after GLB export with expressive micro-motion/follow-through. Use the mirror helpers for symmetric bones.
- [ ] Limb chains go through `twoBoneIK` or fixed point chains; feet and hands have explicit forward/up
- [ ] Extruded and lofted parts have positive `signedVolume`, also after mirroring
- [ ] UV is off unless a texture is used; with a texture, `PartBuilder({ uv })` is set for every part of that material and `disposeAsset` frees `map`

Detail pass (only when it applies)
- [ ] Atlas cells follow the convention (cell 0 top-left); every part of a textured material has uv; roughness/bump maps are `NoColorSpace` with `roughness: 1`
- [ ] Atlas is generated from a forked stream (`seededAtlas`), or injected as a parameter; the builder never loads files or touches the DOM
- [ ] Chamfered and sculpted parts have positive `signedVolume`; sculpt amounts keep radii > 0
- [ ] AO is applied once (`aoShade` per part for rigs, `applyAO` for static merges) and never darker than the 0.35 floor
- [ ] Small details come from `raycastTris`/`scatterOnSurface` + `placeTris` with `sink`; mirrored side uses `mirrorHit`

Composite
- [ ] Unique exported builder names; params namespaced and sliced with `pickParams`
- [ ] Placement uses footprints, fixed priority order, and bounded attempts
- [ ] Skipped items are deterministic; repeated objects are cloned or instanced

QA (every asset)
- [ ] Record geometry checks and visual observations for the delivered build, including any unresolved requested checks.

Lifecycle and export
- [ ] Wrapper group grounds the asset at Y = 0; `disposeAsset` is called on every rebuild
- [ ] Meshes are named. Record the triangle count and compare it with any agreed target.
- [ ] Exporter uses a real TS transpiler, includes helpers once, and has zero imports except `three` (`three/addons` only if `mergeGeometries` is used)
- [ ] GLB asked for: choose the export path in §16. Report the file, checks performed on its bytes, and any unchecked visual or import stages.
- [ ] For a delivery target or LOD request, run `scripts/mesh-stats.ts` with the selected limits and `--lods` when relevant. Verify silhouette and rig continuity at the delivered levels.
- [ ] Export target (module, import map, classic global) matches where the code will run
- [ ] Parity test passes: `generate(params)` and the exported module give the same fingerprint


## 14. Minimal single asset (when a full schema is overkill)

The ~290 lines of a first asset are mostly fixed infrastructure (`prng.ts`, `lowpoly.ts`, `params.ts`), not per-asset cost. Write those once as shared modules and never inline them in an asset file. For a one-off prop, skip the schema and `resolveParams`, keep the PRNG (determinism still matters), and export with only the helpers actually used (`helpers: [rawPrng, rawLowpoly]`). A complete asset is then about 30 lines:

```ts
import * as THREE from 'three';
import { createPRNG } from './prng';
import { PartBuilder, lowPolyMaterial } from './lowpoly';
import { groundAsset } from './lifecycle';

export function buildCrateAsset(raw: { seed?: number; size?: number } = {}) {
  const seed = raw.seed ?? 42, size = Math.min(Math.max(Number(raw.size ?? 1) || 1, 0.3), 3);
  const rng = createPRNG(seed).fork('planks');
  const wood = new PartBuilder();
  wood.add(new THREE.BoxGeometry(size, size, size), () => (rng() < 0.5 ? '#8a6a45' : '#7a5c3b'));   // per-face color, own stream
  for (const s of [-1, 1])                                                                       // corner battens
    wood.add(new THREE.BoxGeometry(size * 0.08, size * 1.02, size * 1.02), '#5b4329', new THREE.Matrix4().makeTranslation(s * size * 0.46, 0, 0));
  const content = new THREE.Group();
  content.add(wood.build(lowPolyMaterial({ roughness: 0.9 }), { name: 'crate' }));
  return groundAsset(content);
}
```

Promote it to the full schema form (§1) as soon as it gets sliders, presets, or is used inside a composite.


## 15. Reference matching (when the user gives an image, screenshot or sketch)

Write `ref-spec.md`, cache `ref.json` (`--grid auto` handles uneven turnarounds, supports `front`/`back`/`side`/`top`/`34`/`34_back`) plus optional semantic regions (`--regions`). Verify `G1–G3`, plus `G4 regional color` CIEDE2000 (`Balance`/`Quality` only; zero overhead in `Fast`/`Quick`), then inspect colored studio captures (`capture-studio.ts --vfx --motion-vfx`) against reopened reference crops (`references/reference-matching.md`).

## 16. GLB file (when the user wants a `.glb`)

For geometry-only GLB, run `qa-asset.ts`, then `npx tsx scripts/export-glb.ts --module ./kernel.ts --export buildXTris --out asset.glb` (or `--tris tris.json`) to verify Q1–Q5 and E1–E6. When retaining vertex colors, materials, UVs, skins, or clips, run `npx tsx scripts/export-rigged-glb.ts --module ./asset.ts --export buildXAsset --out asset.glb [--open a,b] [--static-clips a,b]` to verify `RG1–RG8` (including reloaded GLB Q1–Q4 topology and per-clip motion parity, `references/glb-export.md`).

## 17. Budget and LOD (when there is a target platform, or the asset may be too heavy)

Choose a budget from the asset's delivery target. A browser used to inspect a model does not establish its deployment target. With an agreed target, pass the same profile, kind and any explicit triangle ceiling to QA, mesh stats and geometry-only export. With no target, report the measured counts. If optimization is required, protect the silhouette, face and visible material detail and compare the optimized render with the previous one. See `references/budget.md` for CLI examples and LOD checks.

## 18. Rig, clip and expression check (when the asset has pivots, clips or expression swaps)

Run `npx tsx scripts/rig-check.ts --meta char_metadata.json --kind creature --motion free [--static-clips a,b]` (`--kind` sets category bone limits; `--motion in-place` enforces 0m X/Z drift for locomotion loops while `free` allows hovering/leaping/lunging sway) to verify R1 hierarchy · R2 rest-pose · R3 clips (excluding `RefPose`) · R4 tracks & drift (rejects Euler `.rotation`) · R5 static expression mapping · R6 slide & floor (`qa.clipMinY`) clearance · R7 clip motion. Use Fast Preview for exported textures and clip playback, Full Preview for rig and expression inspection, and the target engine to verify imports. Details: `references/rig-check.md` and `references/studio-preview.md`.
