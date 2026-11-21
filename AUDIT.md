# ThreeJS Modeling Skill v4.1 audit

Audited upstream revision [`7e3afd4`](https://github.com/Luciansvon/ThreeJS-modeling-skill/commit/7e3afd4b3ec222da618778294f0892757f969f07), the November 20, 2026 field-test patch. Tests used Windows with Node 24.14.1, Three.js r180, tsx 4.23.15, and sharp 0.33.5.

## Findings

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | The v4.1 rig checker accepted one XYZ tuple for three position keys and reported incomplete expression and slide data as passing. The CLI summary could also claim all checks passed after listing skipped gates. | R4 checks per-key widths and drift evidence. R5 and R6 surface incomplete data and keep failures for invalid values that are present. Added regression cases to the existing [rig tests](threejs-asset-generator/scripts/rigcheck.test.ts). |
| High | The original skill asks the agent to run terminal commands and open a generated image before completion. Plain web chat cannot produce that evidence. | Web Full packages the harness workflow and source in Markdown. The agent continues with available tools and reports unresolved requested stages at the end. [Web runtime guide](threejs-asset-generator-web/references/runtime.md) |
| Medium | The bundled GLB writer saves triangles, flat normals, and one default material. An internal round trip alone cannot establish that a separate loader accepts the file or that richer attributes survived. | Loaded the crate in Three.js `GLTFLoader`. Documented the [separate Three.js export route](threejs-asset-generator/references/glb-export.md) for rich assets and tested a minimal coloured, skinned, animated sample. |
| Release | The project and cited upstream studio had no license detected by GitHub. The notice file attributes third-party work and includes the Blender skills MIT notice. | Verify permissions for material derived from the upstream studio before public distribution. See [third-party notices](THIRD_PARTY_NOTICES.md), [upstream studio](https://github.com/zinkkrysty/three-js-asset-studio), and [GitHub licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository). |

## Reproduction

Run from `threejs-asset-generator/` after installing its dependencies.

```text
npm run check:strict
npm run validate -- ../threejs-asset-generator-web
npm test -- --only rigcheck.test
npm run qa -- --module ./scripts/fixtures/crate.qa.ts --export buildCrateTris --grounded --footprint --symmetric --out ./review-output
npm run export-glb -- --module ./scripts/fixtures/crate.qa.ts --export buildCrateTris --out ./crate.glb
```

- Baseline strict run reported **12 passing test files, zero failed, zero skipped**, with **13/13** trigger cases. The added sample-count and missing-expression regressions failed before their respective fixes.
- The final strict run again reported **12 passing test files, zero failed, zero skipped**, with **13/13** trigger cases. Both skill manifests passed validation with zero errors and zero warnings. The shared B.I.M.A-DEV-INFRA repository audit reported zero findings.
- Crate fixture passed Q1–Q10 with **36 triangles**, two parts, centered footprint, and lowest Y=0. Four-view inspection showed the blue body and brown battens from the front, the outer batten in the side view, the battens at both edges from the top, and depth across all three visible faces in the angled view.
- The geometry writer passed E1–E6. Three.js `GLTFLoader` reopened the same **3,880-byte** GLB and found **2 meshes and 36 triangles**. A separate `GLTFExporter` → `GLTFLoader` sample returned **24 coloured vertices, 1 bone, 1 clip and 3 keyframes**, preserving material roughness.
- In a simulated text-only chat, the web edition supplied a seeded five-part fish-crate builder and dimension evidence for 1.20 × 0.65 × 0.75 m. It marked image matching, render, and GLB as unchecked when the reference images and runtime were unavailable.
- A second simulated chat returned a copyable road-barrier builder, dimensioned views, and a pending GLB status. A separate Node and Three.js CPU run verified **20 triangles**, dimensions of **1.40 × 0.60 × 0.50 m** within floating-point tolerance, and a repeatable seed zero.

## Web Full follow-up

- The pack check matched **73 source chapters**, including all **15 harness guides** and **51 TypeScript files**, against the canonical harness files. Reproduce with `npm run check:web` from `threejs-asset-generator/`.
- The strict run reported **12 passing test files, zero failed, and zero skipped**, with **13/13** trigger cases. Both manifests validated with zero errors and warnings. The shared B.I.M.A-DEV-INFRA repository audit reported zero findings. [Web Full PR](https://github.com/Luciansvon/ThreeJS-modeling-skill/pull/2)
- In a simulated session without terminal execution or binary attachments, Web Full delivered a builder, three detail levels, and an SVG preview. The final **Blocked** report identified mesh QA and GLB export as pending.

## v4.2 field-evaluation upgrade

Follow-up fixes from the Thunder Dragon blind-test evaluation (Gemini 4 Neon High) and multi-category architecture review (`creature`, `vehicle`, `building`, multi-limb rigs, and pre-modeling exploration Q&A):

| Area | Change | Verification |
| --- | --- | --- |
| Exploration & Intake | Added Exploration vs Build Mode + 6-item intake checklist to both [local SKILL.md](threejs-asset-generator/SKILL.md) and [web SKILL.md](threejs-asset-generator-web/SKILL.md); clarified preview-mode wait behavior in [studio-preview.md](threejs-asset-generator/references/studio-preview.md). | Both manifests validated with 0 errors and 0 warnings (`~4565` tokens local, `~2326` tokens web). |
| Category Budgets & LOD Gate | Extended `--kind` to `prop`, `hero`, `creature`, `vehicle`, and `building`; added vehicle/building material ceilings (up to 5–6 web materials) and `--budget N`; fixed `L0 QA` in `mesh-stats --lods` so it uses the category/platform budget instead of a hardcoded 2,000-triangle ceiling. | Added CLI and unit regressions in [budget.test.ts](threejs-asset-generator/scripts/budget.test.ts). |
| Animation & Rig Checker | Enabled flat-shaded `SkinnedMesh` alongside rigid `RigBuilder`, added animation quality standards (≥ 24 fps, easing, anticipation→climax→recovery, follow-through), added `--kind` bone ceilings (`creature` 64, `vehicle` 32, `building` 24, `hero`/`prop` 16), `--motion in-place\|free`, `qa.clipMinY` floor clearance, and safe error handling for malformed `rig.hierarchy`. | Added regressions in [rigcheck.test.ts](threejs-asset-generator/scripts/rigcheck.test.ts) covering malformed hierarchy, 41-pivot creature rigs, `--motion free`, and `qa.clipMinY`. |
| Geometry & Category Guides | Added `upHint` to `tubeTris` plus new `planarBladeTris` and `radialArrayTris` helpers in [organic.ts](threejs-asset-generator/src/organic.ts); documented multi-limb spiders/krakens, vehicle mechanical rigs, transparent glass, rectangular `boxFootprintOf` footprints, and recessed/hollow buildings. | Added unit tests in [creatures.test.ts](threejs-asset-generator/src/creatures.test.ts). |
| 3/4 Reference Match & Rigged GLB | Added `34` and `34_back` projection matching (auto `flipH`, IoU ≥ 0.70) to [refcheck.ts](threejs-asset-generator/scripts/refcheck.ts) and [ref-intake.ts](threejs-asset-generator/scripts/ref-intake.ts); added official `GLTFExporter` → disk → `GLTFLoader` CLI [export-rigged-glb.ts](threejs-asset-generator/scripts/export-rigged-glb.ts) (`npm run export-rigged-glb`). | Added tests in [refcheck.test.ts](threejs-asset-generator/scripts/refcheck.test.ts) and [glb.test.ts](threejs-asset-generator/scripts/glb.test.ts). |
| Web Full Sync & Triggers | Added 3 trigger cases (multi-limb creature exploration, vehicle, building) in [trigger-cases.json](threejs-asset-generator/tools/trigger-cases.json) and repacked `threejs-asset-generator-web/references/`. | `npm run check:web` verified **74 source chapters** across 5 Markdown packs; `npm run check:strict` passed **12/12 test files** (0 failed, 0 skipped) and **16/16 trigger cases**. |

## Limits of this audit

The samples check file and model data. A live v4.2 blind-test re-run, textured and animated visual appearance in target engines, and the workflow inside live ChatGPT, Gemini, and Claude accounts still need end-to-end testing.
