# ThreeJS Modeling Skill

Generate procedural 3D assets in **Three.js (r170+)** from a brief or reference. Pick a style from the 27-style [art style catalog](./threejs-asset-generator/references/art-styles.md), choose a work mode (`Quick`, `Balance`, or `Quality`), and build across five asset kinds (`prop`, `hero`, `creature`, `vehicle`, `building`). The skill provides seeded builders, manifold voxel modeling with Corner AO, reference silhouette & CIEDE2000 regional color checks, mesh/rig/skin QA gates, interactive studio previews with optional selective Bloom and VFX, and `.glb` export.

## Choose an edition

| Edition | Use it in | What it provides |
| --- | --- | --- |
| [Harness](./threejs-asset-generator/SKILL.md) | Codex, Claude Code, Gemini CLI, or another agent with a workspace and terminal | TypeScript builders, `VoxelGrid` with Corner AO, reference silhouette & G4 color QC, mesh/budget/rig/skin gates, Fast/Full studio previews with Bloom & VFX capture, and geometry-only or rigged/animated `.glb` export. |
| [Web Full](./threejs-asset-generator-web/SKILL.md) | ChatGPT web, Gemini, Claude web, or another browser chat | The harness workflow, standalone art-style catalog, guides, builders, tools, and test source in Markdown. Runs the stages supported by the current session. |

For a harness, place the complete `threejs-asset-generator/` folder in the harness's skill directory and install its dependencies there. Keep the folder name and its `SKILL.md` together.

For web chat, paste the Web Full `SKILL.md` into the conversation or project instructions and attach the Markdown references. If the host limits attachments, start with `runtime.md` and add `art-styles.md` or the modeling, verification, or source packs relevant to the brief. [Markdown references](./threejs-asset-generator-web/references/)

In Gemini, use `SKILL.md` as the Gem instructions and add the Markdown references. In Claude, where custom skills are enabled, zip and upload the entire `threejs-asset-generator-web/` folder. [Gem setup](https://support.google.com/gemini/answer/15146780?co=GENIE.Platform%3DDesktop&hl=en), [Claude custom skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude)

## Model delivery

Both editions start with a concise 3-item confirmation (brief/style/reference check, `Quick`/`Balance`/`Quality` work mode, and `Fast`/`Full` preview mode), build one pure seeded model, choose surface detail, and verify the requested results before delivery. Web Full uses tools already available in the session; if a tool fails, the agent uses a fallback and continues independent work, ending with a **Blocked** report for any unresolved requested stage. [Web asset pipeline](./threejs-asset-generator-web/references/runtime.md#asset-pipeline) · [Work modes](./threejs-asset-generator/references/work-modes.md)

Reopen the reference side-by-side with rendered previews on polish passes, and run `G4` CIEDE2000 regional color QC in `Balance` and `Quality` modes (`Quick`/`Fast` skips `G4` for zero overhead). Surface detail can come from geometry, materials, sRGB-safe vertex colors (`new THREE.Color(hex)` / `shadeHexSRGB`), Corner Voxel AO, or image maps. Choose a triangle ceiling for an actual delivery requirement; without one, report the count and preserve the intended look. [Texture choices](./threejs-asset-generator/references/look.md#choose-the-texture-path) · [Reference matching](./threejs-asset-generator/references/reference-matching.md)

Choose **Fast Preview** to orbit, pan, zoom, and play or scrub clips, or **Full Preview** (`pack-studio`) for camera presets, dark/light backdrops, optional selective **Bloom** (`--bloom` via `UnrealBloomPass` + `OutputPass`), `2048×2048` shadows, rig/VFX toggles, `Copy Code` (model + VFX), and anti-bloat `Verify GLB`. For headless verification (`capture-studio` with `--motion-view` and `--motion-vfx`), both clean and VFX-enabled locomotion frames are captured together so particles never hide joint or tail defects. [Fast GLB viewer](./threejs-asset-generator/assets/fast-preview.html) · [Preview modes and VFX](./threejs-asset-generator/references/studio-preview.md)

---

## Release history

Detailed verification logs through **v4.5.0** are in the [audit record](./AUDIT.md); the [v4.1 handoff](./threejs-asset-generator/HANDOFF.md) covers Phases 0–5.

- **Completed through v4.6.0 (Current):**
  - **v4.6.0:** Default Corner Voxel AO and sRGB shading (`src/voxel.ts`), posed skin integrity gate (`RG9`) and GLB JSON bloat guard (`<= 512 KB`, stripping runtime `userData`) in `export-rigged-glb.ts` & studio `Verify GLB`, selective studio Bloom (`--bloom` via `UnrealBloomPass` + `OutputPass`) and `2048×2048` shadows, dual clean+VFX locomotion capture (`--motion-vfx`), and direct `--module` support in `mesh-stats.ts` and `rig-check.ts`.
  - **v4.5.0:** Standalone 27-style 3D art style catalog ([`art-styles.md`](./threejs-asset-generator/references/art-styles.md), synced independently to [Web Full `art-styles.md`](./threejs-asset-generator-web/references/art-styles.md)), opt-in `greedy` voxel meshing, Turn-1 procedural lock, automatic closed-socket facial pivots (`Balance`/`Quality`), anchored fluid & outward projectile VFX rules, and synced `Copy Code` (model + VFX).
  - **v4.4.0:** Manifold `VoxelGrid` builder & linear `THREE.Color(hex)` guardrail (`src/voxel.ts`), `G4` Regional Color QC (Semantic ROI + CIEDE2000 ΔE00 via `scripts/color-qc.ts`), `RG8` reloaded-GLB topology gate, `--grid auto` turnaround splitting, direct `--module` QA (`qa-asset.ts`), and studio contrast, autoplay, and multi-row VFX captures (`--extras`).
  - **v4.2 – v4.3.3:** Exploration vs Build intake, `Quick`/`Balance`/`Quality` [work modes](./threejs-asset-generator/references/work-modes.md), 5 asset kinds (`prop`, `hero`, `creature`, `vehicle`, `building`), `SkinnedMesh` & `QuaternionKeyframeTrack` animation standards (`R7`, `RG6–RG7` per-clip motion gates), 6-archetype natural locomotion posture, `3/4` reference matching, `export-rigged-glb.ts`, `pack-studio.ts`, and `capture-studio.ts`.
  - **v4.1 & Phases 0–5:** Modular `SKILL.md` router, `src/` builders, `references/` guides, unified runner `tools/check.ts` (`validate-skills`, `trigger-check`, `run-tests`), pure triangle-array QA gates (`qacheck.ts`, `review.ts`, `qa-asset.ts`, pure-Node `png.ts`), platform budget & LOD checks (`budget.ts`, `mesh-stats.ts`, `src/lod.ts`), pure JS/TS `.glb` writer/reader (`glb.ts`, `export-glb.ts`), border flood-fill & `--grid` turnaround intake (`refcheck.ts`, `ref-intake.ts`), and JSON rig validator (`rig-check.ts`, R1–R6).
- **Pending:**
  - **Phase 7:** Reusable asset recipes
  - **Phase 8 remaining:** Description tuning and release packaging.

---

## Repository Structure

```text
ThreeJS-modeling-skill/
├── README.md                        # Usage, release history, license and upstream credits
├── AGENTS.md                        # Maintenance rules for both editions
├── AUDIT.md                         # Release findings, audits, and verification evidence
├── LICENSE                          # MIT license for original project work
├── THIRD_PARTY_NOTICES.md           # Upstream attribution and license notices
├── .gitignore                       # Ignored dependencies and generated outputs
├── .gitattributes                   # Consistent LF line endings
├── threejs-asset-generator/         # Harness skill, references, builders and CLI
└── threejs-asset-generator-web/
    ├── SKILL.md                     # Web chat entrypoint and recovery rules
    └── references/                  # Runtime guide, standalone art-styles catalog, and full harness source in Markdown
```

---

## Usage

Install dependencies once inside `threejs-asset-generator/` (`npm install`; optional `sharp` is only needed for JPEG/WebP references, and `playwright-core` + installed Chrome/Edge/Chromium is only needed for `capture-studio.ts`) and run commands from inside `threejs-asset-generator/`:

```bash
# Validate the harness, run trigger checks and tests, and fail on skipped tests
npm run check:strict

# From a repository checkout, refresh and check the web reference pack
npm run pack:web
npm run check:web
npm run validate -- ..
npm run validate -- ../threejs-asset-generator-web

# Intake a multi-view turnaround sheet (border flood-fill on by default; --grid auto supports uneven bands)
npx tsx scripts/ref-intake.ts --sheet sheet.png --grid auto --views front,side,back --out ref.json

# Compare silhouette (G1-G3) and semantic regional colors (G4 CIEDE2000) against ref.json
npx tsx scripts/ref-compare.ts ref.json --module ./asset.ts --export buildXAsset --mode balance

# Run QA gates and render a 4-panel preview sheet (review.png, zero external deps)
npx tsx scripts/qa-asset.ts --module ./asset.ts --export buildXAsset --grounded --symmetric

# Check triangle/memory budgets and LOD ratios (accepts pure kernels or (params, THREE) builders)
npx tsx scripts/mesh-stats.ts --module ./asset.ts --export buildXAsset --profile web --kind creature --lods

# Validate character rig hierarchy, clips, drift, expressions & slide clearance (--meta or --module)
npx tsx scripts/rig-check.ts --module ./asset.ts --export buildXAsset --kind creature --motion free

# Export a geometry-only asset to .glb (Q1-Q5 & E1-E6)
npx tsx scripts/export-glb.ts --module ./kernel.ts --export buildXTris --out asset.glb

# Export a colored, rigged, or animated asset to .glb (RG1-RG9: bloat guard, topology, motion, posed skin)
npx tsx scripts/export-rigged-glb.ts --module ./asset.ts --export buildXAsset --out asset.glb

# Package a self-contained Full Preview HTML studio and capture a headless contact sheet
npx tsx scripts/pack-studio.ts --module ./asset.ts --export buildXAsset --background dark --bloom --autoplay --out ./index.html
npx tsx scripts/capture-studio.ts --studio ./index.html --out ./studio-contact-sheet.png --locomotion Swim --motion-view side --motion-vfx
```

See [`references/`](./threejs-asset-generator/references/) and fixture templates (`scripts/fixtures/crate.qa.ts`, `scripts/fixtures/dragon.qa.ts`) for parameter schemas and `@@RESULT` JSON output details.

---

## Verification scope

The [audit record](./AUDIT.md) documents findings, test runs, and Web Full pack checks from v4.1 through v4.5.0, while v4.6.0 checks can be reproduced directly with the usage commands above. The [harness handoff](./threejs-asset-generator/HANDOFF.md) records the earlier implementation history.

## License

Original work by Luciansvon in this repository is licensed under the [MIT License](./LICENSE). Third-party material remains subject to its upstream terms. [Third-party notices](./THIRD_PARTY_NOTICES.md)

## Credits & Attribution

| Project | Contribution |
| --- | --- |
| [zinkkrysty/three-js-asset-studio](https://github.com/zinkkrysty/three-js-asset-studio) | Original asset-generator skill and schema, shared preview/export builder, seeded variation, vertex jitter, and modeling conventions. |
| [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills/tree/9e7e04a) | Reference for the modular skill layout, validation tools, mesh checks, budget and LOD checks, and GLB verification. |
| [Three.js](https://github.com/mrdoob/three.js) | 3D runtime for geometry, materials, animation, rendering, and GLB import/export. |
