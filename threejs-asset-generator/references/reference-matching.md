# Reference matching: build against a reference, check after every step

Reference for `threejs-asset-generator` §15. Read it BEFORE writing code whenever the user gives an image, screenshot, sketch, photo or "make it look like this". The point: the agent never works from memory of the reference. It writes the reference down once as a spec, then measures its own result against it after every build step, cheapest check first.

Contents: 1 Intake (once) · 2 The loop · 3 Gates and thresholds · 4 Efficiency rules · 5 Getting triangles out · 6 Final report · 7 When numbers do not apply

Scripts (run them, do not read them): `scripts/ref-intake.ts`, `scripts/ref-compare.ts`; library `scripts/refcheck.ts`; test `scripts/refcheck.test.ts`. Needs `tsx` and `sharp`. Copy `scripts/` next to the project if the skill folder is read-only.

## 1 Intake (once per reference)

1. `view` the reference image ONCE. Several views (front, side, top)? Use each file.
2. Write `ref-spec.md` (max 15 lines). This is the only description of the reference that later steps use:
   - **Subject and facing** (which way it looks, which view each image is).
   - **Proportions**: width/height `w` and depth/height `d`, measured on the image (count pixels or grid squares, do not eyeball). Also 3 to 6 part ratios (head vs body height, leg length vs body, roof vs cabin).
   - **Parts**: list top to bottom or front to back, each with relative size and position.
   - **Palette**: what `ref-intake` prints (do not guess hex values from memory).
   - **Signature features**: the 3 things that make it recognisable (horns, round windows, striped tail). These decide G4.
   - **Out of scope**: shadows, background, texture noise, anything the low-poly style drops on purpose.
3. Run intake: `npx tsx scripts/ref-intake.ts front=ref_front.png side=ref_side.png --out ref.json --w 1.2 --d 2.5` (`--w`/`--d` are the ratios you just measured; omit what you could not measure). One image without a name is `front`.
4. `view` the printed `ref-<view>-mask.png` once. Wrong silhouette (background leaked in, part missing)? Change `--tol` and run again. A bad mask makes every later number meaningless, so this is the only intake check that may not be skipped.

## 2 The loop

Build coarse to fine. After EVERY step run the compare, not only at the end:

| Step | What you build | Gates that must pass before the next step |
|---|---|---|
| A Blockout | primitives with the right size and position, one colour | G1 proportions, G2 aspect |
| B Silhouette | real shapes, tubes, lofts, limbs, no colour work yet | G2 IoU (every view you have) |
| C Colour | palette, per-part colours | G3 palette |
| D Detail | chamfer, atlas, AO, small parts (`references/detail.md`) | G4 checklist |

Each iteration:
1. `fs.writeFileSync('tris.json', JSON.stringify({ tris, colors }))` from your generator driver (see §5), then `npx tsx scripts/ref-compare.ts ref.json tris.json`.
2. Read the output. It lists PASS/FAIL per gate and the hint for each failure.
3. Fix **only the first failing gate**. Change one group of parameters (for example only leg length and body depth), then compare again.
4. On a failing IoU gate `view` `diff-<view>.png` once: red is missing in the model, blue is extra. Name the part that is wrong before touching code.
5. Log one line in your notes: `step B, round 2: side IoU 0.71 -> 0.83, shortened neck`. No log, no next round.

Stop rules: max 3 rounds per gate. After 3 rounds without reaching the threshold, keep the best version, write the remaining gap into the final report and move on. Never chase a number by distorting the shape (a leg 3x too thick to fill a red area is a fail, not a fix).

## 3 Gates and thresholds

| Gate | Measures | Pass when | Typical fix when it fails |
|---|---|---|---|
| G1 proportions | size ratios w/h and d/h of the model against `--w`, `--d` | within 10% | scale the whole part groups, not single vertices |
| G2 aspect | tight silhouette width/height per view | within 8% | proportions first, details later |
| G2 IoU | silhouette overlap per view (64x64 grid, tight crop) | at least 0.85 | read `diff-<view>.png`, fix the largest red or blue blob |
| G3 palette | every reference colour with 5% or more share has a colour within RGB distance 60 | all | retune that one colour |
| G4 checklist | the signature features from `ref-spec.md` (visual) | all present | add or reshape that feature |

- The mirrored reference is tried automatically (the reference may face the other way); the output says so. Side view: a +Z-facing asset faces left. Top view: it faces down.
- G4 is the only visual gate. Take ONE screenshot per milestone (end of B, end of D), same camera angle as the reference, reference and render in the same message, and tick each signature feature. If you cannot render, use the diff PNGs and say that G4 was checked from silhouettes only.
- Thresholds live in `THRESH` in `scripts/refcheck.ts`. Loosen them (IoU 0.7) only for photos with strong perspective and say so in the report.

## 4 Efficiency rules

- Numbers first, pictures last. The compare run takes well under a second and costs a few lines of output; an image view costs far more. View images only for the mask check, a failing IoU diff and the G4 milestones.
- Never re-read the reference image after intake. Use `ref-spec.md` and `ref.json`.
- Compare after every step, but run only gates that exist for that step; gates for later steps are not failures yet. Ignore a G3 FAIL during step A.
- One failing gate per round, one parameter group per change. Two changes at once make the next number unreadable.
- Keep the generator seeded and deterministic (§2). The compare is only meaningful when the same params give the same triangles.
- Do not build detail (step D) while G2 fails. Detail on a wrong silhouette is wasted work.

## 5 Getting triangles out

Kernel-based assets already have `tris` (the output of the kernel, in asset space). For `PartBuilder` or rigged assets collect them from the built object:

```ts
// THREE side. Untested in the session that wrote it: run it once and check that tris.length / 9 equals the triangle count you expect.
import * as THREE from 'three';
export function groupToTris(root: THREE.Object3D): number[] {
  root.updateWorldMatrix(true, true);
  const out: number[] = [], v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry, p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); out.push(v.x, v.y, v.z); }
  });
  return out;
}
// in the driver: fs.writeFileSync('tris.json', JSON.stringify({ tris: groupToTris(asset), colors: ['#8a5a2b', '#d9c9a3'] }));
```

Pass the hex colours you used (`colors`) to enable G3. Pose the asset in its rest pose before collecting.

## 6 Final report (always include)

End the answer with the gate table of the LAST compare run and the leftover gaps, for example:

| Gate | Result |
|---|---|
| G1 width/height | 1.21 vs 1.20, pass |
| G2 front IoU | 0.88, pass |
| G2 side IoU | 0.79, fail (3 rounds used, tail curve still short) |
| G3 palette | pass |
| G4 | horns yes, striped tail yes, round windows no |

Never write "matches the reference" without this table.

## 7 When numbers do not apply

- No usable silhouette (busy photo, no background): skip masks, keep `--w`/`--d` and the palette, run G4 with two screenshots, and say that G2 was not measured.
- Concept art with stylised or impossible perspective: set the IoU target to 0.7 and treat G4 as the main gate.
- The user wants "inspired by", not a match: do intake and G4 only, one screenshot, no rounds.
- Reference changes mid-task: delete `ref.json`, run intake again, restart at step A for the changed parts.
