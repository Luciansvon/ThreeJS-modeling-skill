# GLB export

Reference for `threejs-asset-generator`. Read it when the user wants a `.glb` file of an asset (to open in Blender, a viewer, an engine, or `GLTFLoader`). For standalone **code** export and Three.js versions, see `references/export.md` (§11, §12).

Contents: Run it · What the file contains · The gates (E1 to E6) · The Done report · What it does not cover · Three.js export route

Scripts (run them, do not read them): `scripts/export-glb.ts`; library `scripts/glb.ts` (`partsToGlb`, `readGlb`, `glbGates`); test `scripts/glb.test.ts`. Needs `tsx` only, no `three`. Same output contract as the other scripts: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = a gate failed, 1 = usage or load error.

## Run it

```
# A pure kernel (no THREE)
npx tsx scripts/export-glb.ts --module ./myKernel.ts --export buildMyTris --params '{"seed":3}' --out asset.glb

# Any asset: tris.json from the FINAL grounded group (groupToTris, reference-matching.md §5)
npx tsx scripts/export-glb.ts --tris tris.json --out asset.glb
```

Options: `--open a,b` or `all` (zero-thickness sheets, as in qa-asset) · `--budget N` · `--color r,g,b` (0 to 1, one base colour) · `--skip-qa` (export although Q1 to Q5 fail; the result lists it under `unverified`).

Order of work: `qa-asset.ts` first (all of Q1 to Q10 and the review image), `export-glb.ts` second. The exporter reruns Q1 to Q5 on the same parts and refuses to write a file for a non-finite, inside-out or open asset, because a GLB of that is worse than no file. Q6 to Q10 stay in `qa-asset.ts`.

## What the file contains

- One scene, **one node and one mesh per part**, named after the part. The names are the ones the QA gates report, so a problem found in Blender maps back to a part of the kernel.
- `POSITION` and a flat `NORMAL` per triangle, **non-indexed** (flat shading survives; there is no shared-vertex smoothing to undo). float32, 4-byte aligned, `POSITION` has exact `min`/`max`.
- One default material (`baseColorFactor` from `--color`, `metallicFactor` 0, `roughnessFactor` 0.9), shared by all parts.
- Units and axes need no conversion: 1 unit = 1 metre, Y up, +Z forward, right-handed, counter-clockwise front faces. Those are also the skill's conventions (`SKILL.md` §0), so a vertex goes out as it came in.
- The writer is deterministic: the same parts give the same bytes. It never reads the clock or a random source.

## The gates

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| QA Q1 to Q5 | the parts are finite, non-degenerate, outward-wound, closed (or listed in `--open`) and inside the budget | fix with `qa-asset.ts`; `--skip-qa` only knowingly |
| E1 container | magic `glTF`, version 2, header length equals file size, JSON chunk first, chunk lengths multiples of 4 | a hand-patched file; rewrite with `partsToGlb` |
| E2 json | `asset.version` 2.0, scene 0, node names equal the part names in order, buffer length fits the BIN chunk | renamed parts; a JSON chunk that does not parse |
| E3 accessors | float32 VEC3, inside their bufferView and the BIN chunk, aligned, `POSITION` min/max equal the data bounds | stale `min`/`max` after editing positions (viewers reject it) |
| E4 round-trip | every position read back equals the input at float32 | a writer that reorders or transforms vertices |
| E5 normals | unit length and equal to the face normal computed from the stored winding | an inside-out part (a normal that disagrees with its winding) |
| E6 counts | triangles in = triangles out, per run | a triangle lost or duplicated |

E1 to E6 are checked on the file **re-read from disk**, not on the buffer in memory.

## The Done report

When you export a GLB, the answer must contain:
1. The path of the file and its size.
2. The gate table of the last run (QA Q1 to Q5 and E1 to E6).
3. Everything under `UNVERIFIED` that remains after any separate loader test. The CLI emits one default material and geometry. Use the Three.js route below for assets that need vertex colours, rich materials, rigging, or animation.

If the user needs to see the result, say how to check it: drag the file into a glTF viewer or Blender, and confirm the part names appear as objects.

## What it does not cover

- **No third-party check.** E1 to E6 compare the file with its own input through a reader written for this skill. A cross-check with an independent parser (a few lines of `struct`/`numpy`, or a glTF validator) agreed on the crate fixture, but that was a one-off, not a gate.
- **Geometry only.** No vertex colours (`COLOR_0`), UVs, textures, per-part materials, skins, bones or animation clips. Rigged assets (`rig.ts`, `biped.ts`) export their rest-pose triangles only. Per-part colour is the natural next step and is not done.
- **No Draco or meshopt, no indices.** Files are larger than an optimised export. A 20 000-triangle asset is about 1.4 MB.
- **Not the live scene.** It exports the pure triangle arrays, not a `THREE.Group` with its modifiers, instancing or materials.

## Three.js export route

For assets that need vertex colours, materials, skins, or clips, use `GLTFExporter` from `three/addons/exporters/GLTFExporter.js` on a fresh Three.js group in rest pose. Pass `{ binary: true, animations: clips }` to `parseAsync`. Reopen the returned `ArrayBuffer` with `GLTFLoader.parseAsync(bytes, '')`, compare the mesh names, bounds and triangle counts, then compare the attributes, bones, and clip names and keyframes required by the brief. Save and test the exact exported bytes.

A Three.js r180 smoke test round-tripped a static vertex-colour attribute, material roughness, a one-bone skin, and one clip. Procedural textures, visual playback, and target-engine import need an asset-specific test. See `references/studio-preview.md` for the browser APIs and preview workflow, and `references/detail.md` for texture cases.
