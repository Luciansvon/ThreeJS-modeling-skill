# Budget and LOD

Reference for `threejs-asset-generator`. Read it when an asset has a target platform, when the user asks "is this too heavy", or before you add a `detail` slider. Section numbers continue `SKILL.md` (§17).

Contents: Platform table · Run it · What is counted · The gates (B1 to B6) · LOD with `detail` · The LOD gates (L1 to L4) · The Done report · What it does not cover

Scripts (run them, do not read them): `scripts/mesh-stats.ts`; library `scripts/budget.ts` (`PROFILES`, `assetStats`, `budgetGates`, `lodGates`); LOD helpers `src/lod.ts`; tests `scripts/budget.test.ts`, `src/lod.test.ts`. Needs `tsx` only, no `three`. Same output contract as the other scripts: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = a gate failed, 1 = usage or load error.

## Platform table

Numbers aligned with blender-skills. Each range is *target to hard limit*: the gate fails above the limit and says "above the target" between the two.

| Platform | Hero / Creature tris | Vehicle tris | Building tris | Prop tris | Materials (default / vehicle & building) | Texture max | Bones | Draw calls |
|---|---|---|---|---|---|---|---|---|
| `mobile` | 5k to 15k | 3k to 12k | 2k to 10k | 0.3k to 3k | 1 to 2 / 3 to 5 (`building` 2–4) | 1024 | 75 | 50 |
| `web` | 10k to 30k | 6k to 25k | 4k to 20k | 1k to 10k | 1 to 2 / 3 to 6 | 2048 | 100 | 100 |
| `vr` (standalone) | 10k to 40k | 8k to 30k | 5k to 25k | 1k to 10k | 1 to 3 / 3 to 6 | 2048 | 100 | not in the table |
| `desktop` | 50k to 150k | 30k to 120k | 20k to 100k | 5k to 50k | 2 to 6 / 4 to 8 | 4096 | 150 to 300 | not in the table |

Web delivery: a `hero`, `creature`, or `vehicle` model is at most 2 to 5 MB as GLB (gate B6, mobile and web only); a whole scene at most 10 to 20 MB and 50 to 100 draw calls on mobile web (the scene totals are not checked per asset, see the end).

Pass `--profile mobile|web|vr|desktop` when you know the deployment target. `--kind` accepts `prop` (default), `hero`, `creature`, `vehicle`, or `building`. Choose `web` for a web deployment. A browser preview can be used for any target.

`qa-asset`, `mesh-stats`, and geometry `export-glb` use the same triangle limit. The profile and kind select the table maximum. A positive `--budget N` supplies the triangle limit and takes precedence over the table. With a profile selected, its other limits still apply in `mesh-stats`. `--lods` applies the same triangle limit in L0 for every level.

Without `--profile` or `--budget`, the tools report triangle counts and mark the triangle limit as unchecked. `mesh-stats` reports available measurements and checks LOD when requested. It needs a profile to check B2 through B6. The result includes `platform`, `kind` and `triangleLimit`, with `null` for a missing profile or triangle limit.

A limit the table does not give is reported under `not checked`. Do not fill it with a number you remember.

## Run it

```
# Counts for an asset whose deployment target is still open
npx tsx scripts/mesh-stats.ts --tris tris.json

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

- The triangle arrays provide the triangle count. The reported `gpuVertices` value counts three corners per triangle. Indexed geometry can share vertices. Read the exported position accessor to count stored vertices for an indexed mesh.
- **Draw calls**: one per group of (bone, material), because parts are merged per bone and material (`PartBuilder.build`). Without `--meta` the number is **an upper bound** (one per part) and is labelled so; with a material for every part it is exact. One asset is only a share of a scene's calls.
- **Texture memory**: RGBA8 with a full mip chain, uncompressed: 1024 = 5.33 MiB, 2048 = 21.33 MiB, 4096 = 85.33 MiB. Compression (KTX2) lowers memory, not the size limit.
- **Materials, bones, textures**: only from `--meta`. No meta, no claim: they are listed as `not checked`.
- **GLB size**: from `--glb`, in bytes as `stats.glbBytes`.

## The gates

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| B1 triangles | triangles within the selected profile and kind limit or `--budget N` | too many segments or details: lower `detail` |
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
| L0 QA at detail N | only shown when a level fails geometry QA, the selected triangle limit, or requested symmetry | a hole, an odd side count, too many triangles |
| L1 LOD triangle ratio | each level is 0.35 to 0.65 of the one above | the builder ignores `detail`, or one level drops far more than half |
| L2 LOD parts | the same part names at every level | a level dropped a part instead of faces |
| L3 LOD bounds and pivot | size, lowest Y and footprint centre within 5% of the longest side | thinning removed an extreme (a sampled ring that no longer reaches the maximum radius) |
| L4 LOD determinism | every level builds identically twice | `Math.random`, or a stream that depends on `detail` |

## The Done report

Report the selected limit and the relevant results of the current `mesh-stats` run. If the target is open, report the counts and any requested LOD results. Note unresolved checks that affect the requested delivery.

## What it does not cover

- **Not measured.** Triangles, vertices and texture memory are counted from the arrays and sizes given. There is no frame time, fill rate, overdraw or real GPU memory (no GPU, no browser in the sandbox).
- **Scene totals.** The 10 to 20 MB scene size and the scene's draw calls need the whole scene: a composite asset can be passed as one asset, but the per-scene budget is not computed.
- **Materials per LOD level.** L2 compares part names, a proxy; real materials per level need `--meta` per level and are not compared.
- **LOD is wired into the dragon kernel only.** The biped, detail and other kernels do not have `detail` yet. The helper and the gates work on any builder that accepts it.
- **Draw calls for vr and desktop, GLB size for props and for vr and desktop:** the table gives no limit, so there is no gate.
- The thresholds are the table's, plus two chosen here and not derived from it: the 0.35 to 0.65 ratio window and the 5% bounds tolerance.
