# ThreeJS Modeling Skill (`threejs-asset-generator` v4)

Procedural low-poly 3D asset generator skill for **Three.js (r170+)**. It combines seeded deterministic geometry builders, automated mesh QA gates, a 4-panel software preview renderer, platform polygon/memory budget & LOD checks, and standalone `.glb` export without requiring Blender.

> **Folder note:** The skill lives under [`threejs-asset-generator/`](./threejs-asset-generator/) so its directory name matches `name: threejs-asset-generator` in [`SKILL.md`](./threejs-asset-generator/SKILL.md) (enforced by `tools/validate-skills.ts`).

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

## Current Status

Per [`HANDOFF.md`](./threejs-asset-generator/HANDOFF.md) (Nov 18, 2026):

- **Completed:** **Phases 0, 1, 2, 3, 4, and 5**
  - **Phases 0–1 (Structure):** Trimmed `SKILL.md` into a concise router, moved builder modules to `src/`, and split detailed guides into `references/`.
  - **Phase 2 (Tooling):** Added unified runner `tools/check.ts` (`validate-skills`, `trigger-check`, and `run-tests`).
  - **Phase 3 (QA Gates & Visual Review):** Added pure triangle-array QA gates (`qacheck.ts`) and a 2x2 orthographic software renderer (`review.ts`, `qa-asset.ts`).
  - **Phase 4 (Budgets & LOD):** Added platform budget & LOD checks (`budget.ts`, `mesh-stats.ts`) and `detail`-level LOD helpers (`src/lod.ts`).
  - **Phase 5 (GLB Export):** Added pure JS/TS `.glb` writer/reader and CLI (`scripts/glb.ts`, `scripts/export-glb.ts`).
- **Pending:**
  - **Phase 6:** `rig-check` and `clip-check`
  - **Phase 7:** Reusable asset recipes
  - **Phase 8:** Final packaging (`AGENTS.md`, `CLAUDE.md`, description tuning, and install targets)

---

## Repository Structure

```text
ThreeJS-modeling-skill/
├── README.md                        # Repository overview & detailed credits
├── THIRD_PARTY_NOTICES.md           # Verbatim MIT License notice for EL4CTEO/blender-skills
├── .gitignore                       # Ignored dependencies and generated outputs
├── .gitattributes                   # Consistent LF line endings
└── threejs-asset-generator/         # Core skill package (65 files)
    ├── SKILL.md                     # Main router and conventions
    ├── HANDOFF.md                   # Detailed progress log (Phases 0–5) and unverified notes
    ├── references/                  # 13 topic guides (geometry, look, QA, budgets, GLB, etc.)
    ├── src/                         # 24 builder modules, helpers, and unit tests
    ├── scripts/                     # 17 CLI scripts & tests (QA, review, stats, GLB export)
    └── tools/                       # 7 validation, trigger-check, and test-runner scripts
```

---

## Usage

Run commands from inside `threejs-asset-generator/` (requires **Node.js** and **`tsx`**):

```bash
# Run skill validation, trigger checks, and pure unit tests
tsx tools/check.ts

# Strict mode (treats skipped `three`-dependent tests as failures)
tsx tools/check.ts --strict

# Run QA gates and render a 4-panel preview sheet (review.png)
tsx scripts/qa-asset.ts --module ./kernel.ts --export buildXTris --symmetric

# Check triangle/memory budgets and LOD ratios
tsx scripts/mesh-stats.ts --module ./kernel.ts --export buildXTris --profile web --kind prop

# Export a QA-verified asset to .glb
tsx scripts/export-glb.ts --module ./kernel.ts --export buildXTris --out asset.glb
```

See [`references/`](./threejs-asset-generator/references/) and fixture templates (`scripts/fixtures/crate.qa.ts`, `scripts/fixtures/dragon.qa.ts`) for parameter schemas and `@@RESULT` JSON output details.

---

## Unverified Scope

As documented in [`HANDOFF.md`](./threejs-asset-generator/HANDOFF.md):
- Tests and paths requiring the `three` package (`src/detailThree.test.ts`, `GLTFExporter`, and `groupToTris`) have not been executed yet because `three` was not installed in the sandbox environment.
- Exported `.glb` files have not yet been tested in third-party viewers (`GLTFLoader`, Blender, or `model-viewer`).
