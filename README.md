# ThreeJS Modeling Skill

Generate procedural 3D assets in **Three.js (r170+)** from a brief or reference. Choose geometry, shading and surface detail for the requested style, including low-poly, voxel, smooth claymation and realistic materials. The skill provides seeded builders, mesh checks, previews, animation and `.glb` export.

## Choose an edition

| Edition | Use it in | What it provides |
| --- | --- | --- |
| [Harness](./threejs-asset-generator/SKILL.md) | Codex, Claude Code, Gemini CLI, or another agent with a workspace and terminal | TypeScript builders, reference matching, mesh and budget checks, previews, and geometry-only or animated GLB export. |
| [Web Full](./threejs-asset-generator-web/SKILL.md) | ChatGPT web, Gemini, Claude web, or another browser chat | The harness workflow, guides, builders, tools, and test source in Markdown. Runs the stages supported by the current session. |

For a harness, place the complete `threejs-asset-generator/` folder in the harness's skill directory and install its dependencies there. Keep the folder name and its `SKILL.md` together.

For web chat, paste the Web Full `SKILL.md` into the conversation or project instructions and attach the Markdown references. If the host limits attachments, start with `runtime.md` and add the modeling, verification, or source packs relevant to the brief. [Markdown references](./threejs-asset-generator-web/references/)

In Gemini, use `SKILL.md` as the Gem instructions and add the Markdown references. In Claude, where custom skills are enabled, zip and upload the entire `threejs-asset-generator-web/` folder. [Gem setup](https://support.google.com/gemini/answer/15146780?co=GENIE.Platform%3DDesktop&hl=en), [Claude custom skills](https://support.claude.com/en/articles/12512180-use-skills-in-claude)

## Model delivery

Both editions start with the brief and reference views, build one seeded model, choose surface detail, and verify the requested results before delivery. Web Full uses tools already available in the session. If a tool fails, the agent uses a fallback and continues independent work. A final **Blocked** report gives each unresolved requested stage, its cause, what was delivered in its place, and what would complete it. [Web asset pipeline](./threejs-asset-generator-web/references/runtime.md#asset-pipeline)

Compare the rendered asset with the reference at the intended viewing distance. Reopen the image when a face, joint or material needs a closer look. Surface detail can come from geometry, materials, vertex colors or maps, including session-generated images. Choose a triangle ceiling for an actual delivery requirement. Without one, report the count and preserve the intended look. [Texture choices](./threejs-asset-generator/references/look.md#choose-the-texture-path)

Choose Fast Preview to orbit, pan, zoom and play or scrub clips. For preview-only VFX, use one preview that loads the effect and the model together. Review the action in motion and refine the effect if its timing, direction or strength is hard to read. Choose Full Preview for authoring controls or detailed rig inspection. [Fast GLB viewer](./threejs-asset-generator/assets/fast-preview.html) · [Preview modes and VFX](./threejs-asset-generator/references/studio-preview.md)

---

## Credits & Attribution

This repository builds on and adapts ideas from two upstream open-source projects, plus Three.js itself. Only the actual sources used are listed below:

### 1. [zinkkrysty/three-js-asset-studio](https://github.com/zinkkrysty/three-js-asset-studio)
*Origin of the base `threejs-asset-generator` skill architecture and procedural modeling conventions (no `LICENSE` file is published in the upstream GitHub repo; described as open-source by its author).*

What originated from `zinkkrysty/three-js-asset-studio` (originally `.agents/skills/threejs-asset-generator/SKILL.md` and helper utilities, later refactored and expanded in v3/v4):
- **Skill identity & pipeline contract:** The `threejs-asset-generator` skill name and "single source of truth" contract where one generator function drives both live preview and standalone code export.
- **Generator & parameter schema shape:** `AssetGeneratorSchema` (`id`, `name`, `category`, `description`, `parameters`, `presetConfigs`, `generate`, `generateCode`) and typed UI parameter definitions (`src/types.ts`).
- **Seeded PRNG & watertight vertex jitter:** Mulberry32-based deterministic PRNG (`createPRNG`, `src/prng.ts` — later extended in v4 with `seed = 0` support and `.fork()`) and seam-grouped vertex displacement (`applyVertexJitter`, `src/jitter.ts`).
- **Low-poly look & geometry rules:** `flatShading: true` material/palette rules (`references/look.md`), custom `BufferGeometry` outward CCW winding conventions, attribute matching for merging, and contoured inset overlays (`references/geometry.md`, `src/overlay.ts`).
- **Composite assets & lifecycle conventions:** Exported sub-asset builders, fixed vs. controlled vs. PRNG placement with clearance checks (`references/composite.md`), `Y = 0` grounding and shadow flags (`references/lifecycle.md`).
- **Standalone unminified code export pattern:** Vite `?raw` source embedding, TypeScript stripping, and zero-dependency inline helper bundling (`references/export.md`).

### 2. [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) (`v1.3.2`, commit `9e7e04a`)
*Licensed under the **MIT License** — Copyright © 2026 EL4CTEO (full license text in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)).*

What was adapted from `EL4CTEO/blender-skills` (re-implemented independently in TypeScript/Node without Blender as a dependency):
- **Compact skill layout:** Splitting the monolithic prompt into a concise router (`SKILL.md`) backed by modular `references/` guides and `src/` modules.
- **Automated skill verification tooling:** Unified `tools/check.ts` workflow (`validate-skills.ts`, `trigger-check.ts`, `run-tests.ts`) and the structured `@@RESULT` JSON + exit-code contract (`scripts/result.ts`).
- **Mesh QA gates & visual review:** Pure geometry QA gate checks (`scripts/qacheck.ts`, Q1–Q10), the 2x2 orthographic software preview renderer (`scripts/review.ts`, `scripts/qa-asset.ts`), and the "Done" verification rules (`references/qa-gates.md`).
- **Platform budgets & LOD checks:** Aligned polygon, material, texture-memory, bone, draw-call, and GLB size limits per platform/kind (`scripts/budget.ts`, `scripts/mesh-stats.ts`, `references/budget.md`) plus `detail`-level LOD checks (`src/lod.ts`).
- **GLB export verification workflow:** Pre-export QA enforcement and post-write round-trip checks (`scripts/glb.ts`, `scripts/export-glb.ts`, E1–E6, `references/glb-export.md`).

### 3. [Three.js](https://threejs.org/)
*Licensed under the **MIT License**.*
- Target 3D runtime, geometry, material, and export APIs (`three >= r170`).

---

## Release history

Changes and verification for v4.3 are in the [audit record](./AUDIT.md). The [v4.1 handoff](./threejs-asset-generator/HANDOFF.md) covers the earlier work below.

- **Completed:** **Phases 0, 1, 2, 3, 4, 5, plus v4.1 field-test patch & rig/clip validator**
  - **Phases 0–1 (Structure):** Trimmed `SKILL.md` into a concise router, moved builder modules to `src/`, and split detailed guides into `references/`.
  - **Phase 2 (Tooling):** Added unified runner `tools/check.ts` (`validate-skills`, `trigger-check`, and `run-tests`) with cross-platform `spawnTsx` and Windows path support.
  - **Phase 3 (QA Gates & Visual Review):** Added pure triangle-array QA gates (`qacheck.ts`), a 2x2 orthographic software renderer (`review.ts`, `qa-asset.ts`), and zero-dependency pure-Node PNG writing (`scripts/png.ts`, no `sharp` required for `review.png` or `diff-*.png`).
  - **Phase 4 (Budgets & LOD):** Added platform budget & LOD checks (`budget.ts`, `mesh-stats.ts`), `detail`-level LOD helpers, and `lodRadiusScale` polygon bounds compensation (`src/lod.ts`).
  - **Phase 5 (GLB Export):** Added pure JS/TS `.glb` writer/reader and CLI (`scripts/glb.ts`, `scripts/export-glb.ts`).
  - **v4.1 Field-Test Patch:** Added border flood-fill masking and `--sheet --grid` turnaround sheet splitting in `scripts/refcheck.ts` / `scripts/ref-intake.ts`, pure JSON rig/clip/expression/slide validator (`scripts/rig-check.ts`, R1–R6, `references/rig-check.md`), interactive HTML studio guide (`references/studio-preview.md`), and root `threejs-asset-generator/package.json`.
- **Pending:**
  - **Phase 7:** Reusable asset recipes
  - **Phase 8 remaining:** Description tuning and release packaging.

---

## Repository Structure

```text
ThreeJS-modeling-skill/
├── README.md                        # Repository overview & detailed credits
├── AGENTS.md                        # Maintenance rules for both editions
├── AUDIT.md                         # v4.1 findings and evidence
├── THIRD_PARTY_NOTICES.md           # Verbatim MIT License notice for EL4CTEO/blender-skills
├── .gitignore                       # Ignored dependencies and generated outputs
├── .gitattributes                   # Consistent LF line endings
├── threejs-asset-generator/         # Harness skill, references, builders and CLI
└── threejs-asset-generator-web/
    ├── SKILL.md                     # Web chat entrypoint and recovery rules
    └── references/                  # Runtime guide and full harness source in Markdown
```

---

## Usage

Install dependencies once inside `threejs-asset-generator/` (`npm install`, optional `sharp` only needed for JPEG/WebP references) and run commands from inside `threejs-asset-generator/`:

```bash
# Validate the harness, run trigger checks and tests, and fail on skipped tests
npm run check:strict

# From a repository checkout, refresh and check the web reference pack
npm run pack:web
npm run check:web
npm run validate -- ..

# Intake a multi-view turnaround sheet (border flood-fill on by default)
npx tsx scripts/ref-intake.ts --sheet sheet.png --grid 3x2 --views front,back,top,bottom,side,34 --out ref.json

# Run QA gates and render a 4-panel preview sheet (review.png, zero external deps)
npx tsx scripts/qa-asset.ts --module ./kernel.ts --export buildXTris --symmetric

# Check triangle/memory budgets and LOD ratios
npx tsx scripts/mesh-stats.ts --module ./kernel.ts --export buildXTris --profile web --kind prop --lods

# Validate character rig hierarchy, clips, drift, expressions & slide clearance
npx tsx scripts/rig-check.ts --meta char_metadata.json

# Export a QA-verified asset to .glb
npx tsx scripts/export-glb.ts --module ./kernel.ts --export buildXTris --out asset.glb
```

See [`references/`](./threejs-asset-generator/references/) and fixture templates (`scripts/fixtures/crate.qa.ts`, `scripts/fixtures/dragon.qa.ts`) for parameter schemas and `@@RESULT` JSON output details.

---

## Verification scope

The audit records the v4.1 tests, the Web Full pack checks, and the limits of the evidence. The handoff records the harness implementation history. [Audit](./AUDIT.md), [harness handoff](./threejs-asset-generator/HANDOFF.md)
