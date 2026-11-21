# Rig, clip and expression checks

Reference for `threejs-asset-generator`. Read it after authoring a rigged character with animation clips or static facial expression swaps.

Contents: §18 Run rig-check · The gates (R1 to R6) · Metadata JSON shape · What is not checked

Scripts (run them, do not read them): `scripts/rig-check.ts`; library `scripts/rigcheck.ts`; test `scripts/rigcheck.test.ts`. Needs `tsx` only (no `three`). Output contract: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = gate failed, 1 = usage/load error.

## §18. Run rig-check

```
npx tsx scripts/rig-check.ts --meta char_metadata.json [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--allow-refpose]
```

Default `--max-pivots` scales by `--kind`: `hero` / `prop` = 16, `building` = 24, `vehicle` = 32, `creature` = 64 (for serpentine dragons, spiders, or kraken tentacles). Pass `--motion free` (or set `qa.motionMode: "free"`) for hovering, swimming, leaping, or lunging creatures whose root sways naturally in X/Z.

## The gates (R1 to R6)

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| R1 hierarchy | unique `pivotNames`, single root, valid `{ parent, child }[]` edges, acyclic tree, count <= max pivots for `--kind` (or `--max-pivots`) | missing root, cycle, passing a map instead of `{ parent, child }[]`, too many pivots |
| R2 rest-pose | every pivot has a finite `[x, y, z]` entry in `rig.restLocalPositions` | `NaN` or missing pivot entry |
| R3 clips | unique clip names, finite positive `durationSeconds`, inspection clip (`RefPose`) excluded from export | `RefPose` accidentally baked into gameplay GLB, zero duration |
| R4 tracks & drift | finite, strictly increasing timestamps, one finite value tuple per sample (3 for position/scale, 4 for quaternion), valid pivot targets; in `--motion in-place` (default), horizontal root X/Z drift <= `1e-5` m; in `--motion free`, natural X/Z sway/lunge is permitted | truncated track, duplicate timestamp, unintended horizontal root movement on an in-place runner |
| R5 expressions | square power-of-two `textureResolution` (e.g. `512x512`), `defaultExpressionInGlb` and every clip expression mapping exist | unmapped expression name or non-square resolution |
| R6 floor / slide clearance | for runner slide clips: `qa.slideDropPct >= 22` and `qa.slideMinY >= -0.025` m; for general creatures/vehicles: `qa.clipMinY >= -0.025` m | animation clips below the floor or slide does not duck enough |

Missing evidence is reported under `not checked`. R4 reports separately when root drift cannot be checked. R5 needs a declared expression set, default expression, and texture resolution. R6 checks slide measurements when supplied, or general `qa.clipMinY` when no slide clip applies.

## Metadata JSON shape

```json
{
  "rig": {
    "pivotNames": ["root", "neck", "head", "tail1", "tail2"],
    "hierarchy": [
      { "parent": "root", "child": "neck" },
      { "parent": "neck", "child": "head" },
      { "parent": "root", "child": "tail1" },
      { "parent": "tail1", "child": "tail2" }
    ],
    "restLocalPositions": {
      "root": [0, 0.9, 0], "neck": [0, 0.3, 0.2], "head": [0, 0.3, 0.1],
      "tail1": [0, -0.1, -0.4], "tail2": [0, 0.1, -0.4]
    }
  },
  "animations": [
    {
      "name": "IdleHover",
      "durationSeconds": 4.0,
      "loop": true,
      "tracks": [
        { "name": "root.position", "times": [0, 2, 4], "values": [0, 0.9, 0, 0, 1.02, 0, 0, 0.9, 0] },
        { "name": "head.quaternion", "times": [0, 2, 4], "values": [0, 0, 0, 1, 0, 0.05, 0, 0.9987, 0, 0, 0, 1] }
      ]
    }
  ],
  "qa": { "motionMode": "free", "clipMinY": 0.05 }
}
```

## What is not checked

JSON checks cannot verify visual skinning deformations, texture alignment on the mesh, or target-engine import compatibility (such as Roblox Motor6D or Blender). Visually inspect the character in a live preview (`references/studio-preview.md`) and test import in the target engine before shipping.
