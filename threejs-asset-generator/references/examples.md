# Worked example

Reference for `threejs-asset-generator` §1. A complete small generator: schema, resolveParams, seeded build.

Contents: tree generator

```ts
// treeGenerator.ts
import * as THREE from 'three';
import type { ParamDef, AssetGeneratorSchema } from './types';
import { createPRNG } from './prng';
import { resolveParams } from './params';
import { PartBuilder, lowPolyMaterial } from './lowpoly';
import { applyVertexJitter } from './jitter';
import { groundAsset } from './lifecycle';
import { exportStandaloneCode } from './codeExport';   // project-specific exporter, see references/export.md §11
import rawTree from './treeGenerator.ts?raw';

export const treeParameters: ParamDef[] = [
  { id: 'seed', label: 'Random Seed', type: 'number', default: 42, min: 0, max: 99999, step: 1 },
  { id: 'trunkHeight', label: 'Trunk Height', type: 'number', default: 3.5, min: 1, max: 10, step: 0.1 },
  { id: 'leafColor', label: 'Leaf Color', type: 'color', default: '#2d6a4f' },
  { id: 'hasFruits', label: 'Add Fruits', type: 'boolean', default: true },
];

export function buildTreeAsset(rawParams: Record<string, unknown> = {}) {
  const p = resolveParams({ parameters: treeParameters }, rawParams);
  const rng = createPRNG(p.seed as number);
  const crownRng = rng.fork('crown');   // one stream per feature (see §2)
  const fruitRng = rng.fork('fruit');

  const bark = new PartBuilder();
  const leaves = new PartBuilder();
  // ... bark.add(geometry, '#6b4f3a', matrix); leaves.add(applyVertexJitter(g, 0.15, crownRng), p.leafColor, m);

  const content = new THREE.Group();
  content.add(bark.build(lowPolyMaterial({ roughness: 0.9 }), { name: 'bark' }));
  content.add(leaves.build(lowPolyMaterial(), { name: 'leaves' }));
  return groundAsset(content);
}

export const treeGenerator: AssetGeneratorSchema = {
  id: 'procedural-tree', name: 'Low-Poly Tree', category: 'Nature',
  description: 'Procedural low-poly tree.',
  parameters: treeParameters,
  generate: buildTreeAsset,
  generateCode: (params) =>
    exportStandaloneCode({ entry: { raw: rawTree, fn: 'buildTreeAsset' }, deps: [], params }),
};
```
