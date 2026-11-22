# Third-Party Notices

This file records the upstream sources credited by the project and the license notices for the referenced versions.

## zinkkrysty/three-js-asset-studio

The original `.agents/skills/threejs-asset-generator/SKILL.md` and helper utilities informed the following parts of this project. The upstream repository has no published root license file. This project's MIT license covers original contributions by Luciansvon. [Upstream repository](https://github.com/zinkkrysty/three-js-asset-studio)

- **Skill identity & pipeline contract:** The `threejs-asset-generator` skill name and "single source of truth" contract where one generator function drives both live preview and standalone code export.
- **Generator & parameter schema shape:** `AssetGeneratorSchema` (`id`, `name`, `category`, `description`, `parameters`, `presetConfigs`, `generate`, `generateCode`) and typed UI parameter definitions (`src/types.ts`).
- **Seeded PRNG & watertight vertex jitter:** Mulberry32-based deterministic PRNG (`createPRNG`, `src/prng.ts` — later extended in v4 with `seed = 0` support and `.fork()`) and seam-grouped vertex displacement (`applyVertexJitter`, `src/jitter.ts`).
- **Low-poly look & geometry rules:** `flatShading: true` material/palette rules (`references/look.md`), custom `BufferGeometry` outward CCW winding conventions, attribute matching for merging, and contoured inset overlays (`references/geometry.md`, `src/overlay.ts`).
- **Composite assets & lifecycle conventions:** Exported sub-asset builders, fixed vs. controlled vs. PRNG placement with clearance checks (`references/composite.md`), `Y = 0` grounding and shadow flags (`references/lifecycle.md`).
- **Standalone unminified code export pattern:** Vite `?raw` source embedding, TypeScript stripping, and zero-dependency inline helper bundling (`references/export.md`).

## EL4CTEO/blender-skills

The following workflows were adapted from v1.3.2 (commit `9e7e04a`) and implemented independently in TypeScript and Node. [Upstream source](https://github.com/EL4CTEO/blender-skills/tree/9e7e04a) · [Upstream MIT license](https://github.com/EL4CTEO/blender-skills/blob/9e7e04a/LICENSE)

- **Compact skill layout:** Splitting the monolithic prompt into a concise router (`SKILL.md`) backed by modular `references/` guides and `src/` modules.
- **Automated skill verification tooling:** Unified `tools/check.ts` workflow (`validate-skills.ts`, `trigger-check.ts`, `run-tests.ts`) and the structured `@@RESULT` JSON + exit-code contract (`scripts/result.ts`).
- **Mesh QA gates & visual review:** Pure geometry QA gate checks (`scripts/qacheck.ts`, Q1–Q10), the 2x2 orthographic software preview renderer (`scripts/review.ts`, `scripts/qa-asset.ts`), and the "Done" verification rules (`references/qa-gates.md`).
- **Platform budgets & LOD checks:** Aligned polygon, material, texture-memory, bone, draw-call, and GLB size limits per platform/kind (`scripts/budget.ts`, `scripts/mesh-stats.ts`, `references/budget.md`) plus `detail`-level LOD checks (`src/lod.ts`).
- **GLB export verification workflow:** Pre-export QA enforcement and post-write round-trip checks (`scripts/glb.ts`, `scripts/export-glb.ts`, E1–E6, `references/glb-export.md`).

```text
MIT License

Copyright (c) 2026 EL4CTEO

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Three.js

Three.js supplies the rendering, animation, geometry and glTF APIs. The notice below accompanies the r180 dependency used by the harness. [Upstream license](https://github.com/mrdoob/three.js/blob/r180/LICENSE)

```text
The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
