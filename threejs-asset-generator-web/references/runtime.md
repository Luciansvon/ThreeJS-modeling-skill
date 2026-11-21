# Web runtime and fallback guide

Contents: Choose capabilities · Tool alternatives · Final Blocked report

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
| Rig, animation, expression, or slide | Rig and clip guide, metadata, and rig validator | Deliver the pivot tree and clips or a table of planned clips. Check ordered times and tuple sizes from the actual keyframe source. A pose diagram can communicate the intended movement. Rendering, skinning, playback, and target import each require their own evidence. |
| Fast or Full Preview | Studio preview pattern and Fast Preview HTML source | Reuse any viewer that can open the actual model. If it cannot load, share a real frame you already have, an orthographic SVG projected from model data, or dimensioned text blockouts. Label the visual and record what it establishes. |

| Stage | Source to consult | Continue with this when the tool is unavailable |
| --- | --- | --- |
| Generate or attach a texture | Look and detail guides, texture and atlas builders | Reuse supplied art, produce procedural pixels or SVG source, or provide a color placeholder and the artwork prompt. Preserve the UV and map binding in the builder. Report image creation, mounted appearance, and GLB inclusion separately. |
| Export and reopen GLB | GLB guide, geometry writer, and browser exporter route | If binary output is unavailable, deliver the complete Three.js builder and its inputs. When the session can create the requested bytes, reopen that file and check expected geometry and attributes. Keep the requested download or any missing round-trip check for the final report. |

For a real comparison, use the matching gates, platform budgets, and tolerances from the source chapters. A manual review can support the design while a numeric gate remains unchecked.

## Final Blocked report

Provide the model, available preview, measurements, and completed checks first. At the end, use a short **Blocked** section for requested work that could not be completed. Give one line per blocked stage with the concrete cause, the fallback delivered, and what would unblock the stage.

Example for a session that can produce Markdown and SVG but cannot create or reopen binary files:

> Delivered the Three.js crate builder with three detail settings, dimensioned front/side SVG, and triangle counts derived from the declared parts. Mesh QA is unchecked because the final triangle data was not executed.
>
> **Blocked**
>
> - GLB export and round trip. The session cannot write a binary attachment or reopen it. The completed builder and its input values are supplied. A binary-capable runner or the harness can generate and validate the GLB from the same inputs.
