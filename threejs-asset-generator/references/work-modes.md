# Work modes: Quick (Fast), Balance, and Quality

Reference for `threejs-asset-generator`. Read this after the user selects a work mode at intake to apply the required reference re-inspection rounds, QA gates, G4 regional color QC policy, VFX depth, and visual checks.

Contents: Mode comparison · Quick (Fast) mode · Balance mode · Quality mode · Checking shape (`review.png`) vs checking detail (studio capture)

## Mode comparison

| Requirement | `Quick` (`Fast`) | `Balance` (Default) | `Quality` |
|---|---|---|---|
| **Reference inspection** | Once at intake (`ref-spec.md` + cache `regions` if provided) | Intake + `ref-compare` + **1 side-by-side reopen** with studio capture | Intake + `ref-compare` + **reopen side-by-side on every polish round** |
| **Build & detail** | Full model, accurate proportions, bright emissive eyes/accents (`new THREE.Color(hex)`) | Full model, clean joins, targeted surface/material detail | High-craft proportions, facial landmarks, markings, crisp seams |
| **Refinement rounds** | Single build + fix only if QA or colored render fails | **1** visual & geometry polish pass after first render | **>= 2** visual polish passes until reference & pose read cleanly |
| **Geometry & budget gates** | `Q1–Q4`, `Q6`, `review.png` (`qa-asset.ts --module`) | `Q1–Q10` (`qa-asset.ts --module`) + `mesh-stats.ts` | `Q1–Q10` + `mesh-stats.ts` (with `--lods` when relevant) |
| **Color QC (`G3` & `G4`)** | **`G3` palette only** (`0` `G4` overhead; `--mode fast`) | `G3` + **`G4` Regional Color once** after materials (max 1 fix round) | `G3` + **`G4` Regional Color** + verify once after fix (no infinite loop) |
| **Rig & GLB motion gates** | `rig-check.ts` (`R1–R7`) + `export-rigged-glb.ts` (`RG1–RG8`) when GLB asked | `rig-check.ts` (`R1–R7`) + `export-rigged-glb.ts` (`RG1–RG8`) | Full `R1–R7` + `RG1–RG8` evidence pre & post export |
| **Locomotion posture check** | Side-view sanity check (`capture-studio.ts --motion-view side`) | Side-view + `--motion-vfx` / `--extras` across active clips | Dual dark+light multi-view checks for all 6 archetypes |
| **Runtime VFX & choreography** | Style-matched layered VFX & lively clips (no deliberate throttling) | Rich layered VFX, anchored positions, lively idle & movement | Full multi-layered VFX, nuanced secondary follow-through & contrast |
| **Preview & captures** | `Fast` or `Full Preview` + **1** colored `capture-studio.ts` check | `studio_preview.html` + `capture-studio.ts` (`--vfx --motion-vfx`) | `studio_preview.html` + **both dark and light** `capture-studio.ts` sheets |

## Quick (Fast) mode

Never deliberately degrade visuals into a crude blockout or weak dot VFX. **Quick** speeds up delivery by skipping multi-round polish loops and skipping `G4` regional color checks (`G3` only, zero `G4` overhead):
1. Build the grounded, outward-wound asset with deterministic seed (`??`), clean manifold topology (`src/voxel.ts` for voxel builds), accurate `new THREE.Color(hex)` vertex/material colors, and natural creature locomotion posture (`references/rigging-biped.md`).
2. Run `scripts/qa-asset.ts --module` (`Q1–Q4`, `Q6`, `review.png`) and fix any winding, open/duplicated edge, or grounding error.
3. If animated, use `QuaternionKeyframeTrack` (`<node>.quaternion`) and run `scripts/rig-check.ts` + `scripts/export-rigged-glb.ts` (checks `RG1–RG8` including reloaded GLB topology).
4. Pack the preview (`scripts/pack-studio.ts`) and run **1** colored `scripts/capture-studio.ts` check (never rely on `review.png` to judge real colors or VFX). Pass `--mode fast` if invoking `ref-compare.ts` so `G4` adds zero overhead.

## Balance mode (recommended default)

Use **Balance** for normal production deliverables:
1. Inspect the source reference once at intake (`references/reference-matching.md`), record `ref-spec.md`, note static turnaround poses, and extract/cache `ref.json` (including optional Semantic Color Mapping regions — never re-analyze unchanged references).
2. Run geometry QA (`scripts/qa-asset.ts --module`), budgets (`scripts/mesh-stats.ts`), and `scripts/ref-compare.ts --mode balance` (`G1`, `G2`, `G3`, plus **one** `G4` CIEDE2000 regional color check after materials are applied; fix only failing regions once).
3. Author natural creature locomotion postures (`references/rigging-biped.md`) and anchored layered VFX matching the asset's visual style (`references/studio-preview.md`).
4. Run `scripts/rig-check.ts` (`R1–R7`) and `scripts/export-rigged-glb.ts` (`RG1–RG8`) when `.glb` is requested.
5. Capture rendered studio views (`scripts/capture-studio.ts --vfx --motion-vfx --extras ...`), **reopen the source reference image side-by-side** with the sheet, execute 1 visual polish pass fixing any landmark, seam, posture, or VFX anchoring mismatch, and re-run affected gates.

## Quality mode

Use **Quality** when maximum visual fidelity, expressive animation, and verified multi-backdrop contrast matter most:
1. Execute every step of **Balance**, plus **>= 2 deliberate visual polish rounds** reopening the original reference side-by-side on every round.
2. Run `G4` regional color checks (`--mode quality`) after final materials and verify once after any correction (capped at one automatic correction pass per check — never loop indefinitely).
3. Inspect **side view** and **3/4 views** across locomotion and action clips, verifying natural creature posture (`references/rigging-biped.md`), VFX anchoring (`references/studio-preview.md`), and contrast across both `--background dark` and `--background light` `capture-studio.ts` sheets.

## Checking shape (`review.png`) vs checking detail (studio capture)

- **`review.png` (`scripts/qa-asset.ts`) checks shape and topology only:** Arbitrary per-part pastel colors + magenta back faces. Never judge real colors, materials, or VFX from `review.png`.
- **Studio renders (`scripts/capture-studio.ts` / `studio_preview.html`) check real colors, motion, and VFX:** Every mode (including `Quick`) must inspect at least one real studio capture before finishing.
