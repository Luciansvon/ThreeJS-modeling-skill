# Work modes: Quick, Balance, and Quality

Reference for `threejs-asset-generator`. Read this after the user selects a work mode at intake to apply the required reference re-inspection rounds, QA gates, VFX depth, and visual checks.

Contents: Mode comparison · Quick mode · Balance mode · Quality mode · Checking shape (`review.png`) vs checking detail (studio capture)

## Mode comparison

| Requirement | `Quick` | `Balance` (Default) | `Quality` |
|---|---|---|---|
| **Reference inspection** | Once at intake (`ref-spec.md`) | At intake + reopen side-by-side with studio capture | At intake + **reopen side-by-side on every polish round** |
| **Build & detail** | Coarse blockout, primary silhouette, base colors | Full model, clean joins, targeted surface/material detail | High-craft proportions, facial landmarks, markings, crisp seams |
| **Refinement rounds** | None (single build) or 1 quick fix if QA fails | 1 visual & geometry polish pass after first render | **At least 2 visual polish passes** until reference & pose read cleanly |
| **Geometry & budget gates** | `Q1–Q4`, `Q6`, `review.png` | `Q1–Q10` (`qa-asset.ts`) + `mesh-stats.ts` | `Q1–Q10` + `mesh-stats.ts` (including `--lods` when relevant) |
| **Rig & GLB motion gates** | Basic `rig-check` if rigged; skip round-trip unless asked | `rig-check.ts` (`R1–R7`) + `export-rigged-glb.ts` (`RG1–RG7`) when GLB requested | Mandatory `R1–R7` + `RG1–RG7` per-clip motion evidence before & after export |
| **Locomotion posture check** | Basic check that clips move (`R7`) | Side-view sanity check leaving static reference pose | Mandatory side + 3/4 check for all 6 archetypes (`references/rigging-biped.md`) |
| **Runtime VFX & micro-motion** | Optional / simple preview cues | Rich layered VFX for requested actions + idle micro-motion | Full unrestricted multi-layered VFX + rich secondary motion across all clips |
| **Preview & captures** | `review.png` or `Fast Preview` | `Fast` or `Full Preview` + 1 `capture-studio.ts` contact sheet | `Full Preview` / multi-clip captures across **both dark and light backdrops** |

## Quick mode

Use **Quick** when the user wants rapid blockout exploration or an immediate silhouette prototype:
1. Build the grounded, outward-wound asset with deterministic seed (`??`).
2. Run `scripts/qa-asset.ts` (`Q1–Q4`, `Q6`, `review.png`) and fix any winding, open-edge, or grounding errors.
3. If animated, use `QuaternionKeyframeTrack` (`<node>.quaternion`) and run `scripts/rig-check.ts` so clips are valid.
4. Deliver the model and `Fast Preview` (or `review.png`), clearly marking unrun checks (`ref-compare`, multi-round visual polish, or GLB round-trip if not run) as `Unchecked`.

## Balance mode (recommended default)

Use **Balance** for normal production deliverables:
1. Inspect the source reference at intake (`references/reference-matching.md`), record `ref-spec.md`, and note whether the reference uses a static turnaround pose (T-pose, upright cobra sit, stiff stance, flat-spread wings).
2. Run geometry QA (`scripts/qa-asset.ts`), budgets (`scripts/mesh-stats.ts`), and `scripts/ref-compare.ts` when clean orthographic or 3/4 reference masks apply.
3. Author natural creature locomotion postures (`references/rigging-biped.md`) and unrestricted layered runtime VFX (`references/studio-preview.md`).
4. Run `scripts/rig-check.ts` (`R1–R7`) and `scripts/export-rigged-glb.ts` (`RG1–RG7`) when `.glb` is requested.
5. Capture rendered views (`scripts/capture-studio.ts`), **reopen the source reference image side-by-side** with the studio contact sheet, perform at least 1 visual polish pass fixing any landmark, seam, or locomotion posture issues, and re-run affected gates.

## Quality mode

Use **Quality** when visual fidelity, expressive animation, and polish matter most:
1. Execute every step of **Balance**, plus **at least 2 deliberate visual polish rounds**.
2. On **every** polish round, reopen the original reference image directly via image inspection (never rely on text memory or `review.png` alone), place it mentally or visually alongside the rendered studio captures, and list concrete mismatches (eye shape/placement, horns/ears, snout, markings, color warmth, joint seams, silhouette curves, and VFX timing) before editing.
3. Explicitly inspect the **side view** and **3/4 view** of every locomotion clip (`Walk`, `Run`, `FlySlither`, `Swim`, `DragonAscent`) to confirm the whole body spine, limbs, wings, and tail adopt natural creature posture instead of remaining locked to the reference sheet pose.
4. Capture `studio-contact-sheet.png` across both `--background dark` and `--background light` (plus extra sheets when multiple action VFX clips exist), ensuring HUD controls stay clear and zero console/WebGL errors occur.

## Checking shape (`review.png`) vs checking detail (studio capture)

Do not confuse geometry QA renders with final appearance review:

- **`review.png` (`scripts/qa-asset.ts`) checks shape and topology only:** It renders an orthographic 2×2 view with **arbitrary flat colors per part** and magenta highlights for back-facing triangles. Use it to verify coarse silhouette, part proportions, grounding (`Y = 0` grey line), winding, and watertightness (`Q10`). **Never** use `review.png` to judge real colors, surface markings, facial detail, materials, VFX, or animation realism.
- **Studio renders (`scripts/capture-studio.ts` / `studio_preview.html`) check real detail and motion:** Always inspect actual rendered frames (with real materials, vertex/texture colors, lighting, animations, and `_studio_vfx`) alongside the **reopened source reference** to sign off on likeness, joint gaps during bending, natural locomotion posture, and VFX quality (`references/studio-preview.md`, `references/reference-matching.md`).
