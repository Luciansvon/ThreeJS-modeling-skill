# Harness verification and delivery guide

Contents: references/budget.md · references/export.md · references/glb-export.md · references/qa-gates.md · references/reference-matching.md · references/rig-check.md · references/studio-preview.md

Generated from the canonical harness files. Search by original file path and use the [web runtime guide](runtime.md) to choose which commands or helpers to use in this session.

## references/budget.md

~~~markdown source-excerpt
# Budget and LOD

Reference for `threejs-asset-generator`. Read it when an asset has a target platform, when the user asks "is this too heavy", or before you add a `detail` slider. Section numbers continue `SKILL.md` (§17).

Contents: Platform table · Run it · What is counted · The gates (B1 to B6) · LOD with `detail` · The LOD gates (L1 to L4) · The Done report · What it does not cover

Scripts (run them, do not read them): `scripts/mesh-stats.ts`; library `scripts/budget.ts` (`PROFILES`, `assetStats`, `budgetGates`, `lodGates`); LOD helpers `src/lod.ts`; tests `scripts/budget.test.ts`, `src/lod.test.ts`. Needs `tsx` only, no `three`. Same output contract as the other scripts: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = a gate failed, 1 = usage or load error.

## Platform table

Numbers aligned with blender-skills. Each range is *target to hard limit*: the gate fails above the limit and says "above the target" between the two.

| Platform | Hero / Creature tris | Vehicle tris | Building tris | Prop tris | Materials (default / vehicle & building) | Texture max | Bones | Draw calls |
|---|---|---|---|---|---|---|---|---|
| `mobile` | 5k to 15k | 3k to 12k | 2k to 10k | 0.3k to 3k | 1 to 2 / 3 to 5 (`building` 2–4) | 1024 | 75 | 50 |
| `web` (three.js, default) | 10k to 30k | 6k to 25k | 4k to 20k | 1k to 10k | 1 to 2 / 3 to 6 | 2048 | 100 | 100 |
| `vr` (standalone) | 10k to 40k | 8k to 30k | 5k to 25k | 1k to 10k | 1 to 3 / 3 to 6 | 2048 | 100 | not in the table |
| `desktop` | 50k to 150k | 30k to 120k | 20k to 100k | 5k to 50k | 2 to 6 / 4 to 8 | 4096 | 150 to 300 | not in the table |

Web delivery: a `hero`, `creature`, or `vehicle` model is at most 2 to 5 MB as GLB (gate B6, mobile and web only); a whole scene at most 10 to 20 MB and 50 to 100 draw calls on mobile web (the scene totals are not checked per asset, see the end).
`--kind` accepts `prop`, `hero`, `creature`, `vehicle`, or `building`. `--lods` automatically passes the selected `--profile` + `--kind` max triangle limit (or `--budget N`) into L0 QA instead of clamping at 2,000 triangles.

A limit the table does not give is reported under `not checked`. Do not fill it with a number you remember.

## Run it

```
# A kernel, no THREE (the builder is called with `{...params}`)
npx tsx scripts/mesh-stats.ts --module ./myKernel.ts --export buildMyTris --profile web --kind prop

# The final asset as tris.json, with what the arrays cannot say, and the GLB you exported
npx tsx scripts/mesh-stats.ts --tris tris.json --meta meta.json --glb asset.glb --profile mobile --kind hero

# LOD: builds detail 2, 1, 0 and checks the rule (the builder must accept `detail`)
npx tsx scripts/mesh-stats.ts --module ./myKernel.ts --lods --open wingL,wingR --symmetric
```

`scripts/fixtures/dragon.qa.ts` wraps the real dragon kernel (which needs `(params, rng)`) into the `(params) => parts` shape the scripts accept: copy it for a kernel with another signature.

`meta.json`, every key optional:

```json
{ "parts": { "body": { "material": "wood", "bone": "root" } }, "textures": [1024, { "name": "atlas", "width": 2048 }], "bones": 12 }
```

## What is counted

- **Triangles**: from the arrays. **GPU vertices = 3 x triangles**, because flat shading keeps every triangle non-indexed (a hard edge or a seam duplicates vertices anyway). A smooth, indexed asset would have fewer; this skill does not build one.
- **Draw calls**: one per group of (bone, material), because parts are merged per bone and material (`PartBuilder.build`). Without `--meta` the number is **an upper bound** (one per part) and is labelled so; with a material for every part it is exact. One asset is only a share of a scene's calls.
- **Texture memory**: RGBA8 with a full mip chain, uncompressed: 1024 = 5.33 MiB, 2048 = 21.33 MiB, 4096 = 85.33 MiB. Compression (KTX2) lowers memory, not the size limit.
- **Materials, bones, textures**: only from `--meta`. No meta, no claim: they are listed as `not checked`.

## The gates

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| B1 triangles | triangles within the limit for the platform and kind (`--kind prop` default, `hero`) | too many segments or details: lower `detail` |
| B2 materials | distinct materials within the limit (needs `--meta`) | parts that could share one material |
| B3 textures | the largest texture within the platform limit; total MiB is reported | an atlas too big for mobile |
| B4 bones | bone count within the limit (needs `--meta`) | small moving parts with their own bone |
| B5 draw calls | groups of bone x material within the limit (mobile 50, web 100) | parts that do not share a bone and a material |
| B6 GLB size | with `--glb` and `--kind hero` on mobile or web: at most 5 MiB (target 2) | a flat, non-indexed export is large by design; optimise outside the skill (gltfpack, meshopt) |

## LOD with `detail`

One parameter, `detail`, 0 (low), 1 (medium), 2 (full, the default). It is a **resolution knob over the same seeded asset**: fewer segments and fewer small details. No decimation, no new random stream.

Rules:
1. About **half the triangles per level** (the gate accepts 0.35 to 0.65 of the level above).
2. The **same parts**, hence the same materials or fewer.
3. The **same pivot and bounds**: size, lowest Y and footprint centre stay within 5% of the longest side.
4. **Default = unchanged.** Adding `detail` with default 2 must not move any existing asset: lock it with hashes recorded before the change (`src/lod.test.ts` does this for the dragon, seeds 0, 1, 7, 42).
5. Every level is a full asset: closed parts closed, mirror-symmetric where the top level is (even side counts: 4, 6, 8).
6. One stream per feature. Do not let `detail` change how many random numbers another feature consumes (SKILL.md §2): the dragon wings are identical at every level.

How to add it (`src/lod.ts`):

```ts
import { detailParam, lodLevel, lodPick, lodRadiusScale } from './lod';
export const dragonParameters: ParamDef[] = [ /* ... */ detailParam ];      // default 2
const d = lodLevel(p.detail);                                               // ?? not ||: 0 is a real level
const sides = lodPick(d, [4, 6, 8]);                                        // [low, medium, full]
const { rx, rz } = lodRadiusScale(sides, 8);                                // keeps X/Z bounds within L3 5% when dropping 8 -> 6 -> 4 sides
const spine = sampleSpline(pts, lodPick(d, [1, 2, 4]));
const body = tubeTris(spine, radius, sides);
```

Thin the middle, keep the ends and extremes: the lowest dragon level keeps the same head, tail and wing tips, with a 4-sided body and a straight leg. What the dragon gives: 388 -> 204 -> 96 triangles (ratios 0.53, 0.47), bounds within 1.1%.

## The LOD gates

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| L0 QA at detail N | only shown when a level fails Q1 to Q5 (and Q7 with `--symmetric`) | a level is a full asset: a hole, an odd side count |
| L1 LOD triangle ratio | each level is 0.35 to 0.65 of the one above | the builder ignores `detail`, or one level drops far more than half |
| L2 LOD parts | the same part names at every level | a level dropped a part instead of faces |
| L3 LOD bounds and pivot | size, lowest Y and footprint centre within 5% of the longest side | thinning removed an extreme (a sampled ring that no longer reaches the maximum radius) |
| L4 LOD determinism | every level builds identically twice | `Math.random`, or a stream that depends on `detail` |

## The Done report

When you report a budget or a LOD, the answer must contain: the profile and kind used, the gate table of the last `mesh-stats` run, everything under `not checked`, and the `UNVERIFIED` line (the numbers are counted, not measured).

## What it does not cover

- **Not measured.** Triangles, vertices and texture memory are counted from the arrays and sizes given. There is no frame time, fill rate, overdraw or real GPU memory (no GPU, no browser in the sandbox).
- **Scene totals.** The 10 to 20 MB scene size and the scene's draw calls need the whole scene: a composite asset can be passed as one asset, but the per-scene budget is not computed.
- **Materials per LOD level.** L2 compares part names, a proxy; real materials per level need `--meta` per level and are not compared.
- **LOD is wired into the dragon kernel only.** The biped, detail and other kernels do not have `detail` yet. The helper and the gates work on any builder that accepts it.
- **Draw calls for vr and desktop, GLB size for props and for vr and desktop:** the table gives no limit, so there is no gate.
- The thresholds are the table's, plus two chosen here and not derived from it: the 0.35 to 0.65 ratio window and the 5% bounds tolerance.
~~~

## references/export.md

~~~markdown source-excerpt
# Standalone code export and version notes

Reference for `threejs-asset-generator`. Read it before writing the exporter or pinning a Three.js version. Section numbers match `SKILL.md`.

Contents: §11 Standalone code export (`fingerprint.ts`) · §12 Version notes

## 11. Standalone code export

One exporter serves single and composite assets (a single asset is a composite with zero dependencies).

```ts
exportStandaloneCode({
  entry: { raw: rawPlot, fn: 'buildPlotAsset' },
  deps: [{ raw: rawHouse }, { raw: rawTree }, { raw: rawRock }],   // sub-asset modules
  helpers: [rawPrng, rawParams, rawLowpoly],                        // shared utils, included once
  params,                                                           // becomes DEFAULT_PARAMS
});
```

Pipeline:
1. Read sources with `?raw` (Vite; other bundlers have an equivalent source loader). Without a bundler (plain HTML, a playground, an artifact), let a build script read the files or keep each module's source as a string; the exporter only needs the text. Raw text keeps comments and names because no minifier touches it.
2. Strip TypeScript with a real transpiler (`esbuild` or `ts.transpileModule`, `target: 'es2022'`, no bundling, no minify). Regex type-stripping breaks on generics, `as` casts, `satisfies` and optional chaining.
3. Remove local `import` lines. Include each shared helper **once**. Fail loudly if two modules define the same top-level name with different bodies; silent last-wins is the usual cause of "works in preview, breaks in export".
4. Prepend the only external import: `import * as THREE from 'three';`. `mergeFlat` (§4) keeps `three/addons` out of the output; add the addons import only if the project chose `mergeGeometries`. Output is an ES module (global `three.js` script builds were removed in r161).
5. Append `export const DEFAULT_PARAMS = {...}` and `export { build…Asset }`.
6. Format with 2-space indentation. Prefer `prettier/standalone` over a hand-written regex formatter, which corrupts strings and template literals.

**Single-file HTML and hosted artifacts.** Choose the export target from where the code will run, and say in the reply which one you produced.

- *ES module with an import map* (a page you control): put `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>` before `<script type="module">`. Pin the version the asset was tested on. Add a `"three/addons/"` mapping only if the code imports addons.
- *Classic script with a global `THREE`* (sandboxes that only allow certain CDNs, ship a fixed and often older three build, and have no addons): export with `target: 'classic'`. The source still imports normally; the exporter strips the `import` line and wraps the code in `(function (THREE) { … return { buildXAsset }; })(window.THREE)`. Use core APIs only (the reason `mergeFlat` exists). Check the host's version against §12 before trusting the look: before r152 color management is off by default (hex colors look different), before r155 light intensities are not physical, and below r170 the skill's floor is not met, so treat the result as best effort and tell the user.

Detail helpers (`detail.ts` pure, `detailThree.ts` THREE) are plain helpers too: list both once in `helpers`. Browser-only loaders (`loadAtlasWebp`, `grayMapFromTexture`, `canvasAtlas`) stay in the app, not in the exported asset; a generated atlas (`seededAtlas`) exports with the code.

Rigged assets export the same way: `rig.ts` and `biped.ts` are plain helpers (list them once in `helpers`), and the exported builder returns the rig root with `userData.bones`; export clips with their builder function, not as baked JSON.

Any helper that used an npm package at preview time (`simplex-noise`'s `createNoise2D`, for example) must be replaced by a small in-repo implementation, otherwise "zero dependencies except three" is false.

**Parity test.** The single-source guarantee is only real if it is tested. Generate code for default params and for two seeds, import the exported module in a test (written inside the project so `three` resolves), and compare fingerprints with the live `generate` output.

Code: `src/fingerprint.ts`. API:

- `export function assetFingerprint(root: THREE.Object3D)`


## 12. Version notes (Three.js migration guide)

| Since | What it means for generated assets |
|---|---|
| r147 | `PointLight`/`SpotLight` `decay` defaults to 2 |
| r151 | `mergeGeometries` replaces `mergeBufferGeometries`; `InstancedMesh` needs `computeBoundingSphere()` after changing instance matrices |
| r152 | `ColorManagement` on by default; `outputColorSpace` is sRGB; `uv2` became `uv1` |
| r155 | Physically-based light units by default |
| r161 | No global `three.js` build; use ES modules / import maps |
| r171 | `three/webgpu` and `three/tsl` entry points; built-in materials work with `WebGPURenderer` (avoid `onBeforeCompile`, use TSL node materials for custom shading) |
| r177 | `ColorManagement.workingToColorSpace()` / `colorSpaceToWorking()` renames |
| r181, r187 | PBR energy conservation and PMREM rebuild; materials shade slightly differently |
| r182, r186 | `PCFSoftShadowMap` deprecated, then removed for WebGPU; use `PCFShadowMap` |
| r183 | Better WebGPU shadows (lower or remove bias); `Clock` deprecated in favor of `Timer` (`Timer` is in core since r179) |
| r186 | `Object3D.dispose()` added |

If the project pins an older release, check the migration guide for the gap before using an API from a newer row. Re-verify this table when the project moves to a newer version.
~~~

## references/glb-export.md

~~~markdown source-excerpt
# GLB export

Reference for `threejs-asset-generator`. Read it when the user wants a `.glb` file of an asset (to open in Blender, a viewer, an engine, or `GLTFLoader`). For standalone **code** export and Three.js versions, see `references/export.md` (§11, §12).

Contents: Run it · What the file contains · The gates (E1 to E6) · The Done report · What it does not cover · Three.js export route

Scripts (run them, do not read them): `scripts/export-glb.ts`; library `scripts/glb.ts` (`partsToGlb`, `readGlb`, `glbGates`); test `scripts/glb.test.ts`. Needs `tsx` only, no `three`. Same output contract as the other scripts: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = a gate failed, 1 = usage or load error.

## Run it

```
# A pure kernel (no THREE)
npx tsx scripts/export-glb.ts --module ./myKernel.ts --export buildMyTris --params '{"seed":3}' --out asset.glb

# Any asset: tris.json from the FINAL grounded group (groupToTris, reference-matching.md §5)
npx tsx scripts/export-glb.ts --tris tris.json --out asset.glb
```

Options: `--open a,b` or `all` (zero-thickness sheets, as in qa-asset) · `--budget N` · `--color r,g,b` (0 to 1, one base colour) · `--skip-qa` (export although Q1 to Q5 fail; the result lists it under `unverified`).

Order of work: `qa-asset.ts` first (all of Q1 to Q10 and the review image), `export-glb.ts` second. The exporter reruns Q1 to Q5 on the same parts and refuses to write a file for a non-finite, inside-out or open asset, because a GLB of that is worse than no file. Q6 to Q10 stay in `qa-asset.ts`.

## What the file contains

- One scene, **one node and one mesh per part**, named after the part. The names are the ones the QA gates report, so a problem found in Blender maps back to a part of the kernel.
- `POSITION` and a flat `NORMAL` per triangle, **non-indexed** (flat shading survives; there is no shared-vertex smoothing to undo). float32, 4-byte aligned, `POSITION` has exact `min`/`max`.
- One default material (`baseColorFactor` from `--color`, `metallicFactor` 0, `roughnessFactor` 0.9), shared by all parts.
- Units and axes need no conversion: 1 unit = 1 metre, Y up, +Z forward, right-handed, counter-clockwise front faces. Those are also the skill's conventions (`SKILL.md` §0), so a vertex goes out as it came in.
- The writer is deterministic: the same parts give the same bytes. It never reads the clock or a random source.

## The gates

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| QA Q1 to Q5 | the parts are finite, non-degenerate, outward-wound, closed (or listed in `--open`) and inside the budget | fix with `qa-asset.ts`; `--skip-qa` only knowingly |
| E1 container | magic `glTF`, version 2, header length equals file size, JSON chunk first, chunk lengths multiples of 4 | a hand-patched file; rewrite with `partsToGlb` |
| E2 json | `asset.version` 2.0, scene 0, node names equal the part names in order, buffer length fits the BIN chunk | renamed parts; a JSON chunk that does not parse |
| E3 accessors | float32 VEC3, inside their bufferView and the BIN chunk, aligned, `POSITION` min/max equal the data bounds | stale `min`/`max` after editing positions (viewers reject it) |
| E4 round-trip | every position read back equals the input at float32 | a writer that reorders or transforms vertices |
| E5 normals | unit length and equal to the face normal computed from the stored winding | an inside-out part (a normal that disagrees with its winding) |
| E6 counts | triangles in = triangles out, per run | a triangle lost or duplicated |

E1 to E6 are checked on the file **re-read from disk**, not on the buffer in memory.

## The Done report

When you export a GLB, the answer must contain:
1. The path of the file and its size.
2. The gate table of the last run (QA Q1 to Q5 and E1 to E6).
3. Everything under `UNVERIFIED` that remains after any separate loader test. The CLI emits one default material and geometry. Use the Three.js route below for assets that need vertex colours, rich materials, rigging, or animation.

If the user needs to see the result, say how to check it: drag the file into a glTF viewer or Blender, and confirm the part names appear as objects.

## What it does not cover

- **No third-party check.** E1 to E6 compare the file with its own input through a reader written for this skill. A cross-check with an independent parser (a few lines of `struct`/`numpy`, or a glTF validator) agreed on the crate fixture, but that was a one-off, not a gate.
- **Geometry only.** No vertex colours (`COLOR_0`), UVs, textures, per-part materials, skins, bones or animation clips. Rigged assets (`rig.ts`, `biped.ts`) export their rest-pose triangles only. Per-part colour is the natural next step and is not done.
- **No Draco or meshopt, no indices.** Files are larger than an optimised export. A 20 000-triangle asset is about 1.4 MB.
- **Not the live scene.** It exports the pure triangle arrays, not a `THREE.Group` with its modifiers, instancing or materials.

## Three.js export route

For assets that need vertex colours, materials, skins, or clips, use the bundled CLI `scripts/export-rigged-glb.ts` (which includes a Node `FileReader` polyfill, runs `GLTFExporter`, saves to disk, and re-parses the exact disk bytes with `GLTFLoader` to emit `@@RESULT` gates RG1–RG5):

```
npx tsx scripts/export-rigged-glb.ts --module ./myAsset.ts --export buildAsset --out asset.glb
```

The CLI calls the builder as `buildAsset(params, THREE)`. Pass `--params` with JSON or use the default empty object. Return a `THREE.Object3D` with optional `root.userData.animations` or return `{ root, animations }`. Build a fresh rest-pose instance with only the objects intended for export.

Run the skill's exporter with an absolute path to a TS or JS builder in another folder. The injected `THREE` works without an asset-side Three.js install. On Node 22.15+ or Node 24+, bare `three` imports fall back to the skill's installation when the builder's normal resolution fails. Relative imports resolve from the original builder file. [Node.js module customization hooks](https://nodejs.org/api/module.html#customization-hooks)

Use `QuaternionKeyframeTrack` targeting `.quaternion` for rotation and `VectorKeyframeTrack` targeting `.position` or `.scale` for movement and scale. `GLTFExporter` can omit scalar Euler tracks such as `.rotation[x]`. RG4 verifies clip names and counts. Validate track playback, procedural textures, and target-engine import with an asset-specific check. See `references/studio-preview.md` for the browser preview workflow and `references/detail.md` for texture cases.
~~~

## references/qa-gates.md

~~~markdown source-excerpt
# QA gates and the review image

Reference for `threejs-asset-generator`. Read it before you tell the user an asset is finished. Section numbers match `SKILL.md`.

Contents: §13 Run the gates · The gates (Q1 to Q10) · Reading `review.png` · The "Done" rule and report · What the gates do not cover

Scripts (run them, do not read them): `scripts/qa-asset.ts`; library `scripts/qacheck.ts` (gates), `scripts/review.ts` (renderer), `scripts/png.ts` (pure-Node PNG writer); tests `scripts/qacheck.test.ts`, `src/qa.kernel.test.ts`. Needs `tsx` only (`review.png` is written directly with `node:zlib`, no `sharp` required). Same output contract as the other scripts: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = a gate failed, 1 = usage or load error.

## 13. Run the gates

```
# A pure kernel (no THREE). The builder is called several times, so Q8 and Q9 can run.
npx tsx scripts/qa-asset.ts --module ./myKernel.ts --export buildMyTris --params '{"seed":3}' --open wingL,wingR --symmetric

# Any asset, including PartBuilder and rigged ones: write tris.json from the FINAL grounded group (groupToTris, reference-matching.md §5)
npx tsx scripts/qa-asset.ts --tris tris.json --footprint --symmetric
```

The builder and `--tris` accept a bare triangle array (9 numbers per triangle, CCW from outside), `{ tris }`, a named map such as `{ body: bodyTris, legs: legTris }`, or `{ parts: { body: bodyTris, legs: legTris }, colors? }`. Named parts let the gates identify the part at fault. Use the same JSON with `mesh-stats` and `ref-compare`. Include hex `colors` in a wrapper to run the reference palette gate. `scripts/fixtures/crate.qa.ts` gives a complete named-parts builder.

Options: `--budget N` (default 2000 for small props; pass a category-appropriate budget such as `6000`–`15000` for hero/creature/vehicle models or `20000` for buildings/composites per `references/budget.md`) · `--open a,b` or `all` (zero-thickness sheets) · `--symmetric` · `--grounded` (run Q6 on a kernel that grounds itself) · `--footprint` (Q6 also checks centring) · `--ground-y N` (terrain slab top) · `--out dir` · `--no-render`.

Fix the FIRST failing gate, rebuild, run again. Two fixes in one round make the next result unreadable.

## The gates

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| Q1 finite | at least one triangle, whole triangles, no NaN or Infinity | division by zero, zero-length normalize, a scalar where an array is expected |
| Q2 degenerate | no zero-area triangles | tube or loft ring of radius 0, collapsed stage |
| Q3 winding | every closed part has positive signed volume | inside-out part: swap two vertices per triangle (`mirrorTris` does) |
| Q4 closed | every edge of a closed part has exactly one partner | missing cap, unwelded seam (jitter before `add()`, then weld), overlapping faces |
| Q5 budget | triangles within `--budget` | too many segments or details |
| Q6 grounding | lowest Y equals `--ground-y` (0); with `--footprint` also centred | asset not wrapped by `groundAsset` |
| Q7 symmetry (opt-in) | every vertex has a mirror partner through x = 0 | one side built twice, or an odd side count |
| Q8 determinism (`--module` only) | two builds give identical numbers | `Math.random`, `Date.now`, shared mutable state, shared stream |
| Q9 seed 0 (`--module` only) | seed 0 gives its own asset | `seed \|\| fallback`, or a schema `min` above 0 |
| Q10 visible faces | at most 4 magenta pixels per part in the review image | see below |

Things the gates showed on this skill's own kernels, worth knowing:
- **Sheets look like inside-out parts to Q3.** A fan or flag has no volume, and its "volume" can even be negative (the dragon wing: -0.13). Q4 tells them apart: a sheet also lists open edges, an inside-out closed part does not. List sheets in `--open`; closed parts next to them are still checked.
- **Odd side counts break mirror symmetry** when the ring starts on the X axis (a horizontal spine): a 7-gon has a vertex at +X and a flat at -X. Use 4, 6 or 8 for anything that must be symmetric. `dragonKernel.ts` used 7 and now uses 8.
- **Q6 is for the final asset.** A raw kernel is not grounded (the dragon's feet dip to Y = -0.023 because the tube radius extends past the foot point), so `--module` skips Q6 unless you pass `--grounded`. Check grounding on the wrapped asset with `--tris`.
- **Q7 compares vertices, not triangles.** A box splits every quad along a diagonal that is not mirror-symmetric, so a symmetric box fails a triangle comparison.

## Reading `review.png`

Written to `--out` (default the current folder). 2 x 2 layout, one shared scale: front (top left) · side (top right, +Z faces left) · top (bottom left, +Z faces down) · 3/4 view from +X +Y +Z (bottom right). One muted colour per part; the colour legend is printed. A grey line is Y = 0 in the front and side panels. **Magenta** means a triangle faces away from the camera but is still the nearest surface: an inside-out part, a hole, or a sheet that faces away from the cameras and is missing from `--open`.

Look for what numbers miss: floating or sinking against the grey line, proportions against your `ref-spec.md` or intent, a limb on the wrong side, a part that is too small to read (under about 3 px), a silhouette that is plainly not the object. The renderer is orthographic with flat Lambert light: it shows shape and winding, not materials, textures or rigging.

## The "Done" rule and report

"Done" may be reported only when all of these hold:
1. `qa-asset` ran on the current build and exited 0, or every failing gate is named in the answer with the reason it stays.
2. `review.png` was opened with the `view` tool and the answer says in one line per panel what was seen. "Looks good" is not a finding.
3. Everything the run listed under `UNVERIFIED` and `not checked` is repeated in the answer.
4. Image given by the user: the `ref-compare` gate table (`references/reference-matching.md` §6) is in the answer as well.

End the answer with the gate table of the LAST run:

| Gate | Result |
|---|---|
| Q3 winding | 3 closed parts, all volumes > 0 (open: wingL, wingR) |
| Q6 grounding | lowest Y 0.000 (final asset, `--tris`) |
| Q8 determinism | not run (`--tris`), UNVERIFIED |

Review: front, legs evenly spaced and on the line; side, head at +Z (left) and higher than the tail; top, wings symmetric; 3/4, no magenta.

## What the gates do not cover

Still manual, from the §13 checklist: materials and `metalness` environment, UV and atlas cells, bone count and rig clips, `disposeAsset`, mesh names, export parity (`generate(params)` against the exported module), and all THREE-side behaviour (`src/detailThree.test.ts` stays UNVERIFIED until `three` is installed). Q10 and the review image cannot see the far side of the asset (all four cameras sit on +X, +Y, +Z): a defect that exists only there is found by Q3 and Q4, not by looking.
~~~

## references/reference-matching.md

~~~markdown source-excerpt
# Reference matching: build against a reference, check after every step

Reference for `threejs-asset-generator` §15. Read it BEFORE writing code whenever the user gives an image, screenshot, sketch, photo or "make it look like this". The point: the agent never works from memory of the reference. It writes the reference down once as a spec, then measures its own result against it after every build step, cheapest check first.

Contents: 1 Intake (once) · 2 The loop · 3 Gates and thresholds · 4 Efficiency rules · 5 Getting triangles out · 6 Final report · 7 When numbers do not apply

Scripts (run them, do not read them): `scripts/ref-intake.ts`, `scripts/ref-compare.ts`; library `scripts/refcheck.ts`, `scripts/png.ts`; test `scripts/refcheck.test.ts`. Needs `tsx`; writes mask and diff PNGs and reads standard 8-bit PNG inputs with pure Node (`scripts/png.ts`, no `sharp` required). Install `sharp` only when reading JPEG/WebP references. Copy `scripts/` next to the project if the skill folder is read-only.

## 1 Intake (once per reference)

1. `view` the reference image ONCE. Several views (front, side, top)? Use each file.
2. Write `ref-spec.md` (max 15 lines). This is the only description of the reference that later steps use:
   - **Subject and facing** (which way it looks, which view each image is).
   - **Proportions**: width/height `w` and depth/height `d`, measured on the image (count pixels or grid squares, do not eyeball). Also 3 to 6 part ratios (head vs body height, leg length vs body, roof vs cabin).
   - **Parts**: list top to bottom or front to back, each with relative size and position.
   - **Palette**: what `ref-intake` prints (do not guess hex values from memory).
   - **Signature features**: the 3 things that make it recognisable (horns, round windows, striped tail). These decide G4.
   - **Out of scope**: shadows, background, texture noise, anything the low-poly style drops on purpose.
3. Run intake: `npx tsx scripts/ref-intake.ts front=ref_front.png side=ref_side.png --out ref.json --w 1.2 --d 2.5` (`--w`/`--d` are the ratios you just measured; omit what you could not measure). One image without a name is `front`. Angled concept art is supported directly via `34=ref_34.png` and `34_back=ref_34_back.png` (and `--sheet sheet.png --grid 2x1 --views 34,34_back` or `3x2` with `--views front,back,top,bottom,side,34`). Opaque images use border flood-fill by default so light interior patches (such as a cream belly on a light background) do not poke holes in the silhouette (pass `--no-flood` for flat thresholding).
4. Open each printed mask once and check for leaked background or missing parts. Adjust `--tol` and repeat intake if needed. All masks are written beside the JSON. For example, `--out refs/round-1/asset.json` writes `refs/round-1/asset-front-mask.png`. Each JSON view has a sibling-relative `mask` name. The last `@@RESULT` line gives absolute paths in `out` and `views.<view>.mask`.

## 2 The loop

Build coarse to fine. After EVERY step run the compare, not only at the end:

| Step | What you build | Gates that must pass before the next step |
|---|---|---|
| A Blockout | primitives with the right size and position, one colour | G1 proportions, G2 aspect |
| B Silhouette | real shapes, tubes, lofts, limbs, no colour work yet | G2 IoU (every view you have) |
| C Colour | palette, per-part colours | G3 palette |
| D Detail | chamfer, atlas, AO, small parts (`references/detail.md`) | G4 checklist |

Each iteration:
1. Write `tris.json` from your generator driver using a format from §5, then run `npx tsx scripts/ref-compare.ts ref.json tris.json`.
2. Read the output. It lists PASS/FAIL per gate and the hint for each failure.
3. Fix **only the first failing gate**. Change one group of parameters (for example only leg length and body depth), then compare again.
4. On a failing IoU gate `view` `diff-<view>.png` once: red is missing in the model, blue is extra. Name the part that is wrong before touching code.
5. Log one line in your notes: `step B, round 2: side IoU 0.71 -> 0.83, shortened neck`. No log, no next round.

Stop rules: max 3 rounds per gate. After 3 rounds without reaching the threshold, keep the best version, write the remaining gap into the final report and move on. Never chase a number by distorting the shape (a leg 3x too thick to fill a red area is a fail, not a fix).

## 3 Gates and thresholds

| Gate | Measures | Pass when | Typical fix when it fails |
|---|---|---|---|
| G1 proportions | size ratios w/h and d/h of the model against `--w`, `--d` | within 10% | scale the whole part groups, not single vertices |
| G2 aspect | tight silhouette width/height per view | within 8% | proportions first, details later |
| G2 IoU | silhouette overlap per view (64x64 grid, tight crop) | at least 0.85 | read `diff-<view>.png`, fix the largest red or blue blob |
| G3 palette | every reference colour with 5% or more share has a colour within RGB distance 60 | all | retune that one colour |
| G4 checklist | the signature features from `ref-spec.md` (visual) | all present | add or reshape that feature |

- The CLI reports when a mirrored reference gives the higher IoU. A +Z-facing asset faces left in `side` and down in `top`.
- Angled views `34` and `34_back` start at 38° and 142° azimuth respectively, both at 16° elevation. They sample azimuth offsets of 0°, ±6°, ±12° and elevation offsets of 0°, ±6°. The comparison chooses the highest IoU among cameras within the 14% aspect tolerance. If all fail aspect, it reports the highest-IoU camera for diagnosis. The canonical camera wins ties within either group. The selected camera supplies both G2 measurements and the diff PNG. The IoU threshold is 0.70. The gate text and `@@RESULT.angles` list the selected angles and offsets.
- G4 is the only visual gate. Take ONE screenshot per milestone (end of B, end of D), same camera angle as the reference, reference and render in the same message, and tick each signature feature. If you cannot render, use the diff PNGs and say that G4 was checked from silhouettes only.
- Thresholds live in `THRESH` in `scripts/refcheck.ts`. Loosen them (IoU 0.7) only for photos with strong perspective and say so in the report.

## 4 Efficiency rules

- Use the numeric compare at each build step. Open images for the mask check, a failing IoU diff and the G4 milestones.
- Never re-read the reference image after intake. Use `ref-spec.md` and `ref.json`.
- Compare after every step, but run only gates that exist for that step; gates for later steps are not failures yet. Ignore a G3 FAIL during step A.
- One failing gate per round, one parameter group per change. Two changes at once make the next number unreadable.
- Keep the generator seeded and deterministic (§2). The compare is only meaningful when the same params give the same triangles.
- Do not build detail (step D) while G2 fails. Detail on a wrong silhouette is wasted work.

## 5 Getting triangles out

Kernel-based assets already have `tris` (the output of the kernel, in asset space). For `PartBuilder` or rigged assets collect them from the built object:

```ts
// THREE side. Untested in the session that wrote it: run it once and check that tris.length / 9 equals the triangle count you expect.
import * as THREE from 'three';
export function groupToTris(root: THREE.Object3D): number[] {
  root.updateWorldMatrix(true, true);
  const out: number[] = [], v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); out.push(v.x, v.y, v.z); }
  });
  return out;
}
// in the driver: fs.writeFileSync('tris.json', JSON.stringify({ tris: groupToTris(asset), colors: ['#8a5a2b', '#d9c9a3'] }));
```

Pose the asset in its rest pose before collecting. QA, mesh stats and reference comparison accept the same triangle JSON. Use a bare array, `{ tris, colors? }`, a named map such as `{ body: bodyTris, legs: legTris }`, or `{ parts: { body: bodyTris, legs: legTris }, colors? }`. Include the hex palette as `colors` to enable G3.

## 6 Final report (always include)

End the answer with the gate table of the LAST compare run and the leftover gaps, for example:

| Gate | Result |
|---|---|
| G1 width/height | 1.21 vs 1.20, pass |
| G2 front IoU | 0.88, pass |
| G2 side IoU | 0.79, fail (3 rounds used, tail curve still short) |
| G3 palette | pass |
| G4 | horns yes, striped tail yes, round windows no |

Never write "matches the reference" without this table.

## 7 When numbers do not apply

- No usable silhouette (busy photo, no background): skip masks, keep `--w`/`--d` and the palette, run G4 with two screenshots, and say that G2 was not measured.
- Concept art with stylised or impossible perspective: set the IoU target to 0.7 and treat G4 as the main gate.
- The user wants "inspired by", not a match: do intake and G4 only, one screenshot, no rounds.
- Reference changes mid-task: delete `ref.json`, run intake again, restart at step A for the changed parts.
~~~

## references/rig-check.md

~~~markdown source-excerpt
# Rig, clip and expression checks

Reference for `threejs-asset-generator`. Read it after authoring a rigged character with animation clips or static facial expression swaps.

Contents: §18 Run rig-check · The gates (R1 to R6) · Metadata JSON shape · What is not checked

Scripts (run them, do not read them): `scripts/rig-check.ts`; library `scripts/rigcheck.ts`; test `scripts/rigcheck.test.ts`. Needs `tsx` only (no `three`). Output contract: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = gate failed, 1 = usage/load error.

## §18. Run rig-check

```
npx tsx scripts/rig-check.ts --meta char_metadata.json [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--allow-refpose]
```

Default `--max-pivots` scales by `--kind`: `hero` / `prop` = 16, `building` = 24, `vehicle` = 32, `creature` = 64 (for serpentine dragons, spiders, or kraken tentacles). Pass `--motion free` (or set `qa.motionMode: "free"`) for hovering, swimming, leaping, or lunging creatures whose root sways naturally in X/Z.

## The gates (R1 to R6)

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| R1 hierarchy | unique `pivotNames`, single root, valid `{ parent, child }[]` edges, acyclic tree, count <= max pivots for `--kind` (or `--max-pivots`) | missing root, cycle, passing a map instead of `{ parent, child }[]`, too many pivots |
| R2 rest-pose | every pivot has a finite `[x, y, z]` entry in `rig.restLocalPositions` | `NaN` or missing pivot entry |
| R3 clips | unique clip names, finite positive `durationSeconds`, inspection clip (`RefPose`) excluded from export | `RefPose` accidentally baked into gameplay GLB, zero duration |
| R4 tracks & drift | finite, strictly increasing timestamps, one finite value tuple per sample (3 for position/scale, 4 for quaternion), valid pivot targets; in `--motion in-place` (default), horizontal root X/Z drift <= `1e-5` m; in `--motion free`, natural X/Z sway/lunge is permitted | truncated track, duplicate timestamp, unintended horizontal root movement on an in-place runner |
| R5 expressions | square power-of-two `textureResolution` (e.g. `512x512`), `defaultExpressionInGlb` and every clip expression mapping exist | unmapped expression name or non-square resolution |
| R6 floor / slide clearance | for runner slide clips: `qa.slideDropPct >= 22` and `qa.slideMinY >= -0.025` m; for general creatures/vehicles: `qa.clipMinY >= -0.025` m | animation clips below the floor or slide does not duck enough |

Missing evidence is reported under `not checked`. R4 reports separately when root drift cannot be checked. R5 needs a declared expression set, default expression, and texture resolution. R6 checks slide measurements when supplied, or general `qa.clipMinY` when no slide clip applies.

## Metadata JSON shape

```json
{
  "rig": {
    "pivotNames": ["root", "neck", "head", "tail1", "tail2"],
    "hierarchy": [
      { "parent": "root", "child": "neck" },
      { "parent": "neck", "child": "head" },
      { "parent": "root", "child": "tail1" },
      { "parent": "tail1", "child": "tail2" }
    ],
    "restLocalPositions": {
      "root": [0, 0.9, 0], "neck": [0, 0.3, 0.2], "head": [0, 0.3, 0.1],
      "tail1": [0, -0.1, -0.4], "tail2": [0, 0.1, -0.4]
    }
  },
  "animations": [
    {
      "name": "IdleHover",
      "durationSeconds": 4.0,
      "loop": true,
      "tracks": [
        { "name": "root.position", "times": [0, 2, 4], "values": [0, 0.9, 0, 0, 1.02, 0, 0, 0.9, 0] },
        { "name": "head.quaternion", "times": [0, 2, 4], "values": [0, 0, 0, 1, 0, 0.05, 0, 0.9987, 0, 0, 0, 1] }
      ]
    }
  ],
  "qa": { "motionMode": "free", "clipMinY": 0.05 }
}
```

## What is not checked

JSON checks cannot verify visual skinning deformations, texture alignment on the mesh, or target-engine import compatibility (such as Roblox Motor6D or Blender). Visually inspect the character in a live preview (`references/studio-preview.md`) and test import in the target engine before shipping.
~~~

## references/studio-preview.md

~~~markdown source-excerpt
# Fast and Full Preview

Reference for `threejs-asset-generator`. Read it when the user wants to see or interact with an asset.

Contents: 1 Choose a preview · 2 Full Preview controls · 3 Lighting, VFX, and framing · 4 Export and round-trip verify · 5 Final visual and animation checks

## 1. Choose a preview

When the request leaves the mode open and the user has not asked to dive straight in, ask in one plain sentence before building a heavy studio. For example, “Fast Preview lets you rotate the final model and try its animation clips. Full Preview adds editable parameters, rig inspection, and expression controls. Which do you want?” Follow an explicit mode choice directly. Use Fast for requests like “quick look”, “check the label”, or “play the exported run clip”. Use Full for authoring controls or detailed rig and expression review.

**Fast Preview.** Reuse the [Fast Preview HTML](../assets/fast-preview.html) for existing GLB files. Open the HTML in a browser and select or drop the exact file into it. Drag to orbit, right-drag or drag with two fingers to pan, and scroll or pinch to zoom. The viewer displays the materials, textures, and labels in the loaded GLB. When the file contains animation clips, pick a clip, press Play/Pause, or drag the timeline to inspect a frame. The viewer starts paused. It needs a WebGL-capable browser and a connection to load the viewer library. For GLB output with textures or clips, choose the Three.js export route in [GLB export](glb-export.md#threejs-export-route).

When the model is still being built or the interactive viewer is unavailable, show `review.png` from the [geometry checks](qa-gates.md). Its four views distinguish parts by color. If color accuracy, texture, or text legibility matters, inspect and capture a frame from the actual GLB viewer and report those checks separately.

**Full Preview.** Reuse an existing studio where available. Build a standalone HTML studio when the user requests live parameter tuning, clip authoring or comparison, pose and root-motion inspection, or facial expressions. Model previews keep the same geometry and materials as export.

### Package one asset builder

Use `pack-studio` to open a TS or JS builder in an HTML preview with three-quarter presets, orbit and pan, clip selection, playback, and scrubbing. Both the preview and the rigged exporter call the same builder with `(params, THREE)` and accept an `Object3D` or `{ root, animations }`. Run both from the harness with the same resolved inputs and compatible Three.js versions. Use the injected `THREE` value so the model and viewer share the harness version. [Builder export contract](glb-export.md#threejs-export-route)

```bash
npm run pack-studio -- --module ./asset.ts --export buildAsset --out ./index.html
npm run export-rigged-glb -- --module ./asset.ts --export buildAsset --out ./asset.glb
```

Pass the same `--params` JSON object to both commands for a specific seed or configuration. The packer bundles browser-compatible imports, and locally imported image files are embedded as data URLs. Await the texture loads inside an asynchronous builder before returning the model. A builder that requests external assets at runtime still depends on those URLs. Add parameter editors, rig gizmos, or expressions when the brief calls for them.

In Windows PowerShell 5, use the script directly with escaped JSON quotes, for example `node --import tsx scripts/pack-studio.ts --module ./asset.ts --out ./index.html --params '{\"seed\":1}'`. Use the same quoting with `scripts/export-rigged-glb.ts` for export.

Use `--front-side right` to match a reference facing screen right in the front preset. The packaged viewer reserves a separate header and control bar and frames the rest pose or selected clip using up to 25 sampled poses per clip. Increase `--margin` from its default `1.18` if the asset needs more breathing room, and inspect the exact longest pose.

## 2. Full Preview controls

Choose controls for the asset and the requested review.

- **Up to six turnaround camera presets:** Front (`+Z`), 3/4 Front, 3/4 Back, Side (`+X`), Back (`-Z`), Top (`+Y`), framed far enough back that the full asset (including horns, tail tips, and peak animation poses) fits cleanly inside the safe center area without colliding with top/bottom HUD bars.
- **Match reference 3/4 facing:** When built from a reference image, place the `3/4 Front` camera on the same side so the asset faces the same screen direction (left or right) as the reference image for direct visual comparison.
- **Non-overlapping HUD layout:** Never let an open parameter drawer overlap the live QA telemetry card or obscure the hero's head/tail; keep parameter drawers collapsible (collapsed by default on narrow viewports) on the opposite side from the QA card.
- **Stylized low-poly VFX (optional, runtime-only):** Keep effects in a scene-level `_studio_vfx` group beside the asset. Use faceted shapes or tapered ribbons and check the silhouette at peak action. [Gradient VFX on light and dark backdrops](#gradient-vfx-on-light-and-dark-backdrops)
- **Parameter controls from schema:** Auto-render sliders and colour pickers directly from the asset's `parameters` array, including `seed` and `detail` (`src/lod.ts`, `0..2`).
- **Live QA telemetry HUD:** Show observed triangle and mesh counts. Add measured grounding, winding, drift, and other QA results when available. Mark checks without evidence as `Unchecked`.
- **Rig & animation dock (when animated):** Play/pause, scrub bar, individual clip buttons plus `RefPose`, pivot gizmos toggle, and expression swap buttons (`neutral` / `happy` / `focused`) with optional clip auto-sync.

## 3. Lighting and contrast

- Use `THREE.WebGLRenderer` with `ACESFilmicToneMapping`, `THREE.PCFShadowMap` (never `PCFSoftShadowMap`), and `RoomEnvironment` PMREM so flat-shaded low-poly facets stay readable.
- Support both dark and light studio backdrops. When using Tailwind CDN, stick to standard opacity utilities (`bg-zinc-900/90`, `bg-zinc-900/95` — avoid arbitrary steps like `/88` or `/92` without brackets) so dark HUD panels keep crisp contrast on light backdrops.
- On light backdrops, give bright cream features (inner ears, white highlights) a clear dark outer border so they never blend into the background.

### Gradient VFX on light and dark backdrops

Use two layers for visible lightning or similar emissive ribbons. Draw a wider blue, cyan, or gold shell with `NormalBlending`, `transparent: true`, `depthTest: true`, and `depthWrite: false`. Taper its opacity at the edges and ends, with a soft Fresnel accent on a 3D shell if useful. Draw a much thinner, brighter tinted core inside the shell. On a light backdrop a wide solid additive pass can clip to white, so use the color and alpha ramp to keep the effect readable. [Three.js material blending](https://threejs.org/docs/pages/Material.html#blending)

Pause at the action peak on both light and dark backgrounds. Keep the effect brightest at its source or tip and lower the intensity wherever it obscures the face, markings, or animated limbs. Attach `_studio_vfx` beside the model root and pass only the fresh model root and its animation clips to GLB export.

With the packer, pass `--vfx ./effect.ts`. Export a `createStudioVfx({ root, asset, params, group, THREE })` function that adds its meshes to the supplied `group`. It can return an `update({ clip, time, duration })` callback to sync the effect to playback and to captured frames. The preview's effect module stays outside the model builder and GLB command.

### Frame the full motion inside the HUD

Measure world-space model bounds at rest and across the requested clips. Include sampled poses at the longest tail extension, widest wing reach, and peak action. Update animation and world transforms before measuring posed vertices. Union these bounds and use their center `C` and half-diagonal `r` as a conservative framing sphere. Use the asset root as the measurement input so the ground, effects, and helpers stay out of the model envelope. [Three.js posed mesh vertices](https://threejs.org/docs/pages/Mesh.html#getVertexPosition)

Reserve screen space for panels and buttons. Around the projected target, find an unobstructed centered rectangle with half-width `safeHalfW` and half-height `safeHalfH` in pixels. For a viewport `W × H`, use its vertical effective field of view `fovY` in radians and compute the initial perspective distance as follows. [Three.js perspective camera](https://threejs.org/manual/pages/cameras.html)

```text
verticalSlope = tan(fovY / 2)
horizontalSlope = verticalSlope * W / H
safeSlope = min(horizontalSlope * 2 * safeHalfW / W,
                verticalSlope * 2 * safeHalfH / H)
distance = 1.12 * r / sin(atan(safeSlope))
camera = C + normalize(viewDirection) * distance
```

Use the distance as a starting fit. Open both three-quarter presets and scrub to the widest poses. Check horn, whisker, wing, and tail tips against the title card and bottom controls. On resize or drawer changes, refit the safe area or move the HUD outside the render area.

## 4. Export and round-trip verify

- Always build a fresh, clean asset instance in rest pose before calling `GLTFExporter` (never export live gizmos, wireframe/silhouette overrides, or circular `userData`).
- Provide an in-RAM round-trip verify button (`GLTFExporter` -> `GLTFLoader.parse`) that confirms clip count/names, pivot hierarchy, mesh count, and binary size without triggering a file download.
- Export static expression PNGs separately (`512x512`) alongside a metadata JSON file compatible with `scripts/rig-check.ts` (`references/rig-check.md`).

## 5. Final visual and animation checks

When a browser tool is available, open the delivered preview for the final model and parameters and inspect actual materials and background. Check the console, play the main motion, and scrub to the action peak. Use the available viewer for the requested preview mode.

1. **3/4 Front.** Check silhouette, materials, and how the model fits around the title and controls.
2. **3/4 Back.** Check the opposite side, tail, appendages, and texture seams.
3. **Mid-movement.** Play the main movement clip, then inspect its midpoint for pose, stretch, and ground clearance. Watch the loop transition when the clip loops.
4. **Peak action.** Inspect the intended action frame and effects, if requested. Make sure the model remains readable in the actual lighting.

Open the captured views and record what was seen per panel, together with actual console or rendering errors. The geometry `review.png` stays useful for winding and shape. Visual checks require a rendered model, and smoothness requires observing playback. When the browser, clip, or requested effect cannot be inspected, report that check as `UNVERIFIED` and deliver the available results.

For a packaged preview, `capture-studio` uses an installed Chrome, Edge, or Chromium and the optional `playwright-core` dependency. Set the clip names and the intended action peak in seconds. Add `--vfx` to require visible effects in that frame. Use `--browser` if you need to point to a particular browser executable.

```bash
npm run capture-studio -- --studio ./index.html --out ./studio-contact-sheet.png --locomotion AirSwim --action LightningBurst --peak 0.53
```

Read the final `@@RESULT` for the actual clip times, browser errors, and any `UNVERIFIED` views. A static asset with no requested clips has two rendered views and two `NOT_APPLICABLE` panels. Open `studio-contact-sheet.png` when it was produced. If the local browser or driver is unavailable, use an available browser tool or viewer and record the evidence it can provide.
~~~
