# Low-poly look and natural shapes

Reference for `threejs-asset-generator`. Read it when choosing a material, texture, palette, flat shading, or vertex jitter. Section numbers match `SKILL.md`.

Contents: §4 Low-poly look (`lowpoly.ts`) and texture choices · §5 Vertex jitter (`jitter.ts`)

## 4. Low-poly look

**Flat shading, two layers.** Set `flatShading: true` (it works for the WebGL preview), and also bake real per-face normals into the geometry (`bakeFlat`). The flag is not stored in glTF, so a flag-only asset looks smooth after `GLTFExporter`; baked normals survive export and behave the same under WebGL and WebGPU.

**Materials.**
- Organic and stone: `roughness` 0.7–0.9, `metalness` 0–0.2.
- Painted or metal parts: `roughness` 0.35–0.6, `metalness` 0.5–0.8. Rough metal (roughness 0.7–0.9 with metalness 0.6–0.9) renders almost black without an environment map; metals only reflect their surroundings. Tell the user that metal parts need `scene.environment` (for example `RoomEnvironment` through `PMREMGenerator`), or lower `metalness` to ≤ 0.35 for an environment-free scene.
- Lamps and windows: use `emissive` and `emissiveIntensity`, not extra lights (§10).
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
