# ThreeJS Modeling Skill (`threejs-asset-generator` v4)

Procedural low-poly 3D asset generator skill for **Three.js (r170+)**. It combines seeded deterministic geometry builders, automated mesh QA gates, a 4-panel software preview renderer, platform polygon/memory budget & LOD checks, and standalone `.glb` export without requiring Blender.

> **Folder note:** The skill lives under [`threejs-asset-generator/`](./threejs-asset-generator/) so its directory name matches `name: threejs-asset-generator` in [`SKILL.md`](./threejs-asset-generator/SKILL.md) (enforced by `tools/validate-skills.ts`).

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
├── README.md                        # Repository overview
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

---

## Attribution

Methodology adapted from [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) (MIT License, v1.3.2), implemented independently for Three.js / TypeScript without Blender as a dependency.
