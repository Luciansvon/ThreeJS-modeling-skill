# Web runtime and fallback guide

Contents: Asset pipeline · Choose capabilities · Tool alternatives · Visual evidence · Final Blocked report

## Asset pipeline

1. **Read the brief.** Record target, required outputs, dimensions, and available reference views. Label assumptions about missing views or measurements.
2. **Build one model.** Create a seeded builder with named parts and consistent units, axes, and pivot. Use it for the requested detail levels, rig, preview, and export.
3. **Choose surface detail.** Use material or vertex colors when shape and palette carry the look. Bind a supplied, procedural, or session-generated map when surface detail matters. Use the same map in the preview and export. [Texture rules](../SKILL.md#choose-surface-detail)
4. **Gather evidence.** Apply relevant geometry checks to the model data and enforce the agreed asset budget if one exists. Separate **shape/topology checks** (flat-colored `review.png` or blockouts) from **appearance & motion checks**: reopen the source reference side-by-side with actual rendered views per the `work-modes` chapter in [Modeling guide](modeling-guide.md) (`Quick`, `Balance`, `Quality`) whenever checking real colors, details, VFX, or locomotion posture. Repeat checks affected by a change, then verify the delivered build. Label calculations **Derived**, observed results **Verified**, and checks without evidence **Unchecked**. [Verification guide](verification-guide.md)
5. **Deliver the chosen preview and output.** Offer Fast and Full when the preview mode is open. Prepare the selected mode using the same model, or use an available fallback. If binary export is possible, reopen the actual GLB. Deliver completed work first and end with any unresolved requested stages. [Preview rules](../SKILL.md#offer-a-preview-mode), [Blocked report](#final-blocked-report)

## Choose capabilities

The web edition preserves the harness's workflow and gate definitions. Search the modeling and verification packs by source heading. Read implementation chapters when you need a specific helper. Choose a delivery path based on the capabilities that work in the current session.

1. **Text and attachments.** Read instructions and source from the Markdown chapters. When a host cannot open an attachment, use the brief and excerpts that you can read. Record which missing references prevented a specific check.
2. **Hosted execution.** Reuse plain-array computations when the session can actually run them. Adapt the relevant TypeScript module and its dependencies to the supported JavaScript or CPU runtime. Keep inputs, expected outputs, and thresholds aligned with the canonical examples. Inspect the actual result before marking a check verified.
3. **Interactive preview and image generation.** Use native preview or image tools already present when the brief calls for them. Keep the same model, dimensions, and materials across views. A conceptual image and an exported mesh have separate evidence.
4. **Files.** Provide copyable source in text-only chat. Use an attachment or browser artifact when the host can create it. A downloadable GLB requires actual binary output and a check on that output.

When a capability fails, record the exact error or observed limitation, use an appropriate fallback, and carry on with available parts of the task. Keep the core web handoff usable in text chat. Use existing host capabilities for optional code execution, image generation, preview, and binary files.

## Tool alternatives

| Stage | Source to consult | Continue with this when the tool is unavailable |
| --- | --- | --- |
| Import and match references | The reference-matching guide, reference intake, and compare tools | Read visible front, side, or other supplied views. Record confirmed features, dimensions, and assumptions. Compare proportions analytically and produce shared-scale views. Calculate silhouette IoU only when you have both valid masks. |
| Geometry QA and mesh budgets | QA gates, budget guide, mesh stats, and pure triangle checks | Use the same checks on final triangle data in a hosted CPU runner. For a text-only design, report derived bounds and known primitive counts. Keep winding, closure, and numeric gates unchecked if the triangle arrays could not be inspected. |
| Multiple detail levels | Budget guide and LOD builder | Deliver the requested levels in the builder. Use the same seed, pivot, and bounds, and report actual or derived triangle counts for each. Keep cross-level checks that require execution unchecked when the runtime is unavailable. |
| Rig, animation, expression, or slide | Rig and clip guide, metadata, and rig validator | Deliver the pivot tree and clips with unique node names and `QuaternionKeyframeTrack` (`<node>.quaternion`) for exported rotations; transition out of any static reference pose (T-pose, upright cobra sit, stiff stance, flat-spread wings) into natural creature locomotion posture per archetype (e.g., flying snakes/dragons flatten horizontally and undulate `~~~>` rather than staying upright) and verify from side view. Test one clip at a time, check ordered times and tuple sizes from the actual keyframe source, and compare target pivot transforms across timestamps within the same clip (including mid-cycle/peak). Repeat on the reloaded GLB if binary export ran, and report per-clip/pivot status with timestamps. Keep rendering, skinning, playback, and target import marked separately as **Verified** or **Unchecked**. |
| Fast or Full Preview | Studio preview pattern and Fast Preview HTML source | Reuse any viewer that can open the actual model. If it cannot load, share a real frame you already have, an orthographic SVG projected from model data, or dimensioned text blockouts. Label the visual and record what it establishes. |

| Stage | Source to consult | Continue with this when the tool is unavailable |
| --- | --- | --- |
| Generate or attach a texture | Look and detail guides, texture and atlas builders | Reuse supplied art, produce procedural pixels or SVG source, or provide a color placeholder and the artwork prompt. Preserve the UV and map binding in the builder. Report image creation, mounted appearance, and GLB inclusion separately. |
| Export and reopen GLB | GLB guide, geometry writer, and browser exporter route | If binary output is unavailable, deliver the complete Three.js builder and its inputs. When the session can create the requested bytes, reopen that file and check expected geometry and attributes. Keep the requested download or any missing round-trip check for the final report. |

For a real comparison, use the matching gates, platform budgets, and tolerances from the source chapters. A manual review can support the design while a numeric gate remains unchecked.

## Visual evidence

Use any viewer already available in the session to open the delivered model and **reopen the source reference side-by-side** (following the `work-modes` chapter in [Modeling guide](modeling-guide.md); never rely on flat-colored `review.png` or schematics for appearance/motion sign-off). Inspect `3/4 Front` and `3/4 Back` in the actual materials, a **side-view frame halfway through the requested movement clip** (confirming natural creature locomotion posture rather than a locked reference stance), and a representative frame of the main action. Check any requested effects against the intended background and check that the model stays clear of the preview controls. Record what you observed in each available view and report browser or rendering errors when the viewer exposes them. [Verification and studio guide](verification-guide.md)

Judge requested VFX during playback at the intended camera distance and against the delivery background. Push animation VFX and fine details as creatively as possible—with **no creative limits** on layered particles, sparks, dust, debris, motion trails, glows, shockwaves, smoke, flashes, or shaders—defaulting to rich, multi-layered VFX unless minimal effects are requested. For an impact, can the viewer tell what struck, where it landed and how the surroundings reacted? If the motion already reads well, refine and enrich the effect in isolation and replay the same moment. Use one preview that can show the effect. If playback is unavailable, inspect available frames or deliver the effect code and mark timing unchecked. Reserve **Blocked** for requested results that remain unavailable.

When interactive inspection is unavailable, use any existing render or draw a schematic from the model data. Record which visual and playback checks are **Unchecked**. Put only unresolved requested outputs in the final **Blocked** report and deliver the remaining work.

## Final Blocked report

Provide the model, available preview, measurements, and completed checks first. At the end, use a short **Blocked** section for requested work that could not be completed. Give one line per blocked stage with the concrete cause, the fallback delivered, and what would unblock the stage.

Example for a session that can produce Markdown and SVG but cannot create or reopen binary files:

> Delivered the Three.js crate builder with three detail settings, dimensioned front/side SVG, and triangle counts derived from the declared parts. Mesh QA is unchecked because the final triangle data was not executed.
>
> **Blocked**
>
> - GLB export and round trip. The session cannot write a binary attachment or reopen it. The completed builder and its input values are supplied. A binary-capable runner or the harness can generate and validate the GLB from the same inputs.
