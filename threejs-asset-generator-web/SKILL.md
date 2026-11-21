---
name: threejs-asset-generator-web
description: Use when creating or revising a procedural low-poly Three.js asset in ChatGPT web, Gemini, Claude web, or another chat with limited execution, including reference matching, dimensions, textures, previews, or GLB export.
---

# Three.js Asset Generator for Web Chat

Produce a portable procedural model and a short record of what was checked. This skill works when the chat can return only text. Image generation, a hosted preview, a CPU code runner, and attachments are optional capabilities of the current session.

## Build from one model

1. Record the target platform, requested file type, main dimensions, palette, and which reference views are visible. Use a labeled assumption where information is missing. When an image is available, note the silhouette breaks, part layout, and proportions visible in that view. Report obscured features as assumptions.
2. Block out the silhouette before adding detail. Use metres, Y up, front at +Z, and the footprint centered on X/Z with the base at Y=0. Name sides by axis where left and right are ambiguous. Record named parts, dimensions, positions, material indices, and any pivots in a single parameter schema or mesh builder. Use a deterministic seed for variation, including seed zero. Keep silhouettes and pivots stable across detail levels.
3. Deliver complete JavaScript for a reusable Three.js builder, for example `buildAsset(THREE, params)` returning a `THREE.Group`. Pass in the Three.js namespace so the source can be copied without repository helpers or network imports. Use named meshes, flat-shaded materials, outward-facing triangles, and the same geometry for preview and any export. Keep scene controls and lighting separate from the asset. Use the user's current Three.js version when supplied.
4. Give front and side dimensions in the answer. For characters, include the pivot tree and a clip table with durations, root motion, and expression mappings as applicable. Keep inspection poses separate from exported gameplay clips.

## Choose surface detail

- **Solid material or vertex color by default.** Leave simple low-poly props untextured when their shape, palette, and roughness carry the look at the intended camera distance. Add image detail for a visible requirement such as markings, a label, or a close-up material.
- **Use supplied or deterministic artwork for precision.** Reuse suitable user artwork. Make simple repeated patterns from seeded pixels and exact lettering from editable SVG paths or drawn glyphs. Provide the source in text-only chat.
- **Use image generation for original image detail.** For painted markings or irregular surface detail, call the chat's image tool when it is active and can return a usable image. Request a flat, straight-on base-color map with a specified UV region or tile, palette, and scale. Use even illumination and exclude shadows, highlights, and backgrounds. Ask for seamless edges only for tiled maps. If image generation is unavailable, provide a procedural approximation or a solid-color placeholder and a prompt for the missing artwork.
- **Hand off the map and the binding.** Attach the generated image when possible and wire an optional texture input into the builder. State the intended mesh, UV placement, map slot, and resolution. Use one fixed map for both preview and export. Use sRGB for base-color or emissive images and linear data for normal, roughness, and metalness maps. Choose a resolution appropriate to visibility and budget.
- **Report actual results.** Treat the generated image, its placement on the rendered mesh, and its presence in the reloaded GLB as separate checks. Mark missing stages **Unchecked**. If the host only shows the image inline, say whether a usable image file is available.

## Offer a preview mode

- **Fast Preview** is the default for a quick look. When the session can show the actual GLB, use its built-in viewer for orbit, pan, zoom, textures, labels, and playback or scrubbing of embedded clips as supported. Otherwise show a frame, orthographic SVG projected from the model data, or dimensioned front and side blockouts in text. Label schematic output clearly and mark any clip playback that was unavailable as **Unchecked**.
- **Full Preview** is for live parameters, rig inspection, clip authoring or comparison, and expression changes. Open the interactive controls that matter to the brief if the session supports them. If a requested control is unavailable, state the capability and provide the fast result.

When the user asks for a preview without specifying the mode, offer both in one sentence and state what the session can show. Share the fast result if it is ready. Follow an explicit choice directly and keep building the asset while the choice is open. Report checks only for the model and views actually inspected.

## Match the output to the available capability

| Need | Web alternative | Evidence to report |
| --- | --- | --- |
| Mesh QA, counts, or LOD | Inspect supplied geometry data. If a hosted CPU runner can execute the same emitted geometry, compute bounds, finite vertices, triangle counts, degenerates, and grounding. Compare LODs by measured counts and bounds. | Distinguish dimensions or counts calculated from declared primitives from measurements on executed geometry. Leave topology, winding, and target performance unchecked where evidence is missing. |
| Rig or animation review | Inspect supplied or generated pivot and keyframe data. Check targets, increasing timestamps, one value tuple per key, and horizontal root movement when in-place is required. Use a frame/pose sheet for a visual draft. | Report exactly which metadata was checked. Mark deformation, playback, and target import unchecked until observed. |
| Downloadable GLB | If this session can create binary files with a hosted CPU runner, export the actual model and reopen or validate the exact bytes. Compare expected bounds, part names, and requested attributes such as materials, skins, or clips. In text-only chat, deliver the complete Three.js builder and mark GLB pending. Keep export instructions and helpers out of the text-only handoff. | Attach the file with its size and checks run. A binary header check establishes format only. Rendered appearance and target import need separate evidence. |

Use the capabilities already available in the chat, including hosted image generation when applicable. Keep the essential workflow independent of terminal commands, package installation, external upload services, and local GPU or WebGL rendering. When the built-in preview is unavailable, deliver copyable source and dimensioned views.

## Return the result

Provide the model source or actual file first, then the dimensions, seed, and review evidence. For requests to show the shape, include a two-view blockout or a labeled part-position table alongside the dimensions. Use **Derived** for calculations from declared parameters, **Verified** for checks with observed input and output, and **Unchecked** for missing inputs, permissions, or execution. A planned test belongs under **Unchecked**.

For example, a box-based fish crate with external dimensions 1.20 × 0.65 × 0.75 m and a 0.04 m wall can use five named boxes. The base is 1.20 × 0.04 × 0.75 m centered at Y=0.02. The front and back walls are each 1.20 × 0.61 × 0.04 m at Z=±0.355. The left and right walls are each 0.04 × 0.61 × 0.67 m at X=±0.58. All walls are centered at Y=0.345. Front is 1.20 × 0.65 m. Side is 0.75 × 0.65 m. These bounds are **Derived** from the box parameters. Silhouette agreement, rendered mesh, and GLB stay **Unchecked** until there is evidence.
