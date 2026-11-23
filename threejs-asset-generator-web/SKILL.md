---
name: threejs-asset-generator-web
description: Create or revise procedural Three.js assets in ChatGPT web, Gemini, Claude web or another chat. Match references in low-poly, voxel, claymation, stylized or realistic styles, with materials, animation, VFX, previews and GLB export where supported.
---

# Three.js Asset Generator for Web Chat

Produce a portable procedural model and evidence for the requested checks. Use the harness workflow, production source, and test fixtures supplied in this Markdown pack. Choose tools by the current session's capabilities. The core workflow also works in text-only chat.

## Read the relevant references

Start with the [web runtime guide](references/runtime.md). Open the chapter for the decision in front of you. Load builder or test source when adapting a helper or diagnosing a failure.

| Work | Read |
| --- | --- |
| Model design, geometry, character rigs, textures, and procedural recipes | [Modeling guide](references/modeling-guide.md) |
| 3D art style catalog (1 primary + <=2 modifiers; open matched heading only) | [Art style catalog](references/art-styles.md) |
| Reference matching, mesh QA, budgets, LOD, rig gates, preview, and export | [Verification guide](references/verification-guide.md) |
| Reusable parameter, geometry, rig, detail, and texture implementations | [Builder source](references/source-builders.md) |
| Inspect or adapt a reference intake, preview, QA, or GLB tool | [Tool source and fixtures](references/source-tools.md) |
| Use regression cases, expected behavior, or package notices | [Test source and notices](references/source-tests.md) |

The packs reproduce canonical files under headings named for the original paths. If the chat reads attachments by name, search for the named chapter in those Markdown files. Their terminal commands and imports document the harness interface. Follow this web skill and the runtime guide when choosing what to execute.

## Continue after a tool failure

1. Check which inputs, tools, and outputs the current session can actually access for the task. Use built-in or hosted capabilities already available to the session.
2. If a tool fails, record the exact error or missing capability. Retry when a specific input or configuration correction can fix it. Then use a compatible alternative or the closest deliverable the session can support.
3. Keep working on independent outputs. Preserve the brief, design decisions, geometry conventions, and gate thresholds. Hold only the step or result that needs the missing tool or input.
4. Deliver the usable artifacts and evidence first. Put unresolved tool failures and their impact in the last section, **Blocked**. Report the failed stage, what prevented it, what you delivered in its place, and what would unblock the missing result.

## Before modeling, confirm three things

Start directly inside the procedural Three.js workflow on Turn 1—never drift into external desktop tool tutorials (MagicaVoxel, Blender) unless explicitly asked. Before writing full 3D model code on a build, send **one concise numbered message** with recommended defaults. Skip options already answered explicitly in the session, but **always confirm the brief summary** first:

1. **Brief summary, style & reference check:** summarize the asset, **1 primary art style + up to 2 modifiers** (read only matching headings in [Art style catalog](references/art-styles.md)—styles guide modeling/materials/rendering via native Three.js params without overriding the reference or duplicating tools), requested actions/VFX, and deliverables. If a reference shows a static turnaround pose (**T-pose / A-pose**, upright cobra-like sit, stiff parallel legs, or flat-spread wings), note it sets proportions and bind/rest pose only—animations start from natural creature locomotion posture (`rigging-biped` chapter in [Modeling guide](references/modeling-guide.md)). Ask the user to re-upload missing or unclear images instead of inventing details.
2. **Work mode:** `1) Quick` (`Fast`), `2) Balance` *(recommended default)*, or `3) Quality`—all modes keep `new THREE.Color(hex)` color accuracy, natural locomotion, and stacked anchored VFX; **`Balance` and `Quality` automatically separate closed-socket facial pivots (`eyeL/R`, `eyelidL/R`, `browL/R`, `lowerJawPivot`) from iteration 1** (lightweight jaw/blink in `Quick` when prominent); `Quick`/`Fast` runs `G3` palette only (0 `G4` overhead), while `Balance`/`Quality` add cached Semantic Color Mapping + `G4` CIEDE2000 regional color QC (max 1 fix round; see `work-modes` in [Modeling guide](references/modeling-guide.md) and `reference-matching` in [Verification guide](references/verification-guide.md)).
3. **Preview mode:** `A) Fast Preview` *(recommended default: orbit, zoom, clip playback/scrub)* or `B) Full Preview` *(camera presets, backdrop/VFX toggles, rig/clip controls)*. Keep `Copy Code` synced with **both** the asset builder and runtime VFX module, plus in-RAM `Verify GLB` with clear notes on empty VFX anchors outside the `.glb`. Wait for the user's choice before building a heavy Full Preview studio. For complex assets, offer optional two-stage approval (blockout first, then detail & animation).

When requirements remain open, ask only for missing items in the same message:
1. **Reference & style:** existing image, generate a reference concept first, or build from text (cache confident part colors by semantic region once at intake, marking unclear parts `uncertain` instead of fabricating; read only matched style sections in [Art style catalog](references/art-styles.md) and prefer built-in materials over custom shaders).
2. **Surface & materials:** choose normals and surface detail for the requested style and viewing distance (for stepped voxels use `VoxelGrid` in [Builder source](references/source-builders.md) with watertight culling by default, or `{ greedy: true }` only when reducing flat-panel triangle count; convert hex colors with `new THREE.Color(hex)`).
3. **Animation & VFX creativity:** choose rigid pivots (`QuaternionKeyframeTrack` on `<node>.quaternion` with unique names), skinning or morph targets, starting from natural creature locomotion posture (`rigging-biped` & `studio-preview` creative choreography and layered VFX references are creative inspiration, not rigid templates). Drive attached fluid/fire/energy via empty anchors + stacked directional particle pools (avoid hinged solid meshes that flap like wings), make projectiles travel monotonically outward in live `root` forward space (`anchorWorldPos + forwardDir * travel`), anchor ground/impact VFX to `Y≈0`, and add optional 2–3 frame micro hit-stops at action peaks. Preview-only effects stay outside exported `.glb` models.
4. **Target & deliverables:** platform (`web`, `mobile`, `roblox`, `desktop`), asset kind (`prop`, `hero`, `creature`, `vehicle`, `building`), and output (`.glb`, standalone code, or both).

## Build from one model

1. Record the brief, output, available views and any deployment target or explicit triangle budget. A browser preview alone establishes no polygon ceiling. Report counts when the target is open. **Reopen the source reference image side-by-side** with rendered previews on every polish round required by your work mode (`work-modes` chapter in [Modeling guide](references/modeling-guide.md)); never rely on flat-colored blockout renders or text memory to judge fine facial detail, colors, seams, VFX, or locomotion posture.
2. Block out the silhouette before adding detail. Use metres, Y up, front at +Z, and the footprint centered on X/Z with the base at Y=0. Name sides by axis where left and right are ambiguous. Record named parts, dimensions, positions, material indices, and any pivots in a single parameter schema or mesh builder. Use a deterministic seed for variation, including seed zero. Keep silhouettes and pivots stable across detail levels.
3. Deliver a reusable JavaScript builder, for example `buildAsset(params, THREE)` returning a `THREE.Group` or `{ root, animations }`. Use named meshes, outward-facing triangles, and the same asset in preview and export. Choose smooth, flat or mixed normals to match the style. Keep scene controls and lighting separate. Use the user's Three.js version when supplied.
4. Give relevant dimensions and clip details. Where animation applies, author exported rotations as `QuaternionKeyframeTrack` (`<node>.quaternion`) on uniquely named pivots and adopt **natural creature locomotion posture** per archetype (`rigging-biped` chapter in [Modeling guide](references/modeling-guide.md) — e.g., drop T-pose arms on bipeds, break stiff quadruped legs into strides, flatten flying snakes/dragons horizontally to undulate `~~~>` instead of staying upright like a cobra; inspect from side view). Activate one clip at a time, sample multiple timestamps including mid-cycle or peak action, and verify target pivots actually change **between timestamps within the same clip** (start/end loop poses may match). Where a facial action matters, check the face in playback on the delivered model (for example, the jaw opening during a roar). Repeat the binding and per-clip motion check on the reloaded `.glb` when binary export is available, and report `PASS` / `FAIL` / `Unchecked` per clip, pivot, and timestamp (keep silhouette, proportions, and clipping `Unchecked` until renders are inspected).

## Choose surface detail

- **Match the surface at the intended viewing distance.** Simple props can use shape, palette and roughness. For clay grain, markings or close-up detail, choose a material, vertex treatment or map that preserves that feature on the final mesh.
- **Use supplied or deterministic artwork for precision.** Reuse suitable user artwork. Make simple repeated patterns from seeded pixels and exact lettering from editable SVG paths or drawn glyphs. Provide the source in text-only chat.
- **Use image generation for original image detail.** For painted markings or irregular surface detail, call the chat's image tool when it is active and can return a usable image. Request a flat, straight-on base-color map with a specified UV region or tile, palette, and scale. Use even illumination and exclude shadows, highlights, and backgrounds. Ask for seamless edges only for tiled maps. If image generation is unavailable, provide a procedural approximation or a solid-color placeholder and a prompt for the missing artwork.
- **Hand off the map and the binding.** Attach the generated image when possible and wire an optional texture input into the builder. State the intended mesh, UV placement, map slot, and resolution. Use one fixed map for both preview and export. Use sRGB for base-color or emissive images and linear data for normal, roughness, and metalness maps. Choose a resolution appropriate to visibility and budget.
- **Report actual results.** Treat the generated image, its placement on the rendered mesh, and its presence in the reloaded GLB as separate checks. Mark missing stages **Unchecked**. If the host only shows the image inline, say whether a usable image file is available.

## Offer a preview mode

- **Fast Preview** is the default for a quick look. When the session can show the actual GLB, use its built-in viewer for orbit, pan, zoom, textures, labels, and playback or scrubbing of embedded clips as supported. Otherwise show a frame, orthographic SVG projected from the model data, or dimensioned front and side blockouts in text. Label schematic output clearly and mark any clip playback that was unavailable as **Unchecked**.
- **Full Preview** is for live parameters, rig inspection, clip authoring or comparison, and expression changes. Open the interactive controls that matter to the brief if the session supports them. If a requested control is unavailable, provide the available preview and record the missing control under **Blocked**.

When the user asks for a preview without specifying the mode, offer both in one sentence and state what the session can show. Share a lightweight fast preview if already ready, and wait for the user's choice before building a heavy Full Preview studio. Follow an explicit choice directly. When an actual preview is available, inspect front and back three-quarter views, a movement frame, and a representative action frame with any requested VFX. Check the browser for errors when the session exposes them. Record each unavailable check separately and continue delivery. [Web visual evidence](references/runtime.md#visual-evidence)

## Return the result

Provide the model source or actual file first, then the dimensions, seed, and review evidence. For requests to show the shape, include a two-view blockout or a labeled part-position table alongside the dimensions. Use **Derived** for calculations from declared parameters, **Verified** for checks with observed input and output, and **Unchecked** for checks without evidence. A planned test belongs under **Unchecked**. A requested result that remains unavailable belongs in the final **Blocked** section, even when you supplied a partial alternative.

For example, a box-based fish crate with external dimensions 1.20 × 0.65 × 0.75 m and a 0.04 m wall can use five named boxes. The base is 1.20 × 0.04 × 0.75 m centered at Y=0.02. The front and back walls are each 1.20 × 0.61 × 0.04 m at Z=±0.355. The left and right walls are each 0.04 × 0.61 × 0.67 m at X=±0.58. All walls are centered at Y=0.345. Front is 1.20 × 0.65 m. Side is 0.75 × 0.65 m. These bounds are **Derived** from the box parameters. Silhouette agreement, rendered mesh, and GLB stay **Unchecked** until there is evidence.
