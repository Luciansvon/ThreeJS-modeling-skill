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
- `export function tubeTrisWithT(path: V3[], radius: number[] | ((t: number) => number), sides = 6, caps = true, shape?: (angle: number, t: number) => number, upHint?: V3): { tris: Tris; vertexT: number[] }`
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
