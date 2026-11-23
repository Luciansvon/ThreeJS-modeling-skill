# Surface style, materials, and natural shapes

Reference for `threejs-asset-generator`. Use it to choose geometry, normals, materials, and texture treatment from the brief or reference. Section numbers match `SKILL.md`.

Contents: §4 Surface style, materials, and texture choices (`lowpoly.ts`) · §5 Vertex jitter (`jitter.ts`) · §5.1 Manifold voxel grid (`voxel.ts`)

## 4. Surface style and materials

| Brief or reference | Shape and normals | Joins and finish |
|---|---|---|
| Faceted low-poly | Put facets where they describe the form. Bake per-face normals on surfaces meant to stay faceted in GLB. | Use deliberate color blocks and readable joints. |
| Clay or claymation | Favor rounded volumes and smooth normals across curves. | Blend soft connections or show the pressed seams visible in the reference. Use a matte finish with subtle surface grain when it reads at the intended distance. |
| Voxel | Use a shared grid and consistent block size. Keep hard edges at changes in face direction. | Keep the block joins sharp where required. Match any per-block color or grain to the grid and reference. For rigged or hinged voxel parts, cull interior faces only within one rigid pivot part so bent joints never open gaps (`references/rigging-biped.md`). |
| Realistic | Preserve smoothing across curved surfaces and sharp edges at actual breaks. Use geometry for profile and joints that affect the silhouette. | Follow real seams and construction. Use material maps at the correct scale and direction where their detail is visible. |

Mix these treatments where the brief calls for it. `PartBuilder` bakes flat normals via `bakeFlat`. Use it for intentionally faceted surfaces. For smooth or mixed shading, author normals on the geometry and retain hard edges only where the shape needs them. The glTF export carries the normals, so inspect the reloaded file when GLB is requested.

**Materials.** Match the reference palette and response under delivery lighting. Set roughness by finish. Use metallic response for exposed metal and an environment when it needs reflections. Give transparent glass its own material and check opacity and sorting from the relevant views. Use `emissive` for visible glow and add actual lighting when the brief calls for a light source.

**Color management.** `new THREE.Color('#2d6a4f')` reads hex as sRGB and stores linear values. Vertex-color attributes are read as linear, so copy `c.r, c.g, c.b` directly. **Never shift lightness directly in Three.js linear HSL (`col.offsetHSL`)** on dark tones (`l < 0.1`): linear shifts blow dark shades up to pastel/lavender—use `shadeHexSRGB(hex, delta, satScale)` from `src/voxel.ts` instead.

### Choose the texture path

| Need at the target camera distance | Use |
| --- | --- |
| Shape and material colors are enough | Use solid or vertex colors with scalar roughness and metalness. Keep surfaces UV-free when they need no map. |
| A pattern or marking is visible, or an exact label was requested | Reuse suitable supplied art. Otherwise use seeded pixels for repeatable patterns, vector paths or authored artwork for exact lettering and logos. |
| Original image detail such as painted fur markings or an irregular weathered surface | If an image tool is available in this session and can return a usable image, call it for the needed map. If unavailable, provide a procedural approximation or a color placeholder plus a handoff prompt. |

For image generation, specify the material, palette, coverage, scale, and UV region or tile. Request a flat, straight-on base-color image with even illumination, with shadows, highlights, and mockup backgrounds excluded. Ask for edge-to-edge repetition only for a tiling map. Give seams room in an atlas and keep lettering in an exact editable layer.

Save the selected image as a fixed asset and load it outside the seeded builder. Pass the loaded texture in as an explicit input so preview and export use the same data. Use the UV and atlas workflow in [rigging and UVs](rigging-biped.md#67-uv-and-seeded-textures) and [detail](detail.md). In Three.js mark ordinary PNG or JPEG base-color and emissive maps as `SRGBColorSpace`, and normal, roughness, and metalness maps as `NoColorSpace`. Add data maps for a specific material requirement and validate them separately. Use the smallest useful resolution within [the target budget](budget.md).

Use a reference crop to set grain direction, size, and contrast. Align wood grain along each board and inspect end grain where cuts expose it. Keep color and texture continuous across a smooth join, or let them change where the material or construction changes. Check the actual asset both close up and at the intended viewing distance.

Report the image file or procedural source, the material slot, and which part it covers. Inspect the actual mesh for UV alignment, scale, seams, and legibility. If GLB is requested, use [the Three.js export path](glb-export.md#threejs-export-route) and inspect the reloaded material and target map. Keep image creation, mesh application, and export checks as separate evidence.

For preview effects, choose the treatment by the intended focus, motion, and background. Check the actual result in the delivery lighting. Use a separate scene group for preview effects and export the actual model materials. [Optional VFX references](studio-preview.md#optional-vfx-references)

**Merge compatible parts.** Merge static parts that share a material when their normals, UVs, and animation requirements allow it. Keep each independently moving part on its own pivot (§6.4). Preserve skin and morph attributes in any animated merge.

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

- **Baked contact shading.** Use `aoShade(base, { zones, downBias, groundY… })` (`references/detail.md` §3) when subtle pocket shading helps the chosen look. Check it alongside material maps and lighting for overdark joins.
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

Use vertex jitter for irregular shapes visible in the reference. Preserve exact grid edges and fitted joins where the design depends on them. Displace vertices **before** `add()` in the primitive's local space with a dedicated forked stream. Give vertices that share a position the same offset to prevent gaps.

Code: `src/jitter.ts`. API:

- `export function applyVertexJitter(geo: THREE.BufferGeometry, amount: number, rng: () => number, pinBottom = false)`


The pinned base is measured from the geometry's own bounding box (primitives are centered on the origin, so a fixed `|y| < 0.02` test would pin the equator, not the bottom). Bounding volumes are recomputed after displacement, and normals are computed once, in `bakeFlat`. Express `amount` relative to the shape size (for example `0.12 * radius`), not as a global constant.

## 5.1 Manifold voxel grid builder (`src/voxel.ts`)

For stepped voxel assets, use `VoxelGrid` and `createVoxelMaterials` (`src/voxel.ts`) so interior faces are culled **only within the same material** (preventing open-edge holes where emissive eyes or markings meet the body), duplicate diagonal 2x2 pinches are bridged symmetrically, and vertices convert hex colors safely via `new THREE.Color(hex)` (never `/ 255`):

- `createVoxelMaterials(THREE, { roughness?, metalness?, glowToneMapped? })` → `{ body, glow }` (`MeshStandardMaterial` flat matte body + unlit `MeshBasicMaterial({ vertexColors: true, toneMapped: false })` for vivid eyes/markings in 2 draw calls), plus `createHdrGlowMaterial(THREE, hex, emissiveIntensity)` for multi-tier HDR bloom accents (`emissiveIntensity > 1` with Studio **Bloom**).
- `shadeHexSRGB(hex, lightnessDelta, satScale?)` shifts shades in perceptual sRGB HSL so deep dark armor never turns pastel/lavender under `offsetHSL`.
- `new VoxelGrid({ voxelSize, origin, symAxis: 'even' | 'odd' })`
- `.set(x, y, z, color, material?, group?)` / `.fillBox(...)` / `.fillEllipsoid(...)` / `.fillSuperEllipsoid(..., { power })` / `.fillTube(p0, p1, r0, r1, ...)` / `.fillCubicBezier(p0, p1, p2, p3, r0, r1, ...)` / `.mirrorX()`
- `.fixDiagonalPinches()` / `.ground(groundY?)` / `.buildParts(by?, { greedy? })` / `.buildGeometries(THREE, { worldVertexT, ao?, aoLevels?, dirShade?, glowBoost?, greedy? })` / `.buildMeshes(THREE, materials, { ao?, glowBoost?, greedy? })`
- **Automatic Corner Voxel AO + directional shading (`ao: true` default):** `buildGeometries` and `buildMeshes` automatically bake 3-neighbor corner AO (`[1.0, 0.89, 0.78, 0.66]`) and subtle directional face shading (`0.85..1.00`) onto non-glow buckets at **0 extra triangles** (auto-disabled for `glow`/`emissive` buckets and `greedy: true`). Pass `{ ao: false }` only if exact unshaded linear colors are needed, and `glowBoost: 1.6` when driving selective Studio Bloom on vertex-colored `glow` parts.
- **Greedy meshing option (`greedy: true`, default `false`):** Merges adjacent coplanar same-color voxel faces to cut flat triangle counts by ~40–60% for mobile or multi-character runtime budgets while keeping bounds and stepped corners intact (skipped automatically when `{ worldVertexT }` / `{ vertexT }` skin weights are passed; keep `greedy: false` when running strict closed-edge weld QA `Q4`/`RG8` because merged quads can touch along T-junctions).

For skinned voxel tails or necks, emit **one** continuous `SkinnedMesh` per material in a straight `-Z` bind pose and bind via `worldVertexT` (never per-`cell` weights!) or `attachWorldSkinWeights(THREE, geo, boneOrder, sampler)` (`src/voxel.ts`) so coincident corners share bit-identical skin weights and pass `RG9 posed skin integrity` with zero tearing under extreme rotation.
