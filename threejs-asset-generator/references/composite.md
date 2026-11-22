# Composite assets

Reference for `threejs-asset-generator`. Read it when one asset is built from several sub-assets (plots, scenes, ships with crew). Section numbers match `SKILL.md`.

Contents: §8 Composite assets

## 8. Composite assets

A composite (plot, camp, village) is a builder that places other builders' output.

**Fixed, controlled, procedural.**
- *Fixed:* terrain slab, perimeter, gate opening, walkway. The slab's top surface is Y = 0; the slab extends below.
- *Controlled (parameters):* style, colors, footprint scale, which sub-assets are enabled, counts.
- *Procedural (seeded):* positions and rotations of trees, rocks, benches, bushes.

**Rules.**
1. Sub-asset builders and parameter lists are exported with unique names (`buildHouseAsset`, `houseParameters`).
2. Namespace sub-asset parameters (`house.wallColor`, `tree.leafColor`) with `prefixParams` and hand each builder only its slice with `pickParams`. Passing the plot's whole `params` into the house leaks the plot's seed and colors into it.
3. Derive each sub-asset's seed from the plot seed: `rng.fork('tree3').seed % 100000`.
4. Every sub-asset reports a footprint (`footprintOf`). Placement uses it for collision checks instead of guessing sizes.
5. Place in a fixed priority order (house, then trees, rocks, benches, bushes), one stream per category. Toggling a category never moves categories placed before it.
6. Placement is bounded: at most `maxTries` attempts per item, then skip that item. Skipping is deterministic; an unbounded `while (occupied)` loop can hang the UI.
7. Large counts of the same object: build a few variants and `clone()` them (clones share geometry and material), or use `InstancedMesh`.

```ts
export const prefixParams = (prefix: string, defs: ParamDef[]) =>
  defs.map((d) => ({ ...d, id: prefix + d.id, group: d.group ?? prefix.replace(/\.$/, '') }));
export const pickParams = (p: Record<string, unknown>, prefix: string) =>
  Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));

export function footprintOf(obj: THREE.Object3D) {                 // circle, conservative (trees, rocks, round props)
  const b = new THREE.Box3().setFromObject(obj, true);
  const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
  return { x: c.x, z: c.z, r: Math.hypot(s.x, s.z) / 2 };
}

/** Rectangular AABB footprint for elongated buildings, walls, and vehicles so props can sit close to walls without huge circular dead zones. */
export function boxFootprintOf(obj: THREE.Object3D, clearance = 0) {
  const b = new THREE.Box3().setFromObject(obj, true);
  return { minX: b.min.x - clearance, maxX: b.max.x + clearance, minZ: b.min.z - clearance, maxZ: b.max.z + clearance };
}
export const hitsBox = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

type Spot = { r: number; clearance?: number };
/** Returns the items that fit, in input order, with x/z set. Returned r includes clearance. */
export function placeAll<T extends Spot>(rng: () => number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  items: T[], fixed: { x: number; z: number; r: number }[] = [], maxTries = 60) {
  const placed: (T & { x: number; z: number })[] = [];
  const hit = (x: number, z: number, r: number) => fixed.concat(placed).some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r);
  for (const it of items) {
    const r = it.r + (it.clearance ?? 0);
    for (let t = 0; t < maxTries; t++) {
      const x = bounds.minX + r + rng() * (bounds.maxX - bounds.minX - 2 * r);
      const z = bounds.minZ + r + rng() * (bounds.maxZ - bounds.minZ - 2 * r);
      if (!hit(x, z, r)) { placed.push({ ...it, x, z, r }); break; }
    }
  }
  return placed;
}
```

```ts
export function buildPlotAsset(raw: Record<string, unknown> = {}) {
  const p = resolveParams(plotSchema, raw);            // plotSchema.parameters = [..., ...prefixParams('house.', houseParameters), ...]
  const rng = createPRNG(p.seed as number);
  const seedFor = (label: string) => rng.fork(label).seed % 100000;
  const W = p.plotWidth as number, D = p.plotDepth as number;
  const root = new THREE.Group();

  root.add(buildSlab(p));                               // top surface at y = 0
  const house = buildHouseAsset({ ...pickParams(p, 'house.'), seed: seedFor('house') });
  house.position.set(0, 0, -D * 0.15);
  root.add(house);

  const bounds = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 };
  const candidates = p.hasTrees
    ? Array.from({ length: p.treeCount as number }, (_, i) => {
        const obj = buildTreeAsset({ ...pickParams(p, 'tree.'), seed: seedFor('tree' + i) });
        return { obj, key: 'tree' + i, r: footprintOf(obj).r, clearance: 0.5 };
      })
    : [];
  for (const s of placeAll(rng.fork('trees'), bounds, candidates, [footprintOf(house)])) {
    s.obj.position.set(s.x, 0, s.z);
    s.obj.rotation.y = rng.fork('rot-' + s.key)() * Math.PI * 2;
    root.add(s.obj);                                    // candidates that did not fit are never added
  }
  return root;
}
```

Carry the object on the item (`obj`), as above. Pairing `placeAll`'s result with the input array by index breaks as soon as one item is skipped.

### Architecture, hollow walls & interiors (`--kind building`)

- **Rectangular layouts:** Use `boxFootprintOf` + `hitsBox` when placing elongated houses, fences, market stalls, or city blocks so adjacent assets pack cleanly along walls.
- **Window & door cutouts (watertight):** Never punch unsealed holes into a box (fails Q4). Build each wall with an opening from 4 closed wall segments around the opening (left pier, right pier, lintel above, sill below), then place a recessed frame + glass pane (`references/look.md`) inside the opening.
- **Walkable interiors:** Give interior walls real thickness (two outward-facing closed slabs or an extruded U-frame) rather than `DoubleSide` sheets, and separate movable doors/shutters onto bounded hinge pivots (`references/rigging-biped.md`).
- **Budget:** For a building targeted at web delivery, pass `--profile web --kind building` to QA, mesh stats and geometry-only export. Carry any agreed triangle override through all three. For an unspecified target, report the counts.
