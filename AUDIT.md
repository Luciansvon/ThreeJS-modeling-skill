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

## Limits of this audit

The samples check file and model data. Textured and animated appearance, import into target engines, and the workflow inside live ChatGPT, Gemini, and Claude accounts still need end-to-end testing.
