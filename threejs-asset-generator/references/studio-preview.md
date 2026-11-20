# Interactive HTML studio preview pattern

Reference for `threejs-asset-generator`. Read it when building a single-file interactive Three.js preview studio to inspect textured, rigged, or animated assets in a browser.

Contents: 1 When to build a studio · 2 Required controls · 3 Lighting and contrast · 4 Export and round-trip verify

## 1. When to build a studio

Pure triangle QA (`scripts/qa-asset.ts`) and `review.png` verify geometry, winding, symmetry and grounding, but cannot inspect procedural canvas textures, facial expression swaps, or live animation playback. Wrap the asset in a standalone HTML studio whenever textures, expressions, or animations must be checked visually.

## 2. Required controls

- **6-view turnaround camera presets:** Front (`+Z`), 3/4, Side (`+X`), Back (`-Z`), Top (`+Y`), Bottom (`-Y`), framed far enough back that the full asset (ears to boots) sits cleanly above any bottom dock.
- **Parameter controls from schema:** Auto-render sliders and colour pickers directly from the asset's `parameters` array, including `seed` and `detail` (`src/lod.ts`, `0..2`).
- **Live QA telemetry HUD:** Show triangles, meshes, pivots, active LOD level, winding (`ALL CCW`), ground `Y`, horizontal drift, track finiteness, and slide clearance.
- **Rig & animation dock (when animated):** Play/pause, scrub bar, individual clip buttons plus `RefPose`, pivot gizmos toggle, and expression swap buttons (`neutral` / `happy` / `focused`) with optional clip auto-sync.

## 3. Lighting and contrast

- Use `THREE.WebGLRenderer` with `ACESFilmicToneMapping`, `THREE.PCFShadowMap` (never `PCFSoftShadowMap`), and `RoomEnvironment` PMREM so flat-shaded low-poly facets stay readable.
- Support both dark and light studio backdrops. When using Tailwind CDN, stick to standard opacity utilities (`bg-zinc-900/90`, `bg-zinc-900/95` — avoid arbitrary steps like `/88` or `/92` without brackets) so dark HUD panels keep crisp contrast on light backdrops.
- On light backdrops, give bright cream features (inner ears, white highlights) a clear dark outer border so they never blend into the background.

## 4. Export and round-trip verify

- Always build a fresh, clean asset instance in rest pose before calling `GLTFExporter` (never export live gizmos, wireframe/silhouette overrides, or circular `userData`).
- Provide an in-RAM round-trip verify button (`GLTFExporter` -> `GLTFLoader.parse`) that confirms clip count/names, pivot hierarchy, mesh count, and binary size without triggering a file download.
- Export static expression PNGs separately (`512x512`) alongside a metadata JSON file compatible with `scripts/rig-check.ts` (`references/rig-check.md`).
