# Grounding, lifecycle, lights

Reference for `threejs-asset-generator`. Read it for grounding, disposal, rebuilds, lights and shadows inside assets. Section numbers match `SKILL.md`.

Contents: §9 Grounding and lifecycle (`lifecycle.ts`) · §10 Lights and shadows

## 9. Grounding and lifecycle

**Grounding.** Return a wrapper group whose inner content is shifted so the lowest point sits at Y = 0 and the footprint is centered. The offset lives in the inner group, so a composite can freely `root.position.set(x, 0, z)` without destroying the grounding.

Code: `src/lifecycle.ts`. API:

- `export function groundAsset(content: THREE.Object3D, center = true)`
- `export function disposeAsset(root: THREE.Object3D)`

Exception: composites with a terrain slab define Y = 0 as the slab's top surface (§8).

**Disposal.** The preview rebuilds on every slider change. Without disposal, GPU memory grows until the tab dies. Dispose each geometry and material once (clones share them), then drop the group.

(`disposeAsset` is in `src/lifecycle.ts`.)
Since r186 `Object3D` has its own `dispose()`; custom subclasses must call `super.dispose()`.

**Metadata.** Set `mesh.name` on every mesh (debugging, glTF node names) and `root.userData.stats = { triangles, meshes }` so UIs can show a budget. Low-poly guideline: a prop under about 2k triangles, a composite plot under about 20k, and draw calls equal to the number of materials.

**Articulated / rigged assets (animation pivots).** Merging everything into one mesh is ideal for static props, but characters or vehicles with moving parts need joint pivots:
- Keep the static core (torso, hull) in one `PartBuilder`, and build each moving limb (`head`, `armL`, `armR`, `legL`, `legR`) in its own `PartBuilder` with local origin at the joint pivot (`[0, 0, 0]` = shoulder, hip, or neck).
- Wrap each limb mesh in a named `THREE.Group` positioned at the joint coordinates on the parent, then ground the outer character with `groundAsset`. See `references/creatures.md` §6.4 for biped helpers (`taperedBoxTris`, `buildPivot`).

## 10. Lights and shadows inside assets

- Prefer emissive materials over lights. Lights belong to the scene; if an asset needs one (a lantern), expose a boolean such as `addLights` that defaults to `false`.
- Light intensity is physical since r155, and `PointLight`/`SpotLight` default to `decay = 2`. Values copied from older code look black; tune by eye.
- Set `castShadow = true` on merged meshes. Set `receiveShadow = true` only on surfaces that should catch shadows (ground, walls, decks). Receiving everywhere causes acne on flat faces.
- Use `PCFShadowMap`; `PCFSoftShadowMap` is deprecated (r182) and removed for WebGPU (r186), and `PCFShadowMap` is soft now. If acne appears, raise `light.shadow.normalBias` slightly; since r183 WebGPU shadows need less bias than before.
