// scripts/export-rigged-glb.ts: official Three.js GLB export + disk round-trip verifier for assets with vertex colors, materials, skins/bones, or AnimationClips.
// Usage: npx tsx scripts/export-rigged-glb.ts --module ./myAsset.ts --export buildAsset --out asset.glb [--params '{"seed":1}'] [--static-clips a,b] [--open sheet1,sheet2|all]
// The exported function receives `(params, THREE)` and may return a THREE.Object3D (with optional root.userData.animations) or { root: THREE.Object3D, animations?: THREE.AnimationClip[] }.
// Last stdout line is @@RESULT {json}. Exit 0 = ok, 2 = verification gate failed, 1 = usage/load error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { countScene, extractObjectParts, parseGlbHeader, sanitizeUserDataForGltf, selectBuilder, unpackAsset } from './asset-builder';
import { clipMotion, type ClipMotion, type NodeMotion } from './clip-motion';
import { qaGates } from './qacheck';
import { emit, registerThreeHook, type Gate } from './result';

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
if (!modFile || !outFile) fail('usage: tsx scripts/export-rigged-glb.ts --module ./myAsset.ts [--export name] [--params json] [--static-clips a,b] [--open a,b|all] [--max-json-kb N] --out asset.glb');
const staticClipsList = (opt('static-clips') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const staticClips = new Set(staticClipsList);
const openList = opt('open')?.split(',').map((s) => s.trim()).filter(Boolean);
const maxJsonKb = opt('max-json-kb') !== undefined ? Number(opt('max-json-kb')) : 512;
if (!Number.isFinite(maxJsonKb) || maxJsonKb <= 0) fail('--max-json-kb needs a positive number');
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

const hooks = registerThreeHook();

let asset: ReturnType<typeof unpackAsset>;
try {
  const mod = (await import(pathToFileURL(resolve(modFile)).href)) as Record<string, unknown>;
  const { build } = selectBuilder(mod, opt('export'), modFile);
  asset = unpackAsset(await build(params, THREE));
} catch (e) {
  fail(`cannot build asset: ${(e as Error).message}`);
} finally {
  hooks?.deregister();
}

const { root, animations } = asset;
const before = countScene(root);
const outPath = resolve(outFile);
let diskBytes: Buffer, reloaded: any;
try {
  const restoreUserData = sanitizeUserDataForGltf(root);
  let buf: ArrayBuffer;
  try {
    buf = await new GLTFExporter().parseAsync(root, { binary: true, animations, onlyVisible: true });
  } finally {
    restoreUserData();
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(buf));
  diskBytes = readFileSync(outPath);
  const diskAb = diskBytes.buffer.slice(diskBytes.byteOffset, diskBytes.byteOffset + diskBytes.byteLength);
  reloaded = await new GLTFLoader().parseAsync(diskAb, '');
} catch (e) {
  fail(`cannot write or re-open ${outPath}: ${(e as Error).message}`);
}
const after = countScene(reloaded.scene);
const header = parseGlbHeader(diskBytes);
const jsonLimitBytes = maxJsonKb * 1024;
const inClips = animations.map((c: any) => c.name);
const outClips = (reloaded.animations ?? []).map((c: any) => c.name);

const gates: Gate[] = [
  {
    gate: 'RG1 written',
    value: `${diskBytes.byteLength} bytes (${(diskBytes.byteLength / 1024).toFixed(1)} KB; JSON ${(header.jsonBytes / 1024).toFixed(1)} KB)`,
    pass: diskBytes.byteLength > 12 && header.jsonBytes > 0 && header.jsonBytes <= jsonLimitBytes,
    hint: header.jsonBytes > jsonLimitBytes
      ? `glTF JSON chunk ${(header.jsonBytes / 1024).toFixed(1)} KB exceeds ${maxJsonKb} KB (keep Three.js objects/bones out of userData)`
      : 'GLTFExporter produced an empty or malformed buffer',
  },
  { gate: 'RG2 triangles', value: `${before.tris} in -> ${after.tris} out`, pass: before.tris > 0 && before.tris === after.tris, hint: 'triangle count changed across GLTFExporter -> GLTFLoader round-trip' },
  { gate: 'RG3 meshes', value: `${before.meshes} in -> ${after.meshes} out (${after.vertexColorMeshes} vertex-colored)`, pass: before.meshes === after.meshes && before.vertexColorMeshes === after.vertexColorMeshes, hint: 'mesh or vertex color attributes lost on export' },
  { gate: 'RG4 clips', value: `${inClips.length} in -> ${outClips.length} out [${outClips.join(', ')}]`, pass: inClips.length === outClips.length && inClips.every((n: string, i: number) => outClips[i] === n), hint: 'animation clips missing or renamed during export' },
];
if (before.skins > 0 || before.bones > 0) {
  gates.push({ gate: 'RG5 skin/bones', value: `skins ${before.skins}->${after.skins}, bones ${before.bones}->${after.bones}`, pass: before.skins === after.skins && before.bones === after.bones, hint: 'SkinnedMesh or Bone count changed across round-trip' });
}

const fmtDelta = (m: NodeMotion) => {
  const unit = m.property === 'quaternion' ? ' rad' : m.property === 'position' ? ' m' : '';
  return `${m.change.toFixed(3)}${unit} @${m.at.toFixed(2)}s`;
};

let sourceMotion: ClipMotion[] = [];
let reloadedMotion: ClipMotion[] = [];
if (animations.length > 0) {
  sourceMotion = clipMotion(THREE, root, animations);
  reloadedMotion = clipMotion(THREE, reloaded.scene, reloaded.animations ?? []);

  const bindingIssues: string[] = [];
  const boundProps = new Set<string>();
  let totalInTracks = 0;
  let totalOutTracks = 0;
  for (let i = 0; i < sourceMotion.length; i++) {
    const src = sourceMotion[i];
    const rel = reloadedMotion[i]?.clip === src.clip ? reloadedMotion[i] : reloadedMotion.find((r) => r.clip === src.clip);
    totalInTracks += src.tracks;
    totalOutTracks += rel?.tracks ?? 0;
    for (const u of src.unsupported) bindingIssues.push(`${src.clip}: ${u}; GLTFExporter drops non-glTF tracks — bake rotation to <node>.quaternion`);
    for (const u of src.unbound) bindingIssues.push(`${src.clip} [source]: ${u}`);
    if (rel) {
      for (const u of rel.unsupported) bindingIssues.push(`${rel.clip} [reloaded]: ${u}`);
      for (const u of rel.unbound) bindingIssues.push(`${rel.clip} [reloaded]: ${u}`);
    }
    const hasMergedMorphs = animations[i].tracks.some((t: any) => t.name.includes('morphTargetInfluences['));
    if (!rel || (!hasMergedMorphs && rel.tracks < src.tracks)) {
      bindingIssues.push(`${src.clip}: ${src.tracks} tracks in -> ${rel?.tracks ?? 0} out`);
    }
    for (const m of src.moving) boundProps.add(m.property);
  }
  const propSummary = boundProps.size ? [...boundProps].join('/') : 'position/quaternion/scale';
  gates.push({
    gate: 'RG6 track binding',
    value: bindingIssues.length ? bindingIssues.join('; ') : `${totalInTracks} in -> ${totalOutTracks} out track(s) bound to ${propSummary} before and after export`,
    pass: bindingIssues.length === 0,
    hint: 'bake rotations to unique <nodeName>.quaternion tracks (never .rotation/.rotation[x]) and ensure every target node resolves uniquely from root',
  });

  const motionIssues: string[] = [];
  const clipSummaries: string[] = [];
  for (let i = 0; i < sourceMotion.length; i++) {
    const src = sourceMotion[i];
    const rel = reloadedMotion[i]?.clip === src.clip ? reloadedMotion[i] : reloadedMotion.find((r) => r.clip === src.clip);
    if (staticClips.has(src.clip)) {
      const movedNote = !src.static || (rel && !rel.static) ? ' (moved despite --static-clips)' : '';
      clipSummaries.push(`${src.clip}: static-allowed${movedNote}`);
      continue;
    }
    if (src.static) {
      motionIssues.push(`${src.clip}: no pivot moves across ${src.times.length} samples before export`);
      continue;
    }
    if (!rel || rel.static) {
      motionIssues.push(`${src.clip}: no pivot moves across ${rel?.times.length ?? 0} samples in the reloaded GLB`);
      continue;
    }
    const relKeys = new Set(rel.moving.map((m) => `${m.node}|${m.property}`));
    for (const m of src.moving) {
      if (!relKeys.has(`${m.node}|${m.property}`)) {
        motionIssues.push(`${src.clip}: ${m.node}.${m.property} moved before export (${fmtDelta(m)}) but stayed static in reloaded GLB`);
      }
    }
    clipSummaries.push(`${src.clip}: ${rel.moving.length} pivot(s) move (max ${fmtDelta(rel.moving[0])})`);
  }
  gates.push({
    gate: 'RG7 clip motion',
    value: motionIssues.length ? motionIssues.join('; ') : clipSummaries.join('; '),
    pass: motionIssues.length === 0,
    hint: 'ensure every non-static clip moves at least one bound pivot across timestamps before and after export, or pass intentionally static clip names via --static-clips',
  });
}

try {
  const reloadedParts = extractObjectParts(reloaded.scene, THREE);
  const topo = qaGates(reloadedParts, { open: openList, grounding: false });
  const topoGates = topo.gates.filter((g) => ['Q1 finite', 'Q2 degenerate', 'Q3 winding', 'Q4 closed'].includes(g.gate));
  const topoFails = topoGates.filter((g) => !g.pass);
  gates.push({
    gate: 'RG8 topology',
    value: topoFails.length
      ? topoFails.map((g) => `${g.gate}: ${g.value}`).join(' | ')
      : `${Object.keys(reloadedParts).length} mesh(es) clean (Q1–Q4 finite, valid winding, zero open/duplicated edges${openList?.length ? `; open: ${openList.join(',')}` : ''})`,
    pass: topoFails.length === 0,
    hint: topoFails[0]?.hint ?? 'keep exported meshes watertight without interior cuts or overlapping coplanar voxel segments (pass --open <names> for thin sheets)',
  });
} catch (e) {
  gates.push({
    gate: 'RG8 topology',
    value: (e as Error).message,
    pass: false,
    hint: 'exported GLB contained no valid mesh geometry',
  });
}

const reloadedSkinned: any[] = [];
reloaded.scene.traverseVisible((obj: any) => {
  if (obj.isSkinnedMesh && obj.geometry?.attributes?.position && obj.geometry?.attributes?.skinIndex && obj.geometry?.attributes?.skinWeight) {
    reloadedSkinned.push(obj);
  }
});
if (reloadedSkinned.length > 0 && (reloaded.animations?.length ?? 0) > 0) {
  reloaded.scene.updateMatrixWorld(true);
  const restDiag = Math.max(0.001, new THREE.Box3().setFromObject(reloaded.scene, true).getSize(new THREE.Vector3()).length());
  const maxTearTol = Math.max(0.015, restDiag * 0.012);
  const rootBones = new Set<string>();
  reloaded.scene.traverse((obj: any) => {
    if (obj.isBone && !obj.parent?.isBone && obj.name) rootBones.add(obj.name);
  });

  type SeamRep = { meshIdx: number; vi: number; sigKey: string; nonRootBones: string[] };
  const buckets = new Map<string, SeamRep[]>();
  const bucketSeen = new Map<string, Set<string>>();
  const tmpV = new THREE.Vector3();
  for (let meshIdx = 0; meshIdx < reloadedSkinned.length; meshIdx++) {
    const mesh = reloadedSkinned[meshIdx];
    const pos = mesh.geometry.getAttribute('position');
    const si = mesh.geometry.getAttribute('skinIndex');
    const sw = mesh.geometry.getAttribute('skinWeight');
    const skelBones: any[] = mesh.skeleton?.bones ?? [];
    for (let vi = 0; vi < pos.count; vi++) {
      const merged = new Map<string, number>();
      const bIdx = [si.getX(vi), si.getY(vi), si.getZ(vi), si.getW(vi)];
      const bWt = [sw.getX(vi), sw.getY(vi), sw.getZ(vi), sw.getW(vi)];
      for (let k = 0; k < 4; k++) {
        const w = Math.round(bWt[k] * 1000);
        if (w <= 0) continue;
        const bName = skelBones[bIdx[k]]?.name ?? `#${bIdx[k]}`;
        merged.set(bName, (merged.get(bName) ?? 0) + w);
      }
      const sorted = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const sigKey = sorted.map(([b, w]) => `${b}:${w}`).join(',');
      tmpV.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      const rk = `${Math.round(tmpV.x * 1000)},${Math.round(tmpV.y * 1000)},${Math.round(tmpV.z * 1000)}`;
      let seen = bucketSeen.get(rk);
      if (!seen) bucketSeen.set(rk, (seen = new Set()));
      const dedupKey = `${meshIdx}|${sigKey}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      let list = buckets.get(rk);
      if (!list) buckets.set(rk, (list = []));
      list.push({ meshIdx, vi, sigKey, nonRootBones: sorted.map(([b]) => b).filter((b) => !rootBones.has(b)) });
    }
  }

  const seamPairs: Array<{ a: SeamRep; b: SeamRep }> = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.meshIdx === b.meshIdx) {
          if (a.sigKey !== b.sigKey) seamPairs.push({ a, b });
        } else if (a.nonRootBones.some((bn) => b.nonRootBones.includes(bn))) {
          seamPairs.push({ a, b });
        }
      }
    }
  }

  let worstDist = 0;
  let worstInfo = '';
  if (seamPairs.length > 0) {
    const mixer = new THREE.AnimationMixer(reloaded.scene);
    const vA = new THREE.Vector3(), vB = new THREE.Vector3();
    for (const clip of reloaded.animations) {
      const dur = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
      const times = new Set<number>([0, dur * 0.25, dur * 0.5, dur * 0.75, dur]);
      let extraKeys = 0;
      for (const tr of clip.tracks) {
        if (extraKeys >= 3) break;
        for (let i = 0; i < tr.times.length && extraKeys < 3; i++) {
          const t = tr.times[i];
          if (t > 0 && t < dur) { times.add(t); extraKeys++; }
        }
      }
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      for (const t of [...times].sort((a, b) => a - b)) {
        mixer.setTime(t);
        reloaded.scene.updateMatrixWorld(true);
        for (const { a, b } of seamPairs) {
          const meshA = reloadedSkinned[a.meshIdx], meshB = reloadedSkinned[b.meshIdx];
          meshA.getVertexPosition(a.vi, vA).applyMatrix4(meshA.matrixWorld);
          meshB.getVertexPosition(b.vi, vB).applyMatrix4(meshB.matrixWorld);
          const d = vA.distanceTo(vB);
          if (d > worstDist) {
            worstDist = d;
            worstInfo = `${clip.name}@${t.toFixed(2)}s (${meshA.name || 'skin'}/${meshB.name || 'skin'})`;
          }
        }
      }
      action.stop();
    }
  }
  const rg9Pass = worstDist <= maxTearTol;
  gates.push({
    gate: 'RG9 posed skin integrity',
    value: seamPairs.length === 0
      ? `0 conflicting seam weights across ${reloadedSkinned.length} SkinnedMesh(es)`
      : rg9Pass
        ? `max seam gap ${worstDist.toFixed(4)}m <= ${maxTearTol.toFixed(4)}m across ${seamPairs.length} pair(s)`
        : `skin tear ${worstDist.toFixed(4)}m > ${maxTearTol.toFixed(4)}m at ${worstInfo}`,
    pass: rg9Pass,
    hint: 'use shared world-corner skin weights (worldVertexT or attachWorldSkinWeights) and unify multi-part skinned geometry per material so posed bends never tear apart',
  });
}

const unverified = ['Visual appearance, lighting, and target-engine import (e.g. Blender / Roblox Studio) are not tested by headless GLTFLoader parse'];
console.log(gates.map((g) => `${g.pass ? 'PASS' : 'FAIL'}  ${g.gate}: ${g.value}${g.pass ? '' : '  -> ' + g.hint}`).join('\n'));
for (const [label, list] of [['source', sourceMotion], ['reloaded', reloadedMotion]] as const) {
  for (const cm of list) {
    if (!cm.moving.length) {
      console.log(`MOTION [${label}] ${cm.clip}: static (0 moving pivots across ${cm.times.length} samples)`);
    } else {
      for (const m of cm.moving.slice(0, 5)) {
        console.log(`MOTION [${label}] ${cm.clip}: ${m.node}.${m.property} ${fmtDelta(m)} (rest delta ${m.restChange.toFixed(3)})`);
      }
    }
    if (label === 'reloaded' && cm.tPoseNotice) console.log(`NOTE ${cm.clip}: ${cm.tPoseNotice}`);
  }
}
console.log(`wrote ${outPath}`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const ok = gates.every((g) => g.pass);
process.exit(emit({
  tool: 'export-rigged-glb', ok, out: outPath, bytes: diskBytes.byteLength, jsonBytes: header.jsonBytes, before, after, clips: outClips,
  staticClips: staticClipsList,
  ...(animations.length ? { motion: { source: sourceMotion, reloaded: reloadedMotion } } : {}),
  gates, unverified,
}, ok ? 0 : 2));
