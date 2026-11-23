# Reference matching, Semantic ROI, and G4 Regional Color QC

Reference for `threejs-asset-generator` §15. Use it when the brief includes an image, screenshot, sketch, or photo. Record the visible design, cache semantic color metadata once, and verify proportions, silhouette, palette (`G3`), and regional colors (`G4`).

Contents: 1 Intake and Semantic Color Mapping · 2 Choose a modeling stage · 3 Gates and thresholds (G1–G5) · 4 Compare and refine · 5 Getting triangles out · 6 Final report · 7 When numbers do not apply

Scripts (run them, do not read them): `scripts/ref-intake.ts`, `scripts/ref-compare.ts`; libraries `scripts/refcheck.ts`, `scripts/color-qc.ts`, `scripts/png.ts`. Needs `tsx`; install `sharp` when reading JPEG/WebP references.

## 1 Intake and Semantic Color Mapping

1. Open each available reference. Identify facing direction, camera angle, pose, and style.
   - **Static reference sheet poses:** Turnarounds (T-pose/A-pose, upright serpent sit, rigid quadruped legs, flat wings) define **proportions and rest/bind pose ONLY**. Animations immediately adopt natural creature posture (`references/rigging-biped.md`).
2. Write `ref-spec.md` with measured `w/h` and `d/h` ratios, identifying features, and palette.
3. **Cache Semantic Color Mapping (`--regions`):** When reading the reference at intake, identify key semantic regions and their true un-exaggerated colors (for example `body -> blue`, `belly -> white`, `horns -> yellow`, `eyes -> red`). Save them in `regions.json` (by `hex` or percentage `roi` `{ view, x, y, width, height }` sampled cleanly by `ref-intake.ts` without calling AI again).
   - Mark ambiguous or shadowed/occluded regions `status: "uncertain"` — **never invent colors**.
   - Reuse the cached `regions` metadata in `ref.json` during modeling and `ref-compare.ts`; do **not** re-run AI image analysis unless the reference image itself changes.
4. Run intake (supports `front`, `back`, `side`, `top`, `34`, `34_back`, and `--grid auto` for unevenly spaced horizontal turnarounds):
   ```bash
   npx tsx scripts/ref-intake.ts --sheet turnaround.jpg --grid auto --views front,side,back --regions regions.json --out ref.json
   ```
5. Check `<out>-<view>-mask.png` for clean foreground isolation; adjust `--tol` (or `--no-flood`) if needed. Reopen zoomed crops of the source image for eyes, markings, and seams.

## 2 Choose a modeling stage

| Stage | What you change | Evidence to collect |
|---|---|---|
| A Blockout | main volumes, facing, relative placement | G1 proportions, G2 aspect, visual comparison of landmarks |
| B Silhouette | actual curves, limbs, rooflines or profiles | G2 IoU and aligned renders from relevant views |
| C Surface | normals, palette, region mapping, texture or grain | `G3` palette + `G4` regional color (`Balance`/`Quality`) + studio capture |
| D Detail | distinguishing features, small parts, facial shapes | `G5` landmarks & close-ups; scrub moving details through poses |

## 3 Gates and thresholds (G1–G5)

| Gate | Measures | Pass when | Typical fix when it fails |
|---|---|---|---|
| **G1 proportions** | `w/h` and `d/h` ratios against `--w`, `--d` | within 10% (aim <= 5% for stylized/voxel) | adjust part spans |
| **G2 aspect** | tight silhouette width/height per view | within 8% ortho, 14% angled | compare facing & major volumes |
| **G2 IoU** | silhouette overlap (64×64 grid) | `>= 0.85` realistic/smooth ortho (`>= 0.78` stylized/voxel before studio polish), `>= 0.70` angled (`34`, `34_back`) | check `diff-<view>.png` (red = missing, blue = extra) |
| **G3 palette** | global reference colors (`>= 5%` share) within RGB dist 60 | all covered (retained across **all** modes) | retune global palette swatch |
| **G4 regional color** | **Semantic ROI CIEDE2000 (ΔE00)** (`scripts/color-qc.ts`) matching region-to-region colors (`Balance` & `Quality` only; **0 overhead SKIPPED in `Fast`/`Quick`**) | evaluated regions `ΔE00 <= 12.0` (`<= 7.0` target); lighting-only render shifts flagged, not false-failed | fix swapped or off-hue region material/vertex/texture color (max **1** fix pass) |
| **G5 landmarks** | signature features from `ref-spec.md` | readable in rendered dark/light studio views | refine geometry, eyes, markings, or pose |

- **G4 3-tier extraction priority (`scripts/color-qc.ts`):**
  1. Direct mesh/material or linear vertex color (`sRGB` converted accurately via D65 Lab — **zero lighting distortion, zero extra render**).
  2. Direct texture map pixel buffer / UV region sampling when `material.map` is present.
  3. Regional studio render ROI fallback (`sampleRenderRegion`) using calibrated lighting-invariant CIEDE2000 `(kL=4, kC=3, kH=1)` so brightness/exposure changes never trigger false material failures.
- **Honest status reporting:** If reference regions are `uncertain`, unmapped, or a texture pixel buffer is unreadable, report `SKIPPED` or `ERROR` — never report missing checks as `PASS`.

## 4 Compare and refine

1. Run comparison:
   - From triangles JSON: `npx tsx scripts/ref-compare.ts ref.json tris.json --mode balance`
   - Directly from Three.js builder (zero render needed for `G4`): `npx tsx scripts/ref-compare.ts ref.json --module ./asset.ts --mode balance`
2. For stylized/voxel assets, once `G1 <= 5%` and `G2 IoU >= 0.78` hold cleanly, move straight to `capture-studio.ts` visual polish rather than burning iterations chasing `0.85` orthographic mask overlap.
3. **Reopen the source reference side-by-side** alongside rendered `studio-contact-sheet.png` views per `references/work-modes.md`, fixing visual mismatches before finishing.

## 5 Getting triangles out

- For a rigid/skinned builder returning `(params, THREE)`, `scripts/qa-asset.ts --module`, `scripts/export-rigged-glb.ts`, and `scripts/ref-compare.ts --module` automatically extract named triangles via `extractObjectParts` (`src/voxel.ts`, `src/skinnedRig.ts`, `src/lowpoly.ts`).
- When writing `tris.json` manually from an external script, pose in rest pose, include `colors: [...]` for `G3` and optional `regionColors: { body: "#...", ... }` for `G4`.

## 6 Final report

Report `G1–G5` (or `SKIPPED` when `Quick`/`Fast` skips `G4`) with exact ΔE00 values alongside observed visual findings and studio screenshots.

## 7 When numbers do not apply

- Busy or angled photos without clean segmentation masks: measure readable ratios, cache confident semantic region colors (mark unsure regions `uncertain`), and report `G2` or `SKIPPED` regions transparently.
