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
