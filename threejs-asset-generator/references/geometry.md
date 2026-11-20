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
