// detailThree.test.ts: needs three installed. Run: npx tsx detailThree.test.ts
// NOT executed in the session that produced this version (three was not installed there): run it once in the project.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { signedVolumeOf } from './tri';
import { chamferBoxTris, atlasRect } from './detail';
import { seededAtlas, aoShade, applyAO, latheGeoWithUV, trisUVToGeometry } from './detailThree';
import { PartBuilder, lowPolyMaterial } from './lowpoly';

const rngOf = (s: number) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// AO
const col = aoShade('#ffffff', { downBias: 0.6 });
const ti = { normal: new THREE.Vector3(0, -1, 0), centroid: new THREE.Vector3(), index: 0 };
const dark = (col as any)(ti) as THREE.Color; assert.ok(dark.r < 1 && dark.r > 0.3);
const pb = new PartBuilder();
pb.addTris(chamferBoxTris([0, 0, 0], [1, 1, 1], 0.1), '#c0a080');
const geo = pb.build(lowPolyMaterial()).geometry.clone(); const sumC = () => (geo.attributes.color as THREE.BufferAttribute).array.reduce((a: number, b: number) => a + b, 0);
const s0 = sumC(); applyAO(geo, { downBias: 1, floor: 0.5 }); assert.ok(sumC() < s0 * 0.98 && sumC() > s0 * 0.5, 'applyAO darkens, never black');

// atlas: determinism + texture setup + neutral unused slot
const cells: any[] = [{ kind: 'gills', base: 0xd8c8a8 }, { kind: 'spots', base: 0xb03030, accent: 0xf0e0d0 }, { kind: 'fur', base: 0x805030 }];   // 3 cells in a 2x2 grid
const A = seededAtlas(rngOf(3), cells, 2, 16), B = seededAtlas(rngOf(3), cells, 2, 16);
assert.deepEqual(A.map.image.data, B.map.image.data); assert.equal(A.map.image.width, 32);
assert.equal(A.roughnessMap.colorSpace, THREE.NoColorSpace); assert.equal(A.map.colorSpace, THREE.SRGBColorSpace);
assert.equal((A.map.image.data as Uint8Array)[3], 255, 'alpha 255');

// textured part end-to-end (uv keep)
const pu = new PartBuilder({ uv: 'keep' });
pu.add(latheGeoWithUV([[0.3, 0], [0.4, 0.5], [0.1, 1]], 8, atlasRect(0, 2)), '#ffffff');
const tr = chamferBoxTris([0, 0, 0], [1, 1, 1], 0.1);
pu.add(trisUVToGeometry(tr, new Array(tr.length / 3 * 2).fill(0.5)), '#ffffff', new THREE.Matrix4().makeScale(-1, 1, 1));
const m = pu.build(lowPolyMaterial({ map: A.map })); assert.ok(m.geometry.attributes.uv.count === m.geometry.attributes.position.count);
assert.ok(signedVolumeOf(tr) > 0);

// uv 'keep' + a part without uv must throw at add(), not silently produce a mesh without uv
const bad = new PartBuilder({ uv: 'keep' });
assert.throws(() => bad.addTris(chamferBoxTris([0, 0, 0], [1, 1, 1], 0.1), '#ffffff'), /no uv/);
// a plain PartBuilder still takes kernel triangles, and a bevel-0 box
const plainPart = new PartBuilder(); plainPart.addTris(chamferBoxTris([0, 0, 0], [1, 1, 1], 0), '#ffffff');
assert.equal(plainPart.build(lowPolyMaterial()).geometry.attributes.position.count, 36);
console.log('THREE OK');
