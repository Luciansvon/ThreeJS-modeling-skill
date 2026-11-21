---
name: threejs-asset-generator
description: Procedural low-poly 3D assets in Three.js r170+ with seeded deterministic builders, parameter schemas, flat-shaded vertex-color meshes, custom geometry with correct winding, mirrored parts, rigged biped, creature, vehicle and building kernels, composites, textures, standalone code export, and reference image matching. Not for loading glTF files.
---

# Three.js Procedural Low-Poly Asset Generator

This harness edition assumes a workspace and Node.js. Use the bundled builders and CLI gates to collect evidence from the actual asset.

Build every asset (single or composite) as a **pure, seeded function**. The live preview and the standalone code export call that same function, so what the user sees is what they export.

**Exploration vs Build Mode:** When the user is still exploring ideas, asking for advice, or leaves major requirements open, **pause in Exploration Mode** and ask **2–4 concise plain-language questions** with recommended defaults—do NOT write full 3D model code until aligned. Go straight to **Build Mode** when the brief is already complete or the user asks to build right away. Ask only what is missing from these **6 core intake items**:
1. **Reference & style:** existing image, generate a reference image first, or build from text.
2. **Surface & materials:** flat vertex colors by default; image/procedural textures, transparent glass, or metal only when needed (keep generated image maps as fixed builder inputs).
3. **Animation & flexibility:** static vs animated; desired clips; rigid pivots (`RigBuilder`) vs flat-shaded `SkinnedMesh` for sinuous bodies/tentacles.
4. **Preview mode:** **Fast Preview** (orbit, textures, clip scrub) vs **Full Preview** (live sliders, rig/clip inspection). Do not build a heavy studio before the user chooses (`references/studio-preview.md`).
5. **Runtime VFX:** choose optional effects to suit the brief. Use the examples in `references/studio-preview.md` for inspiration and keep preview effects outside `.glb` export.
6. **Target & deliverables:** platform (`web`, `mobile`, `roblox`, `desktop`), asset kind (`prop`, `hero`, `creature`, `vehicle`, `building`), and output (`.glb`, standalone code, or both).

**Target:** `three` ≥ r170 as ES modules, checked against the official migration notes through r187 (§12 in `references/export.md`).

**Code is in `src/`**, not in the docs. Run, do not re-read: `tsx src/<name>.test.ts` (pure tests need no `three`). Reference files list each module's API.

**Reference image given?** Read `references/reference-matching.md` BEFORE writing code and run its loop after every build step (§15).

## Where to read next

| You are doing | Read | Code |
|---|---|---|
| Materials, flat shading, procedural or image-generated textures, vertex jitter (§4, §5) | `references/look.md` | `src/lowpoly.ts`, `src/jitter.ts` |
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
| Fast GLB viewer or Full Preview studio | `references/studio-preview.md` | [Fast Preview HTML](assets/fast-preview.html) |
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
- Import `THREE` normally. Do not inject a `THREEInstance`: helpers use the module import, so injection only half-works and hides bugs. The export step supplies the import line (§11).
- Give every builder and parameter list a unique name (`buildTreeAsset`, `treeParameters`). A generic `buildAsset` collides as soon as a composite imports two generators.
- For custom geometry (creatures, hulls, wings), keep shape logic in pure functions over plain triangle arrays and let THREE wrap the result at the end (§6.2). Primitive-only props can stay on `PartBuilder` directly.

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

**Run the gates, then look.** `npx tsx scripts/qa-asset.ts --module ./kernel.ts --export buildXTris --symmetric` for a pure kernel, or `--tris tris.json` for the final grounded asset (usage and gate list: `references/qa-gates.md`). It prints Q1 to Q10, writes `review.png` and ends with an `@@RESULT` line. Fix the first failing gate and rerun.

**Done rule.** Never report an asset as done until `qa-asset` passed on the current build (or each failing gate is named with its reason), `review.png` was opened with the view tool and one line per panel says what was seen, and everything listed as `UNVERIFIED` or `not checked` is repeated in the answer. For delivered previews, apply the final visual and animation checks in `references/studio-preview.md`. End with the gate table of the last run.

Determinism and parameters
- [ ] Defaults and ranges exist only in the schema; `build…Asset` calls `resolveParams`
- [ ] Seeds use `??`; seed `0` works; no `Math.random` or `Date.now`
- [ ] Each feature has its own forked stream; toggles do not reshuffle other parts
- [ ] Derived constraints prevent degenerate shapes; sub-seeds fit the seed range

Reference (only when the user gave an image)
- [ ] `ref-spec.md` written once, `ref.json` made, mask PNG checked; `ref-compare` run after every build step; gate table (§15) is in the answer

Geometry and look
- [ ] Axes follow §0; faces described by axis; right = −X when forward = +Z
- [ ] Custom geometry has positive `signedVolume`, also after mirroring; `DoubleSide` only on zero-thickness sheets
- [ ] Mirrored parts go through `add()`/`addTris` or `mirrorTris`, never a bare negative-scale `applyMatrix4`
- [ ] Custom-geometry and creature shapes live in pure triangle kernels with Node tests (determinism, signed volume, stream isolation)
- [ ] Parts go through `bakeFlat` + `paint`; per-triangle color functions are pure
- [ ] Jitter is applied before `add()`, seam-welded, with bounding volumes recomputed
- [ ] Metal parts have an environment map or a lowered `metalness`
- [ ] Overlays use a constant-distance inset and a small lift against z-fighting

Rigging, humanoids, textures (only when they apply)
- [ ] Moving parts use `RigBuilder` (rigid/mechanical/arthropods) or flat-shaded `SkinnedMesh` (serpentine/tentacle/organic curves) in rest pose; static parts stay merged; bone count fits category (`≤ 16` hero/prop, `≤ 24` building, `≤ 32` vehicle, `≤ 64` creature)
- [ ] Left/right bones use `mirrorBone` + mirror matrix; clips use `AnimationMixer` on the rig root with ≥ 24 fps, smooth easing, anticipation→climax→recovery, follow-through, and clean transitions
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
- [ ] `scripts/qa-asset.ts` exit 0 on the current build; `review.png` viewed, one finding per panel; UNVERIFIED items listed; gate table in the answer

Lifecycle and export
- [ ] Wrapper group grounds the asset at Y = 0; `disposeAsset` is called on every rebuild
- [ ] Meshes are named; triangle count is inside budget
- [ ] Exporter uses a real TS transpiler, includes helpers once, and has zero imports except `three` (`three/addons` only if `mergeGeometries` is used)
- [ ] GLB asked for: choose the export path in §16. Report the file, checks performed on its bytes, and any unchecked visual or import stages.
- [ ] Platform given or `detail` added: `scripts/mesh-stats.ts` (`--lods` for LOD) exit 0, profile and kind named, `not checked` repeated; `detail` default 2 leaves the existing asset unchanged
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

Full procedure and scripts: `references/reference-matching.md`. The rules, in order:

1. **Intake once.** View the reference once, write `ref-spec.md` (max 15 lines: facing, measured proportions, parts, palette, 3 signature features, out of scope), run `scripts/ref-intake.ts` (supports `front`, `side`, `top`, `back`, `34`, `34_back`), look at the mask PNG once. After that, never re-read the image: work from the spec and `ref.json`.
2. **Build coarse to fine, compare after every step.** A blockout (G1 proportions, G2 aspect) → B silhouette (G2 IoU ≥ 0.85 ortho, ≥ 0.70 for `34`/`34_back`) → C colour (G3 palette) → D detail (G4 signature features). Run `scripts/ref-compare.ts` after each step.
3. **Numbers before pictures.** Fix only the FIRST failing gate per round, change one parameter group, compare again. View an image only for the mask check, a failing IoU diff (`diff-<view>.png`) and the G4 milestones.
4. **Stop rule.** Max 3 rounds per gate; then keep the best version and report the gap. Never distort a shape to fill a red area. No detail pass (§6.8) while G2 fails.
5. **Log one line per round** (`step B, round 2: side IoU 0.71 -> 0.83, shortened neck`) and **end the answer with the gate table** of the last compare run. "Matches the reference" without that table is not allowed.

## 16. GLB file (when the user wants a `.glb`)

For geometry-only GLB, run `qa-asset.ts`, then `npx tsx scripts/export-glb.ts --module ./kernel.ts --export buildXTris --out asset.glb` (or `--tris tris.json`). It reruns Q1 to Q5 and verifies the output with E1 to E6.

When the GLB must retain vertex colors, materials, UVs, maps, rigging (`RigBuilder` or `SkinnedMesh`), or clips, run `npx tsx scripts/export-rigged-glb.ts --module ./asset.ts --export buildXAsset --out asset.glb`. It runs `GLTFExporter` → disk → `GLTFLoader` and reports RG1–RG5 (`@@RESULT`). See `references/glb-export.md`.

## 17. Budget and LOD (when there is a target platform, or the asset may be too heavy)

Run `npx tsx scripts/mesh-stats.ts --module ./kernel.ts --export buildXTris --profile web --kind prop` (`--kind` supports `prop`, `hero`, `creature`, `vehicle`, `building`; optional `--budget N` overrides the L0 triangle ceiling). It counts triangles, GPU vertices (3 x triangles, flat non-indexed), draw calls, materials, textures, bones and GLB size against the platform table, and says what it could not check. `--lods` builds `detail` 2, 1, 0 and checks about half the triangles per level, the same parts, bounds and pivot, determinism. Add LOD with `detailParam` and `lodRadiusScale` from `src/lod.ts`: default 2 must leave the existing asset unchanged. The numbers are counted, not measured on a GPU: say so. Details: `references/budget.md`.

## 18. Rig, clip and expression check (when the asset has pivots, clips or expression swaps)

Run `npx tsx scripts/rig-check.ts --meta char_metadata.json --kind creature --motion free` (`--kind` sets category bone limits; `--motion in-place` enforces 0m X/Z drift for locomotion loops while `free` allows hovering/leaping/lunging sway) to verify R1 hierarchy · R2 rest-pose · R3 clips (excluding `RefPose`) · R4 tracks & drift · R5 static expression mapping · R6 slide & floor (`qa.clipMinY`) clearance. Use Fast Preview for exported textures and clip playback, Full Preview for rig and expression inspection, and the target engine to verify imports. Details: `references/rig-check.md` and `references/studio-preview.md`.
