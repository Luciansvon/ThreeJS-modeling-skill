# Harness modeling guide

Contents: SKILL.md · references/composite.md · references/creatures.md · references/detail.md · references/examples.md · references/geometry.md · references/lifecycle.md · references/look.md · references/rigging-biped.md

Generated from the canonical harness files. Search by original file path and use the [web runtime guide](runtime.md) to choose which commands or helpers to use in this session.

## SKILL.md

~~~markdown source-excerpt
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
5. **Runtime VFX:** optional studio-only lightning/fire/aura, strictly excluded from `.glb` export.
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
| Anything that animates, humanoid, SkinnedMesh, extrude, texture (§6.4 to §6.7) | `references/rigging-biped.md` | `src/rig.ts`, `src/biped.ts`, `src/texture.ts` |
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

**Done rule.** Never report an asset as done until `qa-asset` passed on the current build (or each failing gate is named with its reason), `review.png` was opened with the view tool and one line per panel says what was seen, and everything listed as `UNVERIFIED` or `not checked` is repeated in the answer. End with the gate table of the last run.

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
2. **Build coarse to fine, compare after every step.** A blockout (G1 proportions, G2 aspect) → B silhouette (G2 IoU ≥ 0.85 ortho, ≥ 0.70 for `34`/`34_back`) → C colour (G3 palette) → D detail (G4 signature features). Run `scripts/ref-compare.ts` after each step; it takes under a second.
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
~~~

## references/composite.md

~~~markdown source-excerpt
# Composite assets

Reference for `threejs-asset-generator`. Read it when one asset is built from several sub-assets (plots, scenes, ships with crew). Section numbers match `SKILL.md`.

Contents: §8 Composite assets

## 8. Composite assets

A composite (plot, camp, village) is a builder that places other builders' output.

**Fixed, controlled, procedural.**
- *Fixed:* terrain slab, perimeter, gate opening, walkway. The slab's top surface is Y = 0; the slab extends below.
- *Controlled (parameters):* style, colors, footprint scale, which sub-assets are enabled, counts.
- *Procedural (seeded):* positions and rotations of trees, rocks, benches, bushes.

**Rules.**
1. Sub-asset builders and parameter lists are exported with unique names (`buildHouseAsset`, `houseParameters`).
2. Namespace sub-asset parameters (`house.wallColor`, `tree.leafColor`) with `prefixParams` and hand each builder only its slice with `pickParams`. Passing the plot's whole `params` into the house leaks the plot's seed and colors into it.
3. Derive each sub-asset's seed from the plot seed: `rng.fork('tree3').seed % 100000`.
4. Every sub-asset reports a footprint (`footprintOf`). Placement uses it for collision checks instead of guessing sizes.
5. Place in a fixed priority order (house, then trees, rocks, benches, bushes), one stream per category. Toggling a category never moves categories placed before it.
6. Placement is bounded: at most `maxTries` attempts per item, then skip that item. Skipping is deterministic; an unbounded `while (occupied)` loop can hang the UI.
7. Large counts of the same object: build a few variants and `clone()` them (clones share geometry and material), or use `InstancedMesh`.

```ts
export const prefixParams = (prefix: string, defs: ParamDef[]) =>
  defs.map((d) => ({ ...d, id: prefix + d.id, group: d.group ?? prefix.replace(/\.$/, '') }));
export const pickParams = (p: Record<string, unknown>, prefix: string) =>
  Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));

export function footprintOf(obj: THREE.Object3D) {                 // circle, conservative (trees, rocks, round props)
  const b = new THREE.Box3().setFromObject(obj, true);
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  return { x: c.x, z: c.z, r: Math.hypot(s.x, s.z) / 2 };
}

/** Rectangular AABB footprint for elongated buildings, walls, and vehicles so props can sit close to walls without huge circular dead zones. */
export function boxFootprintOf(obj: THREE.Object3D, clearance = 0) {
  const b = new THREE.Box3().setFromObject(obj, true);
  return { minX: b.min.x - clearance, maxX: b.max.x + clearance, minZ: b.min.z - clearance, maxZ: b.max.z + clearance };
}
export const hitsBox = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

type Spot = { r: number; clearance?: number };
/** Returns the items that fit, in input order, with x/z set. Returned r includes clearance. */
export function placeAll<T extends Spot>(rng: () => number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  items: T[], fixed: { x: number; z: number; r: number }[] = [], maxTries = 60) {
  const placed: (T & { x: number; z: number })[] = [];
  const hit = (x: number, z: number, r: number) => fixed.concat(placed).some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r);
  for (const it of items) {
    const r = it.r + (it.clearance ?? 0);
    for (let t = 0; t < maxTries; t++) {
      const x = bounds.minX + r + rng() * (bounds.maxX - bounds.minX - 2 * r);
      const z = bounds.minZ + r + rng() * (bounds.maxZ - bounds.minZ - 2 * r);
      if (!hit(x, z, r)) { placed.push({ ...it, x, z, r }); break; }
    }
  }
  return placed;
}
```

```ts
export function buildPlotAsset(raw: Record<string, unknown> = {}) {
  const p = resolveParams(plotSchema, raw);            // plotSchema.parameters = [..., ...prefixParams('house.', houseParameters), ...]
  const rng = createPRNG(p.seed as number);
  const seedFor = (label: string) => rng.fork(label).seed % 100000;
  const W = p.plotWidth as number, D = p.plotDepth as number;
  const root = new THREE.Group();

  root.add(buildSlab(p));                               // top surface at y = 0
  const house = buildHouseAsset({ ...pickParams(p, 'house.'), seed: seedFor('house') });
  house.position.set(0, 0, -D * 0.15);
  root.add(house);

  const bounds = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 };
  const candidates = p.hasTrees
    ? Array.from({ length: p.treeCount as number }, (_, i) => {
        const obj = buildTreeAsset({ ...pickParams(p, 'tree.'), seed: seedFor('tree' + i) });
        return { obj, key: 'tree' + i, r: footprintOf(obj).r, clearance: 0.5 };
      })
    : [];
  for (const s of placeAll(rng.fork('trees'), bounds, candidates, [footprintOf(house)])) {
    s.obj.position.set(s.x, 0, s.z);
    s.obj.rotation.y = rng.fork('rot-' + s.key)() * Math.PI * 2;
    root.add(s.obj);                                    // candidates that did not fit are never added
  }
  return root;
}
```

Carry the object on the item (`obj`), as above. Pairing `placeAll`'s result with the input array by index breaks as soon as one item is skipped.

### Architecture, hollow walls & interiors (`--kind building`)

- **Rectangular layouts:** Use `boxFootprintOf` + `hitsBox` when placing elongated houses, fences, market stalls, or city blocks so adjacent assets pack cleanly along walls.
- **Window & door cutouts (watertight):** Never punch unsealed holes into a box (fails Q4). Build each wall with an opening from 4 closed wall segments around the opening (left pier, right pier, lintel above, sill below), then place a recessed frame + glass pane (`references/look.md`) inside the opening.
- **Walkable interiors:** Give interior walls real thickness (two outward-facing closed slabs or an extruded U-frame) rather than `DoubleSide` sheets, and separate movable doors/shutters onto bounded hinge pivots (`references/rigging-biped.md`).
- **Budget:** Use `--kind building` in `mesh-stats.ts` (allows up to 6 materials on web for stone/plaster, roof tiles, wood trim, glass, metal, and emissive windows) and pass `--budget 20000` (or the platform building max) to `qa-asset.ts`.
~~~

## references/creatures.md

~~~markdown source-excerpt
# Pure triangle kernels and creatures

Reference for `threejs-asset-generator`. Read it before writing a creature, hull, wing or any custom-geometry asset that needs Node tests. Section numbers (6.2, 6.3) match the pointers in `SKILL.md`; `SKILL.md §N` means a section of the main file.

Contents: 6.2 Pure triangle kernels (`tri.ts`, tests) · 6.3 Organic parts and creatures (`organic.ts`, dragon kernel, rules) · 6.4 tapered box. Detail pass (UV, AO, sockets): `detail.md`.

## 6.2 Pure triangle kernels

For custom geometry (creatures, hulls, wings), put the shape logic in functions over plain arrays and let THREE appear only at the end. A kernel takes resolved params plus forked streams and returns named triangle arrays; `PartBuilder.addTris` wraps them. The kernel files (`tri.ts`, `organic.ts`, plus `prng.ts` and `params.ts`) never import THREE, so Node tests them without a renderer and the exporter includes them as plain helpers (SKILL.md §11).

Code: `src/tri.ts`. API:

- `export type V3 = [number, number, number];`
- `export type Tris = number[];                         // 9 numbers per triangle, CCW seen from outside`
- `export function signedVolumeOf(t: Tris) {            // closed meshes only; > 0 means outward CCW`
- `export function mirrorTris(t: Tris, axis: 0 | 1 | 2 = 0): Tris`


Tests that need no Three.js (run them with `node`, `tsx` or any test runner):

Test: `src/creatures.test.ts` (run `tsx src/creatures.test.ts`).

Use kernels where such tests are worth writing (creatures, hulls, anything with custom winding). A tree built from a few primitives stays on the `PartBuilder` path.

## 6.3 Organic parts and creatures

Trees, rocks and buildings are mostly primitives. Creatures and curved things (trunks, roots, tentacles, masts, dragons) need tubes along curves, limbs, spikes and sheets. These helpers are pure and wind outward.

Code: `src/organic.ts`. API:

- `export const add = (a: V3, b: V3): V3`
- `export const sub = (a: V3, b: V3): V3`
- `export const mul = (a: V3, s: number): V3`
- `export const dot = (a: V3, b: V3)`
- `export const cross = (a: V3, b: V3): V3`
- `export const norm = (a: V3): V3`
- `export function sampleSpline(pts: V3[], perSegment = 4): V3[]`
- `export function tubeTris(path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true, shape?: (angle: number, t: number) => number, upHint?: V3): Tris`
- `export const spikeTris = (base: V3, dir: V3, length: number, radius: number, sides = 4): Tris`
- `export function fanTris(apex: V3, rim: V3[]): Tris`
- `export function planarBladeTris(base: V3, mid: V3, tip: V3, halfThick: number, chordBase: number, chordMid: number, planeNormal?: V3): Tris`
- `export function radialArrayTris(tris: Tris, count: number, axis?: 0 | 1 | 2, center?: V3, startAngle?: number): Tris`


Example kernel: `src/dragonKernel.ts` (project-specific parameters and wing rim; copy and adapt).

- **Sides and rings:** 5 to 8 sides and about 4 samples per spline segment are enough for low-poly. Keep each bend under about 90°, otherwise the carried frame degenerates; add control points instead.
- **Radius:** use a function of `t` (0 at the start, 1 at the end) for body profiles, an array for limbs. Keep end radii above zero, or end the part with a spike.
- **Limbs:** a three-point chain (hip, knee, foot) with a taper. The angular kink at the knee suits the style; resample with `sampleSpline` only for smooth limbs. Feet, claws and teeth are `spikeTris`.
- **Spikes and horns:** size them from the local body radius and give them their own forked stream. On strongly curved spines use the frame's up direction instead of a fixed `[0, 1, 0]`.
- **Sheets:** a one-sided membrane has no volume, so `signedVolume` does not apply. Either give it thickness (a second, offset, reversed copy) or put it in its own `PartBuilder` with a `DoubleSide` material. This is the one accepted use of `DoubleSide` (SKILL.md §6).
- **Poses:** describe joints as points (hip, knee, foot), not as nested rotations. Points stay mirror-safe and testable.
- **Mirroring** follows SKILL.md §6.1; build the left side and mirror it.
- **Steep/vertical fins & tail fans:** Pass `upHint` (e.g. `[0, 0, 1]`) to `tubeTris` or use `planarBladeTris(..., [1, 0, 0])` so vertical blades stay razor-thin on `X = 0` instead of twisting 90°.
- **Multi-limb & radial creatures (spiders, krakens, octopi):** Use `radialArrayTris` for static spokes/suckers/limbs or build one articulated leg/tentacle template and instantiate radially around the thorax/mantle. Use `--kind creature` in `mesh-stats.ts` and `rig-check.ts` (up to 64 pivots), and prefer flat-shaded `SkinnedMesh` for flexible tentacles so draw calls stay low (1–2 per creature) while curves bend smoothly.
- **Vehicles & mechanical assemblies:** Separate rotating wheels/propellers (`wheelSpin*`), steering knuckles (`wheelSteerFL/FR` parented above `wheelSpinFL/FR`), and bounded door/turret hinges into dedicated child pivots. Use `--kind vehicle` in `mesh-stats.ts` (allows up to 5–6 materials for paint, rubber, metal, transparent glass, and emissive lights).

## 6.4 Biped / humanoid & tapered box helpers

For stylized blocky characters (goblins, villagers, robots) that need controlled taper/bevel without random vertex jitter, or articulated joints for animation:

`taperedBoxTris(wBot, dBot, wTop, dTop, h)` lives in `src/biped.ts`.

- **Biped limb pivots:** Build the left limb (`+X`) in local joint space (`[0, 0, 0]` at shoulder/hip), mirror its `Tris` with `mirrorTris(limb, 0)` for the right limb (`-X`), and attach each to a named `THREE.Group` (`armL_pivot`, `armR_pivot`, `head_pivot`) positioned at the joint on the torso so animations can rotate `pivot.rotation.x/z` cleanly without breaking flat shading.
~~~

## references/detail.md

~~~markdown source-excerpt
# Detail pass: UV atlas, chamfer, sculpt, fake AO, sockets, material maps

Reference for `threejs-asset-generator` §6.8. Read it when an asset looks flat or blocky and the answer is not more polygons: gills, skin and wood grain, fur, spots, soft box corners, organic bulges, dark creases, handles and spots that must sit on a surface, matte vs glossy parts.

Contents: 1 Atlas and UV (`ringTube`, `tubeWithUV`, `latheWithUV`, `paintAtlas`) · 2 Chamfer and sculpt · 3 Fake AO · 4 Sockets · 5 Material maps · Recipes · Tests (pure and THREE) · TODO

**Rules**
- `detail.ts` is pure (no THREE import, Node-testable, exporter helper). It holds the kernels and `paintAtlas` (the atlas painter is plain bytes). `detailThree.ts` holds everything that touches THREE; list both in `helpers` of the exporter (§11) and keep the tested names unique.
- Textured parts: `new PartBuilder({ uv: 'keep' })` and EVERY part of that material carries uv: `PartBuilder.add` throws when a part has none (and `mergeFlat` throws on mixed sets). `addTris` therefore never works on a `'keep'` builder. Kernel tris without uv go through `boxProjectUV` (`{ uv: 'box' }`) or into a different `PartBuilder` with its own material.
- Atlas convention: `cols x rows` grid, **cell 0 is top-left**, row-major, for `.webp` files and generated atlases alike. `atlasRect(cell, cols)` returns the uv rect; pass it as `cell` to `tubeWithUV`, `latheWithUV`, `loftSculptedBody`. Pattern inside a cell never tiles (no repeat inside an atlas), so one cell = one stretch of the pattern. Grid slots that no cell fills are opaque mid grey (`ATLAS_UNUSED`), never transparent.
- Generated atlases come from `seededAtlas(rng.fork('atlas'), cells, cols)`: DataTextures, no DOM, deterministic, export-safe. `paintAtlas` draws once from the stream it gets and gives every cell its own private stream, so editing one cell never changes another; append new cells at the end, because inserting one shifts the indices after it. Authored `.webp` atlases (`loadAtlasWebp`) and canvas atlases (`canvasAtlas`) need the browser: load them OUTSIDE the generator and pass the texture in as a parameter. The builder itself never loads files or touches the DOM (§6.7).
- Colors: the map is sRGB, roughness and bump maps are data (`NoColorSpace`). `roughnessMap` reads the G channel, so set `roughness: 1` and let the map decide (`atlasMaterial` does). Vertex color still multiplies the map: keep vertex colors light where the atlas carries the detail.
- Fake AO factor is multiplicative and floored at 0.35, applied in linear space. Rigged parts: use `aoShade` inside `add()` (asset space). Static merged assets: `applyAO(geometry, opts)` once, before `new Mesh`.
- `chamferBoxTris(center, size, bevel)`: bevel 0 gives a plain 12-triangle box, a negative or NaN bevel throws, a large bevel is clamped.
- Place small detail with `raycastTris` / `scatterOnSurface` + `placeTris`, never by guessing coordinates. Cast rays from inside the body outward. Mirror a socket with `mirrorHit`.
- Add `roughnessMap` / `bumpMap` to `disposeAsset` (§9 already does).

## 1 to 4: pure helpers

Code: `src/detail.ts`. API:

- `export type Rng = ()`
- `export type UVs = number[];                                  // 2 numbers per vertex, same order as Tris`
- `export type Rect = { u0: number; v0: number; u1: number; v1: number };`
- `export function atlasRect(cell: number, cols: number, rows = cols, pad = 0.002): Rect`
- `export function ringTube(path: V3[], ring: (i: number, angle: number, t: number) => number, sides = 8, caps = true, cell?: Rect)`
- `export const tubeWithUV = (path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true, cell?: Rect)`
- `export function latheWithUV(profile: [number, number][], segments = 8, cell?: Rect)`
- `export function chamferBoxTris(center: V3, size: V3, bevel: number): Tris`
- `export const sculptFalloff = (x: number, center: number, width: number)`
- `export const angleFalloff = (a: number, center: number, width: number)`
- `export type Sculpt = { t: number; width: number; amount: number; angle?: number; angleWidth?: number };`
- `export function loftSculptedBody(spine: V3[], rx: (t: number) => number, ry: (t: number) => number, sculpts: Sculpt[] = [], sides = 10, caps`
- `export type AOZone = { at: V3; radius: number; strength: number; facing?: V3 };`
- `export type AOOptions =`
- `export function aoFactor(centroid: V3, normal: V3, o: AOOptions): number`
- `export type Hit = { point: V3; normal: V3; t: number; tri: number };`
- `export function raycastTris(tris: Tris, origin: V3, dir: V3): Hit | null`
- `export function scatterOnSurface(tris: Tris, rng: Rng, count: number, o: { filter?: (p: V3, n: V3) => boolean; minDist?: number; maxTries?:`
- `export const mirrorHit = (h: Hit, axis: 0 | 1 | 2 = 0): Hit`
- `export function placeTris(local: Tris, hit: Hit, o: { scale?: number | V3; sink?: number; spin?: number; up?: V3 } = {}): Tris`
- `export type AtlasKind = 'flat' | 'noise' | 'grain' | 'fur' | 'spots' | 'gills' | 'scales';`
- `export interface AtlasCell`
- `export const ATLAS_UNUSED = { color: 0x808080, rough: 0.85, bump: 0.5 };`
- `export function paintAtlas(rng: Rng, cells: AtlasCell[], cols: number, cellPx = 32)`



## 1, 3, 5: THREE side (UV geometry, AO baking, atlas textures, material maps)

Code: `src/detailThree.ts`. API:

- `export function trisUVToGeometry(tris: Tris, uv: UVs)`
- `export const latheGeoWithUV = (profile: [number, number][], segments = 8, cell?: Rect)`
- `export const tubeGeoWithUV = (path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true, cell?: Rect)`
- `export function aoShade(base: Colorizer, o: AOOptions): Colorizer`
- `export function applyAO(geo: THREE.BufferGeometry, o: AOOptions)`
- `export function seededAtlas(rng: Rng, cells: AtlasCell[], cols: number, cellPx = 32)`
- `export function atlasMaterial(maps: { map?: THREE.Texture; roughnessMap?: THREE.Texture; bumpMap?: THREE.Texture; metalnessMap?: THREE.Textu`
- `export async function loadAtlasWebp(url: string, o: { rough?: string; bump?: string } = {})`
- `export function grayMapFromTexture(tex: THREE.Texture, o: { contrast?: number; invert?: boolean } = {})`
- `export function canvasAtlas(cols: number, rows: number, cellPx: number, draw: (ctx: CanvasRenderingContext2D, cell: number, x: number, y: nu`



## Recipes

```ts
// Every recipe below uses only names that are defined here. The PURE parts (kernels, scatter, placeTris, raycast) are executed by the
// "pure tests" at the end of this file; the THREE lines (PartBuilder, atlas, materials) need a project with three installed.

// ── Mushroom: gills under the cap, spots on top, stem with grain ──
const atlas = seededAtlas(rng.fork('atlas'), [
  { kind: 'gills', base: 0xd9c9a3, density: 24, rough: 0.9 },                       // cell 0: underside
  { kind: 'spots', base: 0xc23b30, accent: 0xf4ead8, density: 9, bump: 0.7 },       // cell 1: cap top
  { kind: 'grain', base: 0xe9dcc0, accent: 0xcdbb98, density: 6 },                  // cell 2: stem
], 2, 32);                                                                           // 3 cells in 2 columns: slot 3 stays neutral grey
const rect = (cell: number) => atlasRect(cell, atlas.cols, atlas.rows);
const capProfile: [number, number][] = [[0.001, 0.9], [0.55, 0.9], [0.62, 1.0], [0.5, 1.22], [0.28, 1.36], [0.001, 1.4]];   // closed dome, [radius, y]
const gillProfile: [number, number][] = [[0.001, 0], [0.54, 0]];                      // flat disc, hung 0.01 under the cap so nothing z-fights
const stemPath: V3[] = [[0, 0, 0], [0, 0.45, 0], [0, 0.92, 0]];                       // vertical paths are fine: the frame handles |T.y| > 0.9

const mush = new PartBuilder({ uv: 'keep' });                                         // EVERY part here carries uv
const ao = { zones: [{ at: [0, 0.9, 0] as V3, radius: 0.6, strength: 0.6, facing: [0, -1, 0] as V3 }], groundY: 0, groundHeight: 0.3, groundStrength: 0.4 };
mush.add(latheGeoWithUV(capProfile, 12, rect(1)), '#ffffff');                         // cap top (spots)
mush.add(latheGeoWithUV(gillProfile, 12, rect(0)), aoShade('#ffffff', ao), new THREE.Matrix4().makeTranslation(0, -0.01, 0));   // gills, darkened
const stem = tubeWithUV(stemPath, (t) => 0.18 - 0.05 * t, 8, true, rect(2));
mush.add(trisUVToGeometry(stem.tris, stem.uv), aoShade('#ffffff', ao));
const mushMesh = mush.build(atlasMaterial(atlas, { bumpScale: 0.6 }), { name: 'mushroom' });

// Bumps on the cap. They have no uv, so they get their OWN PartBuilder (default: no uv) and their own plain material.
const capTris = latheWithUV(capProfile, 12).tris;
const hits = scatterOnSurface(capTris, rng.fork('spots'), 9, { filter: (_p, n) => n[1] > 0.35, minDist: 0.25 });   // may return fewer than 9: check hits.length
const spinRng = rng.fork('spots.spin');                                              // separate stream: spin never shifts the positions
const bumpLocal = chamferBoxTris([0, 0.5, 0], [1, 1, 1], 0.2);                       // authored at the origin, base y = 0, points +Y
const flecks = new PartBuilder();
for (const h of hits) flecks.addTris(placeTris(bumpLocal, h, { scale: 0.08, sink: 0.2, spin: spinRng() * Math.PI * 2 }), '#f4ead8');
const fleckMesh = hits.length ? flecks.build(lowPolyMaterial(), { name: 'flecks' }) : null;   // build() throws with zero parts

// ── Pickup truck: soft body panels, door handle on the door ──
const bodyTris = chamferBoxTris([0, 0.9, 0], [1.8, 0.9, 4.2], 0.08);
const handleTris = chamferBoxTris([0, 0.5, 0], [0.25, 1, 1.5], 0.06);                // 1 unit tall: base y = 0, long side +Z. sink is a fraction of this height
const doorHit = raycastTris(bodyTris, [0.4, 1.0, 0.3], [1, 0, 0]);                   // from inside, outward (+X side)
if (!doorHit) throw new Error('door ray missed the body');
const truck = new PartBuilder();
truck.addTris(bodyTris, '#b23a2e');
truck.addTris(placeTris(handleTris, doorHit, { scale: 0.12, sink: 0.3 }), '#d8d8d8');   // sink 0.3 buries the lower 30% of the handle
const truckMesh = truck.build(lowPolyMaterial(), { name: 'truck' });

// ── Shiba: belly bulge from one sculpted body ──
const spine: V3[] = Array.from({ length: 9 }, (_, i) => [0, 0.5, i * 0.15]);         // horizontal spine along +Z
const shiba = loftSculptedBody(spine, (t) => 0.26 + 0.1 * Math.sin(Math.PI * t), (t) => 0.22 + 0.08 * Math.sin(Math.PI * t),
  [{ t: 0.45, width: 0.25, amount: 0.25, angle: Math.PI * 1.5, angleWidth: 1.2 }], 12);   // angle 3π/2 = underside
const shibaPart = new PartBuilder({ uv: 'keep' });
shibaPart.add(trisUVToGeometry(shiba.tris, shiba.uv), '#ffffff');
```


## Tests

Two files. The pure one needs only `tri.ts` and `detail.ts` (Node, `npx tsx detail.pure.test.ts`); it also runs the pure halves of every recipe. The THREE one needs a project with three installed.

Test: `src/detail.pure.test.ts` (run `tsx src/detail.pure.test.ts`). Needs only `tri.ts` and `detail.ts`.

Test: `src/detailThree.test.ts` (run `tsx src/detailThree.test.ts`). Needs `three` installed.

## TODO (found in review, not fixed in this version)

Fixed in this version: `chamferBoxTris` bevel 0 / negative, `PartBuilder` uv `keep` guard, unused atlas slots, `paintAtlas` per-cell streams, `SKILL.md` description length, runnable recipes.

Proven bugs or risks, still open:
- `loftSculptedBody` was only tested with horizontal spines. A spine that climbs steeply (|T.y| > 0.9) or curves upward can twist the frame so "underside" is no longer down. Angle 0 is +X for a +Z spine and -Z for a +X spine. Test steep and curved spines before relying on `angle`.
- `raycastTris` returns the geometric normal: a mesh with wrong winding gives a flipped normal without warning.
- `applyAO` has no guard: calling it twice darkens twice.
- `aoShade` and `applyAO` multiply in linear space; the 0.35 floor is linear, not sRGB. Judge by eye.
- Atlas uses `NearestFilter` without mipmaps and can shimmer at a distance. `.webp` atlases from `loadAtlasWebp` keep default filters, so they look different from generated ones.
- `placeTris` assumes the local convention (base y = 0, pointing +Y). Details that break it float or sink silently. `sink` is a fraction of the local height.
- `scatterOnSurface` can return fewer than `count` when the filter is tight. Check `hits.length`; `PartBuilder.build` throws with zero parts.
- `mirrorHit` mirrors point and normal but does not rotate `spin`, so asymmetric details face the wrong way on the mirrored side.

Not verified (no test or no browser):
- Export of `DataTexture` through `GLTFExporter` (UV origin differs: `DataTexture.flipY` is false by default and glTF uses another UV origin).
- `bumpMap` / `bumpScale` together with `flatShading` against migration notes r170..r187.
- `RigBuilder` with UV atlases (its `PartBuilder` is created without UV options).
- Browser-only helpers (`loadAtlasWebp`, `grayMapFromTexture`, `canvasAtlas`): typecheck only.
- No render has ever been looked at. All tests are numeric (volume, winding, determinism).
- Export parity: `generate()` fingerprint versus exported code for detail helpers.
- THREE-side tests (`src/detailThree.test.ts`) have never been run; they need `three` installed (the pure tests run with `tsx`).

Feature gaps:
- UV exists only for tube, lathe and sculpted body. `chamferBoxTris`, `loftTris`, `extrudeTris`, `spikeTris`, `fanTris` and the biped helpers have no UV variants; `PartBuilder` has no `addTrisUV` and cannot mix uv and non-uv parts in one material.
- No automatic AO (hemisphere sampling through `raycastTris`), no occlusion between separate objects, no `normalMap`, no `metalnessMap` from `paintAtlas`.
- Atlas patterns: 7 kinds, none tile. Missing: cracks, orange peel, long fur, rust.
- Chamfer: one value for all edges; no per-edge bevel and no cylinder chamfer.

Packaging:
- Done in v4: code lives in `src/*.ts` with runnable tests; `Contents:` lines link this file; toggle rules are in `SKILL.md` §3.
- Still open: triangle and memory budget (chamfer box 44 triangles vs 12 for a plain box; atlas memory per `cellPx`) and a troubleshooting guide (black texture, floating detail, AO too dark).
~~~

## references/examples.md

~~~markdown source-excerpt
# Worked example

Reference for `threejs-asset-generator` §1. A complete small generator: schema, resolveParams, seeded build.

Contents: tree generator

```ts
// treeGenerator.ts
import * as THREE from 'three';
import type { ParamDef, AssetGeneratorSchema } from './types';
import { createPRNG } from './prng';
import { resolveParams } from './params';
import { PartBuilder, lowPolyMaterial } from './lowpoly';
import { applyVertexJitter } from './jitter';
import { groundAsset } from './lifecycle';
import { exportStandaloneCode } from './codeExport';   // project-specific exporter, see references/export.md §11
import rawTree from './treeGenerator.ts?raw';

export const treeParameters: ParamDef[] = [
  { id: 'seed', label: 'Random Seed', type: 'number', default: 42, min: 0, max: 99999, step: 1 },
  { id: 'trunkHeight', label: 'Trunk Height', type: 'number', default: 3.5, min: 1, max: 10, step: 0.1 },
  { id: 'leafColor', label: 'Leaf Color', type: 'color', default: '#2d6a4f' },
  { id: 'hasFruits', label: 'Add Fruits', type: 'boolean', default: true },
];

export function buildTreeAsset(rawParams: Record<string, unknown> = {}) {
  const p = resolveParams({ parameters: treeParameters }, rawParams);
  const rng = createPRNG(p.seed as number);
  const crownRng = rng.fork('crown');   // one stream per feature (see §2)
  const fruitRng = rng.fork('fruit');

  const bark = new PartBuilder();
  const leaves = new PartBuilder();
  // ... bark.add(geometry, '#6b4f3a', matrix); leaves.add(applyVertexJitter(g, 0.15, crownRng), p.leafColor, m);

  const content = new THREE.Group();
  content.add(bark.build(lowPolyMaterial({ roughness: 0.9 }), { name: 'bark' }));
  content.add(leaves.build(lowPolyMaterial(), { name: 'leaves' }));
  return groundAsset(content);
}

export const treeGenerator: AssetGeneratorSchema = {
  id: 'procedural-tree', name: 'Low-Poly Tree', category: 'Nature',
  description: 'Procedural low-poly tree.',
  parameters: treeParameters,
  generate: buildTreeAsset,
  generateCode: (params) =>
    exportStandaloneCode({ entry: { raw: rawTree, fn: 'buildTreeAsset' }, deps: [], params }),
};
```
~~~

## references/geometry.md

~~~markdown source-excerpt
# Custom geometry, winding, overlays

Reference for `threejs-asset-generator`. Read it before writing custom BufferGeometry, mirrored parts or contoured overlays. Creature kernels are in `creatures.md`, rigs in `rigging-biped.md`, detail in `detail.md`. Section numbers match `SKILL.md`.

Contents: §6 Custom geometry and winding (`geometry.ts`) · §6.1 Mirrored parts · §6.2 to 6.8 pointers · §7 Contoured overlays (`overlay.ts`)

## 6. Custom geometry and winding

Use custom `BufferGeometry` when primitives would need distorting rotations or non-uniform scaling (hulls, wings, tapered fuselages, bows). Build watertight meshes from explicit vertices.

- Wind every triangle **counter-clockwise when seen from outside**. Face normal `N = (V2 − V1) × (V3 − V1)` must point away from the body:

| Face | Required normal |
|---|---|
| +X side | N.x > 0 |
| −X side | N.x < 0 |
| Top | N.y > 0 |
| Bottom | N.y < 0 |
| Front (+Z) | N.z > 0 |
| Rear (−Z) | N.z < 0 |

- Verify closed meshes with the **signed volume** instead of eyeballing normals: positive means outward CCW, negative means inside-out. Run it as a dev assertion in the generator tests.
- Don't hide winding bugs with `side: DoubleSide`; it doubles fragment cost and masks the defect. The one exception is a zero-thickness sheet such as a wing membrane (§6.3).
- Build non-indexed from a flat triangle array; `bakeFlat` then adds normals and normalizes attributes.

Code: `src/geometry.ts`. API:

- `export function trianglesToGeometry(flatXYZ: number[]) {          // 9 numbers per triangle`
- `export function signedVolume(geo: THREE.BufferGeometry) {         // closed meshes only`


### 6.1 Mirrored and symmetric parts

Build one side and mirror it. A mirror (any transform with a negative determinant, such as `makeScale(-1, 1, 1)`) turns every triangle inside-out: `applyMatrix4` moves the vertices but keeps their order, so afterwards the normals point into the body and `signedVolume` goes negative. The symptom is one wing that renders dark, culled, or lit from behind.

- **Through THREE:** pass the mirror matrix to `PartBuilder.add` / `addTris`. They check `matrix.determinant() < 0` and call `flipWinding` for you. Compose placement first, mirror last: `mirror.clone().multiply(place)`.
- **On arrays:** `mirrorTris(tris, 0)` negates the axis coordinate and swaps vertices 1 and 2 of every triangle (§6.2).
- **Not with `Object3D.scale.x = -1`.** The renderer compensates for a negative-determinant world matrix at draw time, but the geometry itself stays inside-out, so it breaks once the part is baked, merged or exported.
- **Sides follow §0.** With forward +Z the left wing is at +X and the right at −X. Build the left and mirror it for the right (or the reverse); pick one and keep it.
- **Exact or slightly varied.** Reusing one forked stream (`rng.fork('wing')`) gives a perfect mirror image. Forking per side (`'wing.L'`, `'wing.R'`) gives natural asymmetry. Decide per feature, don't mix.

### 6.2 Pure triangle kernels and 6.3 Organic parts and creatures

Full code and tests: `references/creatures.md`. Read it before writing a creature, hull, wing or any custom-geometry asset. The rules:

- Shape logic lives in pure functions over flat triangle arrays (`Tris`: 9 numbers per triangle, CCW from outside). THREE only wraps the result, through `PartBuilder.addTris`.
- Kernel files (`tri.ts`, `organic.ts`, `prng.ts`, `params.ts`) never import THREE. Node tests them: same seed gives the same triangles, `signedVolumeOf(closed part) > 0`, `mirrorTris` keeps the volume positive, and toggling one feature leaves the other parts unchanged.
- Helpers in the reference: `signedVolumeOf`, `mirrorTris`, `sampleSpline`, `tubeTris` (frames without twist), `spikeTris`, `fanTris`.
- Limbs are point chains (hip, knee, foot), never nested rotations. Spikes and horns get their own forked stream.
- A one-sided sheet (membrane, sail) has no volume. Give it thickness, or put it in its own `PartBuilder` with a `DoubleSide` material, the one accepted use of `DoubleSide`.
- Primitive-only props (a tree from a few cones) stay on the `PartBuilder` path.

### 6.4 to 6.7 Rigged characters, biped helpers, directed extrude, UV textures

Full code and tests: `references/rigging-biped.md`. Read it before writing anything that must move, any humanoid, or any asset with a texture. The rules:

- **Rigging (6.4).** A moving part cannot be merged into the static mesh. Declare bones as pivots (`BoneDef`: name, pivot in asset space, parent listed first) and add parts to a bone with `RigBuilder.addTris(bone, material, tris, color, matrix?)`. Parts merge **per bone and material**, geometry is shifted so the pivot is the bone's origin, and bones nest as plain `THREE.Group`s. Draw calls = bones × materials, so keep a character to about 8 to 12 bones and 1 or 2 materials. Author every part in the **rest pose** in asset space; mirrored bones use `mirrorBone` and a mirror matrix (winding is fixed for you). Animate with `makeClip` (quaternion tracks, `AnimationMixer`), never by regenerating geometry. `groundAsset` and `disposeAsset` work unchanged on the rig root.
- **Biped helpers (6.5).** Joints are points (`bipedRest`), limbs are `tubeTris` chains, `twoBoneIK` bends knees and elbows without changing bone lengths, `footTris` and `handTris` take an explicit forward and up so toes and fingers point the right way, `eyeTris`, `noseTris`, `earTris` give face features, and `sleeveTris` makes clothing that hugs a limb.
- **Directed extrude and bevel (6.6).** `loftTris` and `extrudeTris` push a 2D outline along any direction with taper and chamfered ends; `tubeTris` takes an optional `shape(angle, t)` for pleats, ribs and ear ridges. These replace hand-written vertex lists for trouser folds, inner-ear lips, belts and plates. `applyVertexJitter` (§5) stays the tool for random variation.
- **UV and textures (6.7).** Default stays UV-free flat vertex color. For a texture, create `new PartBuilder({ uv: 'box', uvScale })` (asset-space box projection, deterministic) or `{ uv: 'keep' }` for authored UVs, and use `seededNoiseTexture` (a `DataTexture`, no DOM, so it survives export). Vertex color multiplies the map. Do not draw canvas textures inside generators: they need the DOM and break purity and the exporter. Generated atlases use `seededAtlas` (DataTexture); `.webp` or canvas atlases are loaded by the app and passed in as a parameter (§6.8).

### 6.8 Detail pass

Full code and tests: `references/detail.md`. Read it when the asset looks flat or blocky and polygons are not the answer. The rules:

- **Atlas and UV.** `tubeWithUV`, `latheWithUV` and `loftSculptedBody` return `{ tris, uv }`; `atlasRect(cell, cols)` places the uv in one cell of a grid atlas (cell 0 top-left). Use `PartBuilder({ uv: 'keep' })`. Generated atlas: `seededAtlas` (DOM-free). `.webp`/canvas atlas: browser only, injected as a parameter.
- **Chamfer and sculpt.** `chamferBoxTris` replaces razor-sharp boxes; `loftSculptedBody` + `sculptFalloff` give elliptical sections with controlled bulges and dents. `applyVertexJitter` (§5) stays the random tool.
- **Fake AO.** `aoShade` (per `add()`, rigged-safe) or `applyAO` (static, once). Floor 0.35, multiplicative.
- **Sockets.** `raycastTris` / `scatterOnSurface` find surface points, `placeTris` aligns detail (base on y = 0, up +Y) to the hit normal with `sink`, `mirrorHit` mirrors it. Details never float or sink.
- **Material maps.** `atlasMaterial({ map, roughnessMap, bumpMap })`: grayscale data maps (`NoColorSpace`, `roughness: 1`) give gloss vs matte without geometry.

## 7. Contoured overlays (decks, floors, armor plates)

An overlay follows the perimeter of the body underneath and leaves a rim around it.

- Inset by a **constant distance** along the outline. Scaling the outline by 0.95 about the origin gives an uneven rim (on a 10 × 4 footprint that is 0.25 on the long axis and 0.10 on the short one) and shifts off-center shapes sideways.
- Lift the overlay a hair (about 0.1–0.3 % of the body height) above the surface it covers, otherwise the coplanar faces z-fight.

Code: `src/overlay.ts`. API:

- `export function insetPolygon(pts: number[][], d: number)`
~~~

## references/lifecycle.md

~~~markdown source-excerpt
# Grounding, lifecycle, lights

Reference for `threejs-asset-generator`. Read it for grounding, disposal, rebuilds, lights and shadows inside assets. Section numbers match `SKILL.md`.

Contents: §9 Grounding and lifecycle (`lifecycle.ts`) · §10 Lights and shadows

## 9. Grounding and lifecycle

**Grounding.** Return a wrapper group whose inner content is shifted so the lowest point sits at Y = 0 and the footprint is centered. The offset lives in the inner group, so a composite can freely `root.position.set(x, 0, z)` without destroying the grounding.

Code: `src/lifecycle.ts`. API:

- `export function groundAsset(content: THREE.Object3D, center = true)`
- `export function disposeAsset(root: THREE.Object3D)`

Exception: composites with a terrain slab define Y = 0 as the slab's top surface (§8).

**Disposal.** The preview rebuilds on every slider change. Without disposal, GPU memory grows until the tab dies. Dispose each geometry and material once (clones share them), then drop the group.

(`disposeAsset` is in `src/lifecycle.ts`.)
Since r186 `Object3D` has its own `dispose()`; custom subclasses must call `super.dispose()`.

**Metadata.** Set `mesh.name` on every mesh (debugging, glTF node names) and `root.userData.stats = { triangles, meshes }` so UIs can show a budget. Low-poly guideline: a prop under about 2k triangles, a composite plot under about 20k, and draw calls equal to the number of materials.

**Articulated / rigged assets (animation pivots).** Merging everything into one mesh is ideal for static props, but characters or vehicles with moving parts need joint pivots:
- Keep the static core (torso, hull) in one `PartBuilder`, and build each moving limb (`head`, `armL`, `armR`, `legL`, `legR`) in its own `PartBuilder` with local origin at the joint pivot (`[0, 0, 0]` = shoulder, hip, or neck).
- Wrap each limb mesh in a named `THREE.Group` positioned at the joint coordinates on the parent, then ground the outer character with `groundAsset`. See `references/creatures.md` §6.4 for biped helpers (`taperedBoxTris`, `buildPivot`).

## 10. Lights and shadows inside assets

- Prefer emissive materials over lights. Lights belong to the scene; if an asset needs one (a lantern), expose a boolean such as `addLights` that defaults to `false`.
- Light intensity is physical since r155, and `PointLight`/`SpotLight` default to `decay = 2`. Values copied from older code look black; tune by eye.
- Set `castShadow = true` on merged meshes. Set `receiveShadow = true` only on surfaces that should catch shadows (ground, walls, decks). Receiving everywhere causes acne on flat faces.
- Use `PCFShadowMap`; `PCFSoftShadowMap` is deprecated (r182) and removed for WebGPU (r186), and `PCFShadowMap` is soft now. If acne appears, raise `light.shadow.normalBias` slightly; since r183 WebGPU shadows need less bias than before.
~~~

## references/look.md

~~~markdown source-excerpt
# Low-poly look and natural shapes

Reference for `threejs-asset-generator`. Read it when choosing a material, texture, palette, flat shading, or vertex jitter. Section numbers match `SKILL.md`.

Contents: §4 Low-poly look (`lowpoly.ts`) and texture choices · §5 Vertex jitter (`jitter.ts`)

## 4. Low-poly look

**Flat shading, two layers.** Set `flatShading: true` (it works for the WebGL preview), and also bake real per-face normals into the geometry (`bakeFlat`). The flag is not stored in glTF, so a flag-only asset looks smooth after `GLTFExporter`; baked normals survive export and behave the same under WebGL and WebGPU.

**Materials.**
- Organic and stone: `roughness` 0.7–0.9, `metalness` 0–0.2.
- Painted or metal parts: `roughness` 0.35–0.6, `metalness` 0.5–0.8. Rough metal (roughness 0.7–0.9 with metalness 0.6–0.9) renders almost black without an environment map; metals only reflect their surroundings. Tell the user that metal parts need `scene.environment` (for example `RoomEnvironment` through `PMREMGenerator`), or lower `metalness` to ≤ 0.35 for an environment-free scene.
- Lamps and windows: use `emissive` and `emissiveIntensity`, not extra lights (§10).
- Transparent glass (vehicle windshields, cockpits, building windows): put glass in its own material (`MeshStandardMaterial` with `transparent: true`, `opacity: 0.42–0.58`, `roughness: 0.12`, `metalness: 0.15`, `depthWrite: false`, muted tint `#88c9e8`). Keep glass panes as clean closed slabs or thin single-sided outward panes over a dark interior shell so alpha sorting stays clean and survives `GLTFExporter` without needing `MeshPhysicalMaterial` transmission extensions.
- Palette: muted hex tones (`#2e7d32`, `#e6a100`, `#1e222a`); avoid pure primaries.
- Since r181 PBR energy conservation, and since r187 PMREM, shading differs slightly between versions. Judge a palette by relative contrast, not by absolute screenshots.

**Color management.** `new THREE.Color('#2d6a4f')` reads hex as sRGB and stores linear values. Vertex-color attributes are read as linear, so copy `c.r, c.g, c.b` directly. Writing `hex / 255` yourself produces washed-out colors.

### Choose the texture path

| Need at the target camera distance | Use |
| --- | --- |
| Silhouette, flat color blocks, or gloss are enough | Solid material, vertex colors, and scalar roughness or metalness. Keep simple bollards and distant barriers UV-free. |
| A pattern or marking is visible, or an exact label was requested | Reuse suitable supplied art. Otherwise use seeded pixels for repeatable patterns, vector paths or authored artwork for exact lettering and logos. |
| Original image detail such as painted fur markings or an irregular weathered surface | If an image tool is available in this session and can return a usable image, call it for the needed map. If unavailable, provide a procedural approximation or a color placeholder plus a handoff prompt. |

For image generation, specify the material, palette, coverage, scale, and UV region or tile. Request a flat, straight-on base-color image with even illumination, with shadows, highlights, and mockup backgrounds excluded. Ask for edge-to-edge repetition only for a tiling map. Give seams room in an atlas and keep lettering in an exact editable layer.

Save the selected image as a fixed asset and load it outside the seeded builder. Pass the loaded texture in as an explicit input so preview and export use the same data. Use the UV and atlas workflow in [rigging and UVs](rigging-biped.md#67-uv-and-seeded-textures) and [detail](detail.md). In Three.js mark ordinary PNG or JPEG base-color and emissive maps as `SRGBColorSpace`, and normal, roughness, and metalness maps as `NoColorSpace`. Add data maps for a specific material requirement and validate them separately. Use the smallest useful resolution within [the target budget](budget.md).

Report the image file or procedural source, the material slot, and which part it covers. Inspect the actual mesh for UV alignment, scale, seams, and legibility. If GLB is requested, use [the Three.js export path](glb-export.md#threejs-export-route) and inspect the reloaded material and target map. Keep image creation, mesh application, and export checks as separate evidence.

**One mesh per material, colors in vertices.** Paint each part with a vertex color and merge all parts that share a material. A part that must move on its own (a limb, a head, a door) is the exception: merge per bone, not per asset (§6.4). A tree becomes 2 meshes instead of 60, and the colors stay editable through parameters.

Code: `src/lowpoly.ts`. API:

- `export const lowPolyMaterial = (o: THREE.MeshStandardMaterialParameters = {})`
- `export function bakeFlat(geo: THREE.BufferGeometry, keepUV = false)`
- `export function flipWinding(g: THREE.BufferGeometry)`
- `export type TriInfo = { normal: THREE.Vector3; centroid: THREE.Vector3; index: number };`
- `export type Colorizer = THREE.ColorRepresentation | ((tri: TriInfo) => THREE.ColorRepresentation);`
- `export function paint(geo: THREE.BufferGeometry, color: Colorizer)`
- `export function mergeFlat(parts: THREE.BufferGeometry[])`
- `export function boxProjectUV(g: THREE.BufferGeometry, scale = 1)`
- `export interface PartOptions { uv?: false | 'keep' | 'box'; uvScale?: number }   // default: no uv (flat vertex color)`
- `export class PartBuilder`
- `.constructor(private opt: PartOptions = {}) {}`
- `.add(geo: THREE.BufferGeometry, color: Colorizer, matrix?: THREE.Matrix4)`
- `.addTris(tris: number[], color: Colorizer, matrix?: THREE.Matrix4)`
- `.build(material: THREE.Material, o: { name?: string; castShadow?: boolean; receiveShadow?: boolean } = {})`


**Per-triangle color.** `paint` and `PartBuilder.add` also take a function, called once per triangle with its face normal, centroid and index, both in asset space (after `matrix`). One flat color per face keeps the faceted look.

```ts
const back = new THREE.Color('#2f7d4b'), belly = new THREE.Color('#e08a2e'), tip = new THREE.Color('#9fd36a'), tmp = new THREE.Color();
body.add(geo, ({ normal, centroid }) =>
  tmp.copy(normal.y < -0.35 ? belly : back)                           // orange underside
     .lerp(tip, THREE.MathUtils.clamp(Math.abs(centroid.x) / halfSpan, 0, 1)),   // gradient toward the wing tips
  matrix);
```

- **Fake AO.** Wrap any colorizer with `aoShade(base, { zones, downBias, groundY… })` (`references/detail.md` §3) to darken pockets (under chin, under a cap, inside a cabin, near the ground). Contact and crease shading is what makes low-poly read as volume.
- The function must be pure: it depends only on its argument, or on its own forked stream (triangle order is fixed, so that stays deterministic). Never read `Math.random`.
- Return a hex string (read as sRGB) or a `THREE.Color` (already working-space). Both are correct; do not divide hex by 255 yourself.
- The `tri` object is reused between calls. Copy values out if you keep them.
- Use `Math.abs(centroid.x)` when a gradient must match on both mirrored sides.

Merge rules (`mergeFlat` throws when they are broken; the addons `mergeGeometries` returns `null` and only logs an error):
- All inputs must be non-indexed. `BoxGeometry` is indexed while `IcosahedronGeometry` is not, so `bakeFlat` normalizes everything.
- All inputs carry exactly `position`, `normal`, `color`, plus `uv` when the `PartBuilder` was created with `{ uv }` (all parts or none). Normalize them in one place (`bakeFlat` + `paint`) instead of requiring every custom geometry to carry a dummy `uv`.
- Parts needing a different material (metal vs wood) go in a separate `PartBuilder`.
- `mergeFlat` is in-repo on purpose: it keeps the exported code free of `three/addons` (§11). If a project needs indexed or grouped output, use `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` (renamed from `mergeBufferGeometries` in r151); the export then needs the addons import.

## 5. Natural shapes: vertex jitter

Displace vertices **before** `add()` (in the primitive's local space) with a dedicated forked stream. Vertices that share a position must receive the same offset or the mesh tears open at seams.

Code: `src/jitter.ts`. API:

- `export function applyVertexJitter(geo: THREE.BufferGeometry, amount: number, rng: () => number, pinBottom = false)`


The pinned base is measured from the geometry's own bounding box (primitives are centered on the origin, so a fixed `|y| < 0.02` test would pin the equator, not the bottom). Bounding volumes are recomputed after displacement, and normals are computed once, in `bakeFlat`. Express `amount` relative to the shape size (for example `0.12 * radius`), not as a global constant.
~~~

## references/rigging-biped.md

~~~markdown source-excerpt
# Rigging, biped helpers, directed extrude, UV textures

Reference for `threejs-asset-generator`. Read it before writing a character, anything that must animate, a humanoid, an extruded or beveled shape, or a textured asset. `SKILL.md §N` means a section of the main file; 6.2 and 6.3 are in `creatures.md`.

Contents: 6.4 Rigged parts (`rig.ts`, clips) · 6.5 Biped helpers and 6.6 Directed extrude and bevel (`biped.ts`, tested) · 6.7 UV and seeded textures · tests. Detail pass (atlas, AO, sockets): `detail.md`.

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
~~~
