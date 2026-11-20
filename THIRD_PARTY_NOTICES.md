# Third-Party Notices

This repository builds on and adapts ideas/methodology from the following upstream open-source projects:

---

## 1. zinkkrysty/three-js-asset-studio
- **Source:** https://github.com/zinkkrysty/three-js-asset-studio
- **Role:** Origin of the base `threejs-asset-generator` skill architecture (`.agents/skills/threejs-asset-generator/SKILL.md`), `AssetGeneratorSchema` contract, seeded Mulberry32 PRNG pattern, seam-grouped vertex jitter convention, flat-shaded low-poly rules, composite asset pattern, and standalone code export concept.
- **License note:** No `LICENSE` file is published in the upstream GitHub repository at the time of referencing (described as an open-source studio in its README). Attributed here for transparency.

---

## 2. EL4CTEO/blender-skills
- **Source:** https://github.com/EL4CTEO/blender-skills
- **Version / Commit Referenced:** `v1.3.2` (`9e7e04a`)
- **Role:** Methodology for compact router-style skill organization, automated validation/trigger/test tooling, pure mesh QA gates, 4-panel visual review sheets, platform polygon/memory budgets, LOD verification, and GLB round-trip export gates (re-implemented independently in TypeScript/Node for Three.js without Blender).
- **License:** MIT License

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
