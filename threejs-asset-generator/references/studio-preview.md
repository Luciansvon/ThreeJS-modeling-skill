# Fast and Full Preview

Reference for `threejs-asset-generator`. Read it when the user wants to see or interact with an asset.

Contents: 1 Choose a preview · 2 Full Preview controls · 3 Lighting, VFX, and framing · 4 Export and round-trip verify · 5 Final visual and animation checks

## 1. Choose a preview

When the request leaves the mode open and the user has not asked to dive straight in, ask in one plain sentence before building a heavy studio. For example, “Fast Preview lets you rotate the final model and try its animation clips. Full Preview adds editable parameters, rig inspection, and expression controls. Which do you want?” Follow an explicit mode choice directly. Use Fast for requests like “quick look”, “check the label”, or “play the exported run clip”. Use Full for authoring controls or detailed rig and expression review.

**Fast Preview.** Reuse the [Fast Preview HTML](../assets/fast-preview.html) for existing GLB files. Open the HTML in a browser and select or drop the exact file into it. Drag to orbit, right-drag or drag with two fingers to pan, and scroll or pinch to zoom. The viewer displays the materials, textures, and labels in the loaded GLB. When the file contains animation clips, pick a clip, press Play/Pause, or drag the timeline to inspect a frame. The viewer starts paused. It needs a WebGL-capable browser and a connection to load the viewer library. For GLB output with textures or clips, choose the Three.js export route in [GLB export](glb-export.md#threejs-export-route).

When the model is still being built or the interactive viewer is unavailable, show `review.png` from the [geometry checks](qa-gates.md). Its four views distinguish parts by color. If color accuracy, texture, or text legibility matters, inspect and capture a frame from the actual GLB viewer and report those checks separately.

**Full Preview.** Reuse an existing studio where available. Build a standalone HTML studio when the user requests live parameter tuning, clip authoring or comparison, pose and root-motion inspection, or facial expressions. Model previews keep the same geometry and materials as export.

### Package one asset builder

Use `pack-studio` to open a TS or JS builder in a self-contained HTML preview with all six turnaround presets (`34-front`, `34-back`, `front`, `side`, `back`, `top`), orbit and pan, clip selection, playback, scrubbing, dark/light backdrop toggle, and built-in rest-pose `.glb` export + in-RAM round-trip verification (`GLTFExporter` -> `GLTFLoader`). Both the preview and the rigged exporter call the same builder with `(params, THREE)` and accept an `Object3D` or `{ root, animations }`. Run both from the harness with the same resolved inputs and compatible Three.js versions. Use the injected `THREE` value so the model and viewer share the harness version. [Builder export contract](glb-export.md#threejs-export-route)

```bash
npm run pack-studio -- --module ./asset.ts --export buildAsset --background dark --initial-clip IdleFloat --autoplay --out ./index.html
npm run export-rigged-glb -- --module ./asset.ts --export buildAsset --out ./asset.glb
```

Pass the same `--params` JSON object to both commands for a specific seed or configuration. Use `--initial-clip <Clip>` and `--autoplay` on showcase previews when the asset has animation clips so interactive opens begin alive rather than frozen in rest pose. The packer bundles browser-compatible imports, and locally imported image files are embedded as data URLs. Await the texture loads inside an asynchronous builder before returning the model. A builder that requests external assets at runtime still depends on those URLs. Add parameter editors, rig gizmos, or expressions when the brief calls for them.

In Windows PowerShell 5, use the script directly with escaped JSON quotes, for example `node --import tsx scripts/pack-studio.ts --module ./asset.ts --out ./index.html --params '{\"seed\":1}'`. Use the same quoting with `scripts/export-rigged-glb.ts` for export.

Use `--front-side right` to match a reference facing screen right in the front preset, and `--background light` when inspecting pale backgrounds by default. The packaged viewer reserves a separate header and control bar and frames the posed vertices (across rest pose and sampled animation frames) using up to 25 sampled poses per clip. Increase `--margin` from its default `1.18` if the asset needs more breathing room, and inspect the exact longest pose.

## 2. Full Preview controls

Choose controls for the asset and the requested review.

- **Up to six turnaround camera presets:** Front (`+Z`), 3/4 Front, 3/4 Back, Side (`+X`), Back (`-Z`), Top (`+Y`), framed far enough back that the full asset (including horns, tail tips, and peak animation poses) fits cleanly inside the safe center area without colliding with top/bottom HUD bars.
- **Match reference 3/4 facing:** When built from a reference image, place the `3/4 Front` camera on the same side so the asset faces the same screen direction (left or right) as the reference image for direct visual comparison.
- **Non-overlapping HUD layout:** Never let an open parameter drawer overlap the live QA telemetry card or obscure the hero's head/tail; keep parameter drawers collapsible (collapsed by default on narrow viewports) on the opposite side from the QA card.
- **Runtime VFX (optional).** Keep preview effects in a scene-level `_studio_vfx` group beside the asset. Match the effect to the intended motion and style. [VFX references](#optional-vfx-references)
- **Parameter controls from schema:** Auto-render sliders and colour pickers directly from the asset's `parameters` array, including `seed` and `detail` (`src/lod.ts`, `0..2`).
- **Live QA telemetry HUD:** Show observed triangle and mesh counts. Add measured grounding, winding, drift, and other QA results when available. Mark checks without evidence as `Unchecked`.
- **Rig & animation dock (when animated):** Play/pause, scrub bar, individual clip buttons plus `RefPose`, pivot gizmos toggle, and expression swap buttons (`neutral` / `happy` / `focused`) with optional clip auto-sync.

## 3. Lighting and contrast

- Use `THREE.WebGLRenderer` with `ACESFilmicToneMapping`, `THREE.PCFShadowMap` (never `PCFSoftShadowMap`), and balanced `RoomEnvironment` + key/rim lighting (`#0d1422` deep dark / `#eef2f6` crisp light studio) so shadows, dark recesses, and emissive contrast read sharply at first glance.
- Support both dark and light studio backdrops. When using Tailwind CDN, stick to standard opacity utilities (`bg-zinc-900/90`, `bg-zinc-900/95` — avoid arbitrary steps like `/88` or `/92` without brackets) so dark HUD panels keep crisp contrast on light backdrops.
- On light backdrops, give bright cream features (inner ears, white highlights) a clear dark outer border so they never blend into the background.

### Universal VFX anchoring rule (mandatory)

Static hardcoded world coordinates break whenever an animated creature lifts, leans horizontal (`Swim`/`Fly`), jumps, or lunges:
- **Body, muzzle, weapon, and propulsion/trail VFX:** Inside `vfx.update({ clip, time })`, always read live world transforms (`bone.getWorldPosition(...)` / `bone.getWorldQuaternion(...)`, or `new THREE.Box3().setFromObject(root, true).getCenter(...)`) after pose updates—**never** hardcode fixed `Y`/`Z` offsets like `(0, 1.35, -0.5)` or sample an un-animated outer wrapper at `(0, 0, 0)`.
- **Floor, dust, shadow-pool, and ground-impact VFX:** Lock height near the floor (`Y ≈ 0.015–0.03`) while tracking live world `X, Z` of the stepping foot, striking appendage, or body center so floor effects follow character movement without floating into mid-air during leaps.

### Creative layered VFX & color grading reference (inspiration, not hard rules)

Use these principles freely to make effects blend naturally into every asset style without obscuring faces:
- **Match shape language to model style:** Author voxel VFX with crisp instanced/animated cubes, stepped streaks, and polygonal rings; low-poly VFX with sharp crystal/shard prisms and faceted cones; smooth/clay assets with soft ribbons, glow spheres, and billowy puffs.
- **Three-tier palette value contrast:** Sample the asset's own palette into **50–60% deep dark anchor shades** (ensures sharp contrast on light backgrounds and depth on dark ones), **~30% bridge mid-tones** matching the body hue, and **10–15% crisp bright emissive cores** (`toneMapped: false`).
- **Characterful `Idle` VFX (intermittent rhythm, not continuous overload):** Keep idle effects quiet and alive—such as occasional jagged static lightning arcs snapping briefly between a thunder dragon's horns/back, slow rising embers + dark charcoal puffs on fire monsters, sinking cold mist + frost flakes on ice creatures, gentle rising bubbles + seafloor caustics + synchronized idle glow pulses on aquatic creatures, or subtle foot dust wisps on grounded fighters.
- **Breathing room around faces:** Frame swirling vortexes, sparks, and ribbons around shoulders, limbs, back, or floor while keeping a clean optical window around eyes and expressions.

### Optional VFX references

Push animation VFX and fine surface/motion details as creatively as possible—there are **zero creative limits** on particle count, layering, color palettes, custom shaders, or techniques when crafting preview VFX. Use these examples strictly as inspiration, never as ceilings; combine, layer, or invent new effects (bursts, sparks, dust clouds, debris, energy arcs, motion trails, shockwaves, rim glows, smoke, flashes, ground decals) so every action feels alive. Default to rich, expressive multi-layered VFX unless the user explicitly asks for minimal effects. Triangle budgets apply to the exported model only, not preview-only `_studio_vfx`.

- **Lightning burst.** One possible rhythm is inward-moving energy, a short flash, an expanding wave, then lingering sparks. Change the stages and their timing to match the action. A continuous aura can use a different rhythm.
- **Gradient ribbon.** A translucent tinted shell with soft edges and a thin bright core can keep a bolt legible on pale backgrounds. `NormalBlending` is one way to preserve its tint. A short additive flash can give the peak more impact when it suits the lighting. [Three.js material blending](https://threejs.org/docs/pages/Material.html#blending)
- **Ground contact.** A surface ripple, dust wake, or brief aftermark can give a grounded strike a sense of weight. Use a response that fits the surface and the action.

Play the action at the delivery camera distance and backdrop. Where they matter to the brief, check the weight at impact, the direction the effect travels, and how it settles afterward. Refine and enrich the effects while preserving the character motion that already reads well. Keep preview effects beside the model root and pass only the fresh model root and its animation clips to GLB export.

Add `--vfx ./effect.ts` to `pack-studio` to include requested effects in the same self-contained preview. Supplied effects start enabled. Use **Studio VFX** to toggle them while playing or scrubbing. Export a factory such as `createStudioVfx({ root, asset, params, group, THREE })` and add its meshes to the supplied `group`. Select the factory with `--vfx-export` if needed. An optional `update({ clip, time, duration })` callback sets the effect at each pose, including rest (`clip: null`), so action-timed effects appear where authored.

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
- Packaged studios (`pack-studio`) include built-in `Export .glb` and `Verify GLB` buttons (`GLTFExporter` -> `GLTFLoader.parse`) that test clip count/names, bones, skins, mesh/triangle parity, track binding, and per-clip motion preservation in RAM without triggering a file download, reporting moving vs static clips; custom studios should expose the same rest-pose check.
- Export static expression PNGs separately (`512x512`) alongside a metadata JSON file compatible with `scripts/rig-check.ts` (`references/rig-check.md`).

## 5. Final visual and animation checks

When a browser tool is available, open the delivered preview for the final model and parameters, **reopen the source reference image side-by-side** (following the polish rounds in `references/work-modes.md`), and inspect actual materials, markings, background, and movement. Check the console, play the main motion, and scrub to a representative action frame. Use the available viewer for the requested preview mode.

1. **3/4 Front.** Check silhouette, facial landmarks, materials, and how the model fits around the title and controls.
2. **3/4 Back.** Check the opposite side, tail, appendages, and texture seams.
3. **Mid-movement (prefer `side` view for posture check).** Play the main movement clip, inspect its midpoint for pose, stretch, and ground clearance, and verify the creature adopts **natural locomotion posture** for its archetype (`references/rigging-biped.md` — e.g., flying snakes/dragons flatten horizontally `~~~>` rather than staying upright like a cobra; bipeds drop T-pose arms; quadrupeds break stiff parallel legs). Watch the loop transition when the clip loops.
4. **Action and effects.** Play the action and inspect a representative frame in the delivery lighting. Use the [VFX review](#optional-vfx-references) when effects are requested.

Open the captured views and record what was seen per panel, together with actual console or rendering errors. The geometry `review.png` stays useful for winding and shape. Visual checks require a rendered model, and smoothness requires observing playback. When the browser, clip, or requested effect cannot be inspected, report that check as `UNVERIFIED` and deliver the available results.

For a packaged preview, `capture-studio` uses an installed Chrome, Edge, or Chromium and the optional `playwright-core` dependency. Substitute your actual clip names and choose a representative action time in seconds. Add `--motion-view side` (or `top`, `back`, `front`, `34-back`) to inspect profile motion, `--motion-vfx` when locomotion clips (`Swim`, `Fly`, `Run`) also emit runtime VFX (without failing if a plain walk has none), `--action-view <view>` for action silhouettes, `--extra Clip@time[:view][:vfx]` or `--extras Clip1@t1:view:vfx,Clip2@t2` to inspect additional clips in an expanded multi-row sheet, `--background light` when verifying light-backdrop contrast, and `--vfx` when the action frame should show an effect. Use `--browser` if you need to point to a particular browser executable.

```bash
npm run capture-studio -- --studio ./index.html --out ./studio-contact-sheet.png --locomotion Swim --motion-view side --motion-vfx --action TentacleSlam --peak 1.0 --vfx --extras "InkMaelstrom@1.5:34-front:vfx,IdleFloat@2.2:34-front:vfx" --background dark
```

Read the final `@@RESULT` for the actual clip times, browser errors, and any `UNVERIFIED` views. The VFX pixel comparison records whether the effect changed the action frame. Judge the effect's quality in playback at the intended delivery view. A static asset with no requested clips has two rendered views and two `NOT_APPLICABLE` panels. Open `studio-contact-sheet.png` when it was produced. If the local browser or driver is unavailable, use an available browser tool or viewer and record the evidence it can provide.
