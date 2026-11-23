// npx tsx src/voxel.test.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelGrid, createVoxelMaterials } from './voxel';
import { boundsOf, qaGates, signedVolume, triCount } from '../scripts/qacheck';

// 1. Multi-material voxel inlay + deliberate diagonal pinch + exact X-mirroring ('even' axis)
{
  const v = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  v.fillBox(0, 0, -1, 1, 3, 1, '#262b74', 'body');
  // Deliberate 2x2 XY diagonal pinch sticking out on +X and a glow eye inlaid adjacent to body
  v.set(2, 1, 0, '#2e357d', 'body');
  v.set(3, 2, 0, '#2e357d', 'body');
  v.set(1, 2, 1, '#ff9800', 'glow'); // eye inlay replacing corner of body box
  v.mirrorX();

  // Before fixDiagonalPinches, Q4 must detect duplicated edges on the pinch
  const before = qaGates(v.buildParts(), { symmetric: true, grounding: true });
  assert.equal(before.gates.find((g) => g.gate === 'Q4 closed')?.pass, false, 'diagonal pinch trips Q4 before fix');

  const fixed = v.fixDiagonalPinches();
  assert.ok(fixed >= 2, `expected both mirrored pinches fixed, got ${fixed}`);

  const afterParts = v.buildParts();
  const after = qaGates(afterParts, { symmetric: true, grounding: true });
  const failed = after.gates.filter((g) => !g.pass);
  assert.deepEqual(failed, [], `expected all QA gates to pass after fixDiagonalPinches: ${JSON.stringify(failed)}`);
  assert.ok(afterParts.body && afterParts.glow, 'material buckets remain separated cleanly');

  // Verify buildMeshes + sRGB->linear vertex colors + vertexT
  const mats = createVoxelMaterials(THREE);
  const built = v.buildMeshes(THREE, mats);
  assert.ok(built.meshes.body.isMesh && built.meshes.glow.isMesh);
  const colorAttr = built.meshes.body.geometry.getAttribute('color');
  const firstR = colorAttr.getX(0);
  const expectedLinearR = new THREE.Color('#262b74').r;
  assert.ok(Math.abs(firstR - expectedLinearR) < 1e-4, `vertex color must be linear sRGB (${expectedLinearR}), not 0x26/255 (~0.149): got ${firstR}`);
  assert.ok(firstR < 0.04, `dark indigo linear red should stay dark (< 0.04), got ${firstR}`);

  const geomsWithT = v.buildGeometries(THREE, { vertexT: (_x, y) => Math.max(0, Math.min(1, y / 0.4)) });
  assert.equal(geomsWithT.body.vertexT?.length, geomsWithT.body.geometry.getAttribute('position').count);
}

// 2. Odd-symmetry grid mode + fillEllipsoid + zero dup edges
{
  const odd = new VoxelGrid({ voxelSize: 0.05, origin: [0, 0, 0], symAxis: 'odd' });
  odd.fillEllipsoid(0, 3, 0, 2.2, 2.5, 1.8, '#3b4496', 'body');
  odd.set(1, 3, 2, '#14f0ff', 'glow');
  odd.mirrorX();
  odd.fixDiagonalPinches();
  odd.ground(0);
  const res = qaGates(odd.buildParts(), { symmetric: true, grounding: true });
  assert.deepEqual(res.gates.filter((g) => !g.pass), [], JSON.stringify(res.gates));
}

// 3. Opt-in greedy meshing preserves bounds, outward winding, positive volume & palette while cutting flat triangles >= 40%
{
  const block = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  block.fillBox(0, 0, -2, 2, 4, 2, '#1c2434', 'body');
  block.fillBox(0, 1, 2, 0, 3, 2, '#62c4ff', 'body'); // inlaid lighter belly strip breaks uniform face cleanly
  block.set(1, 3, 2, '#36b8ff', 'glow');
  block.mirrorX();
  block.ground(0);

  const stdParts = block.buildParts('material');
  const greedyParts = block.buildParts('material', { greedy: true });
  const stdTris = triCount(stdParts.body);
  const greedyTris = triCount(greedyParts.body);
  const savings = (stdTris - greedyTris) / stdTris;
  assert.ok(savings >= 0.4, `expected greedy meshing to reduce body triangles >= 40%, got ${(savings * 100).toFixed(1)}% (${stdTris} -> ${greedyTris})`);
  assert.deepEqual(boundsOf(greedyParts.body), boundsOf(stdParts.body), 'greedy bounds must match exact voxel envelope');
  assert.ok(Math.abs(signedVolume(greedyParts.body) - signedVolume(stdParts.body)) < 1e-6, 'greedy volume must stay identical and outward CCW');

  const mats = createVoxelMaterials(THREE);
  const stdBuilt = block.buildMeshes(THREE, mats);
  const greedyBuilt = block.buildMeshes(THREE, mats, { greedy: true });
  assert.deepEqual(greedyBuilt.colors, stdBuilt.colors);
  assert.equal(greedyBuilt.meshes.body.geometry.getIndex()!.count / 3, greedyTris);
}

console.log('voxel.test.ts PASS');
