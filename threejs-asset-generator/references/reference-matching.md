# Reference matching

Reference for `threejs-asset-generator` §15. Use it when the brief includes an image, screenshot, sketch, or photo. Record the visible design and keep the source available to compare against the model as it changes.

Contents: 1 Intake and working views · 2 Choose a modeling stage · 3 Gates and thresholds · 4 Compare and refine · 5 Getting triangles out · 6 Final report · 7 When numbers do not apply

Scripts (run them, do not read them): `scripts/ref-intake.ts`, `scripts/ref-compare.ts`; library `scripts/refcheck.ts`, `scripts/png.ts`; test `scripts/refcheck.test.ts`. Needs `tsx`; writes mask and diff PNGs and reads standard 8-bit PNG inputs with pure Node (`scripts/png.ts`, no `sharp` required). Install `sharp` only when reading JPEG/WebP references. Copy `scripts/` next to the project if the skill folder is read-only.

## 1 Intake and working views

1. Open each available reference. Identify the facing direction, camera angle, pose, and requested style.
2. Write a short `ref-spec.md` with measurable width/height and depth/height ratios, the relative size and placement of important parts, the palette, and the features that make the subject recognizable. Note which details the brief changes and which views leave depth or construction uncertain.
3. Run intake: `npx tsx scripts/ref-intake.ts front=ref_front.png side=ref_side.png --out ref.json --w 1.2 --d 2.5` (`--w`/`--d` are the ratios you just measured; omit what you could not measure). One image without a name is `front`. Angled concept art is supported directly via `34=ref_34.png` and `34_back=ref_34_back.png` (and `--sheet sheet.png --grid 2x1 --views 34,34_back` or `3x2` with `--views front,back,top,bottom,side,34`). Opaque images use border flood-fill by default so light interior patches (such as a cream belly on a light background) do not poke holes in the silhouette (pass `--no-flood` for flat thresholding).
4. Check the masks for leaked background or missing parts and adjust `--tol` if needed. `--out refs/round-1/asset.json` puts masks beside the JSON, such as `asset-front-mask.png`. The last `@@RESULT` lists the paths.
5. Reopen or crop the reference whenever details matter. Use the full view to judge proportions, and close-ups for eye placement, muzzle shape, seam treatment, grain direction, and material finish. Keep analytical crops separate from the whole-object masks.

## 2 Choose a modeling stage

Start coarse on a new build. On a revision, enter where the requested change belongs and check the parts it affects.

| Stage | What you change | Evidence to collect |
|---|---|---|
| A Blockout | main volumes, facing, relative placement | G1 proportions, G2 aspect, visual comparison of landmarks |
| B Silhouette | actual curves, limbs, rooflines or profiles | G2 IoU and aligned renders from relevant views |
| C Surface | normals, palette, joints, texture or grain | G3 when colors are comparable and a render in delivery lighting |
| D Detail | distinguishing features, small parts, facial shapes | G4 close-ups. Scrub moving details through their poses. |

Use a closely matched camera and pose for visual comparisons. Check head-to-body ratio, joint placement, and other important landmarks even when aspect and IoU pass. Cropped views can reveal a misplaced eye or awkward neck join that barely changes the whole silhouette.

## 3 Gates and thresholds

| Gate | Measures | Pass when | Typical fix when it fails |
|---|---|---|---|
| G1 proportions | size ratios w/h and d/h of the model against `--w`, `--d` | within 10% | adjust the affected part proportions |
| G2 aspect | tight silhouette width/height per view | within 8% for orthographic views, 14% for angled views | compare facing and major proportions |
| G2 IoU | silhouette overlap per view (64×64 grid, tight crop) | at least 0.85 for orthographic views, 0.70 for angled views | use the diff to locate a mismatch, then confirm it against the source |
| G3 palette | every reference colour with 5% or more share has a colour within RGB distance 60 | all | retune that one colour |
| G4 checklist | the signature features from `ref-spec.md` | features read correctly in the relevant render or pose | adjust their shape, material, placement, or motion |

- The CLI reports when a mirrored reference gives the higher IoU. A +Z-facing asset faces left in `side` and down in `top`.
- Angled views `34` and `34_back` start at 38° and 142° azimuth respectively, both at 16° elevation. They sample azimuth offsets of 0°, ±6°, ±12° and elevation offsets of 0°, ±6°. The comparison chooses the highest IoU among cameras within the 14% aspect tolerance. If all fail aspect, it reports the highest-IoU camera for diagnosis. The canonical camera wins ties within either group. The selected camera supplies both G2 measurements and the diff PNG. The IoU threshold is 0.70. The gate text and `@@RESULT.angles` list the selected angles and offsets; when the sweep shifts the angle, the gate text also prints `canonical IoU` and flags `passed via angle sweep` if only the shifted angle cleared the threshold.
- Thresholds live in `THRESH` in `scripts/refcheck.ts`. Treat them as diagnostic signals when pose, perspective, mask quality, or intentional style changes affect comparability. Report the CLI's actual status and what the visual comparison showed.

## 4 Compare and refine

1. Compare the evidence for the change. For geometry, write `tris.json` and run `npx tsx scripts/ref-compare.ts ref.json tris.json`. In a diff image, red marks missing silhouette and blue marks extra silhouette. For material or face changes, inspect matched renders or crops.
2. Correct the most consequential mismatch. Separate changes when it helps diagnose their effect. Keep the seed and camera consistent while comparing iterations.
3. Continue while another edit can improve the requested result. A numeric failure can coexist with usable evidence for surface work or expression. Keep the best result and report any unresolved discrepancy, including a clear visual mismatch after a numeric pass.

## 5 Getting triangles out

Kernel-based assets already have `tris` in asset space. For a skinned build, use `extractQaArtifacts(built).tris` from `src/skinnedRig.ts` to get named rest-pose triangles. For a simple mesh or rigid assembly, visit the built object and transform its rest vertices into asset space. For example:

```ts
// Simple meshes using the full geometry draw range.
import * as THREE from 'three';
export function groupToTris(root: THREE.Object3D): number[] {
  root.updateWorldMatrix(true, true);
  const out: number[] = [], v = new THREE.Vector3();
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const index = m.geometry.index, position = m.geometry.getAttribute('position');
    for (let i = 0; i < (index?.count ?? position.count); i++) {
      v.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(m.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}
// in the driver: fs.writeFileSync('tris.json', JSON.stringify({ tris: groupToTris(asset), colors: ['#8a5a2b', '#d9c9a3'] }));
```

Pose the asset in its rest pose before collecting. QA, mesh stats and reference comparison accept the same triangle JSON. Use a bare array, `{ tris, colors? }`, a named map such as `{ body: bodyTris, legs: legTris }`, or `{ parts: { body: bodyTris, legs: legTris }, colors? }`. Include the hex palette as `colors` to enable G3.

## 6 Final report

Summarize the latest measured results alongside the visual findings and unresolved gaps. Include the comparable views or crops when they show why a score differs from the visual result. For example:

| Gate | Result |
|---|---|
| G1 width/height | 1.21 vs 1.20, pass |
| G2 front IoU | 0.88, pass |
| G2 side IoU | 0.79, fail. The side render still shows a short tail curve. |
| G3 palette | pass |
| G4 | Horns and tail stripes read well. The eye crop shows the model's eyes sit too high. |

## 7 When numbers do not apply

- For a busy photo, keep the ratios and palette you can measure. Review the readable details and state that G2 was unmeasured if a clean mask could not be made.
- For exaggerated perspective or an inspiration brief, prioritize the agreed visual traits and note the limits of the camera match.
- If the reference changes, update the affected views and repeat the relevant modeling stage. Keep working parts and motions that still fit the brief.
- With only silhouettes or diff PNGs, report shape evidence and mark finish, facial detail, or playback unverified as applicable.
