# QA gates and the review image

Reference for `threejs-asset-generator`. Read it before you tell the user an asset is finished. Section numbers match `SKILL.md`.

Contents: §13 Run the gates · The gates (Q1 to Q10) · Reading `review.png` · The "Done" rule and report · What the gates do not cover

Scripts (run them, do not read them): `scripts/qa-asset.ts`; library `scripts/qacheck.ts` (gates), `scripts/review.ts` (renderer); tests `scripts/qacheck.test.ts`, `src/qa.kernel.test.ts`. Needs `tsx`; `sharp` only for the PNG. Same output contract as the other scripts: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = a gate failed, 1 = usage or load error.

## 13. Run the gates

```
# A pure kernel (no THREE). The builder is called several times, so Q8 and Q9 can run.
npx tsx scripts/qa-asset.ts --module ./myKernel.ts --export buildMyTris --params '{"seed":3}' --open wingL,wingR --symmetric

# Any asset, including PartBuilder and rigged ones: write tris.json from the FINAL grounded group (groupToTris, reference-matching.md §5)
npx tsx scripts/qa-asset.ts --tris tris.json --footprint --symmetric
```

The builder returns `Tris` (9 numbers per triangle, CCW from outside), `{ tris }`, or named parts `{ body: Tris, legs: Tris }`. Named parts are better: the gates then name the part at fault. `scripts/fixtures/crate.qa.ts` is the smallest complete example.

Options: `--budget N` (default 2000; about 20000 for a composite) · `--open a,b` or `all` (zero-thickness sheets) · `--symmetric` · `--grounded` (run Q6 on a kernel that grounds itself) · `--footprint` (Q6 also checks centring) · `--ground-y N` (terrain slab top) · `--out dir` · `--no-render`.

Fix the FIRST failing gate, rebuild, run again. Two fixes in one round make the next result unreadable.

## The gates

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| Q1 finite | at least one triangle, whole triangles, no NaN or Infinity | division by zero, zero-length normalize, a scalar where an array is expected |
| Q2 degenerate | no zero-area triangles | tube or loft ring of radius 0, collapsed stage |
| Q3 winding | every closed part has positive signed volume | inside-out part: swap two vertices per triangle (`mirrorTris` does) |
| Q4 closed | every edge of a closed part has exactly one partner | missing cap, unwelded seam (jitter before `add()`, then weld), overlapping faces |
| Q5 budget | triangles within `--budget` | too many segments or details |
| Q6 grounding | lowest Y equals `--ground-y` (0); with `--footprint` also centred | asset not wrapped by `groundAsset` |
| Q7 symmetry (opt-in) | every vertex has a mirror partner through x = 0 | one side built twice, or an odd side count |
| Q8 determinism (`--module` only) | two builds give identical numbers | `Math.random`, `Date.now`, shared mutable state, shared stream |
| Q9 seed 0 (`--module` only) | seed 0 gives its own asset | `seed \|\| fallback`, or a schema `min` above 0 |
| Q10 visible faces | at most 4 magenta pixels per part in the review image | see below |

Things the gates showed on this skill's own kernels, worth knowing:
- **Sheets look like inside-out parts to Q3.** A fan or flag has no volume, and its "volume" can even be negative (the dragon wing: -0.13). Q4 tells them apart: a sheet also lists open edges, an inside-out closed part does not. List sheets in `--open`; closed parts next to them are still checked.
- **Odd side counts break mirror symmetry** when the ring starts on the X axis (a horizontal spine): a 7-gon has a vertex at +X and a flat at -X. Use 4, 6 or 8 for anything that must be symmetric. `dragonKernel.ts` used 7 and now uses 8.
- **Q6 is for the final asset.** A raw kernel is not grounded (the dragon's feet dip to Y = -0.023 because the tube radius extends past the foot point), so `--module` skips Q6 unless you pass `--grounded`. Check grounding on the wrapped asset with `--tris`.
- **Q7 compares vertices, not triangles.** A box splits every quad along a diagonal that is not mirror-symmetric, so a symmetric box fails a triangle comparison.

## Reading `review.png`

Written to `--out` (default the current folder). 2 x 2 layout, one shared scale: front (top left) · side (top right, +Z faces left) · top (bottom left, +Z faces down) · 3/4 view from +X +Y +Z (bottom right). One muted colour per part; the colour legend is printed. A grey line is Y = 0 in the front and side panels. **Magenta** means a triangle faces away from the camera but is still the nearest surface: an inside-out part, a hole, or a sheet that faces away from the cameras and is missing from `--open`.

Look for what numbers miss: floating or sinking against the grey line, proportions against your `ref-spec.md` or intent, a limb on the wrong side, a part that is too small to read (under about 3 px), a silhouette that is plainly not the object. The renderer is orthographic with flat Lambert light: it shows shape and winding, not materials, textures or rigging.

## The "Done" rule and report

"Done" may be reported only when all of these hold:
1. `qa-asset` ran on the current build and exited 0, or every failing gate is named in the answer with the reason it stays.
2. `review.png` was opened with the `view` tool and the answer says in one line per panel what was seen. "Looks good" is not a finding.
3. Everything the run listed under `UNVERIFIED` and `not checked` is repeated in the answer.
4. Image given by the user: the `ref-compare` gate table (`references/reference-matching.md` §6) is in the answer as well.

End the answer with the gate table of the LAST run:

| Gate | Result |
|---|---|
| Q3 winding | 3 closed parts, all volumes > 0 (open: wingL, wingR) |
| Q6 grounding | lowest Y 0.000 (final asset, `--tris`) |
| Q8 determinism | not run (`--tris`), UNVERIFIED |

Review: front, legs evenly spaced and on the line; side, head at +Z (left) and higher than the tail; top, wings symmetric; 3/4, no magenta.

## What the gates do not cover

Still manual, from the §13 checklist: materials and `metalness` environment, UV and atlas cells, bone count and rig clips, `disposeAsset`, mesh names, export parity (`generate(params)` against the exported module), and all THREE-side behaviour (`src/detailThree.test.ts` stays UNVERIFIED until `three` is installed). Q10 and the review image cannot see the far side of the asset (all four cameras sit on +X, +Y, +Z): a defect that exists only there is found by Q3 and Q4, not by looking.
