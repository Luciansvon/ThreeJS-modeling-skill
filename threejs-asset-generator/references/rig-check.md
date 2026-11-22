# Rig, clip and expression checks

Reference for `threejs-asset-generator`. Use it after authoring a rig, animation clips, or face controls.

Contents: §18 Run rig-check · The gates (R1 to R7) · Per-clip motion check · Metadata JSON shape · Export and playback

Scripts (run them, do not read them): `scripts/rig-check.ts`; library `scripts/rigcheck.ts`, `scripts/clip-motion.ts`; test `scripts/rigcheck.test.ts`. Needs `tsx` only for metadata gates (`three` for live `clipMotion` playback sampling). Output contract: last stdout line `@@RESULT {json}`, exit 0 = ok, 2 = gate failed, 1 = usage/load error.

## §18. Run rig-check

```
npx tsx scripts/rig-check.ts --meta char_metadata.json [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--static-clips a,b] [--allow-refpose]
```

Default `--max-pivots` scales by `--kind`: `hero` / `prop` = 16, `building` = 24, `vehicle` = 32, `creature` = 64 (for serpentine dragons, spiders, or kraken tentacles). Pass `--motion free` (or set `qa.motionMode: "free"`) for hovering, swimming, leaping, or lunging creatures whose root sways naturally in X/Z. List intentionally motionless pose clips under `--static-clips` (or `qa.staticClips`) so R7 allows them.

## The gates (R1 to R7)

| Gate | Passes when | Typical cause of a fail |
|---|---|---|
| R1 hierarchy | unique `pivotNames`, single root, valid `{ parent, child }[]` edges, acyclic tree, count <= max pivots for `--kind` (or `--max-pivots`) | missing root, cycle, passing a map instead of `{ parent, child }[]`, too many pivots |
| R2 rest-pose | every pivot has a finite `[x, y, z]` entry in `rig.restLocalPositions` | `NaN` or missing pivot entry |
| R3 clips | unique clip names, finite positive `durationSeconds`, inspection clip (`RefPose`) excluded from export | `RefPose` accidentally baked into gameplay GLB, zero duration |
| R4 tracks & drift | finite, strictly increasing timestamps, one finite value tuple per sample (3 for position/scale, 4 for quaternion), no Euler `.rotation` tracks, valid pivot targets; in `--motion in-place` (default), horizontal root X/Z drift <= `1e-5` m; in `--motion free`, natural X/Z sway/lunge is permitted | `.rotation` / `.rotation[x]` Euler track (dropped by `GLTFExporter`), truncated track, duplicate timestamp, unintended horizontal root movement on an in-place runner |
| R5 expressions | static face metadata declares a square power-of-two `textureResolution` (e.g. `512x512`), a valid `defaultExpressionInGlb`, and valid clip expression mappings when supplied | unmapped expression name or non-square resolution |
| R6 floor / slide clearance | for runner slide clips: `qa.slideDropPct >= 22` and `qa.slideMinY >= -0.025` m; for general creatures/vehicles: `qa.clipMinY >= -0.025` m | animation clips below the floor or slide does not duck enough |
| R7 clip motion | every tracked clip not listed in `qa.staticClips` / `--static-clips` changes at least one track across timestamps (`> 1e-3` rad for quaternion, `> 1e-4` for position/scale) | all keyframes hold the first pose, unmoving loop, or forgotten pose changes |

Missing evidence is reported under `not checked`. R4 reports separately when root drift cannot be checked. R5 needs a declared expression set, default expression, and texture resolution. R6 checks slide measurements when supplied, or general `qa.clipMinY` when no slide clip applies. R7 evaluates clips that include `tracks` and reports untracked clips as unchecked.

## Per-clip motion check

1. Activate and test **one clip at a time** (do not blend multiple clips when checking motion).
2. Sample multiple timestamps per clip, including mid-cycle or peak action frames, and compare each target pivot's transform **across timestamps within the same clip** (`scripts/clip-motion.ts`). Start and end poses may match in looping clips. Difference from rest pose is auxiliary information only (also flags potential T-pose lock if moving limbs stay close to rest).
3. Verify every track binds uniquely to its target node and uses `GLTFExporter`-safe properties (`position`, `quaternion`, `scale`, `morphTargetInfluences`). When GLB export is requested, repeat the per-clip motion test on the reloaded GLB (`scripts/export-rigged-glb.ts`, gates RG6–RG7).
4. Record `PASS` / `FAIL` per clip and moving pivot along with the timestamps sampled. Mark any test that was not run as `Unchecked`, and keep silhouette, proportions, and clipping `Unchecked` until renders are visually inspected.

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

## Export and playback

1. For a GLB deliverable, load the exact exported file in [Fast Preview](studio-preview.md#1-choose-a-preview) or the target viewer. Use [the Three.js export checks](glb-export.md#threejs-export-route) for file, mesh, clip, and skeleton evidence.
2. Play the clips and scrub the frames that show each requested motion. For a roar, compare the mouth closed, widest open, and closed again. Inspect the hinge, deformation, and clearance from an angle where they are visible. Check that a morph changes the surface and a face map aligns with the intended features. [glTF morph targets](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#morph-targets)
3. Recheck existing loops and transitions after a face or root change. For a motion issue, use a preview-only root-track isolation as described in [facial motion and root isolation](rigging-biped.md#facial-motion-and-root-isolation).

Record the export checks and visible playback observations. R5 covers static texture metadata. If loading or playback is unavailable, mark the corresponding visual or target-engine checks `UNVERIFIED`.
