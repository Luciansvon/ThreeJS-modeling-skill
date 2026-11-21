// scripts/export-rigged-glb.ts: official Three.js GLB export + disk round-trip verifier for assets with vertex colors, materials, skins/bones, or AnimationClips.
// Usage: npx tsx scripts/export-rigged-glb.ts --module ./myAsset.ts --export buildAsset --out asset.glb [--params '{"seed":1}']
// The exported function receives `(params, THREE)` and may return a THREE.Object3D (with optional root.userData.animations) or { root: THREE.Object3D, animations?: THREE.AnimationClip[] }.
// Last stdout line is @@RESULT {json}. Exit 0 = ok, 2 = verification gate failed, 1 = usage/load error.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emit, type Gate } from './result';

// Minimal Node FileReader polyfill needed by Three.js GLTFExporter in headless Node environments
if (typeof (globalThis as Record<string, unknown>).FileReader === 'undefined') {
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); }).catch((e) => this.onerror?.(e));
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        this.onloadend?.();
      }).catch((e) => this.onerror?.(e));
    }
  }
  (globalThis as Record<string, unknown>).FileReader = NodeFileReader;
}

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'export-rigged-glb', ok: false, error: msg }, 1)); };

const modFile = opt('module'), outFile = opt('out');
if (!modFile || !outFile) fail('usage: tsx scripts/export-rigged-glb.ts --module ./myAsset.ts [--export name] [--params json] --out asset.glb');
let params: Record<string, unknown> = {};
try { if (opt('params')) params = JSON.parse(opt('params')!); } catch (e) { fail(`--params is not valid JSON: ${(e as Error).message}`); }

let THREE: typeof import('three');
let GLTFExporter: any;
let GLTFLoader: any;
try {
  THREE = await import('three');
  GLTFExporter = (await import('three/addons/exporters/GLTFExporter.js')).GLTFExporter;
  GLTFLoader = (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader;
} catch (e) {
  fail(`three / addons not available: ${(e as Error).message}`);
}

let built: any;
try {
  const mod = (await import(pathToFileURL(resolve(modFile)).href)) as Record<string, unknown>;
  const fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
  const name = opt('export') ?? (fns.length === 1 ? fns[0] : mod.default ? 'default' : undefined);
  if (!name || typeof mod[name] !== 'function') fail(`pick the builder with --export <name>. Functions exported by ${modFile}: ${fns.join(', ') || 'none'}`);
  built = await (mod[name] as (p: Record<string, unknown>, t: typeof import('three')) => unknown)(params, THREE);
} catch (e) {
  fail(`cannot build asset: ${(e as Error).message}`);
}

const root = built?.root?.isObject3D ? built.root : built;
if (!root?.isObject3D) fail('builder must return a THREE.Object3D or { root: THREE.Object3D, animations?: AnimationClip[] }');
const animations = Array.isArray(built?.animations) ? built.animations : (Array.isArray(root.userData?.animations) ? root.userData.animations : []);

function countScene(obj: any) {
  let tris = 0, meshes = 0, skins = 0, bones = 0, vertexColorMeshes = 0;
  obj.traverse((o: any) => {
    if (o.isBone) bones++;
    if (o.isSkinnedMesh) skins++;
    if (o.isMesh && o.geometry?.attributes?.position) {
      meshes++;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (g.attributes.color) vertexColorMeshes++;
    }
  });
  return { tris: Math.round(tris), meshes, skins, bones, vertexColorMeshes };
}

const before = countScene(root);
const exporter = new GLTFExporter();
const buf: ArrayBuffer = await exporter.parseAsync(root, { binary: true, animations, onlyVisible: true });
const outPath = resolve(outFile);
writeFileSync(outPath, Buffer.from(buf));

const diskBytes = readFileSync(outPath);
const diskAb = diskBytes.buffer.slice(diskBytes.byteOffset, diskBytes.byteOffset + diskBytes.byteLength);
const loader = new GLTFLoader();
const reloaded = await loader.parseAsync(diskAb, '');
const after = countScene(reloaded.scene);
const inClips = animations.map((c: any) => c.name);
const outClips = (reloaded.animations ?? []).map((c: any) => c.name);

const gates: Gate[] = [
  { gate: 'RG1 written', value: `${diskBytes.byteLength} bytes (${(diskBytes.byteLength / 1024).toFixed(1)} KB)`, pass: diskBytes.byteLength > 12, hint: 'GLTFExporter produced an empty buffer' },
  { gate: 'RG2 triangles', value: `${before.tris} in -> ${after.tris} out`, pass: before.tris > 0 && before.tris === after.tris, hint: 'triangle count changed across GLTFExporter -> GLTFLoader round-trip' },
  { gate: 'RG3 meshes', value: `${before.meshes} in -> ${after.meshes} out (${after.vertexColorMeshes} vertex-colored)`, pass: before.meshes === after.meshes && before.vertexColorMeshes === after.vertexColorMeshes, hint: 'mesh or vertex color attributes lost on export' },
  { gate: 'RG4 clips', value: `${inClips.length} in -> ${outClips.length} out [${outClips.join(', ')}]`, pass: inClips.length === outClips.length && inClips.every((n: string, i: number) => outClips[i] === n), hint: 'animation clips missing or renamed during export' },
];
if (before.skins > 0 || before.bones > 0) {
  gates.push({ gate: 'RG5 skin/bones', value: `skins ${before.skins}->${after.skins}, bones ${before.bones}->${after.bones}`, pass: before.skins === after.skins && before.bones === after.bones, hint: 'SkinnedMesh or Bone count changed across round-trip' });
}

const unverified = ['Visual appearance, lighting, and target-engine import (e.g. Blender / Roblox Studio) are not tested by headless GLTFLoader parse'];
console.log(gates.map((g) => `${g.pass ? 'PASS' : 'FAIL'}  ${g.gate}: ${g.value}${g.pass ? '' : '  -> ' + g.hint}`).join('\n'));
console.log(`wrote ${outPath}`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const ok = gates.every((g) => g.pass);
process.exit(emit({ tool: 'export-rigged-glb', ok, out: outPath, bytes: diskBytes.byteLength, before, after, clips: outClips, gates, unverified }, ok ? 0 : 2));
