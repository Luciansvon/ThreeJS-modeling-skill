# Fast and Full Preview

Reference for `threejs-asset-generator`. Read it when the user wants to see or interact with an asset.

Contents: 1 Choose a preview · 2 Full Preview controls · 3 Lighting and contrast · 4 Export and round-trip verify

## 1. Choose a preview

When the request leaves the mode open and the user has not asked to dive straight in, ask in one plain sentence before building a heavy studio. For example, “Fast Preview lets you rotate the final model and try its animation clips. Full Preview adds editable parameters, rig inspection, and expression controls. Which do you want?” Follow an explicit mode choice directly. Use Fast for requests like “quick look”, “check the label”, or “play the exported run clip”. Use Full for authoring controls or detailed rig and expression review.

**Fast Preview.** Reuse the [Fast Preview HTML](../assets/fast-preview.html) for existing GLB files. Open the HTML in a browser and select or drop the exact file into it. Drag to orbit, right-drag or drag with two fingers to pan, and scroll or pinch to zoom. The viewer displays the materials, textures, and labels in the loaded GLB. When the file contains animation clips, pick a clip, press Play/Pause, or drag the timeline to inspect a frame. The viewer starts paused. It needs a WebGL-capable browser and a connection to load the viewer library. For GLB output with textures or clips, choose the Three.js export route in [GLB export](glb-export.md#threejs-export-route).

When the model is still being built or the interactive viewer is unavailable, show `review.png` from the [geometry checks](qa-gates.md). Its four views distinguish parts by color. If color accuracy, texture, or text legibility matters, inspect and capture a frame from the actual GLB viewer and report those checks separately.

**Full Preview.** Reuse an existing studio where available. Build a standalone HTML studio when the user requests live parameter tuning, clip authoring or comparison, pose and root-motion inspection, or facial expressions. Model previews keep the same geometry and materials as export.

## 2. Full Preview controls

Choose controls for the asset and the requested review.

- **Up to six turnaround camera presets:** Front (`+Z`), 3/4 Front, 3/4 Back, Side (`+X`), Back (`-Z`), Top (`+Y`), framed far enough back that the full asset (including horns, tail tips, and peak animation poses) fits cleanly inside the safe center area without colliding with top/bottom HUD bars.
- **Match reference 3/4 facing:** When built from a reference image, place the `3/4 Front` camera on the same side so the asset faces the same screen direction (left or right) as the reference image for direct visual comparison.
- **Non-overlapping HUD layout:** Never let an open parameter drawer overlap the live QA telemetry card or obscure the hero's head/tail; keep parameter drawers collapsible (collapsed by default on narrow viewports) on the opposite side from the QA card.
- **Stylized low-poly VFX (optional, runtime-only):** When the brief asks for effects (lightning, fire, frost, aura), build them from faceted low-poly primitives or crisp additive ribbons in a separate `_studio_vfx` group (never parented under the exported asset root). Keep bloom/flash intensity restrained so the model's silhouette and flat-shaded facets remain readable at peak action.
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
