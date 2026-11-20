# Standalone code export and version notes

Reference for `threejs-asset-generator`. Read it before writing the exporter or pinning a Three.js version. Section numbers match `SKILL.md`.

Contents: §11 Standalone code export (`fingerprint.ts`) · §12 Version notes

## 11. Standalone code export

One exporter serves single and composite assets (a single asset is a composite with zero dependencies).

```ts
exportStandaloneCode({
  entry: { raw: rawPlot, fn: 'buildPlotAsset' },
  deps: [{ raw: rawHouse }, { raw: rawTree }, { raw: rawRock }],   // sub-asset modules
  helpers: [rawPrng, rawParams, rawLowpoly],                        // shared utils, included once
  params,                                                           // becomes DEFAULT_PARAMS
});
```

Pipeline:
1. Read sources with `?raw` (Vite; other bundlers have an equivalent source loader). Without a bundler (plain HTML, a playground, an artifact), let a build script read the files or keep each module's source as a string; the exporter only needs the text. Raw text keeps comments and names because no minifier touches it.
2. Strip TypeScript with a real transpiler (`esbuild` or `ts.transpileModule`, `target: 'es2022'`, no bundling, no minify). Regex type-stripping breaks on generics, `as` casts, `satisfies` and optional chaining.
3. Remove local `import` lines. Include each shared helper **once**. Fail loudly if two modules define the same top-level name with different bodies; silent last-wins is the usual cause of "works in preview, breaks in export".
4. Prepend the only external import: `import * as THREE from 'three';`. `mergeFlat` (§4) keeps `three/addons` out of the output; add the addons import only if the project chose `mergeGeometries`. Output is an ES module (global `three.js` script builds were removed in r161).
5. Append `export const DEFAULT_PARAMS = {...}` and `export { build…Asset }`.
6. Format with 2-space indentation. Prefer `prettier/standalone` over a hand-written regex formatter, which corrupts strings and template literals.

**Single-file HTML and hosted artifacts.** Choose the export target from where the code will run, and say in the reply which one you produced.

- *ES module with an import map* (a page you control): put `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>` before `<script type="module">`. Pin the version the asset was tested on. Add a `"three/addons/"` mapping only if the code imports addons.
- *Classic script with a global `THREE`* (sandboxes that only allow certain CDNs, ship a fixed and often older three build, and have no addons): export with `target: 'classic'`. The source still imports normally; the exporter strips the `import` line and wraps the code in `(function (THREE) { … return { buildXAsset }; })(window.THREE)`. Use core APIs only (the reason `mergeFlat` exists). Check the host's version against §12 before trusting the look: before r152 color management is off by default (hex colors look different), before r155 light intensities are not physical, and below r170 the skill's floor is not met, so treat the result as best effort and tell the user.

Detail helpers (`detail.ts` pure, `detailThree.ts` THREE) are plain helpers too: list both once in `helpers`. Browser-only loaders (`loadAtlasWebp`, `grayMapFromTexture`, `canvasAtlas`) stay in the app, not in the exported asset; a generated atlas (`seededAtlas`) exports with the code.

Rigged assets export the same way: `rig.ts` and `biped.ts` are plain helpers (list them once in `helpers`), and the exported builder returns the rig root with `userData.bones`; export clips with their builder function, not as baked JSON.

Any helper that used an npm package at preview time (`simplex-noise`'s `createNoise2D`, for example) must be replaced by a small in-repo implementation, otherwise "zero dependencies except three" is false.

**Parity test.** The single-source guarantee is only real if it is tested. Generate code for default params and for two seeds, import the exported module in a test (written inside the project so `three` resolves), and compare fingerprints with the live `generate` output.

Code: `src/fingerprint.ts`. API:

- `export function assetFingerprint(root: THREE.Object3D)`


## 12. Version notes (Three.js migration guide)

| Since | What it means for generated assets |
|---|---|
| r147 | `PointLight`/`SpotLight` `decay` defaults to 2 |
| r151 | `mergeGeometries` replaces `mergeBufferGeometries`; `InstancedMesh` needs `computeBoundingSphere()` after changing instance matrices |
| r152 | `ColorManagement` on by default; `outputColorSpace` is sRGB; `uv2` became `uv1` |
| r155 | Physically-based light units by default |
| r161 | No global `three.js` build; use ES modules / import maps |
| r171 | `three/webgpu` and `three/tsl` entry points; built-in materials work with `WebGPURenderer` (avoid `onBeforeCompile`, use TSL node materials for custom shading) |
| r177 | `ColorManagement.workingToColorSpace()` / `colorSpaceToWorking()` renames |
| r181, r187 | PBR energy conservation and PMREM rebuild; materials shade slightly differently |
| r182, r186 | `PCFSoftShadowMap` deprecated, then removed for WebGPU; use `PCFShadowMap` |
| r183 | Better WebGPU shadows (lower or remove bias); `Clock` deprecated in favor of `Timer` (`Timer` is in core since r179) |
| r186 | `Object3D.dispose()` added |

If the project pins an older release, check the migration guide for the gap before using an API from a newer row. Re-verify this table when the project moves to a newer version.
