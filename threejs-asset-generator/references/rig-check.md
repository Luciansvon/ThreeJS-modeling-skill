# Rig, clip and expression checks

Reference for `threejs-asset-generator`. Read it after authoring a rigged character with animation clips or static facial expression swaps.

Contents: §18 Run rig-check · The gates (R1 to R6) · Metadata JSON shape · What is not checked

Scripts (run them, do not read them): `scripts/rig-check.ts`; library `scripts/rigcheck.ts`; test `scripts/rigcheck.test.ts`. Needs `tsx` only (no `three`). Output contract: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = gate failed, 1 = usage/load error.

## §18. Run rig-check

```
npx tsx scripts/rig-check.ts --meta char_metadata.json [--max-pivots 16] [--allow-refpose]
```

## The gates (R1 to R6)

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| R1 hierarchy | unique `pivotNames`, single root, valid parent-child edges, acyclic tree, count <= `--max-pivots` (default 16) | missing root, cycle, typo in parent/child edge, too many pivots |
| R2 rest-pose | every pivot has a finite `[x, y, z]` entry in `rig.restLocalPositions` | `NaN` or missing pivot entry |
| R3 clips | unique clip names, finite positive `durationSeconds`, inspection clip (`RefPose`) excluded from export | `RefPose` accidentally baked into gameplay GLB, zero duration |
| R4 tracks & drift | strictly increasing finite timestamps, finite values, targets exist in `pivotNames`, horizontal root X/Z drift <= `1e-5` m | duplicate timestamps at clip end, root moving horizontally instead of in-place |
| R5 expressions | square power-of-two `textureResolution` (e.g. `512x512`), `defaultExpressionInGlb` and every clip expression mapping exist | unmapped expression name or non-square resolution |
| R6 slide clearance | `qa.slideDropPct >= 22` and `qa.slideMinY >= -0.025` m | slide animation does not duck enough, or feet/tail clip below the floor |

Any section omitted from the JSON (`restLocalPositions`, `animations`, `tracks`, `face`, `qa`) is reported under `not checked`, never guessed.

## Metadata JSON shape

Pass a JSON file containing `rig` (`pivotNames`, `hierarchy`, optional `restLocalPositions`), optional `animations` (`name`, `durationSeconds`, `loop`, `expression`, optional `tracks`), optional `face` (`defaultExpressionInGlb`, `textureResolution`, `expressions`, `animationExpressionMapping`), and optional `qa` (`maxHorizDrift`, `slideDropPct`, `slideMinY`).

## What is not checked

JSON checks cannot verify visual skinning deformations, texture alignment on the mesh, or target-engine import compatibility (such as Roblox Motor6D or Blender). Visually inspect the character in a live preview (`references/studio-preview.md`) and test import in the target engine before shipping.
