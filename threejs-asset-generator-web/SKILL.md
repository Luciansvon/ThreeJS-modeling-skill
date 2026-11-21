---
name: threejs-asset-generator-web
description: Use when creating or revising a procedural low-poly Three.js asset in ChatGPT web, Gemini, Claude web, or another chat with limited execution, including reference matching, dimensions, textures, previews, or GLB export.
---

# Three.js Asset Generator for Web Chat

Produce a portable procedural model and evidence for the requested checks. Use the harness workflow, production source, and test fixtures supplied in this Markdown pack. Choose tools by the current session's capabilities. The core workflow also works in text-only chat.

## Read the relevant references

Start with the [web runtime guide](references/runtime.md) before using commands or code from the source excerpts. Open the chapters that match the brief.

| Work | Read |
| --- | --- |
| Model design, geometry, character rigs, textures, and procedural recipes | [Modeling guide](references/modeling-guide.md) |
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
- **Full Preview** is for live parameters, rig inspection, clip authoring or comparison, and expression changes. Open the interactive controls that matter to the brief if the session supports them. If a requested control is unavailable, provide the available preview and record the missing control under **Blocked**.

When the user asks for a preview without specifying the mode, offer both in one sentence and state what the session can show. Share the fast result if it is ready. Follow an explicit choice directly and keep building the asset while the choice is open. Report checks only for the model and views actually inspected.

## Return the result

Provide the model source or actual file first, then the dimensions, seed, and review evidence. For requests to show the shape, include a two-view blockout or a labeled part-position table alongside the dimensions. Use **Derived** for calculations from declared parameters, **Verified** for checks with observed input and output, and **Unchecked** for checks without evidence. A planned test belongs under **Unchecked**. A requested result that remains unavailable belongs in the final **Blocked** section, even when you supplied a partial alternative.

For example, a box-based fish crate with external dimensions 1.20 × 0.65 × 0.75 m and a 0.04 m wall can use five named boxes. The base is 1.20 × 0.04 × 0.75 m centered at Y=0.02. The front and back walls are each 1.20 × 0.61 × 0.04 m at Z=±0.355. The left and right walls are each 0.04 × 0.61 × 0.67 m at X=±0.58. All walls are centered at Y=0.345. Front is 1.20 × 0.65 m. Side is 0.75 × 0.65 m. These bounds are **Derived** from the box parameters. Silhouette agreement, rendered mesh, and GLB stay **Unchecked** until there is evidence.
