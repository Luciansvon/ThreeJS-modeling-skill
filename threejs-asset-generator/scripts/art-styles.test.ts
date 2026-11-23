// npx tsx scripts/art-styles.test.ts
// Verifies the lightweight 3D Art Style Guide (27 styles), context footprint vs baseline,
// zero new dependencies, and end-to-end Three.js modeling/QA/preview/GLB export across 3 style scenarios:
//   1. Low Poly (faceted PartBuilder + lowPolyMaterial)
//   2. Voxel (VoxelGrid default watertight + greedy meshing option)
//   3. Hybrid: Chibi + Hand-Painted + Toon Shading (facial pivots + procedural DataTexture + MeshToonMaterial)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { groundAsset } from '../src/lifecycle';
import { PartBuilder, lowPolyMaterial } from '../src/lowpoly';
import { createPRNG } from '../src/prng';
import { VoxelGrid, createVoxelMaterials } from '../src/voxel';
import { tokensOf } from '../tools/validate-skills';
import { countScene, extractObjectParts } from './asset-builder';
import { clipMotion } from './clip-motion';
import { decodePngRgba, encodePngRgba } from './png';
import { boundsOf, qaGates, signedVolume, triCount } from './qacheck';
import { parseResult, spawnTsx } from './result';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '..');
const webDir = join(rootDir, '..', 'threejs-asset-generator-web');

const EXPECTED_STYLES = [
  // Geometry (7)
  'Low Poly', 'Voxel', 'Blocky', 'Smooth Stylized', 'Chibi', 'Hard Surface', 'Primitive-Based',
  // Materials (7)
  'Claymation', 'Hand-Painted', 'Papercraft', 'Wool', 'Wooden Toy', 'Vinyl Toy', 'Pixelated',
  // Rendering (7)
  'Toon Shading', 'Anime Shading', 'Comic Ink', 'Painterly', 'Watercolor', 'Retro PS1', 'Realistic PBR',
  // Art Direction (6)
  'Cozy Pastel', 'Fantasy', 'Gothic', 'Cyberpunk', 'Storybook', 'Minimalist',
] as const;

function readGlbJson(buf: ArrayBuffer): Record<string, any> {
  const dv = new DataView(buf);
  assert.equal(dv.getUint32(0, true), 0x46546c67, 'GLB magic');
  const jsonLen = dv.getUint32(12, true);
  return JSON.parse(Buffer.from(buf, 20, jsonLen).toString('utf8'));
}

async function withNodeGlbTextureShim<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, any>;
  const origSelf = g.self;
  const origFileReader = g.FileReader;
  const origDocument = g.document;
  const origImageData = g.ImageData;
  const blobStore = new Map<string, Blob>();
  let urlCounter = 0;

  if (typeof g.self === 'undefined') g.self = g;

  if (typeof g.FileReader === 'undefined') {
    g.FileReader = class {
      result: ArrayBuffer | string | null = null;
      onloadend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      readAsArrayBuffer(blob: Blob) {
        blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }).catch((e) => this.onerror?.(e));
      }
      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then((b) => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
          this.onloadend?.();
        }).catch((e) => this.onerror?.(e));
      }
    };
  }

  g.ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };

  const origCreateObjUrl = URL.createObjectURL;
  const origRevokeObjUrl = URL.revokeObjectURL;
  URL.createObjectURL = (obj: any) => {
    const id = `blob:node-art-style/${++urlCounter}`;
    if (obj && typeof obj.arrayBuffer === 'function') blobStore.set(id, obj as Blob);
    return id;
  };
  URL.revokeObjectURL = (u: string) => { blobStore.delete(u); };

  g.document = {
    createElementNS: (_ns: string, tag: string) => g.document.createElement(tag),
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        let w = 1, h = 1;
        let pixels = new Uint8Array(4);
        let flip = false;
        return {
          get width() { return w; },
          set width(v: number) { w = Math.max(1, v | 0); pixels = new Uint8Array(w * h * 4); },
          get height() { return h; },
          set height(v: number) { h = Math.max(1, v | 0); pixels = new Uint8Array(w * h * 4); },
          getContext: () => ({
            translate: () => {},
            scale: (_sx: number, sy: number) => { if (sy < 0) flip = true; },
            putImageData: (img: { data: Uint8ClampedArray; width: number; height: number }) => {
              w = img.width; h = img.height;
              pixels = new Uint8Array(w * h * 4);
              for (let y = 0; y < h; y++) {
                const sy = flip ? h - 1 - y : y;
                const srcOff = sy * w * 4;
                const dstOff = y * w * 4;
                pixels.set(img.data.subarray(srcOff, srcOff + w * 4), dstOff);
              }
            },
            drawImage: () => {},
          }),
          toBlob: (cb: (blob: Blob) => void, mime = 'image/png') => {
            const png = encodePngRgba(pixels, w, h);
            cb(new Blob([new Uint8Array(png)], { type: mime }));
          },
        };
      }
      // Minimal <img> stub for THREE.ImageLoader inside GLTFLoader.parseAsync
      const listeners: Record<string, Array<(e?: any) => void>> = {};
      const imgEl: Record<string, any> = {
        width: 1,
        height: 1,
        addEventListener: (ev: string, cb: (e?: any) => void) => { (listeners[ev] ??= []).push(cb); },
        removeEventListener: (ev: string, cb: (e?: any) => void) => {
          listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== cb);
        },
        set src(url: string) {
          queueMicrotask(async () => {
            try {
              const blob = blobStore.get(url);
              let bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
              if (!bytes && url.startsWith('data:image/png;base64,')) {
                bytes = new Uint8Array(Buffer.from(url.slice('data:image/png;base64,'.length), 'base64'));
              }
              const decoded = bytes ? decodePngRgba(Buffer.from(bytes)) : null;
              if (decoded) {
                imgEl.width = decoded.width;
                imgEl.height = decoded.height;
                imgEl.data = decoded.rgba;
              }
              for (const cb of listeners.load ?? []) cb({});
            } catch (err) {
              for (const cb of listeners.error ?? []) cb(err);
            }
          });
        },
      };
      return imgEl;
    },
  };

  try {
    return await fn();
  } finally {
    URL.createObjectURL = origCreateObjUrl;
    URL.revokeObjectURL = origRevokeObjUrl;
    if (origSelf === undefined) delete g.self; else g.self = origSelf;
    if (origFileReader === undefined) delete g.FileReader; else g.FileReader = origFileReader;
    if (origDocument === undefined) delete g.document; else g.document = origDocument;
    if (origImageData === undefined) delete g.ImageData; else g.ImageData = origImageData;
  }
}

// -----------------------------------------------------------------------------
// 0. Catalog completeness, standalone Web Full sync & context-budget check
// -----------------------------------------------------------------------------
const harnessCatalogPath = join(rootDir, 'references', 'art-styles.md');
const webCatalogPath = join(webDir, 'references', 'art-styles.md');
assert.ok(existsSync(harnessCatalogPath), 'harness references/art-styles.md exists');
assert.ok(existsSync(webCatalogPath), 'web references/art-styles.md exists');

const harnessCatalog = readFileSync(harnessCatalogPath, 'utf8').replace(/\r\n/g, '\n');
const webCatalog = readFileSync(webCatalogPath, 'utf8').replace(/\r\n/g, '\n');
assert.equal(harnessCatalog, webCatalog, 'art-styles.md must stay synced cleanly between harness and web');
assert.ok(/^Contents:\s+\S/m.test(harnessCatalog), 'art-styles.md has Contents: line');
for (const style of EXPECTED_STYLES) {
  assert.ok(harnessCatalog.includes(`### ${style}\n`), `missing style heading: ### ${style}`);
}
const externalUrls = harnessCatalog.match(/https:\/\/[^\s)]+/g) ?? [];
assert.ok(externalUrls.length >= EXPECTED_STYLES.length, 'each style includes trusted reference link(s)');

// Ensure art-styles.md was NOT dumped into modeling-guide.md (context stays on-demand)
const modelingGuide = readFileSync(join(webDir, 'references', 'modeling-guide.md'), 'utf8');
assert.ok(!modelingGuide.includes('## references/art-styles.md'), 'modeling-guide.md must NOT auto-inline art-styles.md');

// Ensure zero new packages/dependencies added
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), ['esbuild', 'tsx', 'three']);
assert.deepEqual(Object.keys(pkg.optionalDependencies ?? {}), ['playwright-core', 'sharp']);
assert.equal(pkg.dependencies, undefined, 'no runtime dependencies added');

const harnessSkillTokens = tokensOf(readFileSync(join(rootDir, 'SKILL.md'), 'utf8'));
const webSkillTokens = tokensOf(readFileSync(join(webDir, 'SKILL.md'), 'utf8'));
const modelingGuideBytes = Buffer.byteLength(modelingGuide, 'utf8');
assert.ok(harnessSkillTokens <= 5000, `harness SKILL.md must stay <= 5000 tokens (got ${harnessSkillTokens})`);
assert.ok(webSkillTokens <= 5000, `web SKILL.md must stay <= 5000 tokens (got ${webSkillTokens})`);

const tmpOut = mkdtempSync(join(tmpdir(), 'art-styles-test-'));
try {
  await withNodeGlbTextureShim(async () => {
    // -------------------------------------------------------------------------
    // 1. Scenario 1: Low Poly (Crystal Shrine Pillar — faceted PartBuilder)
    // -------------------------------------------------------------------------
    const t1 = performance.now();
  function buildLowPolySample(seed = 7) {
    const rng = createPRNG(seed);
    const pb = new PartBuilder();
    pb.add(new THREE.CylinderGeometry(0.42, 0.55, 0.25, 6), '#4a5568', new THREE.Matrix4().makeTranslation(0, 0.125, 0));
    pb.add(
      new THREE.CylinderGeometry(0.18, 0.34, 0.95, 6),
      ({ normal }) => (normal.y > 0.3 ? '#38bdf8' : rng() < 0.5 ? '#0284c7' : '#0369a1'),
      new THREE.Matrix4().makeTranslation(0, 0.725, 0),
    );
    const group = new THREE.Group();
    group.name = 'lowpoly_crystal_root';
    group.add(pb.build(lowPolyMaterial({ roughness: 0.85, metalness: 0.05 }), { name: 'crystal_pillar' }));
    return groundAsset(group);
  }

  const lpRoot = buildLowPolySample(7);
  const lpQa = qaGates(extractObjectParts(lpRoot, THREE), { grounding: true, footprint: true });
  assert.deepEqual(lpQa.gates.filter((g) => !g.pass), [], `Low Poly QA failed: ${JSON.stringify(lpQa.gates)}`);

  const lpGlb = await new GLTFExporter().parseAsync(lpRoot, { binary: true, onlyVisible: true });
  const lpReloaded = await new GLTFLoader().parseAsync(lpGlb, '');
  const lpBefore = countScene(lpRoot);
  const lpAfter = countScene(lpReloaded.scene);
  assert.equal(lpAfter.tris, lpBefore.tris);
  assert.equal(lpAfter.vertexColorMeshes, 1);
  const s1Ms = performance.now() - t1;

  // ---------------------------------------------------------------------------
  // 2. Scenario 2: Voxel (Stepped Voxel Totem — default watertight + greedy)
  // ---------------------------------------------------------------------------
  const t2 = performance.now();
  const grid = new VoxelGrid({ voxelSize: 0.08, symAxis: 'even' });
  grid.fillBox(0, 0, -2, 2, 5, 2, '#1f2937', 'body');
  grid.fillBox(0, 1, 2, 0, 3, 2, '#60a5fa', 'body');
  grid.set(1, 4, 2, '#38bdf8', 'glow');
  grid.mirrorX();
  grid.fixDiagonalPinches();
  grid.ground(0);

  const voxMats = createVoxelMaterials(THREE);
  const voxStd = grid.buildMeshes(THREE, voxMats);
  const voxGreedy = grid.buildMeshes(THREE, voxMats, { greedy: true });
  const stdBodyTris = triCount(voxStd.parts.body);
  const greedyBodyTris = triCount(voxGreedy.parts.body);
  const greedyRatio = (stdBodyTris - greedyBodyTris) / stdBodyTris;
  assert.ok(greedyRatio >= 0.35, `expected greedy reduction >= 35%, got ${(greedyRatio * 100).toFixed(1)}%`);
  assert.deepEqual(boundsOf(voxGreedy.parts.body), boundsOf(voxStd.parts.body));
  assert.ok(Math.abs(signedVolume(voxGreedy.parts.body) - signedVolume(voxStd.parts.body)) < 1e-6);

  const voxQa = qaGates(extractObjectParts(voxStd.group, THREE), { grounding: true, symmetric: true });
  assert.deepEqual(voxQa.gates.filter((g) => !g.pass), [], `Voxel QA failed: ${JSON.stringify(voxQa.gates)}`);

  const voxGlb = await new GLTFExporter().parseAsync(voxStd.group, { binary: true, onlyVisible: true });
  const voxReloaded = await new GLTFLoader().parseAsync(voxGlb, '');
  assert.equal(countScene(voxReloaded.scene).tris, countScene(voxStd.group).tris);
  assert.equal(readGlbJson(voxGlb).materials.length, 2);
  const s2Ms = performance.now() - t2;

  // ---------------------------------------------------------------------------
  // 3. Scenario 3: Hybrid (Chibi + Hand-Painted + Toon Shading)
  //    Validates primary+2 modifiers, closed-socket facial pivots, native
  //    DataTexture + MeshToonMaterial gradientMap, animation, studio preview & GLB note.
  // ---------------------------------------------------------------------------
  const t3 = performance.now();
  function createBrushTexture(rng: () => number, size = 32): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    const base = new THREE.Color('#4f7cac');
    const warm = new THREE.Color('#70a288');
    const c = new THREE.Color();
    for (let y = 0; y < size; y++) {
      const grad = y / (size - 1);
      for (let x = 0; x < size; x++) {
        const stroke = 0.88 + 0.12 * Math.sin(x * 0.7 + rng() * 0.5) + 0.08 * grad;
        c.copy(base).lerp(warm, grad * 0.55).multiplyScalar(Math.min(1, stroke));
        // Stored as sRGB bytes per Three.js SRGBColorSpace convention
        const sr = Math.min(255, Math.round(Math.pow(c.r, 1 / 2.2) * 255));
        const sg = Math.min(255, Math.round(Math.pow(c.g, 1 / 2.2) * 255));
        const sb = Math.min(255, Math.round(Math.pow(c.b, 1 / 2.2) * 255));
        data.set([sr, sg, sb, 255], (y * size + x) * 4);
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  function createToonRamp(): THREE.DataTexture {
    // 3-step nearest gradient map (zero custom shaders)
    const ramp = new Uint8Array([
      85, 85, 85, 255,
      175, 175, 175, 255,
      255, 255, 255, 255,
    ]);
    const tex = new THREE.DataTexture(ramp, 3, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  const rng3 = createPRNG(11);
  const paintTex = createBrushTexture(rng3.fork('paint'));
  const gradientMap = createToonRamp();
  const toonPaintedMat = new THREE.MeshToonMaterial({ map: paintTex, gradientMap });
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#22d3ee'), toneMapped: false });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1e293b'), roughness: 0.85 });

  const chibiRoot = new THREE.Group();
  chibiRoot.name = 'chibi_hybrid_root';
  const torso = new THREE.Group(); torso.name = 'torso'; torso.position.set(0, 0.25, 0);
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.36), toonPaintedMat);
  torsoMesh.name = 'torso_mesh';
  torso.add(torsoMesh);
  chibiRoot.add(torso);

  // Oversized 1:1 chibi head + separated Balance/Quality facial pivots (eyelids, brows, jaw)
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.52, 0);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.52), toonPaintedMat);
  headMesh.name = 'head_mesh';
  head.add(headMesh);

  for (const [side, sx] of [['L', 0.14], ['R', -0.14]] as const) {
    const eye = new THREE.Group(); eye.name = `eye${side}`; eye.position.set(sx, 0.04, 0.27);
    const eyeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.04), eyeMat);
    eyeMesh.name = `eye${side}_mesh`; eye.add(eyeMesh);

    const lid = new THREE.Group(); lid.name = `eyelid${side}`; lid.position.set(sx, 0.11, 0.28);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), darkMat);
    lidMesh.name = `eyelid${side}_mesh`; lid.add(lidMesh);

    const brow = new THREE.Group(); brow.name = `brow${side}`; brow.position.set(sx, 0.16, 0.28);
    const browMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.04), darkMat);
    browMesh.name = `brow${side}_mesh`; brow.add(browMesh);
    head.add(eye, lid, brow);
  }
  const jaw = new THREE.Group(); jaw.name = 'lowerJawPivot'; jaw.position.set(0, -0.14, 0.12);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.2), darkMat);
  jawMesh.name = 'jaw_mesh'; jaw.add(jawMesh);
  head.add(jaw);
  torso.add(head);

  const qOpen = new THREE.Quaternion().toArray();
  const qBlink = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.45).toArray();
  const qJaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.32).toArray();
  const qNod = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12).toArray();
  const idleClip = new THREE.AnimationClip('Idle', 1.6, [
    new THREE.QuaternionKeyframeTrack('eyelidL.quaternion', [0, 0.4, 0.8, 1.6], [...qOpen, ...qBlink, ...qOpen, ...qOpen]),
    new THREE.QuaternionKeyframeTrack('eyelidR.quaternion', [0, 0.4, 0.8, 1.6], [...qOpen, ...qBlink, ...qOpen, ...qOpen]),
    new THREE.QuaternionKeyframeTrack('lowerJawPivot.quaternion', [0, 0.8, 1.2, 1.6], [...qOpen, ...qOpen, ...qJaw, ...qOpen]),
    new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.8, 1.6], [...qOpen, ...qNod, ...qOpen]),
  ]);

  const hybridQa = qaGates(extractObjectParts(chibiRoot, THREE), { grounding: true });
  assert.deepEqual(hybridQa.gates.filter((g) => !g.pass), [], `Hybrid QA failed: ${JSON.stringify(hybridQa.gates)}`);

  // Verify live clip motion across facial pivots before export
  const motionBefore = clipMotion(THREE, chibiRoot, [idleClip]);
  assert.equal(motionBefore[0].moving.length, 4, 'all 4 chibi facial/head pivots move cleanly');

  const ab = await new GLTFExporter().parseAsync(chibiRoot, { binary: true, animations: [idleClip], onlyVisible: true });
  const reloaded = await new GLTFLoader().parseAsync(ab, '');
  const hybridGlb = { ab, reloaded };

  const glbJson = readGlbJson(hybridGlb.ab);
  assert.ok(Array.isArray(glbJson.images) && glbJson.images.length >= 1, 'hand-painted texture exported into GLB');
  // Confirm documented GLTF limitation: MeshToonMaterial exports as glTF pbrMetallicRoughness (gradientMap is preview-only)
  assert.ok(glbJson.materials.some((m: any) => m.pbrMetallicRoughness?.baseColorTexture !== undefined));
  assert.equal(countScene(hybridGlb.reloaded.scene).tris, countScene(chibiRoot).tris);
  assert.equal(hybridGlb.reloaded.animations.length, 1);
  const motionAfter = clipMotion(THREE, hybridGlb.reloaded.scene, hybridGlb.reloaded.animations);
  assert.ok(motionAfter[0].moving.some((m) => m.node === 'eyelidL'), 'eyelid blink preserved after GLB reload');

  // Verify pack-studio pipeline builds an interactive preview cleanly on Scenario 3
  const hybridModulePath = join(tmpOut, 'chibi-hybrid.ts');
  const hybridHtmlPath = join(tmpOut, 'chibi-hybrid.html');
  writeFileSync(hybridModulePath, `
    export function buildHybrid(_p: unknown, THREE: any) {
      const root = new THREE.Group();
      root.name = 'chibi_preview';
      const ramp = new THREE.DataTexture(new Uint8Array([90,90,90,255, 180,180,180,255, 255,255,255,255]), 3, 1, THREE.RGBAFormat);
      ramp.minFilter = THREE.NearestFilter; ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshToonMaterial({ color: '#4f7cac', gradientMap: ramp }));
      m.position.y = 0.25; m.name = 'head'; root.add(m);
      return { root, animations: [new THREE.AnimationClip('Idle', 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0,0,0,1, 0,0.2,0,0.98, 0,0,0,1])])] };
    }
  `);
  const packRun = spawnTsx(join(here, 'pack-studio.ts'), [
    '--module', hybridModulePath,
    '--export', 'buildHybrid',
    '--initial-clip', 'Idle',
    '--out', hybridHtmlPath,
  ], { cwd: rootDir });
  assert.equal(packRun.status, 0, `${packRun.stdout}${packRun.stderr}`);
  const packRes = parseResult(packRun.stdout)!;
  assert.equal(packRes.ok, true);
  assert.ok(readFileSync(hybridHtmlPath, 'utf8').includes('buildHybrid'));
  const s3Ms = performance.now() - t3;

  console.log(
    `ART-STYLES BENCHMARK: styles=${EXPECTED_STYLES.length} | depsAdded=0 | `
    + `harnessSkillTokens=${harnessSkillTokens}(baseline:4656,+${harnessSkillTokens - 4656}) | `
    + `webSkillTokens=${webSkillTokens}(baseline:3140,+${webSkillTokens - 3140}) | `
    + `modelingGuideBytes=${modelingGuideBytes}(baseline:103096,+${modelingGuideBytes - 103096}) | `
    + `S1_LowPoly=${s1Ms.toFixed(1)}ms(${lpBefore.tris}tris) | `
    + `S2_Voxel=${s2Ms.toFixed(1)}ms(std=${stdBodyTris},greedy=${greedyBodyTris},saved=${(greedyRatio * 100).toFixed(1)}%) | `
    + `S3_Hybrid=${s3Ms.toFixed(1)}ms(4movingPivots,GLB=${(hybridGlb.ab.byteLength / 1024).toFixed(1)}KB)`,
  );
  console.log('ART-STYLES OK');
  });
} finally {
  rmSync(tmpOut, { recursive: true, force: true });
}
