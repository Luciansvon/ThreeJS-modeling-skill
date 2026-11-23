// npx tsx src/voxel.test.ts
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelGrid, attachWorldSkinWeights, createHdrGlowMaterial, createVoxelMaterials, shadeHexSRGB } from './voxel';
import { attachCurveSkinWeights, buildBoneHierarchy } from './skinnedRig';
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

  // Verify buildMeshes + unshaded sRGB->linear vertex colors ({ ao: false }) + worldVertexT + default Corner AO
  const mats = createVoxelMaterials(THREE);
  const unshaded = v.buildMeshes(THREE, mats, { ao: false });
  assert.ok(unshaded.meshes.body.isMesh && unshaded.meshes.glow.isMesh);
  const colorAttr = unshaded.meshes.body.geometry.getAttribute('color');
  const firstR = colorAttr.getX(0);
  const expectedLinearR = new THREE.Color('#262b74').r;
  assert.ok(Math.abs(firstR - expectedLinearR) < 1e-4, `vertex color with ao:false must match exact linear sRGB (${expectedLinearR}): got ${firstR}`);
  assert.ok(firstR < 0.04, `dark indigo linear red should stay dark (< 0.04), got ${firstR}`);

  const defaultAo = v.buildMeshes(THREE, mats);
  const aoQa = qaGates(defaultAo.parts, { symmetric: true, grounding: true });
  assert.deepEqual(aoQa.gates.filter((g) => !g.pass), [], 'default Corner AO diagonal flip keeps Q1-Q6 cleanly passing');

  const geomsWithT = v.buildGeometries(THREE, { worldVertexT: (_x, y) => Math.max(0, Math.min(1, y / 0.4)) });
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

// 4. Corner Voxel AO darkens concave creases while keeping glow unshaded + glowBoost + HDR material helper
{
  const stepGrid = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  stepGrid.fillBox(0, 0, 0, 1, 0, 0, '#ffffff', 'body');
  stepGrid.set(1, 1, 0, '#ffffff', 'body'); // protruding wall creates concave corner at x=1 on top of (0,0,0)
  stepGrid.set(0, 0, 1, '#ff5500', 'glow');
  const g = stepGrid.buildGeometries(THREE, { glowBoost: 1.6 });
  const pos = g.body.geometry.getAttribute('position');
  const nor = g.body.geometry.getAttribute('normal');
  const col = g.body.geometry.getAttribute('color');
  let outerTopL = -1, creaseTopL = -1;
  for (let i = 0; i < pos.count; i++) {
    if (nor.getY(i) > 0.9 && Math.abs(pos.getY(i) - 0.1) < 1e-5) {
      if (Math.abs(pos.getX(i)) < 1e-5) outerTopL = col.getX(i);
      if (Math.abs(pos.getX(i) - 0.1) < 1e-5) creaseTopL = col.getX(i);
    }
  }
  assert.ok(outerTopL > 0.99 && creaseTopL > 0 && creaseTopL < outerTopL * 0.92, `expected AO crease darkening (${creaseTopL}) vs exposed (${outerTopL})`);

  const glowCol = g.glow.geometry.getAttribute('color');
  const expectedGlowR = new THREE.Color('#ff5500').r * 1.6;
  assert.ok(Math.abs(glowCol.getX(0) - expectedGlowR) < 1e-4, 'glow bucket skips AO and scales by glowBoost');
  const hdrMat = createHdrGlowMaterial(THREE, '#ff6600', 1.8);
  assert.equal(hdrMat.emissiveIntensity, 1.8);
  assert.equal(hdrMat.toneMapped, false);
}

// 5. Organic curve sculpting (fillSuperEllipsoid, fillTube, fillCubicBezier) passes Q1-Q6
{
  const org = new VoxelGrid({ voxelSize: 0.1, symAxis: 'even' });
  org.fillSuperEllipsoid(0, 2, 0, 2.2, 2.2, 2.2, '#2d283e', { power: 2.8 });
  org.fillCubicBezier([1, 4, 0], [3, 6, -1], [4, 9, -2], [3, 11, -1], 1.1, 0.4, '#8b7b6b');
  org.fillTube([0, 2, -2], [0, 1, -7], 1.2, 0.5, '#2d283e');
  org.mirrorX();
  org.fixDiagonalPinches();
  org.ground(0);
  const res = qaGates(org.buildParts(), { symmetric: true, grounding: true });
  assert.deepEqual(res.gates.filter((g) => !g.pass), [], JSON.stringify(res.gates));
}

// 6. shadeHexSRGB strictly darkens dark colors without lavender blowup
{
  const darkBase = '#1c1428';
  const darker = shadeHexSRGB(darkBase, -0.07);
  const baseC = new THREE.Color(darkBase), darkC = new THREE.Color(darker);
  assert.ok(darkC.b <= baseC.b && darkC.g <= baseC.g && darkC.r <= baseC.r, `negative shift on ${darkBase} -> ${darker} must never brighten`);
  const veryDark = '#050308';
  const deeper = shadeHexSRGB(veryDark, -0.1);
  assert.ok(new THREE.Color(deeper).b <= new THREE.Color(veryDark).b, `ultra-dark ${veryDark} -> ${deeper} must never jump brighter`);
  const lighter = shadeHexSRGB(darkBase, 0.1);
  assert.ok(new THREE.Color(lighter).b > baseC.b && new THREE.Color(lighter).b < 0.25, `positive shift on ${darkBase} -> ${lighter} stays controlled`);
}

// 7. World-corner skinning (worldVertexT + attachWorldSkinWeights) stays zero-tear under 150-degree bend
{
  const tail = new VoxelGrid({ voxelSize: 0.1, symAxis: 'odd' });
  tail.fillBox(-1, 0, -6, 1, 1, 0, '#2a2238', 'body');
  tail.fixDiagonalPinches();
  const { rootBone, bones, boneOrder } = buildBoneHierarchy([
    { name: 'root', worldPos: [0, 0.1, 0.05] },
    { name: 'mid', parent: 'root', worldPos: [0, 0.1, -0.25] },
    { name: 'tip', parent: 'mid', worldPos: [0, 0.1, -0.55] },
  ]);
  const built = tail.buildGeometries(THREE, {
    ao: false,
    worldVertexT: (_wx, _wy, wz) => Math.max(0, Math.min(1, (0.05 - wz) / 0.7)),
  });
  attachCurveSkinWeights(built.body.geometry, boneOrder, ['root', 'mid', 'tip'], { vertexT: built.body.vertexT!, boneT: [0, 0.5, 1] });
  const skin = new THREE.SkinnedMesh(built.body.geometry, createVoxelMaterials(THREE).body);
  skin.add(rootBone);
  skin.bind(new THREE.Skeleton(boneOrder.map((n) => bones[n])));

  // Map rest coincident pairs
  const pos = skin.geometry.getAttribute('position');
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    const list = buckets.get(k) ?? [];
    list.push(i);
    buckets.set(k, list);
  }
  bones.mid.rotation.x = 2.6; // extreme 149-deg bend
  rootBone.updateMatrixWorld(true);
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
  for (const idxs of buckets.values()) {
    skin.getVertexPosition(idxs[0], v0);
    for (let j = 1; j < idxs.length; j++) {
      skin.getVertexPosition(idxs[j], v1);
      assert.ok(v0.distanceTo(v1) < 1e-6, 'worldVertexT keeps shared corners fused under extreme bend');
    }
  }

  // Test attachWorldSkinWeights directly too
  const geo2 = built.body.geometry.clone();
  attachWorldSkinWeights(THREE, geo2, boneOrder, (_wx, _wy, wz) => {
    const u = Math.max(0, Math.min(1, (0.05 - wz) / 0.7));
    return [{ bone: 'root', weight: 1 - u }, { bone: 'tip', weight: u }];
  });
  const si2 = geo2.getAttribute('skinIndex'), sw2 = geo2.getAttribute('skinWeight');
  for (const idxs of buckets.values()) {
    for (let j = 1; j < idxs.length; j++) {
      assert.equal(si2.getX(idxs[0]), si2.getX(idxs[j]));
      assert.ok(Math.abs(sw2.getX(idxs[0]) - sw2.getX(idxs[j])) < 1e-6);
    }
  }
}

console.log('voxel.test.ts PASS');
