# Tool and fixture source

Contents: package.json · scripts/asset-builder.ts · scripts/budget.ts · scripts/capture-studio.ts · scripts/clip-motion.ts · scripts/color-qc.ts · scripts/export-glb.ts · scripts/export-rigged-glb.ts · scripts/fixtures/crate.qa.ts · scripts/fixtures/dragon.qa.ts · scripts/glb.ts · scripts/mesh-stats.ts · scripts/pack-studio.ts · scripts/package.json · scripts/png.ts · scripts/qa-asset.ts · scripts/qacheck.ts · scripts/ref-compare.ts · scripts/ref-intake.ts · scripts/refcheck.ts · scripts/result.ts · scripts/review.ts · scripts/rig-check.ts · scripts/rigcheck.ts · scripts/sharp.ts · scripts/studio/framing.ts · scripts/studio/index.html · scripts/studio/runtime.ts · scripts/studio/types.ts · tools/check.ts · tools/package.json · tools/run-tests.ts · tools/trigger-check.ts · tools/validate-skills.ts · assets/fast-preview.html

Generated from the canonical harness files. Search by original file path and use the [web runtime guide](runtime.md) to choose which commands or helpers to use in this session.

## package.json

~~~json source-excerpt
{
  "name": "threejs-asset-generator",
  "version": "4.5.0",
  "private": true,
  "type": "module",
  "description": "Style-adaptive procedural Three.js assets, reference matching, geometry checks, animation, VFX previews and GLB export.",
  "scripts": {
    "check": "tsx tools/check.ts",
    "check:strict": "tsx tools/check.ts --strict",
    "validate": "tsx tools/validate-skills.ts",
    "pack:web": "tsx tools/pack-web.ts",
    "check:web": "tsx tools/pack-web.ts --check",
    "trigger": "tsx tools/trigger-check.ts",
    "test": "tsx tools/run-tests.ts",
    "qa": "tsx scripts/qa-asset.ts",
    "stats": "tsx scripts/mesh-stats.ts",
    "export-glb": "tsx scripts/export-glb.ts",
    "export-rigged-glb": "tsx scripts/export-rigged-glb.ts",
    "pack-studio": "tsx scripts/pack-studio.ts",
    "capture-studio": "tsx scripts/capture-studio.ts",
    "rig-check": "tsx scripts/rig-check.ts",
    "ref-intake": "tsx scripts/ref-intake.ts",
    "ref-compare": "tsx scripts/ref-compare.ts"
  },
  "devDependencies": {
    "esbuild": "^0.28.2",
    "tsx": "^4.19.0",
    "three": "^0.180.0"
  },
  "optionalDependencies": {
    "playwright-core": "^1.58.0",
    "sharp": "^0.33.5"
  }
}
~~~

## scripts/asset-builder.ts

~~~typescript source-excerpt
import type * as THREE from 'three';

export function selectBuilder(
  moduleExports: Record<string, unknown>,
  requestedName?: string,
  moduleLabel = 'module',
  option = '--export',
) {
  const functions = Object.keys(moduleExports).filter((key) => typeof moduleExports[key] === 'function');
  const name = requestedName ?? (functions.length === 1 ? functions[0] : moduleExports.default ? 'default' : undefined);
  if (!name || typeof moduleExports[name] !== 'function') {
    throw new Error(`pick the builder with ${option} <name>. Functions exported by ${moduleLabel}: ${functions.join(', ') || 'none'}`);
  }
  return {
    name,
    build: moduleExports[name] as (params: Record<string, unknown>, three: typeof THREE) => unknown,
  };
}

export function unpackAsset(built: unknown): { root: THREE.Object3D; animations: THREE.AnimationClip[] } {
  const result = built as { root?: THREE.Object3D; animations?: THREE.AnimationClip[] } | null | undefined;
  const wrapped = result?.root?.isObject3D === true;
  const root = wrapped ? result.root : (built as THREE.Object3D | undefined);
  if (!root?.isObject3D) {
    throw new Error('builder must return a THREE.Object3D or { root: THREE.Object3D, animations?: AnimationClip[] }');
  }
  const animations = Array.isArray(result?.animations) && (wrapped || result.animations.length > 0)
    ? result.animations
    : Array.isArray(root.userData?.animations) ? root.userData.animations : [];
  return { root, animations };
}

export function countScene(root: THREE.Object3D) {
  let tris = 0, meshes = 0, skins = 0, bones = 0, vertexColorMeshes = 0;
  root.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones++;
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) skins++;
    const { isMesh, geometry } = object as THREE.Mesh;
    if (!isMesh || !geometry?.attributes?.position) return;
    meshes++;
    tris += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    if (geometry.attributes.color) vertexColorMeshes++;
  });
  return { tris: Math.round(tris), meshes, skins, bones, vertexColorMeshes };
}

/** Extracts world-space triangle arrays per visible mesh (works for static, rigid, and SkinnedMesh rigs). */
export function extractObjectParts(
  root: THREE.Object3D,
  three: { Vector3: new () => THREE.Vector3 },
): Record<string, number[]> {
  root.updateMatrixWorld(true);
  const parts: Record<string, number[]> = {};
  const used = new Set<string>();
  const v = new three.Vector3();
  let meshIdx = 0;

  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    meshIdx++;
    const baseName = mesh.name || `mesh_${meshIdx}`;
    let name = baseName;
    for (let suffix = 2; used.has(name); suffix++) name = `${baseName}_${suffix}`;
    used.add(name);

    const pos = mesh.geometry.getAttribute('position');
    const idx = mesh.geometry.index;
    const count = idx ? idx.count : pos.count;
    const arr: number[] = [];
    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
    for (let i = 0; i < count; i++) {
      const vi = idx ? idx.getX(i) : i;
      if (isSkinned) (mesh as THREE.SkinnedMesh).getVertexPosition(vi, v).applyMatrix4(mesh.matrixWorld);
      else v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
      arr.push(v.x, v.y, v.z);
    }
    if (arr.length >= 9) parts[name] = arr;
  });

  if (!Object.keys(parts).length) throw new Error('asset contains no visible mesh triangles');
  return parts;
}
~~~

## scripts/budget.ts

~~~typescript source-excerpt
// scripts/budget.ts: pure budget numbers and gates over triangle arrays. No THREE, no DOM, no fs. Node-testable.
// Profiles are the table in references/budget.md (aligned with blender-skills). Each limit is the UPPER end of the range: above it a gate fails; between the lower end
// and the upper end the gate passes and says "above the target". A limit the table does not give (draw calls and GLB size outside mobile and web) is "not checked", never guessed.
// Gate ids: B1 triangles · B2 materials · B3 textures · B4 bones · B5 draw calls · B6 GLB size · L1 LOD triangle ratio · L2 LOD parts · L3 LOD bounds and pivot · L4 LOD determinism
import { qaGates, boundsOf, flatten, triCount, type Gate, type Parts, type QAOptions } from './qacheck';
export type { Gate };

export type Platform = 'mobile' | 'web' | 'vr' | 'desktop';
export type Kind = 'prop' | 'hero' | 'creature' | 'vehicle' | 'building';
export const KINDS: readonly Kind[] = ['prop', 'hero', 'creature', 'vehicle', 'building'];
type Range = { target: number; max: number };
export type Profile = {
  tris: Record<Kind, Range>;
  materials: Range;
  materialsByKind?: Partial<Record<Kind, Range>>;
  texture: number;
  bones: Range;
  drawCalls?: number;
  glbMiB?: Partial<Record<Kind, Range>>;
};

export const PROFILES: Record<Platform, Profile> = {
  mobile: {
    tris: {
      hero: { target: 5000, max: 15000 },
      creature: { target: 5000, max: 15000 },
      vehicle: { target: 3000, max: 12000 },
      building: { target: 2000, max: 10000 },
      prop: { target: 300, max: 3000 },
    },
    materials: { target: 1, max: 2 },
    materialsByKind: { vehicle: { target: 3, max: 5 }, building: { target: 2, max: 4 } },
    texture: 1024,
    bones: { target: 75, max: 75 },
    drawCalls: 50,
    glbMiB: { hero: { target: 2, max: 5 }, creature: { target: 2, max: 5 }, vehicle: { target: 2, max: 5 } },
  },
  web: {
    tris: {
      hero: { target: 10000, max: 30000 },
      creature: { target: 10000, max: 30000 },
      vehicle: { target: 6000, max: 25000 },
      building: { target: 4000, max: 20000 },
      prop: { target: 1000, max: 10000 },
    },
    materials: { target: 1, max: 2 },
    materialsByKind: { vehicle: { target: 3, max: 6 }, building: { target: 3, max: 6 } },
    texture: 2048,
    bones: { target: 100, max: 100 },
    drawCalls: 100,
    glbMiB: { hero: { target: 2, max: 5 }, creature: { target: 2, max: 5 }, vehicle: { target: 2, max: 5 } },
  },
  vr: {
    tris: {
      hero: { target: 10000, max: 40000 },
      creature: { target: 10000, max: 40000 },
      vehicle: { target: 8000, max: 30000 },
      building: { target: 5000, max: 25000 },
      prop: { target: 1000, max: 10000 },
    },
    materials: { target: 1, max: 3 },
    materialsByKind: { vehicle: { target: 3, max: 6 }, building: { target: 3, max: 6 } },
    texture: 2048,
    bones: { target: 100, max: 100 },
  },
  desktop: {
    tris: {
      hero: { target: 50000, max: 150000 },
      creature: { target: 50000, max: 150000 },
      vehicle: { target: 30000, max: 120000 },
      building: { target: 20000, max: 100000 },
      prop: { target: 5000, max: 50000 },
    },
    materials: { target: 2, max: 6 },
    materialsByKind: { vehicle: { target: 4, max: 8 }, building: { target: 4, max: 8 } },
    texture: 4096,
    bones: { target: 150, max: 300 },
  },
};

/** GPU memory of an RGBA8 texture in MiB. With a full mip chain (default) a 1024 texture is 5.33, 2048 is 21.33, 4096 is 85.33. */
export const textureMiB = (w: number, h = w, mips = true) => (w * h * 4 * (mips ? 4 / 3 : 1)) / 1048576;

/** Optional facts the triangle arrays cannot carry. Everything is optional; what is missing is reported as "not checked". */
export type Meta = { parts?: Record<string, { material?: string; bone?: string }>; textures?: Array<number | { name?: string; width: number; height?: number; mips?: boolean }>; bones?: number | string[] };
export type Stats = { triangles: number; gpuVertices: number; meshes: number; drawCalls: number; drawCallsExact: boolean; materials: number | null; bones: number | null; textures: { name: string; w: number; h: number; mib: number }[]; textureMiB: number };

export function assetStats(parts: Parts, meta: Meta = {}): Stats {
  const names = Object.keys(parts), tris = triCount(flatten(parts));
  const mp = meta.parts ?? {}, described = names.length > 0 && names.every((n) => mp[n]?.material !== undefined);
  const groups = new Set(names.map((n) => `${mp[n]?.bone ?? '-'}|${mp[n]?.material ?? '-'}|${mp[n]?.material === undefined && mp[n]?.bone === undefined ? n : ''}`));   // merged per (bone, material); an unlabelled part is its own group
  const bones = Array.isArray(meta.bones) ? meta.bones.length : typeof meta.bones === 'number' ? meta.bones : null;
  const textures = (meta.textures ?? []).map((t, i) => { const o = typeof t === 'number' ? { width: t } : t, w = o.width, h = o.height ?? o.width; return { name: (o as { name?: string }).name ?? `texture${i}`, w, h, mib: textureMiB(w, h, (o as { mips?: boolean }).mips ?? true) }; });
  return { triangles: tris, gpuVertices: tris * 3, meshes: names.length, drawCalls: groups.size, drawCallsExact: described, materials: described ? new Set(names.map((n) => mp[n].material)).size : null, bones, textures, textureMiB: textures.reduce((s, t) => s + t.mib, 0) };
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
// An omitted platform preserves the library's web default. The CLI passes null when no profile was requested.
export type BudgetOptions = { platform?: Platform | null; kind?: Kind; budget?: number; glbBytes?: number };

function triangleBudget({ platform = 'web', kind = 'prop', budget }: BudgetOptions): Range | undefined {
  if (budget !== undefined) {
    if (!Number.isFinite(budget) || budget <= 0) throw new Error('--budget needs a positive number');
    return { target: budget, max: budget };
  }
  return platform ? PROFILES[platform].tris[kind] : undefined;
}

/** Read the same target and triangle override in every CLI. */
export function parseBudgetArgs(args: readonly string[]) {
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const name = args[i + 1];
    if (!name || name.startsWith('--')) throw new Error(`${flag} needs a value`);
    return name;
  };
  const platform = (value('--profile') ?? null) as Platform | null;
  const kind = (value('--kind') ?? 'prop') as Kind;
  const rawBudget = value('--budget');
  if (platform && !Object.hasOwn(PROFILES, platform)) throw new Error(`--profile must be one of ${Object.keys(PROFILES).join(', ')}, got "${platform}"`);
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')}, got "${kind}"`);
  const options = { platform, kind, budget: rawBudget === undefined ? undefined : Number(rawBudget) };
  return { ...options, triangleLimit: triangleBudget(options)?.max ?? null };
}

/** Budget gates for one asset. `skipped` lists what could not be checked and why. */
export function budgetGates(s: Stats, o: BudgetOptions = {}): { gates: Gate[]; skipped: string[] } {
  const { platform = 'web', kind = 'prop' } = o;
  const gates: Gate[] = [], skipped: string[] = [];
  const range = (id: string, label: string, v: number, r: Range, hint: string, unit = '') => {
    const pass = v <= r.max;
    gates.push({ gate: id, value: `${label} ${fmt(v)}${unit} of max ${fmt(r.max)}${unit} (${platform}, target ${fmt(r.target)})${pass && v > r.target ? ', above the target' : ''}`, pass, hint });
  };
  const tri = triangleBudget(o);
  if (!tri) skipped.push('B1 triangle limit (set --profile or --budget)');
  else {
    const pass = s.triangles <= tri.max;
    const basis = o.budget !== undefined ? '(--budget)' : `(${platform}, ${kind}, target ${tri.target})${pass && s.triangles > tri.target ? ', above the target' : ''}`;
    gates.push({ gate: 'B1 triangles', value: `${s.triangles} triangles of max ${tri.max} ${basis}`, pass, hint: 'optimize less visible geometry first and compare the revised render at the intended viewing distance (references/budget.md)' });
  }

  if (!platform) {
    skipped.push('B2 to B6 platform limits (set --profile)');
    return { gates, skipped };
  }
  const P = PROFILES[platform];
  const matRange = P.materialsByKind?.[kind] ?? P.materials;
  if (s.materials === null) skipped.push('B2 materials (no --meta with a material per part)'); else range('B2 materials', `${s.materials} material(s)`, s.materials, matRange, 'merge parts that share a look into one material');
  if (!s.textures.length) skipped.push('B3 textures (no textures in --meta; an asset with vertex colours only has none)');
  else { const worst = s.textures.reduce((a, b) => (Math.max(b.w, b.h) > Math.max(a.w, a.h) ? b : a)), side = Math.max(worst.w, worst.h);
    gates.push({ gate: 'B3 textures', value: `largest ${worst.name} ${worst.w}x${worst.h} of max ${P.texture}, ${fmt(s.textureMiB)} MiB uncompressed GPU memory in total (${platform})`, pass: side <= P.texture, hint: 'shrink the atlas or split the cells; compression (KTX2) cuts memory, not the size limit' }); }
  if (s.bones === null) skipped.push('B4 bones (no bone count in --meta; fine for a static asset)'); else range('B4 bones', `${s.bones} bone(s)`, s.bones, P.bones, 'merge small moving parts into their parent bone');
  if (P.drawCalls === undefined) skipped.push(`B5 draw calls (the table gives no limit for ${platform})`);
  else gates.push({ gate: 'B5 draw calls', value: `${s.drawCallsExact ? '' : 'at most '}${s.drawCalls} of max ${P.drawCalls} (${platform}; ${s.drawCallsExact ? 'groups of bone x material' : 'upper bound: one per part, merging can only lower it'}); one asset is a share of the scene's calls`, pass: s.drawCalls <= P.drawCalls, hint: 'merge parts that share a bone and a material (PartBuilder.build does this per material)' });
  const glb = P.glbMiB?.[kind];
  if (o.glbBytes === undefined) skipped.push('B6 GLB size (no --glb file)'); else if (!glb) skipped.push(`B6 GLB size (the table gives a limit for hero models on mobile and web only, not ${kind} on ${platform})`);
  else range('B6 GLB size', 'GLB', o.glbBytes / 1048576, glb, 'optimise outside the skill (gltfpack, meshopt); a non-indexed flat-shaded export is large by design', ' MiB');
  return { gates, skipped };
}

/** The LOD rule from references/budget.md: about half the triangles per level, the same parts, the same bounds and pivot, same seed gives the same asset. */
export const LOD_TOL = { ratioLo: 0.35, ratioHi: 0.65, bounds: 0.05 };
export async function lodGates(build: (p: Record<string, unknown>) => unknown | Promise<unknown>, normalize: (o: unknown) => Parts, params: Record<string, unknown>, qa: QAOptions = {}): Promise<{ gates: Gate[]; levels: { detail: number; triangles: number; size: number[]; minY: number }[] }> {
  const gates: Gate[] = [], levels: { detail: number; triangles: number; size: number[]; minY: number }[] = [], built: Record<number, Parts> = {};
  for (const detail of [2, 1, 0]) {
    const parts = normalize(await build({ ...params, detail })), b = boundsOf(flatten(parts));
    built[detail] = parts; levels.push({ detail, triangles: triCount(flatten(parts)), size: b.size.map((v) => +v.toFixed(4)), minY: +b.min[1].toFixed(4) });
    const bad = qaGates(parts, { ...qa, grounding: false }).gates.filter((g) => !g.pass);
    if (bad.length) gates.push({ gate: `L0 QA at detail ${detail}`, value: bad.map((g) => `${g.gate}: ${g.value}`).join('; '), pass: false, hint: 'each level must pass geometry QA and any selected triangle and symmetry checks' });
  }
  const ratios = [1, 2].map((i) => levels[i].triangles / levels[i - 1].triangles);
  gates.push({ gate: 'L1 LOD triangle ratio', value: `${levels.map((l) => `detail ${l.detail}: ${l.triangles}`).join(' -> ')} (ratios ${ratios.map((r) => r.toFixed(2)).join(', ')}, wanted ${LOD_TOL.ratioLo} to ${LOD_TOL.ratioHi} each)`, pass: ratios.every((r) => r >= LOD_TOL.ratioLo && r <= LOD_TOL.ratioHi), hint: ratios.some((r) => r >= 1) ? 'the builder ignores `detail`: wire lodPick into segments and details (src/lod.ts)' : 'about half the triangles per level: adjust segments or the number of small details' });
  const names = (d: number) => JSON.stringify(Object.keys(built[d]).sort());
  gates.push({ gate: 'L2 LOD parts', value: names(2) === names(1) && names(1) === names(0) ? `same parts at every level: ${names(2)}` : `part names differ: ${[2, 1, 0].map((d) => `${d}=${names(d)}`).join(' ')}`, pass: names(2) === names(1) && names(1) === names(0), hint: 'a level may drop faces, not a part (a part is a material or a bone group); materials per level are not checked here' });
  const full = boundsOf(flatten(built[2])), long = Math.max(...full.size), worst = [1, 0].map((d) => { const b = boundsOf(flatten(built[d])); return Math.max(...b.size.map((v, k) => Math.abs(v - full.size[k])), Math.abs(b.min[1] - full.min[1]), Math.abs(b.center[0] - full.center[0]), Math.abs(b.center[2] - full.center[2])) / long; });
  gates.push({ gate: 'L3 LOD bounds and pivot', value: `largest deviation from full detail ${(Math.max(...worst) * 100).toFixed(1)}% of the longest side (limit ${LOD_TOL.bounds * 100}%): size, lowest Y, footprint centre`, pass: Math.max(...worst) <= LOD_TOL.bounds, hint: 'the silhouette and pivot must not move between levels: keep end points and extremes, thin only the middle' });
  let same = true; for (const detail of [2, 1, 0]) { const again = normalize(await build({ ...params, detail })); same &&= JSON.stringify(again) === JSON.stringify(built[detail]); }
  gates.push({ gate: 'L4 LOD determinism', value: same ? 'every level builds identically twice' : 'a level differs between two builds', pass: same, hint: 'Math.random, Date.now or a shared stream whose use depends on `detail`: fork one stream per feature' });
  return { gates, levels };
}
~~~

## scripts/capture-studio.ts

~~~typescript source-excerpt
import { constants } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Browser, Page } from 'playwright-core';
import { decodePngRgba, encodePngRgba } from './png';
import { emit } from './result';
import type { StudioBackground, StudioFrame, StudioFrameEvidence, StudioInfo, StudioView } from './studio/types';

const usage = 'Usage: tsx scripts/capture-studio.ts --studio ./index.html --out studio-contact-sheet.png [--locomotion Clip] [--motion-view view] [--motion-vfx] [--action Clip --peak seconds] [--action-view view] [--extra Clip@time[:view][:vfx]] [--extras a,b] [--background dark|light] [--vfx] [--browser executable]';
const tool = 'capture-studio';
const viewport = { width: 960, height: 600 };
const validViews = new Set<StudioView>(['34-front', '34-back', 'front', 'side', 'back', 'top']);
type Issue = { kind: string; message: string; source?: string };
type MissingTile = { label: string; reason: string; status: 'UNVERIFIED' | 'NOT_APPLICABLE' };
type Tile = { label: string; status: 'CAPTURED'; evidence: StudioFrameEvidence } | (MissingTile & { evidence: null });
type PlannedTile = { label: string; frame: StudioFrame } | MissingTile;
type PlanOptions = {
  locomotion?: string;
  action?: string;
  peak?: number;
  vfx?: boolean;
  motionVfx?: boolean;
  extraSpecs?: readonly string[];
  motionView: StudioView;
  actionView: StudioView;
  background?: StudioBackground;
};

async function installedBrowsers(explicit?: string) {
  const installDirs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA];
  const windows = installDirs.filter((path): path is string => Boolean(path)).flatMap((path) => [
    join(path, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(path, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]);
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : ['google-chrome', 'microsoft-edge', 'microsoft-edge-stable', 'chromium', 'chromium-browser'];
  const fromPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((path) => names.map((name) => join(path, name)));
  const candidates = explicit ? [resolve(explicit)] : [...new Set([
    ...(process.platform === 'win32' ? windows : process.platform === 'darwin' ? mac : []), ...fromPath,
  ])];
  const found = await Promise.all(candidates.map(async (path) => {
    try {
      await access(path, constants.X_OK);
      return (await stat(path)).isFile() ? path : null;
    } catch { return null; }
  }));
  return found.filter((path): path is string => path !== null);
}

function parseExtraTile(
  spec: string,
  info: StudioInfo,
  defaultVfx: boolean,
  background?: StudioBackground,
): PlannedTile {
  const parts = spec.split(':').map((s) => s.trim()).filter(Boolean);
  const head = parts[0] ?? '';
  const atIdx = head.lastIndexOf('@');
  const clipName = (atIdx >= 0 ? head.slice(0, atIdx) : head).trim();
  const timeStr = atIdx >= 0 ? head.slice(atIdx + 1).trim() : undefined;
  let extraView: StudioView = '34-front';
  let extraVfx = defaultVfx;
  for (const tag of parts.slice(1)) {
    if (validViews.has(tag as StudioView)) extraView = tag as StudioView;
    else if (tag.toLowerCase() === 'vfx') extraVfx = true;
    else if (tag.toLowerCase() === 'novfx' || tag.toLowerCase() === 'clean') extraVfx = false;
    else throw new Error(`Unknown modifier "${tag}" in --extra "${spec}"`);
  }
  const matches = info.clips.filter((clip) => clip.name === clipName);
  const clip = matches[0];
  if (matches.length !== 1 || clip.duration <= 0 || clip.tracks <= 0) {
    return { label: `Extra: ${clipName || spec}`, status: 'UNVERIFIED', reason: `No unique, positive-duration animated clip named “${clipName}”.` };
  }
  const t = timeStr !== undefined && timeStr !== '' ? Number(timeStr) : clip.duration / 2;
  if (!Number.isFinite(t) || t < 0 || t > clip.duration) {
    return { label: `Extra: ${clip.name}`, status: 'UNVERIFIED', reason: `Set --extra time for "${clip.name}" within 0–${clip.duration} seconds.` };
  }
  return {
    label: `${clip.name} (${t.toFixed(2)}s)`,
    frame: { view: extraView, clip: clip.name, time: t, vfx: extraVfx, ...(background ? { background } : {}) },
  };
}

function planTiles(info: StudioInfo, { locomotion, action, peak, vfx = false, motionVfx = false, extraSpecs = [], motionView, actionView, background }: PlanOptions): PlannedTile[] {
  const hasAnimations = info.clips.some((clip) => clip.duration > 0 && clip.tracks > 0);
  const findClip = (name: string | undefined) => {
    const matches = info.clips.filter((clip) => clip.name === name);
    const clip = matches[0];
    return matches.length === 1 && clip.duration > 0 && clip.tracks > 0 ? clip : undefined;
  };
  const walk = findClip(locomotion), attack = findClip(action);
  const notApplicable = (label: string): MissingTile => ({
    label, status: 'NOT_APPLICABLE', reason: 'This asset has no positive-duration animation clips.',
  });
  const unverified = (label: string, reason: string): MissingTile => ({ label, reason, status: 'UNVERIFIED' });
  const missing = (name: string | undefined, option: string) => name === undefined
    ? `Select an exact animated clip with ${option}.`
    : `No unique, positive-duration animated clip named “${name}”.`;
  const withBg = (frame: StudioFrame): StudioFrame => (background ? { ...frame, background } : frame);
  let midway: PlannedTile;
  if (walk) {
    midway = {
      label: 'Mid locomotion',
      frame: withBg({ view: motionView, clip: walk.name, time: walk.duration / 2, ...(motionVfx ? { vfx: true } : {}) }),
    };
  } else if (!hasAnimations && locomotion === undefined) midway = notApplicable('Mid locomotion');
  else midway = unverified('Mid locomotion', missing(locomotion, '--locomotion'));
  let actionTile: PlannedTile;
  if (!hasAnimations && action === undefined && peak === undefined && !vfx) actionTile = notApplicable('Action peak');
  else if (!attack) actionTile = unverified('Action peak', missing(action, '--action'));
  else if (peak === undefined || peak > attack.duration) {
    actionTile = unverified('Action peak', `Set --peak to the authored peak time within 0–${attack.duration} seconds.`);
  } else actionTile = { label: 'Action peak', frame: withBg({ view: actionView, clip: attack.name, time: peak, vfx }) };
  const base: PlannedTile[] = [
    { label: '3/4 front', frame: withBg({ view: '34-front' }) },
    { label: '3/4 back', frame: withBg({ view: '34-back' }) },
    midway, actionTile,
  ];
  for (const spec of extraSpecs) base.push(parseExtraTile(spec, info, vfx, background));
  return base;
}

async function placeholder(page: Page, tile: MissingTile) {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    body { margin: 0; background: #131b26; color: #f0f4f9; font: 20px system-ui, sans-serif; }
    main { margin: 130px 90px; }
    h1 { font-size: 32px; margin-bottom: 14px; }
    strong { color: #ffcd90; }
    p { color: #aebdd0; overflow-wrap: anywhere; }
    </style></head><body><main><h1></h1><strong></strong><p></p></main></body></html>`);
  await page.evaluate(({ label, reason, status }) => {
    document.querySelector('h1')!.textContent = label;
    document.querySelector('strong')!.textContent = status === 'NOT_APPLICABLE' ? 'NOT APPLICABLE' : status;
    document.querySelector('p')!.textContent = reason;
  }, tile);
  return page.screenshot({ animations: 'disabled', timeout: 8000 });
}

function contactSheet(tiles: Buffer[]) {
  const { width, height } = viewport;
  const cols = 2, rows = Math.max(1, Math.ceil(tiles.length / cols));
  const stride = width * cols * 4;
  const rgba = new Uint8Array(stride * height * rows);
  // Fill unused trailing cells (e.g., 5 tiles in a 2x3 grid) with dark studio matte #131b26
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 19; rgba[i + 1] = 27; rgba[i + 2] = 38; rgba[i + 3] = 255;
  }
  for (const [index, input] of tiles.entries()) {
    const tile = decodePngRgba(input);
    if (!tile || tile.width !== width || tile.height !== height) throw new Error(`Could not decode the ${width} × ${height} PNG for tile ${index + 1}`);
    const start = (index % cols) * width * 4 + Math.floor(index / cols) * height * stride;
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      rgba.set(tile.rgba.subarray(row, row + width * 4), start + y * stride);
    }
  }
  return encodePngRgba(rgba, width * cols, height * rows);
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

async function main() {
  const { values } = parseArgs({ options: {
    studio: { type: 'string' }, out: { type: 'string' }, locomotion: { type: 'string' },
    'motion-view': { type: 'string' }, 'motion-vfx': { type: 'boolean' },
    action: { type: 'string' }, 'action-view': { type: 'string' },
    extra: { type: 'string', multiple: true }, extras: { type: 'string' },
    peak: { type: 'string' }, background: { type: 'string' }, vfx: { type: 'boolean' }, browser: { type: 'string' },
  } });
  const extraSpecs = [
    ...(values.extra ?? []),
    ...(values.extras ? values.extras.split(',').map((s) => s.trim()).filter(Boolean) : []),
  ];
  if (!values.studio || !values.out) throw new Error(usage);
  if (extname(values.out).toLowerCase() !== '.png') throw new Error('--out must end in .png');
  const studio = resolve(values.studio), out = resolve(values.out);
  if (extname(studio).toLowerCase() !== '.html' || !(await stat(studio)).isFile()) throw new Error('--studio must point to a local HTML file');
  const peak = values.peak === undefined ? undefined : Number(values.peak);
  if (peak !== undefined && (!values.peak?.trim() || !Number.isFinite(peak) || peak < 0)) {
    throw new Error('--peak must be a finite non-negative time in seconds');
  }
  const motionView = (values['motion-view'] ?? '34-front') as StudioView;
  if (!validViews.has(motionView)) throw new Error('--motion-view must be one of 34-front, 34-back, front, side, back, top');
  const actionView = (values['action-view'] ?? '34-front') as StudioView;
  if (!validViews.has(actionView)) throw new Error('--action-view must be one of 34-front, 34-back, front, side, back, top');
  const background = values.background as StudioBackground | undefined;
  if (background !== undefined && background !== 'dark' && background !== 'light') {
    throw new Error('--background must be dark or light');
  }

  const errors: Issue[] = [], warnings: Issue[] = [], launchErrors: Issue[] = [];
  const unverified: string[] = [], tiles: Tile[] = [];
  let browserPath: string | undefined, info: StudioInfo | undefined, written: number | undefined;
  let status: 'PASS' | 'FAIL' | 'UNVERIFIED' = 'UNVERIFIED';
  function finish() {
    for (const error of errors) console.error(`${error.kind}: ${error.message}`);
    for (const reason of unverified) console.log(`UNVERIFIED: ${reason}`);
    const outRows = Math.max(1, Math.ceil(Math.max(1, tiles.length) / 2));
    if (written) console.log(`Wrote ${out} (${written} bytes, ${viewport.width * 2} × ${viewport.height * outRows})`);
    return emit({
      tool, ok: status === 'PASS', status, studio, out: written ? out : null, bytes: written ?? 0,
      browser: browserPath, motionView, actionView, background: background ?? null, info, tiles, errors, warnings, launchErrors, unverified,
    });
  }
  function addIssue(list: Issue[], issue: Issue) {
    if (!list.some(({ kind, message, source }) => kind === issue.kind && message === issue.message && source === issue.source)) list.push(issue);
  }

  const candidates = await installedBrowsers(values.browser);
  if (!candidates.length) {
    unverified.push(values.browser
      ? `Browser executable not found: ${resolve(values.browser)}`
      : 'No local Chrome, Edge, or Chromium executable found. Supply --browser <path>.');
    return finish();
  }
  let chromium: typeof import('playwright-core').chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch (error) {
    unverified.push(`Browser driver unavailable (${messageOf(error)}). Install optional dependencies to enable capture.`);
    return finish();
  }

  let browser: Browser | undefined;
  for (const executablePath of candidates) {
    try {
      browser = await chromium.launch({
        executablePath, headless: true, timeout: 12_000,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      browserPath = executablePath;
      break;
    } catch (error) { launchErrors.push({ kind: 'browser-launch', source: executablePath, message: messageOf(error) }); }
  }
  if (!browser) {
    unverified.push('The browser executable could not start. See launchErrors for details.');
    return finish();
  }

  let activePage: Page | undefined;
  async function capture(browser: Browser) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'en-US', serviceWorkers: 'block' });
    activePage = page;
    const studioUrl = pathToFileURL(studio).href;
    page.on('console', (event) => {
      if (event.type() !== 'error' && event.type() !== 'warning') return;
      const location = event.location();
      const source = location.url ? `${location.url}:${location.lineNumber + 1}` : undefined;
      const kind = event.type() === 'error' ? 'console-error' : 'console-warning';
      addIssue(event.type() === 'error' ? errors : warnings, { kind, source, message: event.text() });
    });
    page.on('pageerror', (error) => addIssue(errors, { kind: 'pageerror', message: error.message }));
    page.on('crash', () => addIssue(errors, { kind: 'crash', message: 'Studio page crashed' }));
    page.on('requestfailed', (request) => addIssue(errors, {
      kind: 'resource', source: request.url(), message: request.failure()?.errorText ?? 'Resource request failed',
    }));
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('file:') && url !== studioUrl) addIssue(errors, { kind: 'resource', source: url, message: 'Studio requested a separate local file' });
    });
    await page.route(/^https?:\/\//i, (route) => {
      addIssue(errors, { kind: 'network', source: route.request().url(), message: 'Studio requested an external resource during offline capture' });
      return route.abort();
    });
    await page.goto(studioUrl, { waitUntil: 'load', timeout: 18_000 });
    await page.waitForFunction(() => document.documentElement.dataset.studioState !== 'loading', null, { timeout: 18_000 });
    const boot = await page.evaluate(() => ({
      info: window.threejsStudio?.version === 1 ? window.threejsStudio.info?.() : undefined,
      diagnostics: window.threejsStudio?.getErrors?.() ?? [],
      state: document.documentElement.dataset.studioState,
    }));
    info = boot.info;
    for (const diagnostic of boot.diagnostics) addIssue(errors, diagnostic);
    if (boot.state !== 'ready' || !info) {
      if (boot.diagnostics.length && boot.diagnostics.every(({ kind }) => kind === 'webgl')) {
        unverified.push('WebGL did not initialize. No model frames were captured.');
      } else {
        if (!errors.length) addIssue(errors, { kind: 'studio', message: 'The page did not expose a ready Three.js Studio capture API' });
        status = 'FAIL';
      }
      return;
    }

    const plan = planTiles(info, {
      locomotion: values.locomotion, action: values.action, peak, vfx: values.vfx,
      motionVfx: values['motion-vfx'], extraSpecs, motionView, actionView, background,
    });
    const frames: Buffer[] = [];
    let fallback: Page | undefined;
    for (const tile of plan) {
      if ('reason' in tile) {
        if (tile.status === 'UNVERIFIED') unverified.push(`${tile.label}: ${tile.reason}`);
        tiles.push({ ...tile, evidence: null });
        fallback ??= await browser.newPage({ viewport, deviceScaleFactor: 1 });
        frames.push(await placeholder(fallback, tile));
        continue;
      }
      const evidence = await page.evaluate((frame) => {
        if (!window.threejsStudio?.setFrame) throw new Error('Studio capture API does not expose setFrame');
        const result = window.threejsStudio.setFrame(frame);
        if (document.documentElement.dataset.studioState !== 'ready') {
          throw new Error(window.threejsStudio.getErrors().map(({ message }) => message).join(', ') || 'Studio frame could not render');
        }
        return result;
      }, { ...tile.frame, label: tile.label });
      frames.push(await page.screenshot({ animations: 'disabled', timeout: 8000 }));
      tiles.push({ label: tile.label, status: 'CAPTURED', evidence });
    }
    if (values.vfx) {
      const vfxEvidence = tiles[3]?.evidence?.vfx;
      if (vfxEvidence === 'unavailable') unverified.push('Action VFX: the studio has no supplied VFX module.');
      else if (vfxEvidence === 'no-visible-change') unverified.push('Action VFX: enabling the effect did not change any canvas pixels at the requested time.');
      else if (!vfxEvidence) unverified.push('Action VFX: no action frame was available.');
    }
    const diagnostics = await page.evaluate(() => window.threejsStudio?.getErrors?.() ?? []);
    for (const diagnostic of diagnostics) addIssue(errors, diagnostic);
    const png = contactSheet(frames);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, png);
    written = png.byteLength;
    status = errors.length ? 'FAIL' : unverified.length ? 'UNVERIFIED' : 'PASS';
  }

  try {
    await capture(browser);
  } catch (error) {
    addIssue(errors, { kind: 'capture', message: messageOf(error) });
    const diagnostics = await activePage?.evaluate(() => window.threejsStudio?.getErrors?.() ?? []).catch(() => []);
    for (const diagnostic of diagnostics ?? []) addIssue(errors, diagnostic);
    status = 'FAIL';
  } finally {
    await browser.close().catch((error) => {
      addIssue(errors, { kind: 'browser-close', message: messageOf(error) });
      status = 'FAIL';
    });
  }
  return finish();
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = messageOf(error);
  console.error(message);
  process.exitCode = emit({ tool, ok: false, error: message }, 1);
}
~~~

## scripts/clip-motion.ts

~~~typescript source-excerpt
// scripts/clip-motion.ts: per-clip track binding and playback motion sampler. Accepts injected THREE so both Node CLIs and browser studio share it.
import type * as THREE from 'three';

export const MOTION_PROPERTIES = ['position', 'quaternion', 'scale', 'morphTargetInfluences'] as const;
export type MotionProperty = (typeof MOTION_PROPERTIES)[number];
export const DEFAULT_MOTION_THRESHOLDS = { angle: 1e-3, distance: 1e-4 };

export type NodeMotion = {
  node: string;
  property: MotionProperty;
  change: number;
  at: number;
  restChange: number;
};

export type ClipMotion = {
  clip: string;
  duration: number;
  times: number[];
  tracks: number;
  unsupported: string[];
  unbound: string[];
  moving: NodeMotion[];
  static: boolean;
  tPoseNotice?: string;
};

export type ClipMotionOptions = {
  samples?: number;
  thresholds?: { angle?: number; distance?: number };
};

type RestSnapshot = {
  node: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  morphs?: number[];
};

type SampleValue = THREE.Vector3 | THREE.Quaternion | number[];

const SUPPORTED_SET = new Set<string>(MOTION_PROPERTIES);
const LIMB_NAME_RE = /(upper.?arm|fore.?arm|shoulder|arm|wing|thigh|leg)[_.-]?(l|r|left|right)?$/i;
const REST_CLIP_NAME_RE = /refpose|tpose|t_pose|bind/i;

function buildSampleTimes(duration: number, clip: THREE.AnimationClip, samples: number): number[] {
  if (!(Number.isFinite(duration) && duration > 0)) return [0];
  const raw: number[] = [0];
  const steps = Math.max(2, Math.floor(samples));
  for (let i = 1; i < steps - 1; i++) raw.push((duration * i) / (steps - 1));
  raw.push(duration);
  for (const track of clip.tracks) {
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i];
      if (Number.isFinite(t) && t > 0 && t < duration) raw.push(t);
    }
  }
  raw.sort((a, b) => a - b);
  const unique: number[] = [];
  for (const t of raw) {
    if (!unique.length || t - unique[unique.length - 1] > 1e-6) unique.push(t);
  }
  if (unique[unique.length - 1] !== duration) unique[unique.length - 1] = duration;
  return unique;
}

function readValue(node: THREE.Object3D, prop: MotionProperty): SampleValue {
  if (prop === 'quaternion') return node.quaternion.clone();
  if (prop === 'position') return node.position.clone();
  if (prop === 'scale') return node.scale.clone();
  const influences = (node as THREE.Mesh).morphTargetInfluences;
  return Array.isArray(influences) ? influences.slice() : [];
}

function measureDiff(prop: MotionProperty, base: SampleValue, current: SampleValue): number {
  if (prop === 'quaternion') {
    const dot = Math.min(1, Math.abs((base as THREE.Quaternion).dot(current as THREE.Quaternion)));
    return 2 * Math.acos(dot);
  }
  if (prop === 'position' || prop === 'scale') {
    return (base as THREE.Vector3).distanceTo(current as THREE.Vector3);
  }
  const a = base as number[], b = current as number[];
  const len = Math.max(a.length, b.length);
  let max = 0;
  for (let i = 0; i < len; i++) max = Math.max(max, Math.abs((b[i] ?? 0) - (a[i] ?? 0)));
  return max;
}

function measureRestDiff(prop: MotionProperty, rest: RestSnapshot, current: SampleValue): number {
  if (prop === 'quaternion') return measureDiff(prop, rest.quaternion, current);
  if (prop === 'position') return measureDiff(prop, rest.position, current);
  if (prop === 'scale') return measureDiff(prop, rest.scale, current);
  return measureDiff(prop, rest.morphs ?? [], current);
}

/** Sample each AnimationClip independently against a fresh rest pose and report track binding plus per-pivot motion. */
export function clipMotion(
  THREE: typeof import('three'),
  root: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
  opts: ClipMotionOptions = {},
): ClipMotion[] {
  const samples = opts.samples ?? 9;
  const angleThresh = opts.thresholds?.angle ?? DEFAULT_MOTION_THRESHOLDS.angle;
  const distThresh = opts.thresholds?.distance ?? DEFAULT_MOTION_THRESHOLDS.distance;

  const counts = new Map<string, number>();
  const limbNodes: string[] = [];
  root.traverse((obj) => {
    if (!obj.name) return;
    counts.set(obj.name, (counts.get(obj.name) ?? 0) + 1);
    if (LIMB_NAME_RE.test(obj.name)) limbNodes.push(obj.name);
  });

  const results: ClipMotion[] = [];
  for (const clip of clips) {
    const clipName = clip.name || '(unnamed)';
    const duration = Number.isFinite(clip.duration) && clip.duration >= 0 ? clip.duration : 0;
    const times = buildSampleTimes(duration, clip, samples);
    const unsupported: string[] = [];
    const unbound: string[] = [];
    const targets = new Map<string, { node: THREE.Object3D; label: string; prop: MotionProperty }>();

    for (const track of clip.tracks) {
      let parsed: ReturnType<typeof THREE.PropertyBinding.parseTrackName>;
      try {
        parsed = THREE.PropertyBinding.parseTrackName(track.name);
      } catch {
        unbound.push(`${track.name} (unparseable track name)`);
        continue;
      }

      const { nodeName, objectName, objectIndex, propertyName, propertyIndex } = parsed;
      if (!SUPPORTED_SET.has(propertyName)) {
        unsupported.push(`${track.name} (unsupported property "${propertyName}")`);
        continue;
      }
      if (objectName !== undefined && objectName !== 'bones') {
        unsupported.push(`${track.name} (unsupported sub-object "${objectName}")`);
        continue;
      }
      if (propertyIndex !== undefined && propertyName !== 'morphTargetInfluences') {
        unsupported.push(`${track.name} (scalar channel "${propertyName}[${propertyIndex}]" is not exported as a glTF track)`);
        continue;
      }

      const prop = propertyName as MotionProperty;
      let targetNode: THREE.Object3D | null | undefined;
      let label: string;

      if (objectName === 'bones') {
        if (nodeName && (counts.get(nodeName) ?? 0) > 1) {
          unbound.push(`${track.name} (ambiguous node name "${nodeName}": ${counts.get(nodeName)} matches)`);
          continue;
        }
        const meshNode = THREE.PropertyBinding.findNode(root, nodeName) as THREE.SkinnedMesh | null;
        if (!meshNode?.isSkinnedMesh || !objectIndex) {
          unbound.push(`${track.name} (SkinnedMesh "${nodeName || '(root)'}" or bone "${objectIndex}" not found)`);
          continue;
        }
        const bone = meshNode.skeleton?.getBoneByName(objectIndex);
        if (!bone) {
          unbound.push(`${track.name} (bone "${objectIndex}" not found on skeleton)`);
          continue;
        }
        if ((counts.get(bone.name) ?? 0) > 1) {
          unbound.push(`${track.name} (ambiguous bone name "${bone.name}": ${counts.get(bone.name)} matches)`);
          continue;
        }
        targetNode = bone;
        label = bone.name || objectIndex;
      } else {
        if (!nodeName || nodeName === '.') {
          unbound.push(`${track.name} (missing node name)`);
          continue;
        }
        const matches = counts.get(nodeName) ?? 0;
        if (matches > 1) {
          unbound.push(`${track.name} (ambiguous node name "${nodeName}": ${matches} matches)`);
          continue;
        }
        targetNode = THREE.PropertyBinding.findNode(root, nodeName);
        if (!targetNode) {
          unbound.push(`${track.name} (node "${nodeName}" not found under root)`);
          continue;
        }
        label = targetNode.name || nodeName;
      }

      if (prop === 'morphTargetInfluences' && !Array.isArray((targetNode as THREE.Mesh).morphTargetInfluences)) {
        unbound.push(`${track.name} (node "${label}" has no morphTargetInfluences)`);
        continue;
      }

      const key = `${targetNode.uuid}|${prop}`;
      if (!targets.has(key)) targets.set(key, { node: targetNode, label, prop });
    }

    const snapshots = new Map<THREE.Object3D, RestSnapshot>();
    for (const { node } of targets.values()) {
      if (snapshots.has(node)) continue;
      const morphs = (node as THREE.Mesh).morphTargetInfluences;
      snapshots.set(node, {
        node,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        morphs: Array.isArray(morphs) ? morphs.slice() : undefined,
      });
    }

    const firstValues = new Map<string, SampleValue>();
    const maxMotion = new Map<string, { change: number; at: number; restChange: number }>();
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();

    try {
      for (let i = 0; i < times.length; i++) {
        const t = times[i];
        mixer.setTime(t);
        root.updateMatrixWorld(true);
        for (const [key, { node, prop }] of targets) {
          const val = readValue(node, prop);
          const rest = snapshots.get(node)!;
          const restDelta = measureRestDiff(prop, rest, val);
          if (i === 0) {
            firstValues.set(key, val);
            maxMotion.set(key, { change: 0, at: t, restChange: Number.isFinite(restDelta) ? restDelta : 0 });
            continue;
          }
          const delta = measureDiff(prop, firstValues.get(key)!, val);
          const prev = maxMotion.get(key)!;
          if (Number.isFinite(delta) && delta > prev.change) {
            prev.change = delta;
            prev.at = t;
          }
          if (Number.isFinite(restDelta) && restDelta > prev.restChange) {
            prev.restChange = restDelta;
          }
        }
      }
    } finally {
      action.stop();
      mixer.uncacheClip(clip);
      mixer.uncacheRoot(root);
      for (const snap of snapshots.values()) {
        snap.node.position.copy(snap.position);
        snap.node.quaternion.copy(snap.quaternion);
        snap.node.scale.copy(snap.scale);
        if (snap.morphs && Array.isArray((snap.node as THREE.Mesh).morphTargetInfluences)) {
          const dst = (snap.node as THREE.Mesh).morphTargetInfluences!;
          for (let k = 0; k < snap.morphs.length; k++) dst[k] = snap.morphs[k];
        }
      }
      root.updateMatrixWorld(true);
    }

    const moving: NodeMotion[] = [];
    for (const [key, { label, prop }] of targets) {
      const stats = maxMotion.get(key) ?? { change: 0, at: 0, restChange: 0 };
      const threshold = prop === 'quaternion' ? angleThresh : distThresh;
      if (stats.change > threshold) {
        moving.push({
          node: label,
          property: prop,
          change: stats.change,
          at: stats.at,
          restChange: stats.restChange,
        });
      }
    }
    moving.sort((a, b) => b.change - a.change);

    let tPoseNotice: string | undefined;
    if (!REST_CLIP_NAME_RE.test(clipName) && moving.length > 0) {
      const maxRest = Math.max(...moving.map((m) => m.restChange));
      if (maxRest < 0.08) {
        tPoseNotice = `All moving channels stay near the rest pose (max ${maxRest.toFixed(4)}); inspect visually to verify the clip leaves any T-pose.`;
      } else if (limbNodes.length >= 2) {
        const limbSet = new Set(limbNodes);
        const limbRotMoves = moving.some((m) => limbSet.has(m.node) && m.property === 'quaternion' && m.restChange >= 0.08);
        if (!limbRotMoves) {
          tPoseNotice = 'Arm/shoulder/leg pivots stay near rest pose (< 0.08 rad); inspect visually to verify limbs leave any T-pose.';
        }
      }
    }

    results.push({
      clip: clipName,
      duration,
      times,
      tracks: clip.tracks.length,
      unsupported,
      unbound,
      moving,
      static: moving.length === 0,
      ...(tPoseNotice ? { tPoseNotice } : {}),
    });
  }

  return results;
}
~~~

## scripts/color-qc.ts

~~~typescript source-excerpt
// scripts/color-qc.ts: G4 Regional Color QC (Semantic ROI + CIEDE2000 ΔE00) for Three.js Asset Generator.
// Pure TypeScript, zero external dependencies (shared by Harness and Web Full).
// Core CIE transforms, CIEDE2000 (Sharma et al. 2005), and ROI statistics adapted from:
// https://github.com/Luciansvon/AI-COLOR-COMPARE (src/color_science/transforms.ts, ciede2000.ts, metrics.ts).
import type { Gate } from './result';

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface LinearRGB {
  r: number; // 0..1+
  g: number; // 0..1+
  b: number; // 0..1+
}

export interface XYZ {
  x: number; // 0..100+
  y: number; // 0..100
  z: number; // 0..100+
}

export interface Lab {
  l: number; // 0..100
  a: number; // -128..+127
  b: number; // -128..+127
}

export interface PixelDataStats {
  meanLab: Lab;
  meanRgb: RGB;
  brightness: number;
  contrast: number;
  saturation: number;
  shadowClippingRatio: number;
  highlightClippingRatio: number;
  pixelCount: number;
}

export interface SemanticRegionRoi {
  view?: string;
  x: number; // 0..100 percent
  y: number; // 0..100 percent
  width: number; // 0..100 percent
  height: number; // 0..100 percent
}

export interface SemanticRegionRef {
  region: string;
  hex?: string;
  label?: string;
  status?: 'confident' | 'uncertain';
  roi?: SemanticRegionRoi;
  emissive?: boolean;
}

export type RegionColorSource = 'vertex-color' | 'material' | 'texture' | 'render' | 'declared';

export interface ModelRegionSample {
  region: string;
  hex?: string;
  linearRgb?: LinearRGB;
  srgb?: RGB;
  source: RegionColorSource;
  unreadable?: boolean;
  note?: string;
}

export interface G4Thresholds {
  /** Maximum full CIEDE2000 ΔE00 allowed for unlit material/vertex/texture checks. */
  maxDeltaE00: number;
  /** Advisory ΔE00 notice threshold. */
  warnDeltaE00: number;
  /** Maximum lighting-invariant ΔE00 (kL=4, kC=3, kH=1) allowed on render samples before failing chromatic accuracy. */
  renderChromaticMaxDeltaE00: number;
  /** Minimum |ΔL*| required to classify an exceed on a render sample as exposure/lighting-driven. */
  minLightingDeltaL: number;
}

export const DEFAULT_G4_THRESHOLDS: G4Thresholds = {
  maxDeltaE00: 12.0,
  warnDeltaE00: 7.0,
  renderChromaticMaxDeltaE00: 7.5,
  minLightingDeltaL: 8.0,
};

export type G4Status = 'PASS' | 'FAIL' | 'SKIPPED' | 'ERROR';

export interface RegionQCResult {
  region: string;
  label?: string;
  status: G4Status;
  source?: RegionColorSource;
  refHex?: string;
  modelHex?: string;
  deltaE00?: number;
  chromaticDeltaE00?: number;
  deltaL?: number;
  deltaA?: number;
  deltaB?: number;
  lightingOnlyWarning?: boolean;
  reason: string;
}

export interface RegionalColorQCReport {
  status: G4Status;
  mode: string;
  evaluated: number;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  maxDeltaE00: number;
  thresholds: G4Thresholds;
  regions: RegionQCResult[];
  gate: Gate | null;
  reason: string;
}

// CIE D65 2-degree standard illuminant (reused from AI-COLOR-COMPARE transforms.ts)
const D65_XN = 95.047;
const D65_YN = 100.0;
const D65_ZN = 108.883;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function sRGBToLinearRGB(rgb: RGB): LinearRGB {
  const toLinear = (c: number) => {
    const v = Math.max(0, Math.min(255, c)) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return { r: toLinear(rgb.r), g: toLinear(rgb.g), b: toLinear(rgb.b) };
}

export function linearRGBToSRGB(linear: LinearRGB): RGB {
  const toSRGB = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    const c = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(c * 255);
  };
  return { r: toSRGB(linear.r), g: toSRGB(linear.g), b: toSRGB(linear.b) };
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3
    ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
    : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex color: "${hex}"`);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgbToHex = (rgb: RGB): string =>
  '#' + [rgb.r, rgb.g, rgb.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function rgbToXyz(rgb: RGB): XYZ {
  return linearRgbToXyz(sRGBToLinearRGB(rgb));
}

export function linearRgbToXyz(lin: LinearRGB): XYZ {
  const r = Math.max(0, lin.r), g = Math.max(0, lin.g), b = Math.max(0, lin.b);
  return {
    x: (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100,
    y: (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) * 100,
    z: (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) * 100,
  };
}

function fXYZ(t: number): number {
  const delta = 6 / 29;
  return t > delta * delta * delta ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

export function xyzToLab(xyz: XYZ): Lab {
  const fx = fXYZ(xyz.x / D65_XN);
  const fy = fXYZ(xyz.y / D65_YN);
  const fz = fXYZ(xyz.z / D65_ZN);
  return { l: Math.max(0, 116 * fy - 16), a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const rgbToLab = (rgb: RGB): Lab => xyzToLab(rgbToXyz(rgb));
export const linearRgbToLab = (lin: LinearRGB): Lab => xyzToLab(linearRgbToXyz(lin));

/**
 * CIEDE2000 color difference (ΔE00) per CIE & Sharma et al. (2005).
 * Ported directly from Luciansvon/AI-COLOR-COMPARE `src/color_science/ciede2000.ts`.
 */
export function calculateDeltaE00(lab1: Lab, lab2: Lab, kL = 1.0, kC = 1.0, kH = 1.0): number {
  const { l: l1, a: a1, b: b1 } = lab1;
  const { l: l2, a: a2, b: b2 } = lab2;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = Math.pow(cBar, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + Math.pow(25, 7))));

  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);

  let h1Prime = deg(Math.atan2(b1, a1Prime));
  if (h1Prime < 0) h1Prime += 360;
  let h2Prime = deg(Math.atan2(b2, a2Prime));
  if (h2Prime < 0) h2Prime += 360;

  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;

  let deltaHPrimeDegrees = 0;
  if (c1Prime * c2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) deltaHPrimeDegrees = diff;
    else if (diff > 180) deltaHPrimeDegrees = diff - 360;
    else deltaHPrimeDegrees = diff + 360;
  }
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(rad(deltaHPrimeDegrees / 2));

  const lBarPrime = (l1 + l2) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;

  let hBarPrime = 0;
  if (c1Prime * c2Prime === 0) {
    hBarPrime = h1Prime + h2Prime;
  } else {
    const diff = Math.abs(h1Prime - h2Prime);
    const sum = h1Prime + h2Prime;
    if (diff <= 180) hBarPrime = sum / 2;
    else if (sum < 360) hBarPrime = (sum + 360) / 2;
    else hBarPrime = (sum - 360) / 2;
  }

  const t = 1
    - 0.17 * Math.cos(rad(hBarPrime - 30))
    + 0.24 * Math.cos(rad(2 * hBarPrime))
    + 0.32 * Math.cos(rad(3 * hBarPrime + 6))
    - 0.20 * Math.cos(rad(4 * hBarPrime - 63));

  const deltaTheta = 30 * Math.exp(-Math.pow((hBarPrime - 275) / 25, 2));
  const cBarPrime7 = Math.pow(cBarPrime, 7);
  const rc = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + Math.pow(25, 7)));

  const lBarMinus50Sq = Math.pow(lBarPrime - 50, 2);
  const sL = 1 + (0.015 * lBarMinus50Sq) / Math.sqrt(20 + lBarMinus50Sq);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin(rad(2 * deltaTheta)) * rc;

  const lTerm = deltaLPrime / (kL * sL);
  const cTerm = deltaCPrime / (kC * sC);
  const hTerm = deltaHPrime / (kH * sH);
  return Math.sqrt(Math.max(0, lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm));
}

/**
 * Extracts Lab/RGB/brightness/contrast/saturation statistics from RGBA pixel bytes
 * (reused from AI-COLOR-COMPARE `src/color_science/metrics.ts`, ignoring transparent pixels).
 */
export function extractROIStats(rgbaPixels: Uint8Array | Uint8ClampedArray | number[], alphaCut = 128): PixelDataStats {
  const total = Math.floor(rgbaPixels.length / 4);
  if (!total) {
    return {
      meanLab: { l: 0, a: 0, b: 0 },
      meanRgb: { r: 0, g: 0, b: 0 },
      brightness: 0, contrast: 0, saturation: 0,
      shadowClippingRatio: 0, highlightClippingRatio: 0, pixelCount: 0,
    };
  }

  let sumR = 0, sumG = 0, sumB = 0, sumL = 0, sumA = 0, sumBLab = 0, sumSat = 0;
  let shadowClipped = 0, highlightClipped = 0, count = 0;
  const lValues: number[] = [];

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    if (rgbaPixels[idx + 3] < alphaCut) continue;
    const r = rgbaPixels[idx], g = rgbaPixels[idx + 1], b = rgbaPixels[idx + 2];
    count++;
    sumR += r; sumG += g; sumB += b;
    if (r < 5 && g < 5 && b < 5) shadowClipped++;
    if (r > 250 || g > 250 || b > 250) highlightClipped++;
    const lab = rgbToLab({ r, g, b });
    lValues.push(lab.l);
    sumL += lab.l; sumA += lab.a; sumBLab += lab.b;
    sumSat += Math.hypot(lab.a, lab.b);
  }

  if (!count) {
    return {
      meanLab: { l: 0, a: 0, b: 0 },
      meanRgb: { r: 0, g: 0, b: 0 },
      brightness: 0, contrast: 0, saturation: 0,
      shadowClippingRatio: 0, highlightClippingRatio: 0, pixelCount: 0,
    };
  }

  const meanL = sumL / count;
  let sumVar = 0;
  for (const l of lValues) sumVar += (l - meanL) * (l - meanL);

  return {
    meanLab: { l: meanL, a: sumA / count, b: sumBLab / count },
    meanRgb: { r: Math.round(sumR / count), g: Math.round(sumG / count), b: Math.round(sumB / count) },
    brightness: meanL,
    contrast: Math.sqrt(sumVar / count),
    saturation: sumSat / count,
    shadowClippingRatio: shadowClipped / count,
    highlightClippingRatio: highlightClipped / count,
    pixelCount: count,
  };
}

/** Extracts ROI stats from a percentage bounding box `{ x, y, width, height }` on an RGBA image. */
export function extractROIBoxStats(
  rgba: Uint8Array | Uint8ClampedArray,
  totalWidth: number,
  totalHeight: number,
  box: SemanticRegionRoi,
  alphaCut = 128,
): PixelDataStats {
  const x0 = Math.max(0, Math.min(totalWidth - 1, Math.round((box.x / 100) * totalWidth)));
  const y0 = Math.max(0, Math.min(totalHeight - 1, Math.round((box.y / 100) * totalHeight)));
  const cw = Math.max(1, Math.min(totalWidth - x0, Math.round((box.width / 100) * totalWidth)));
  const ch = Math.max(1, Math.min(totalHeight - y0, Math.round((box.height / 100) * totalHeight)));
  const cropped = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcStart = ((y0 + y) * totalWidth + x0) * 4;
    cropped.set(rgba.subarray(srcStart, srcStart + cw * 4), y * cw * 4);
  }
  return extractROIStats(cropped, alphaCut);
}

/** Priority 3 fallback: sample a rendered frame's semantic ROI box into a ModelRegionSample. */
export function sampleRenderRegion(
  region: string,
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  box: SemanticRegionRoi,
): ModelRegionSample {
  const stats = extractROIBoxStats(rgba, width, height, box);
  if (!stats.pixelCount) return { region, source: 'render', unreadable: true, note: 'ROI contains no opaque pixels' };
  return {
    region,
    srgb: stats.meanRgb,
    hex: rgbToHex(stats.meanRgb),
    source: 'render',
  };
}

const normalizeName = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokensOf = (s: string) => normalizeName(s).split(/\s+/).filter(Boolean);

function matchRegionScore(region: string, candidates: string[], aliases?: Record<string, string | string[]>): number {
  const normRegion = normalizeName(region);
  const aliasList = aliases?.[region];
  const targets = [normRegion, ...(Array.isArray(aliasList) ? aliasList.map(normalizeName) : aliasList ? [normalizeName(aliasList)] : [])].filter(Boolean);
  let best = 0;
  for (const cand of candidates) {
    const nc = normalizeName(cand);
    if (!nc) continue;
    const cTokens = tokensOf(cand);
    for (const target of targets) {
      if (nc === target) best = Math.max(best, 100);
      else if (cTokens.includes(target)) best = Math.max(best, 80);
      else if (nc.includes(target)) best = Math.max(best, 60);
      else {
        const tTokens = tokensOf(target);
        if (tTokens.length && tTokens.every((t) => cTokens.includes(t))) best = Math.max(best, 70);
      }
    }
  }
  return best;
}

type DuckAttr = { count?: number; itemSize?: number; array?: ArrayLike<number>; getX?: (i: number) => number; getY?: (i: number) => number; getZ?: (i: number) => number };
type DuckMaterial = { color?: { r: number; g: number; b: number }; emissive?: { r: number; g: number; b: number }; map?: { image?: { data?: ArrayLike<number>; width?: number; height?: number } } };
type DuckNode = {
  name?: string;
  visible?: boolean;
  isMesh?: boolean;
  parent?: DuckNode | null;
  children?: DuckNode[];
  geometry?: { attributes?: Record<string, DuckAttr> };
  material?: DuckMaterial | DuckMaterial[];
};

function collectMeshesWithPaths(root: DuckNode): Array<{ mesh: DuckNode; names: string[] }> {
  const out: Array<{ mesh: DuckNode; names: string[] }> = [];
  const visit = (node: DuckNode, ancestors: string[]) => {
    if (!node || node.visible === false) return;
    const chain = node.name ? [...ancestors, node.name] : ancestors;
    if (node.isMesh && node.geometry?.attributes?.position) out.push({ mesh: node, names: chain });
    if (Array.isArray(node.children)) for (const child of node.children) visit(child, chain);
  };
  visit(root, []);
  return out;
}

function readAttrVec(attr: DuckAttr, index: number): [number, number, number] {
  if (typeof attr.getX === 'function' && typeof attr.getY === 'function' && typeof attr.getZ === 'function') {
    return [attr.getX(index), attr.getY(index), attr.getZ(index)];
  }
  const s = attr.itemSize ?? 3;
  const a = attr.array!;
  return [a[index * s] ?? 0, a[index * s + 1] ?? 0, a[index * s + 2] ?? 0];
}

function sampleMeshBaseColor(mesh: DuckNode, emissiveHint = false): { linear?: LinearRGB; srgb?: RGB; source: RegionColorSource; unreadable?: boolean; note?: string } {
  const matRaw = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const mat: DuckMaterial = matRaw ?? {};
  const tint = mat.color ? { r: mat.color.r, g: mat.color.g, b: mat.color.b } : { r: 1, g: 1, b: 1 };
  const colAttr = mesh.geometry?.attributes?.color;

  // Priority 1a: vertex colors multiplied by material.color (Three.js sRGB->linear shader rule)
  if (colAttr && (colAttr.count ?? 0) > 0) {
    const n = colAttr.count!;
    const step = Math.max(1, Math.floor(n / 1024));
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    for (let i = 0; i < n; i += step) {
      const [vx, vy, vz] = readAttrVec(colAttr, i);
      sr += vx * tint.r; sg += vy * tint.g; sb += vz * tint.b; cnt++;
    }
    const lin = { r: sr / cnt, g: sg / cnt, b: sb / cnt };
    return { linear: lin, srgb: linearRGBToSRGB(lin), source: 'vertex-color' };
  }

  // Priority 2: texture map pixel buffer (optionally indexed by mesh UVs so shared texture atlases stay per-part!)
  if (mat.map) {
    const img = mat.map.image;
    const data = img?.data;
    const w = img?.width ?? 0, h = img?.height ?? 0;
    if (!data || w <= 0 || h <= 0) {
      return { source: 'texture', unreadable: true, note: 'material.map has no readable pixel buffer in current runtime' };
    }
    const uv = mesh.geometry?.attributes?.uv;
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    if (uv && (uv.count ?? 0) > 0) {
      const step = Math.max(1, Math.floor(uv.count! / 512));
      for (let i = 0; i < uv.count!; i += step) {
        let u: number, v: number;
        if (typeof uv.getX === 'function' && typeof uv.getY === 'function') {
          u = uv.getX(i); v = uv.getY(i);
        } else {
          const s = uv.itemSize ?? 2;
          u = uv.array![i * s]; v = uv.array![i * s + 1];
        }
        const uu = ((u % 1) + 1) % 1;
        const vv = ((v % 1) + 1) % 1;
        const px = Math.min(w - 1, Math.floor(uu * w));
        const py = Math.min(h - 1, Math.floor((1 - vv) * h));
        const off = (py * w + px) * 4;
        if ((data[off + 3] ?? 255) < 128) continue;
        const linTex = sRGBToLinearRGB({ r: data[off], g: data[off + 1], b: data[off + 2] });
        sr += linTex.r * tint.r; sg += linTex.g * tint.g; sb += linTex.b * tint.b; cnt++;
      }
    }
    if (!cnt) {
      const stats = extractROIStats(data instanceof Uint8Array || data instanceof Uint8ClampedArray ? data : Array.from(data));
      if (!stats.pixelCount) return { source: 'texture', unreadable: true, note: 'texture contains no opaque pixels' };
      const linTex = sRGBToLinearRGB(stats.meanRgb);
      const lin = { r: linTex.r * tint.r, g: linTex.g * tint.g, b: linTex.b * tint.b };
      return { linear: lin, srgb: linearRGBToSRGB(lin), source: 'texture' };
    }
    const lin = { r: sr / cnt, g: sg / cnt, b: sb / cnt };
    return { linear: lin, srgb: linearRGBToSRGB(lin), source: 'texture' };
  }

  // Priority 1b: scalar material.color / emissive (zero lighting influence)
  if (emissiveHint && mat.emissive && (tint.r + tint.g + tint.b) < 0.05 && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05) {
    const em = { r: mat.emissive.r, g: mat.emissive.g, b: mat.emissive.b };
    return { linear: em, srgb: linearRGBToSRGB(em), source: 'material' };
  }
  return { linear: tint, srgb: linearRGBToSRGB(tint), source: 'material' };
}

/**
 * Priority 1 & 2 model sampler: reads base material/vertex/texture colors from named meshes or parent groups
 * directly in memory without rendering frames or calling any AI.
 */
export function sampleModelRegionColors(
  root: unknown,
  regions: readonly SemanticRegionRef[],
  regionAliases?: Record<string, string | string[]>,
): Record<string, ModelRegionSample> {
  const result: Record<string, ModelRegionSample> = {};
  if (!root || !regions.length) return result;
  const entries = collectMeshesWithPaths(root as DuckNode);

  for (const ref of regions) {
    let bestScore = 0;
    const matched: DuckNode[] = [];
    for (const entry of entries) {
      const score = matchRegionScore(ref.region, entry.names, regionAliases);
      if (score <= 0) continue;
      if (score > bestScore) { bestScore = score; matched.length = 0; matched.push(entry.mesh); }
      else if (score === bestScore) matched.push(entry.mesh);
    }
    if (!matched.length) continue;

    let sr = 0, sg = 0, sb = 0, cnt = 0;
    let source: RegionColorSource = 'material';
    let unreadable = false;
    let note: string | undefined;
    for (const m of matched) {
      const s = sampleMeshBaseColor(m, ref.emissive);
      source = s.source;
      if (s.unreadable) { unreadable = true; note = s.note; continue; }
      if (s.linear) { sr += s.linear.r; sg += s.linear.g; sb += s.linear.b; cnt++; }
    }
    if (!cnt) {
      result[ref.region] = { region: ref.region, source, unreadable: true, note: unreadable ? note : 'unable to sample mesh color' };
      continue;
    }
    const lin = { r: sr / cnt, g: sg / cnt, b: sb / cnt };
    const srgb = linearRGBToSRGB(lin);
    result[ref.region] = { region: ref.region, linearRgb: lin, srgb, hex: rgbToHex(srgb), source };
  }
  return result;
}

const shiftHint = (dL: number, dA: number, dB: number) => {
  const notes: string[] = [];
  if (Math.abs(dL) >= 5) notes.push(dL > 0 ? 'too light' : 'too dark');
  if (Math.abs(dA) >= 5) notes.push(dA > 0 ? 'too red/magenta' : 'too green');
  if (Math.abs(dB) >= 5) notes.push(dB > 0 ? 'too yellow/warm' : 'too blue/cool');
  return notes.length ? notes.join(', ') : 'hue/chroma mismatch';
};

/**
 * Evaluates G4 Regional Color QC using CIEDE2000 (ΔE00).
 * Fast/Quick modes return SKIPPED immediately with zero G4 overhead.
 */
export function evaluateRegionalColorQC(
  refRegions: readonly SemanticRegionRef[] | undefined,
  modelSamples: Record<string, ModelRegionSample> | undefined,
  options: { mode?: string; thresholds?: Partial<G4Thresholds> } = {},
): RegionalColorQCReport {
  const mode = (options.mode ?? 'balance').toLowerCase();
  const thresholds: G4Thresholds = { ...DEFAULT_G4_THRESHOLDS, ...options.thresholds };

  if (mode === 'fast' || mode === 'quick') {
    return {
      status: 'SKIPPED', mode, evaluated: 0, passed: 0, failed: 0, skipped: 0, errored: 0,
      maxDeltaE00: 0, thresholds, regions: [], gate: null,
      reason: `Mode "${options.mode ?? mode}" runs G3 palette only (G4 skipped with zero overhead)`,
    };
  }

  if (!refRegions?.length) {
    return {
      status: 'SKIPPED', mode, evaluated: 0, passed: 0, failed: 0, skipped: 0, errored: 0,
      maxDeltaE00: 0, thresholds, regions: [], gate: null,
      reason: 'No cached semantic region metadata in reference; G4 skipped cleanly',
    };
  }

  const regions: RegionQCResult[] = [];
  let passed = 0, failed = 0, skipped = 0, errored = 0, maxDeltaE00 = 0;

  for (const ref of refRegions) {
    if (ref.status === 'uncertain' || !ref.hex) {
      skipped++;
      regions.push({
        region: ref.region, label: ref.label, status: 'SKIPPED', refHex: ref.hex,
        reason: 'reference region marked uncertain or missing hex',
      });
      continue;
    }

    const sample = modelSamples?.[ref.region];
    if (!sample) {
      skipped++;
      regions.push({
        region: ref.region, label: ref.label, status: 'SKIPPED', refHex: ref.hex,
        reason: `no model region sample found for "${ref.region}"`,
      });
      continue;
    }
    if (sample.unreadable) {
      skipped++;
      regions.push({
        region: ref.region, label: ref.label, status: 'SKIPPED', source: sample.source, refHex: ref.hex,
        reason: sample.note ?? 'model region color buffer unreadable',
      });
      continue;
    }

    try {
      const refRgb = hexToRgb(ref.hex);
      const refLab = rgbToLab(refRgb);
      const modelLab = sample.srgb ? rgbToLab(sample.srgb)
        : sample.linearRgb ? linearRgbToLab(sample.linearRgb)
          : sample.hex ? rgbToLab(hexToRgb(sample.hex))
            : null;
      if (!modelLab) {
        skipped++;
        regions.push({
          region: ref.region, label: ref.label, status: 'SKIPPED', source: sample.source, refHex: ref.hex,
          reason: 'model region sample lacks color values',
        });
        continue;
      }

      const modelHex = sample.hex ?? (sample.srgb ? rgbToHex(sample.srgb) : sample.linearRgb ? rgbToHex(linearRGBToSRGB(sample.linearRgb)) : undefined);
      const dE = Number(calculateDeltaE00(refLab, modelLab, 1, 1, 1).toFixed(2));
      const dEChromatic = Number(calculateDeltaE00(refLab, modelLab, 4.0, 3.0, 1.0).toFixed(2));
      const dL = Number((modelLab.l - refLab.l).toFixed(2));
      const dA = Number((modelLab.a - refLab.a).toFixed(2));
      const dB = Number((modelLab.b - refLab.b).toFixed(2));
      const refC = Math.hypot(refLab.a, refLab.b);
      const modC = Math.hypot(modelLab.a, modelLab.b);
      maxDeltaE00 = Math.max(maxDeltaE00, dE);

      const neutralSafe = refC >= 8 || modC < 12;
      const isLightingOnlyRenderShift = sample.source === 'render'
        && dE > thresholds.maxDeltaE00
        && neutralSafe
        && dEChromatic <= thresholds.renderChromaticMaxDeltaE00
        && Math.abs(dL) >= thresholds.minLightingDeltaL;

      if (isLightingOnlyRenderShift) {
        passed++;
        regions.push({
          region: ref.region, label: ref.label, status: 'PASS', source: sample.source,
          refHex: ref.hex, modelHex, deltaE00: dE, chromaticDeltaE00: dEChromatic,
          deltaL: dL, deltaA: dA, deltaB: dB, lightingOnlyWarning: true,
          reason: `render brightness/lighting shift (ΔE00=${dE}, chromatic ΔE00=${dEChromatic} <= ${thresholds.renderChromaticMaxDeltaE00}) — base hue preserved`,
        });
      } else if (dE <= thresholds.maxDeltaE00) {
        passed++;
        regions.push({
          region: ref.region, label: ref.label, status: 'PASS', source: sample.source,
          refHex: ref.hex, modelHex, deltaE00: dE, chromaticDeltaE00: dEChromatic,
          deltaL: dL, deltaA: dA, deltaB: dB,
          reason: dE > thresholds.warnDeltaE00 ? `within limit with mild drift (ΔE00=${dE})` : `matched (ΔE00=${dE})`,
        });
      } else {
        failed++;
        regions.push({
          region: ref.region, label: ref.label, status: 'FAIL', source: sample.source,
          refHex: ref.hex, modelHex, deltaE00: dE, chromaticDeltaE00: dEChromatic,
          deltaL: dL, deltaA: dA, deltaB: dB,
          reason: `ΔE00=${dE} > ${thresholds.maxDeltaE00} (ref ${ref.hex} vs model ${modelHex}: ${shiftHint(dL, dA, dB)})`,
        });
      }
    } catch (error) {
      errored++;
      regions.push({
        region: ref.region, label: ref.label, status: 'ERROR', source: sample.source, refHex: ref.hex,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const evaluated = passed + failed;
  const status: G4Status = errored > 0 ? 'ERROR' : failed > 0 ? 'FAIL' : evaluated === 0 ? 'SKIPPED' : 'PASS';
  const failedList = regions.filter((r) => r.status === 'FAIL').map((r) => `${r.region} (ΔE00 ${r.deltaE00})`);
  const errList = regions.filter((r) => r.status === 'ERROR').map((r) => `${r.region}: ${r.reason}`);

  let gate: Gate | null = null;
  if (status === 'PASS' || status === 'FAIL') {
    gate = {
      gate: 'G4 regional color',
      value: status === 'PASS'
        ? `${passed} region(s) matched via CIEDE2000 (max ΔE00 ${maxDeltaE00.toFixed(2)} <= ${thresholds.maxDeltaE00}${skipped ? `; ${skipped} skipped` : ''})`
        : `${failed} region(s) mismatched: ${failedList.join(', ')}`,
      pass: status === 'PASS',
      hint: status === 'PASS' ? '' : `adjust material/vertex colors for failing region(s): ${failedList.join(', ')} (max 1 correction round)`,
    };
  }

  const reason = status === 'PASS' ? gate!.value
    : status === 'FAIL' ? gate!.value
      : status === 'ERROR' ? `G4 technical error: ${errList.join('; ')}`
        : 'All regions were uncertain, unmapped, or unreadable — G4 reported as SKIPPED';

  return { status, mode, evaluated, passed, failed, skipped, errored, maxDeltaE00, thresholds, regions, gate, reason };
}
~~~

## scripts/export-glb.ts

~~~typescript source-excerpt
// scripts/export-glb.ts: write a GLB from a pure kernel or a tris.json, then read it back and check it (E1 to E6, references/glb-export.md).
//   Kernel (no THREE):   npx tsx scripts/export-glb.ts --module ./myKernel.ts --export buildMyTris [--params '{"seed":3}'] [--out asset.glb]
//   Any asset via tris:  npx tsx scripts/export-glb.ts --tris tris.json [--out asset.glb]
// Options: --open a,b | all (sheets)  --profile web --kind prop  --budget N  --skip-qa  --color r,g,b (0..1, default 0.8,0.8,0.8)
// Runs geometry QA before writing. Q5 applies with a selected budget. Q6 to Q10 stay in qa-asset.ts.
// No THREE needed. Last stdout line is the @@RESULT JSON. Exit 0 = ok, 2 = a gate failed, 1 = usage or load error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeParts, qaGates, type Parts } from './qacheck';
import { parseBudgetArgs } from './budget';
import { partsToGlb, glbGates } from './glb';
import { emit, type Gate } from './result';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; }, flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'export-glb', ok: false, error: msg }, 1)); };
const modFile = opt('module'), trisFile = opt('tris'), outFile = resolve(opt('out') ?? 'asset.glb');
if (!modFile === !trisFile) fail('usage: tsx scripts/export-glb.ts (--module file.ts [--export name] [--params json] | --tris tris.json) [--out asset.glb] [--open a,b|all] [--profile name] [--kind name] [--budget N] [--skip-qa] [--color r,g,b]');
let target: ReturnType<typeof parseBudgetArgs>;
try { target = parseBudgetArgs(args); } catch (e) { fail((e as Error).message); }
const { platform, kind, triangleLimit } = target;

let color: [number, number, number, number] | undefined;
if (opt('color')) { const c = opt('color')!.split(',').map(Number); if (c.length !== 3 || c.some((x) => !Number.isFinite(x) || x < 0 || x > 1)) fail('--color needs r,g,b with each value from 0 to 1'); color = [c[0], c[1], c[2], 1]; }
let params: Record<string, unknown> = {};
try { if (opt('params')) params = JSON.parse(opt('params')!); } catch (e) { fail(`--params is not valid JSON: ${(e as Error).message}`); }

let parts: Parts;
try {
  if (modFile) {
    const mod = (await import(pathToFileURL(resolve(modFile)).href)) as Record<string, unknown>, fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
    const name = opt('export') ?? (fns.length === 1 ? fns[0] : mod.default ? 'default' : undefined);
    if (!name || typeof mod[name] !== 'function') fail(`pick the builder with --export <name>. Functions exported by ${modFile}: ${fns.join(', ') || 'none'}`);
    parts = normalizeParts(await (mod[name!] as (p: Record<string, unknown>) => unknown)({ ...params }));
  } else parts = normalizeParts(JSON.parse(readFileSync(resolve(trisFile!), 'utf8')));
} catch (e) {
  const m = (e as Error).message;
  fail(/Cannot find (module|package) ['"]three/.test(m) ? `the builder imports \`three\`, which is not installed here. Write tris.json from your driver (groupToTris) and use --tris.` : `cannot build or read the asset: ${m}`);
}

const gates: Gate[] = [], unverified: string[] = [];
const qa = qaGates(parts!, { budget: triangleLimit ?? undefined, open: opt('open')?.split(',').map((s) => s.trim()).filter(Boolean), grounding: false });
const qaFail = qa.gates.filter((g) => !g.pass);
const qaRange = triangleLimit === null ? 'Q1 to Q4' : 'Q1 to Q5';
const triangles = qa.stats.triangles;
const count = triangleLimit === null ? `${triangles} triangles` : `${triangles} of ${triangleLimit} triangles`;
gates.push({ gate: `QA ${qaRange}`, value: qaFail.length ? qaFail.map((g) => `${g.gate}: ${g.value}`).join('; ') : `applicable ${qaRange} checks passed (${count})`, pass: qaFail.length === 0 || flag('skip-qa'), hint: qaFail.length ? 'run qa-asset.ts to inspect the affected geometry or chosen budget' : '' });
if (qaFail.length && flag('skip-qa')) unverified.push(`exported with --skip-qa although ${qaFail.map((g) => g.gate).join(', ')} failed`);

let bytes: Uint8Array | null = null;
if (gates[0].pass) {
  try { bytes = partsToGlb(parts!, { materialColor: color }); } catch (e) { gates.push({ gate: 'write', value: (e as Error).message, pass: false, hint: 'fix the input; the writer refuses empty or non-finite parts' }); }
}
if (bytes) {
  mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, bytes);
  gates.push(...glbGates(new Uint8Array(readFileSync(outFile)), parts!));          // re-read from disk: the check covers the file, not the buffer in memory
}
unverified.push('GLB opened in a real viewer or loader (GLTFLoader, Blender, model-viewer): these gates check the container and the data against the input, not a third-party importer');
unverified.push('materials, vertex colours, UVs, rigging and animation: this exporter writes geometry only (one default material)');

console.log(gates.map((g) => `${g.pass ? 'PASS' : 'FAIL'}  ${g.gate}: ${g.value}${g.pass ? '' : '  -> ' + g.hint}`).join('\n'));
if (bytes) console.log(`\nwrote ${outFile} (${bytes.length} bytes, ${Object.keys(parts!).length} part(s), ${triangles} triangles)`);
if (qa.skipped.length) console.log(`not checked: ${qa.skipped.join('; ')}`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} gate(s) failing. Inspect the affected geometry or export settings and rerun.` : '\nAll evaluated export checks pass. See the recorded limitations.');
process.exit(emit({ tool: 'export-glb', ok: failed.length === 0, gates, skipped: qa.skipped, unverified, platform, kind, triangleLimit, triangles, file: bytes ? outFile : null, bytes: bytes?.length ?? 0 }));
~~~

## scripts/export-rigged-glb.ts

~~~typescript source-excerpt
// scripts/export-rigged-glb.ts: official Three.js GLB export + disk round-trip verifier for assets with vertex colors, materials, skins/bones, or AnimationClips.
// Usage: npx tsx scripts/export-rigged-glb.ts --module ./myAsset.ts --export buildAsset --out asset.glb [--params '{"seed":1}'] [--static-clips a,b] [--open sheet1,sheet2|all]
// The exported function receives `(params, THREE)` and may return a THREE.Object3D (with optional root.userData.animations) or { root: THREE.Object3D, animations?: THREE.AnimationClip[] }.
// Last stdout line is @@RESULT {json}. Exit 0 = ok, 2 = verification gate failed, 1 = usage/load error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { countScene, extractObjectParts, selectBuilder, unpackAsset } from './asset-builder';
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
if (!modFile || !outFile) fail('usage: tsx scripts/export-rigged-glb.ts --module ./myAsset.ts [--export name] [--params json] [--static-clips a,b] [--open a,b|all] --out asset.glb');
const staticClipsList = (opt('static-clips') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const staticClips = new Set(staticClipsList);
const openList = opt('open')?.split(',').map((s) => s.trim()).filter(Boolean);
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
  const buf: ArrayBuffer = await new GLTFExporter().parseAsync(root, { binary: true, animations, onlyVisible: true });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(buf));
  diskBytes = readFileSync(outPath);
  const diskAb = diskBytes.buffer.slice(diskBytes.byteOffset, diskBytes.byteOffset + diskBytes.byteLength);
  reloaded = await new GLTFLoader().parseAsync(diskAb, '');
} catch (e) {
  fail(`cannot write or re-open ${outPath}: ${(e as Error).message}`);
}
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
  tool: 'export-rigged-glb', ok, out: outPath, bytes: diskBytes.byteLength, before, after, clips: outClips,
  staticClips: staticClipsList,
  ...(animations.length ? { motion: { source: sourceMotion, reloaded: reloadedMotion } } : {}),
  gates, unverified,
}, ok ? 0 : 2));
~~~

## scripts/fixtures/crate.qa.ts

~~~typescript source-excerpt
// scripts/fixtures/crate.qa.ts: the smallest builder qa-asset.ts accepts, and a template for your own:  (params) => { part: Tris, ... }
// Self-contained on purpose (no THREE, no imports from src/). Seeded: seed 0 is a real seed, the stream is local, nothing reads Math.random.
export type Tris = number[];

/** Axis-aligned box, 12 triangles, CCW seen from outside (positive signed volume). */
export function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Tris {
  const lo = [x0, y0, z0], hi = [x1, y1, z1], out: number[] = [];
  for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
    const u = (k + 1) % 3, v = (k + 2) % 3, at = s > 0 ? hi[k] : lo[k];                   // e_u x e_v = e_k, so this order is CCW seen from +k
    const pt = (a: number, b: number) => { const p = [0, 0, 0]; p[k] = at; p[u] = a; p[v] = b; return p; };
    let q = [pt(lo[u], lo[v]), pt(hi[u], lo[v]), pt(hi[u], hi[v]), pt(lo[u], hi[v])];
    if (s < 0) q = [q[0], q[3], q[2], q[1]];
    out.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  }
  return out;
}

const mulberry32 = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A crate: a body whose height depends on the seed, and a batten on each side (mirrored, so the asset is symmetric in x). Y = 0 is the floor. */
export function buildCrateTris(raw: { seed?: number; size?: number } = {}) {
  const seed = raw.seed ?? 42, size = Math.min(Math.max(Number(raw.size ?? 1) || 1, 0.3), 3), rng = mulberry32(seed);   // ?? not ||: seed 0 must work
  const h = size * (0.8 + 0.4 * rng()), half = size / 2, t = size * 0.05;
  return {
    body: box(-half, 0, -half, half, h, half),
    battens: [...box(half - t, 0, -half - t, half + t, h, half + t), ...box(-half - t, 0, -half - t, -half + t, h, half + t)],
  };
}
~~~

## scripts/fixtures/dragon.qa.ts

~~~typescript source-excerpt
// scripts/fixtures/dragon.qa.ts: wraps the real dragon kernel (src/dragonKernel.ts, which needs (params, rng)) into the (params) => parts shape that
// qa-asset.ts, export-glb.ts and mesh-stats.ts accept. Template for any kernel with a different signature. Accepts `detail` (0 to 2, src/lod.ts).
import { createPRNG } from '../../src/prng';
import { resolveParams } from '../../src/params';
import { dragonParameters, buildDragonKernel } from '../../src/dragonKernel';

export const buildDragon = (raw: Record<string, unknown> = {}) => {
  const p = resolveParams({ parameters: dragonParameters }, raw);
  return buildDragonKernel(p, createPRNG(p.seed as number));          // seed 0 is a real seed: resolveParams keeps it
};
~~~

## scripts/glb.ts

~~~typescript source-excerpt
// scripts/glb.ts: pure GLB (binary glTF 2.0) writer and checker over triangle arrays. No THREE, no DOM, no fs. Node-testable.
// Input: named parts { name: Tris } (9 numbers per triangle, CCW seen from outside). Output: one scene, one node and one mesh per part,
// POSITION + flat NORMAL (non-indexed, so flat shading survives), unit = metre, Y up, +Z forward: the skill's conventions equal glTF's (references/glb-export.md).
// Gate ids: E1 container (magic, version, length, chunks) · E2 JSON (schema subset we write) · E3 accessors (bounds, alignment, min/max)
//           · E4 round-trip (positions equal the input at float32) · E5 normals (unit length, agree with winding) · E6 counts (triangles in = triangles out)
import type { Gate } from './result';
export type { Gate };
export type Tris = number[];
export type Parts = Record<string, Tris>;

const MAGIC = 0x46546c67, VERSION = 2, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;   // 'glTF', 2, 'JSON', 'BIN\0'
const FLOAT = 5126, ARRAY_BUFFER = 34962;
const pad4 = (n: number) => (n + 3) & ~3;

export type GlbOptions = { generator?: string; materialColor?: [number, number, number, number]; metallic?: number; roughness?: number };

/** Flat normal of triangle at offset i (9 numbers). Zero vector for a degenerate triangle. */
export function faceNormal(t: Tris, i: number): [number, number, number] {
  const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
  return l > 0 ? [nx / l, ny / l, nz / l] : [0, 0, 0];
}

/** Writes parts to a GLB. Throws on empty or non-finite input: run qa-asset first (Q1). */
export function partsToGlb(parts: Parts, opt: GlbOptions = {}): Uint8Array {
  const names = Object.keys(parts);
  if (!names.length) throw new Error('no parts to export');
  const chunks: Float32Array[] = [], bufferViews: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: object[] = [];
  let offset = 0;
  for (const name of names) {
    const t = parts[name];
    if (t.length === 0 || t.length % 9 !== 0) throw new Error(`part "${name}": ${t.length} numbers is not a whole number of triangles (9 each)`);
    if (!t.every(Number.isFinite)) throw new Error(`part "${name}": contains NaN or Infinity`);
    const n = t.length / 3, pos = new Float32Array(t), nor = new Float32Array(t.length), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < t.length; i += 9) {
      const f = faceNormal(t, i);
      for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) nor[i + v * 3 + k] = f[k];
    }
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }   // min/max of the float32 values, as the spec requires
    const base = accessors.length;
    for (const [arr, withBounds] of [[pos, true], [nor, false]] as const) {
      bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target: ARRAY_BUFFER });
      accessors.push({ bufferView: bufferViews.length - 1, componentType: FLOAT, count: n, type: 'VEC3', ...(withBounds ? { min, max } : {}) });
      chunks.push(arr); offset += arr.byteLength;                                    // float32 vec3 data stays 4-byte aligned by construction
    }
    meshes.push({ name, primitives: [{ attributes: { POSITION: base, NORMAL: base + 1 }, material: 0, mode: 4 }] });
    nodes.push({ name, mesh: meshes.length - 1 });
  }
  const json = {
    asset: { version: '2.0', generator: opt.generator ?? 'threejs-asset-generator scripts/glb.ts' },
    scene: 0, scenes: [{ name: 'asset', nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews, buffers: [{ byteLength: offset }],
    materials: [{ name: 'default', pbrMetallicRoughness: { baseColorFactor: opt.materialColor ?? [0.8, 0.8, 0.8, 1], metallicFactor: opt.metallic ?? 0, roughnessFactor: opt.roughness ?? 0.9 } }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json)), jsonLen = pad4(jsonBytes.length), binLen = pad4(offset);
  const total = 12 + 8 + jsonLen + 8 + binLen, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, VERSION, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, JSON_CHUNK, true); out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);   // JSON pads with spaces
  const b0 = 20 + jsonLen; dv.setUint32(b0, binLen, true); dv.setUint32(b0 + 4, BIN_CHUNK, true);
  let p = b0 + 8; for (const c of chunks) { out.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), p); p += c.byteLength; }   // BIN pads with zeros (already zero)
  return out;
}

export type GlbInfo = { json: any; bin: Uint8Array; parts: Parts; normals: Parts };

/** Reads a GLB written by `partsToGlb` (or any GLB that uses non-indexed float32 POSITION/NORMAL). Throws a readable error on a malformed container. */
export function readGlb(bytes: Uint8Array): GlbInfo {
  if (bytes.length < 20) throw new Error(`E1: ${bytes.length} bytes is shorter than a GLB header and one chunk header`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('E1: magic is not "glTF"');
  if (dv.getUint32(4, true) !== VERSION) throw new Error(`E1: version ${dv.getUint32(4, true)}, expected 2`);
  if (dv.getUint32(8, true) !== bytes.length) throw new Error(`E1: header length ${dv.getUint32(8, true)} differs from file size ${bytes.length}`);
  let p = 12, json: any = null, bin = new Uint8Array(0), first = true;
  while (p < bytes.length) {
    if (p + 8 > bytes.length) throw new Error('E1: truncated chunk header');
    const len = dv.getUint32(p, true), type = dv.getUint32(p + 4, true), start = p + 8;
    if (len % 4 !== 0) throw new Error(`E1: chunk length ${len} is not a multiple of 4`);
    if (start + len > bytes.length) throw new Error('E1: chunk runs past the end of the file');
    if (first && type !== JSON_CHUNK) throw new Error('E1: first chunk must be JSON');
    if (type === JSON_CHUNK) { try { json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + len))); } catch (e) { throw new Error(`E2: JSON chunk does not parse: ${(e as Error).message}`); } }
    else if (type === BIN_CHUNK) bin = bytes.subarray(start, start + len);
    first = false; p = start + len;
  }
  if (!json) throw new Error('E1: no JSON chunk');
  const parts: Parts = {}, normals: Parts = {};
  for (const node of json.nodes ?? []) {
    const prim = json.meshes?.[node.mesh]?.primitives?.[0];
    if (!prim) throw new Error(`E2: node "${node.name}" has no mesh primitive`);
    for (const [attr, into] of [['POSITION', parts], ['NORMAL', normals]] as const) {
      const acc = json.accessors?.[prim.attributes?.[attr]], bv = json.bufferViews?.[acc?.bufferView];
      if (!acc || !bv) throw new Error(`E2: node "${node.name}" lacks accessor or bufferView for ${attr}`);
      const from = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), len = acc.count * 12;
      if (from % 4 !== 0 || from + len > bin.length || from + len > (bv.byteOffset ?? 0) + bv.byteLength) throw new Error(`E3: ${attr} of "${node.name}" is misaligned or runs past its bufferView/BIN chunk`);
      into[node.name] = Array.from(new Float32Array(bin.slice(from, from + len).buffer));   // slice copies, so alignment of the source does not matter
    }
  }
  return { json, bin, parts, normals };
}

const f32 = (x: number) => Math.fround(x);
/** Checks a GLB against the parts it was written from. */
export function glbGates(bytes: Uint8Array, source: Parts): Gate[] {
  const gates: Gate[] = [];
  let info: GlbInfo;
  try { info = readGlb(bytes); } catch (e) {
    const m = (e as Error).message, id = /^E(\d)/.exec(m)?.[1] ?? '1';
    return [{ gate: id === '2' ? 'E2 json' : id === '3' ? 'E3 accessors' : 'E1 container', value: m, pass: false, hint: 'the file is malformed: rewrite it with partsToGlb, do not patch bytes' }];
  }
  gates.push({ gate: 'E1 container', value: `${bytes.length} bytes, glTF 2, JSON + BIN chunks, length matches`, pass: true, hint: '' });
  const j = info.json, names = Object.keys(source);
  const jerr: string[] = [];
  if (j.asset?.version !== '2.0') jerr.push('asset.version is not "2.0"');
  if (!Array.isArray(j.scenes) || j.scene !== 0) jerr.push('scene 0 missing');
  if (JSON.stringify((j.nodes ?? []).map((n: any) => n.name)) !== JSON.stringify(names)) jerr.push(`node names ${JSON.stringify((j.nodes ?? []).map((n: any) => n.name))} differ from the parts ${JSON.stringify(names)}`);
  if (j.buffers?.[0]?.byteLength > info.bin.length) jerr.push('buffers[0].byteLength exceeds the BIN chunk');
  gates.push({ gate: 'E2 json', value: jerr.length ? jerr.join('; ') : `${names.length} node(s) named after the parts, one mesh each`, pass: !jerr.length, hint: 'node names carry the part names the QA gates report: keep them identical' });
  const aerr: string[] = [];
  for (const [i, a] of (j.accessors ?? []).entries()) {
    if (a.componentType !== FLOAT || a.type !== 'VEC3') { aerr.push(`accessor ${i} is not float32 VEC3`); continue; }
    if (a.min) {                                   // POSITION only: min/max must be the exact bounds of the data
      const v = new Float32Array(info.bin.slice((j.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0), (j.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0) + a.count * 12).buffer);
      for (let k = 0; k < 3; k++) { let lo = Infinity, hi = -Infinity; for (let q = k; q < v.length; q += 3) { lo = Math.min(lo, v[q]); hi = Math.max(hi, v[q]); } if (lo !== a.min[k] || hi !== a.max[k]) aerr.push(`accessor ${i} min/max[${k}] is not the data bounds`); }
    }
  }
  gates.push({ gate: 'E3 accessors', value: aerr.length ? aerr.join('; ') : `${(j.accessors ?? []).length} accessors in bounds, 4-byte aligned, POSITION min/max exact`, pass: !aerr.length, hint: 'viewers reject a POSITION accessor whose min/max do not match' });
  let worst = 0, bad = '';
  for (const n of names) { const a = source[n], b = info.parts[n] ?? []; if (a.length !== b.length) { worst = Infinity; bad = n; break; } for (let i = 0; i < a.length; i++) { const d = Math.abs(f32(a[i]) - b[i]); if (d > worst) { worst = d; bad = n; } } }
  gates.push({ gate: 'E4 round-trip', value: worst === 0 ? 'positions equal the input at float32' : `part "${bad}" differs by ${worst}`, pass: worst === 0, hint: 'the writer must not reorder or transform vertices' });
  let nbad = 0, nWhere = '';
  for (const n of names) { const t = info.parts[n] ?? [], nr = info.normals[n] ?? []; for (let i = 0; i + 8 < t.length; i += 9) { const f = faceNormal(t, i), len = Math.hypot(nr[i], nr[i + 1], nr[i + 2]); const dot = f[0] * nr[i] + f[1] * nr[i + 1] + f[2] * nr[i + 2]; if (len > 0 && (Math.abs(len - 1) > 1e-5 || dot < 0.999)) { nbad++; nWhere ||= `${n} triangle ${i / 9}`; } } }
  gates.push({ gate: 'E5 normals', value: nbad ? `${nbad} normal(s) off, first at ${nWhere}` : 'unit length and equal to the face normal (winding agrees)', pass: nbad === 0, hint: 'a normal opposite to its winding means the part is inside-out: run qa-asset Q3' });
  const cin = names.reduce((s, n) => s + source[n].length / 9, 0), cout = names.reduce((s, n) => s + (info.parts[n]?.length ?? 0) / 9, 0);
  gates.push({ gate: 'E6 counts', value: `${cin} triangles in, ${cout} out`, pass: cin === cout, hint: 'triangles lost or duplicated in the writer' });
  return gates;
}
~~~

## scripts/mesh-stats.ts

~~~typescript source-excerpt
// scripts/mesh-stats.ts: mesh measurements and optional deployment budget checks (references/budget.md).
//   Kernel (no THREE):   npx tsx scripts/mesh-stats.ts --module ./myKernel.ts --export buildMyTris [--params '{"seed":3}'] [--profile web] [--kind prop]
//   Any asset via tris:  npx tsx scripts/mesh-stats.ts --tris tris.json --meta meta.json --glb asset.glb --profile mobile --kind hero
//   LOD check:           npx tsx scripts/mesh-stats.ts --module ./myKernel.ts --lods [--open a,b] [--symmetric]    (builds detail 2, 1, 0; the builder must accept `detail`)
// Options: --profile mobile|web|vr|desktop  --kind prop|hero|creature|vehicle|building (default prop)  --budget N  --meta meta.json  --glb file.glb  --open a,b|all  --symmetric  --lods
// meta.json (all optional): { "parts": { "body": { "material": "wood", "bone": "root" } }, "textures": [1024, { "name": "atlas", "width": 2048 }], "bones": 12 }
// What meta does not give is reported as "not checked", never guessed. Last stdout line is the @@RESULT JSON. Exit 0 = ok, 2 = a gate failed, 1 = usage or load error.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeParts, type Parts } from './qacheck';
import { assetStats, budgetGates, lodGates, parseBudgetArgs, type Meta } from './budget';
import { emit } from './result';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; }, flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'mesh-stats', ok: false, error: msg }, 1)); };
const modFile = opt('module'), trisFile = opt('tris');
if (!modFile === !trisFile) fail('usage: tsx scripts/mesh-stats.ts (--module file.ts [--export name] [--params json] [--lods] | --tris tris.json) [--profile mobile|web|vr|desktop] [--kind prop|hero|creature|vehicle|building] [--budget N] [--meta meta.json] [--glb file.glb] [--open a,b|all] [--symmetric]');
let target: ReturnType<typeof parseBudgetArgs>;
try { target = parseBudgetArgs(args); } catch (e) { fail((e as Error).message); }
const { platform, kind, triangleLimit } = target;
if (flag('lods') && !modFile) fail('--lods needs --module: a tris.json is one fixed level and cannot be rebuilt at another detail');
let params: Record<string, unknown> = {}, meta: Meta = {};
try { if (opt('params')) params = JSON.parse(opt('params')!); } catch (e) { fail(`--params is not valid JSON: ${(e as Error).message}`); }
try { if (opt('meta')) meta = JSON.parse(readFileSync(resolve(opt('meta')!), 'utf8')); } catch (e) { fail(`--meta cannot be read: ${(e as Error).message}`); }
let glbBytes: number | undefined; try { if (opt('glb')) glbBytes = statSync(resolve(opt('glb')!)).size; } catch (e) { fail(`--glb cannot be read: ${(e as Error).message}`); }
const open = opt('open')?.split(',').map((s) => s.trim()).filter(Boolean);

let parts: Parts, build: ((p: Record<string, unknown>) => unknown) | undefined;
try {
  if (modFile) {
    const mod = (await import(pathToFileURL(resolve(modFile)).href)) as Record<string, unknown>, fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
    const name = opt('export') ?? (fns.length === 1 ? fns[0] : mod.default ? 'default' : undefined);
    if (!name || typeof mod[name] !== 'function') fail(`pick the builder with --export <name>. Functions exported by ${modFile}: ${fns.join(', ') || 'none'}`);
    build = mod[name!] as (p: Record<string, unknown>) => unknown; parts = normalizeParts(await build({ ...params }));
  } else parts = normalizeParts(JSON.parse(readFileSync(resolve(trisFile!), 'utf8')));
} catch (e) {
  const m = (e as Error).message;
  fail(/Cannot find (module|package) ['"]three/.test(m) ? 'the builder imports `three`, which is not installed here. Write tris.json from your driver (groupToTris) and use --tris.' : `cannot build or read the asset: ${m}`);
}

const stats = { ...assetStats(parts!, meta), glbBytes: glbBytes ?? null };
const { gates, skipped } = budgetGates(stats, { ...target, glbBytes }), unverified: string[] = [];
let levels: unknown = null;
if (flag('lods')) { const l = await lodGates(build!, normalizeParts, params, { open, symmetric: flag('symmetric'), budget: triangleLimit ?? undefined }); gates.push(...l.gates); levels = l.levels; }
else if (modFile) skipped.push('L1 to L4 LOD (pass --lods; the builder must accept `detail`)');
if (!stats.drawCallsExact) unverified.push('draw calls are an upper bound (one per part); pass --meta with a material and bone per part for the real number');
unverified.push('gpuVertices counts triangle corners; indexed meshes may share vertices. Frame time, fill rate and GPU memory were not measured in a renderer.');

console.log(gates.map((g) => `${g.pass ? 'PASS' : 'FAIL'}  ${g.gate}: ${g.value}${g.pass ? '' : '  -> ' + g.hint}`).join('\n'));
console.log(`\nstats: ${JSON.stringify(stats)}`);
if (skipped.length) console.log(`not checked: ${skipped.join('; ')}`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const failed = gates.filter((g) => !g.pass);
if (failed.length) console.log(`\n${failed.length} gate(s) failing. Review the affected limits and recheck the revised asset.`);
else if (triangleLimit === null) console.log('\nCounts reported. Set --profile or --budget to check a deployment limit.');
else console.log('\nAll selected budget and LOD checks passed.');
process.exit(emit({ tool: 'mesh-stats', ok: failed.length === 0, gates, stats, skipped, unverified, platform, kind, triangleLimit, levels }));
~~~

## scripts/pack-studio.ts

~~~typescript source-excerpt
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { emit } from './result';
import type { StudioBackground, StudioConfig } from './studio/types';

const usage = 'Usage: tsx scripts/pack-studio.ts --module ./asset.ts [--export buildAsset] [--params json] [--vfx ./effect.ts] [--vfx-export createStudioVfx] [--margin 1.18] [--front-side left|right] [--background dark|light] [--initial-clip Clip] [--autoplay] --out index.html';
const harness = fileURLToPath(new URL('../', import.meta.url));
const scriptImport = (path: string) => JSON.stringify(process.platform === 'win32' ? path.replace(/\\/g, '/') : path);

async function main() {
  const { values } = parseArgs({ options: {
    module: { type: 'string' }, export: { type: 'string' }, params: { type: 'string' },
    out: { type: 'string' }, vfx: { type: 'string' }, 'vfx-export': { type: 'string' },
    margin: { type: 'string' }, 'front-side': { type: 'string' }, background: { type: 'string' },
    'initial-clip': { type: 'string' }, autoplay: { type: 'boolean' },
  } });
  if (!values.module || !values.out) throw new Error(usage);
  if (extname(values.out).toLowerCase() !== '.html') throw new Error('--out must end in .html');
  if (values['vfx-export'] && !values.vfx) throw new Error('--vfx-export requires --vfx <module>');

  let params: unknown;
  try {
    params = JSON.parse(values.params ?? '{}');
  } catch (error) {
    throw new Error(`--params is not valid JSON: ${(error as Error).message}`);
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('--params must be a JSON object');
  const margin = Number(values.margin ?? 1.18);
  if (!Number.isFinite(margin) || margin < 1) throw new Error('--margin must be a finite number at least 1');
  const frontSide = values['front-side'] ?? 'left';
  if (frontSide !== 'left' && frontSide !== 'right') throw new Error('--front-side must be left or right');
  const background = (values.background ?? 'dark') as StudioBackground;
  if (background !== 'dark' && background !== 'light') throw new Error('--background must be dark or light');

  const modulePath = resolve(values.module);
  const vfxPath = values.vfx && resolve(values.vfx);
  const out = resolve(values.out);
  const config: StudioConfig = {
    module: basename(modulePath), builder: values.export, params: params as Record<string, unknown>, margin, frontSide, background,
    ...(values['initial-clip'] ? { initialClip: values['initial-clip'] } : {}),
    ...(values.autoplay ? { autoplay: true } : {}),
  };
  const runtime = fileURLToPath(new URL('./studio/runtime.ts', import.meta.url));
  const configJson = JSON.stringify(config);
  // Parse the JSON string to preserve parameter names such as "__proto__" as own properties.
  const entry = `
    import { startStudio } from ${scriptImport(runtime)};
    await startStudio(
      JSON.parse(${JSON.stringify(configJson)}),
      () => import(${scriptImport(modulePath)}),
      ${vfxPath ? `() => import(${scriptImport(vfxPath)})` : 'undefined'},
      ${JSON.stringify(values['vfx-export']) ?? 'undefined'},
    );
  `;

  const { build } = await import('esbuild');
  const skipCanonicalResolve = Symbol('studio-three-resolve');
  const bundle = await build({
    stdin: { contents: entry, loader: 'ts', sourcefile: 'studio-entry.ts', resolveDir: harness },
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify: true, legalComments: 'inline', logLevel: 'silent', write: false, metafile: true,
    absWorkingDir: harness,
    loader: Object.fromEntries(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ktx2'].map((ext) => [ext, 'dataurl'])),
    plugins: [{
      name: 'studio-three',
      setup(build) {
        // The studio, asset, and addons share the same Three.js instance, even for external asset paths.
        build.onResolve({ filter: /^three(?:\/|$)/ }, (args) => {
          if (args.pluginData === skipCanonicalResolve) return;
          return build.resolve(args.path, { kind: args.kind, resolveDir: harness, pluginData: skipCanonicalResolve });
        });
      },
    }],
  });
  const external = Object.values(bundle.metafile.outputs).flatMap((output) => output.imports.map((item) => item.path));
  if (external.length) throw new Error(`Studio cannot bundle external imports: ${external.join(', ')}`);
  if (bundle.outputFiles.length !== 1) throw new Error('Studio bundle must contain one inline script');
  const script = bundle.outputFiles[0].text;
  if (/<\/script/i.test(script)) throw new Error('Studio bundle contains an unescaped script closing tag');
  const template = await readFile(new URL('./studio/index.html', import.meta.url), 'utf8');
  const threeEntry = createRequire(import.meta.url).resolve('three');
  const license = await readFile(resolve(dirname(threeEntry), '..', 'LICENSE'), 'utf8');
  const html = template.replace('<!-- THREE_LICENSE -->', () => `<!-- Three.js license\n${license.trim()}\n-->`)
    .replace('/* STUDIO_BUNDLE */', () => script);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, 'utf8');

  for (const warning of bundle.warnings) console.warn(`esbuild: ${warning.text}`);
  console.log(`Wrote ${out} (${Buffer.byteLength(html)} bytes)`);
  const unverified = ['Browser render and capture; run capture-studio to verify'];
  console.log(`UNVERIFIED: ${unverified[0]}`);
  return emit({
    tool: 'pack-studio', ok: true, out, bytes: Buffer.byteLength(html), module: modulePath,
    builder: config.builder ?? null, params: config.params, vfx: vfxPath || null, margin, frontSide, background,
    initialClip: config.initialClip ?? null, autoplay: Boolean(config.autoplay),
    unverified,
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = emit({ tool: 'pack-studio', ok: false, error: message }, 1);
}
~~~

## scripts/package.json

~~~json source-excerpt
{ "type": "module", "private": true }
~~~

## scripts/png.ts

~~~typescript source-excerpt
// scripts/png.ts: minimal zero-dependency PNG RGBA writer & 8-bit PNG reader using node:zlib.
// Lets qa-asset.ts, ref-compare.ts and ref-intake.ts write/read PNGs even when `sharp` is not installed.
import { writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePngRgba(rgba: Uint8Array, width: number, height: number): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`encodePngRgba: expected ${width * height * 4} bytes, got ${rgba.length}`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.allocUnsafe(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + stride);
    raw[rowOff] = 0; // filter None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowOff + 1);
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function writePngRgba(file: string, rgba: Uint8Array, width: number, height: number): void {
  writeFileSync(file, encodePngRgba(rgba, width, height));
}

export function scaleNearestRgba(rgba: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  const s = Math.max(1, Math.round(scale)), ow = width * s, oh = height * s;
  const out = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const sy = Math.floor(y / s);
    for (let x = 0; x < ow; x++) {
      const si = (sy * width + Math.floor(x / s)) * 4, di = (y * ow + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes non-interlaced 8-bit PNG (Gray, RGB, Gray+Alpha, RGBA) into RGBA. Returns null for non-PNG or unsupported formats. */
export function decodePngRgba(buf: Buffer): { rgba: Uint8Array; width: number; height: number } | null {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return null;
  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0;
  const idats: Buffer[] = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (off + 12 + len > buf.length) return null;
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bppMap: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const bpp = bppMap[colorType];
  if (!width || !height || bitDepth !== 8 || !bpp || interlace !== 0 || !idats.length) return null;
  let inflated: Buffer;
  try { inflated = inflateSync(Buffer.concat(idats)); } catch { return null; }
  const stride = width * bpp;
  if (inflated.length < height * (1 + stride)) return null;

  const recon = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = inflated[y * (1 + stride)], srcOff = y * (1 + stride) + 1, dstOff = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = inflated[srcOff + x];
      const a = x >= bpp ? recon[dstOff + x - bpp] : 0;
      const b = y > 0 ? recon[dstOff - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? recon[dstOff - stride + x - bpp] : 0;
      let v = raw;
      if (f === 1) v = (raw + a) & 255;
      else if (f === 2) v = (raw + b) & 255;
      else if (f === 3) v = (raw + ((a + b) >> 1)) & 255;
      else if (f === 4) v = (raw + paeth(a, b, c)) & 255;
      else if (f !== 0) return null;
      recon[dstOff + x] = v;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const di = i * 4, si = i * bpp;
    if (colorType === 6) { rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = recon[si + 3]; }
    else if (colorType === 2) { rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = 255; }
    else if (colorType === 4) { rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[si]; rgba[di + 3] = recon[si + 1]; }
    else { rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[si]; rgba[di + 3] = 255; }
  }
  return { rgba, width, height };
}
~~~

## scripts/qa-asset.ts

~~~typescript source-excerpt
// scripts/qa-asset.ts: QA gates + review image for a generated asset. Run it before you say an asset is done (references/qa-gates.md).
//   Kernel (no THREE):   npx tsx scripts/qa-asset.ts --module ./myKernel.ts --export buildMyTris [--params '{"seed":3}']
//   Any asset via tris:  npx tsx scripts/qa-asset.ts --tris tris.json            (tris.json as in references/reference-matching.md §5)
// Options: --profile web --kind prop  --budget N  --open wingL,wingR | all  --symmetric  --footprint  --grounded  --ground-y 0  --out dir (default .)  --no-render
// Q6 grounding: on for --tris (the final asset). Off for --module (a raw kernel is grounded later by groundAsset) unless --grounded or --footprint.
// --module rebuilds the asset to check Q8 determinism and Q9 seed 0; --tris reports both as UNVERIFIED.
// Both accept Tris, { tris }, named parts { name: Tris, ... }, or { parts: { name: Tris, ... } }.
// Writes review.png (2 x 2: front | side / top | 3/4): LOOK at it. Prints the gate table; last stdout line is the @@RESULT JSON. Exit 0 = ok, 2 = a gate failed, 1 = usage or load error.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writePngRgba } from './png';
import { extractObjectParts, selectBuilder, unpackAsset } from './asset-builder';
import { normalizeParts, qaGates, determinismGates, type Gate, type Parts, type QAOptions } from './qacheck';
import { parseBudgetArgs } from './budget';
import { renderSheet, WRONG_TOL } from './review';
import { emit, registerThreeHook } from './result';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; }, flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'qa-asset', ok: false, error: msg }, 1)); };
const fmtGates = (g: Gate[]) => g.map((x) => `${x.pass ? 'PASS' : 'FAIL'}  ${x.gate}: ${x.value}${x.pass ? '' : '  -> ' + x.hint}`).join('\n');

const num = (k: string) => { const v = opt(k); if (v === undefined) return undefined; const n = Number(v); if (!Number.isFinite(n)) fail(`--${k} needs a number, got "${v}"`); return n; };
const out = resolve(opt('out') ?? '.'), modFile = opt('module'), trisFile = opt('tris');
if (!modFile === !trisFile) fail('usage: tsx scripts/qa-asset.ts (--module file.ts [--export name] [--params json] | --tris tris.json) [--profile name] [--kind name] [--budget N] [--open a,b|all] [--symmetric] [--footprint] [--grounded] [--ground-y N] [--out dir] [--no-render]');
let target: ReturnType<typeof parseBudgetArgs>;
try { target = parseBudgetArgs(args); } catch (e) { fail((e as Error).message); }
const { platform, kind, triangleLimit } = target;
const o: QAOptions = { budget: triangleLimit ?? undefined, groundY: num('ground-y'), open: opt('open')?.split(',').map((s) => s.trim()).filter(Boolean), symmetric: flag('symmetric'), footprint: flag('footprint') };
o.grounding = !modFile || flag('grounded') || flag('footprint');   // Q6 needs the final grounded asset: always for --tris, only on request for a raw kernel

let parts: Parts, build: ((p: Record<string, unknown>) => Promise<Parts>) | undefined, params: Record<string, unknown> = {};
try { if (opt('params')) params = JSON.parse(opt('params')!); } catch (e) { fail(`--params is not valid JSON: ${(e as Error).message}`); }
let threeMod: typeof import('three') | undefined;
try { threeMod = await import('three'); } catch { threeMod = undefined; }
const toParts = (built: unknown): Parts => {
  if ((built as { isBufferGeometry?: boolean } | null)?.isBufferGeometry) {
    throw new Error('builder returned a THREE.BufferGeometry; wrap it in a THREE.Mesh/Object3D (or return { root, animations }) or pass triangle arrays via --tris');
  }
  const b = built as { isObject3D?: boolean; root?: { isObject3D?: boolean } } | null;
  if (b?.isObject3D || b?.root?.isObject3D) {
    if (!threeMod) throw new Error('the builder returns a THREE.Object3D, which requires `three`. Install three or write tris.json and use --tris.');
    return extractObjectParts(unpackAsset(built).root, threeMod);
  }
  return normalizeParts(built);
};
try {
  if (modFile) {
    const hooks = registerThreeHook();
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(resolve(modFile)).href)) as Record<string, unknown>;
    } finally {
      hooks?.deregister();
    }
    const { build: rawBuild } = selectBuilder(mod, opt('export'), modFile);
    build = async (p: Record<string, unknown>) => toParts(await rawBuild(p, threeMod as typeof import('three')));
    parts = await build({ ...params });
  } else parts = normalizeParts(JSON.parse(readFileSync(resolve(trisFile!), 'utf8')));
} catch (e) {
  const m = (e as Error).message;
  fail(/Cannot find (module|package) ['"]three/.test(m) ? `the builder imports \`three\`, which is not installed here (${m.split('\n')[0]}). Install three, or write tris.json from your driver and use --tris.` : `cannot build or read the asset: ${m}`);
}

const { gates, skipped, stats } = qaGates(parts!, o), unverified: string[] = [];
if (build) gates.push(...(await determinismGates(build, params)));
else unverified.push('Q8 determinism and Q9 seed 0 (--tris cannot rebuild the asset; run --module on the kernel, or compare two tris.json runs)');

let review: string | null = null, legend: { part: string; color: string }[] = [], wrong: Record<string, number> = {};
if (!flag('no-render') && gates[0].pass) {
  const sheet = renderSheet(parts!, { open: o.open }); legend = sheet.legend; wrong = sheet.wrong;
  const over = Object.entries(wrong).filter(([, c]) => c > WRONG_TOL);
  gates.push({ gate: 'Q10 visible faces', value: over.length ? over.map(([n, c]) => `${n} ${c}px magenta`).join(', ') : `no back faces on top of the surface (noise limit ${WRONG_TOL}px per part)`, pass: over.length === 0, hint: 'magenta in review.png = a triangle faces away from the camera but is the nearest surface: inside-out part (Q3), a hole (Q4), or a sheet that needs --open' });
  mkdirSync(out, { recursive: true });
  review = join(out, 'review.png');
  writePngRgba(review, sheet.rgba, sheet.width, sheet.height);
} else if (!flag('no-render')) unverified.push('review.png (Q1 failed, nothing to draw)');
else unverified.push('review.png (--no-render)');

const wrongTotal = Object.values(wrong).reduce((a, b) => a + b, 0);
console.log(fmtGates(gates));
console.log(`\nstats: ${JSON.stringify(stats)}`);
if (skipped.length) console.log(`not checked: ${skipped.join('; ')}`);
if (legend.length) console.log(`review colours: ${legend.map((l) => `${l.part} ${l.color}`).join(', ')}`);
if (unverified.length) console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} gate(s) failing. Inspect the affected geometry and verify the revised build.` : review ? `\nAll evaluated checks pass. Inspect ${review} for visible geometry issues.` : '\nEvaluated checks passed. No review image was produced.');
process.exit(emit({ tool: 'qa-asset', ok: failed.length === 0, gates, stats, skipped, unverified, platform, kind, triangleLimit, review, legend, wrongFacePixels: wrongTotal }));
~~~

## scripts/qacheck.ts

~~~typescript source-excerpt
// scripts/qacheck.ts: pure QA gates over triangle arrays (9 numbers per triangle, CCW seen from outside). No THREE, no DOM, no fs. Node-testable.
// A "build" returns Tris, { tris }, named parts, or { parts: named parts }. Parts let the winding and closed-mesh gates
// skip zero-thickness sheets (wings, flags) with `open`, while every closed part is still held to them.
// Gate ids: Q1 finite · Q2 degenerate · Q3 winding · Q4 closed · Q5 budget · Q6 grounding · Q7 symmetry (opt-in) · Q8 determinism · Q9 seed 0
// (Q10 visible faces comes from the rendered review image, see qa-asset.ts and review.ts.)
import type { Gate } from './result';
export type { Gate };
export type Tris = number[];
export type Parts = Record<string, Tris>;
export type QAOptions = {
  budget?: number;          // max triangles when a deployment profile or explicit limit is selected
  open?: string[];          // part names that are sheets (no volume); 'all' skips Q3 and Q4 for everything
  symmetric?: boolean;      // Q7: the vertex set must equal its mirror image through x = 0
  grounding?: boolean;      // run Q6, default true. A raw kernel is not grounded (groundAsset does that), so qa-asset turns it off for --module unless --grounded
  footprint?: boolean;      // Q6 also requires the footprint centred on x = z = 0 (use on the FINAL grounded asset, not on a raw kernel)
  groundY?: number;         // expected lowest Y, default 0 (a composite with a terrain slab defines Y = 0 as the slab top)
  weld?: number;            // vertex weld distance for Q4 and Q7, default 1e-4 (0.1 mm)
  maxDegenerate?: number;   // allowed degenerate triangles, default 0
};
export const DEFAULTS = { weld: 1e-4, degenerate: 1e-9, groundTol: 1e-3, footprintTol: 0.02, symmetryTol: 0.01 };

const num = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number');
/** Normalize the triangle formats used by the QA, budget, export, and reference tools. */
export function normalizeParts(out: unknown): Parts {
  if (num(out)) return { asset: out };
  if (out && typeof out === 'object') {
    const o = out as Record<string, unknown>;
    if (num(o.tris)) return { asset: o.tris };
    const flat = Object.entries(o).filter((entry): entry is [string, Tris] => num(entry[1]));
    if (flat.length) return Object.fromEntries(flat);

    const wrapper = o.parts;
    if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
      const named: [string, Tris][] = [];
      for (const [name, tris] of Object.entries(wrapper)) {
        if (!num(tris)) throw new Error(`parts.${name} must be an array of triangle coordinates`);
        named.push([name, tris]);
      }
      if (!named.length) throw new Error('parts must contain at least one named triangle array');
      return Object.fromEntries(named);
    }
  }
  throw new Error('builder must return number[], { tris: number[] }, named triangle parts, or { parts: named triangle parts }');
}
export const flatten = (parts: Parts): Tris => { const out: number[] = []; for (const k of Object.keys(parts)) for (const v of parts[k]) out.push(v); return out; };
export const triCount = (t: Tris) => Math.floor(t.length / 9);

export function boundsOf(t: Tris) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < t.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], t[i + k]); max[k] = Math.max(max[k], t[i + k]); }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}

/** Signed volume of a closed mesh: > 0 means outward CCW. Same formula as src/tri.ts (kept here so scripts/ stays self-contained). */
export function signedVolume(t: Tris) {
  let v = 0;
  for (let i = 0; i + 8 < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

export const triArea = (t: Tris, i: number) => {
  const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
};
/** Indices (triangle numbers) whose area is below `rel` x diagonal^2 of the whole asset. */
export function degenerateTris(t: Tris, rel = DEFAULTS.degenerate): number[] {
  const diag = Math.hypot(...boundsOf(t).size) || 1, eps = rel * diag * diag, out: number[] = [];
  for (let q = 0; q < triCount(t); q++) if (!(triArea(t, q * 9) > eps)) out.push(q);
  return out;
}

// Rounds symmetrically around 0 so that x and -x always land in mirrored cells (Math.round(-0.5) is -0, Math.round(0.5) is 1).
const cell = (v: number, tol: number) => Math.sign(v) * Math.round(Math.abs(v) / tol) || 0;
const vkey = (t: Tris, i: number, tol: number, flipX = false) => `${(flipX ? -1 : 1) * cell(t[i], tol) || 0},${cell(t[i + 1], tol)},${cell(t[i + 2], tol)}`;

/** Closed-mesh report after welding vertices within `tol`. boundary = directed edges without a partner (a hole); duplicated = directed edges used twice (overlap or mixed winding). */
export function edgeReport(t: Tris, tol = DEFAULTS.weld) {
  const ids = new Map<string, number>(), id = (i: number) => { const k = vkey(t, i, tol); let v = ids.get(k); if (v === undefined) ids.set(k, (v = ids.size)); return v; };
  const dir = new Map<string, number>();
  for (let q = 0; q < triCount(t); q++) {
    const a = id(q * 9), b = id(q * 9 + 3), c = id(q * 9 + 6);
    if (a === b || b === c || a === c) continue;                       // collapsed by welding: Q2 reports these
    for (const [p, r] of [[a, b], [b, c], [c, a]]) dir.set(`${p}>${r}`, (dir.get(`${p}>${r}`) ?? 0) + 1);
  }
  let boundary = 0, duplicated = 0;
  for (const [k, n] of dir) { const [p, r] = k.split('>'); if (!dir.has(`${r}>${p}`)) boundary++; if (n > 1) duplicated++; }
  return { boundary, duplicated, edges: dir.size };
}

/** Share (0..1) of welded vertices whose mirror image through x = 0 is not a vertex of the asset.
 *  Vertices, not triangles: a box splits every quad along a diagonal that is not mirror-symmetric, so a symmetric shape would fail a triangle comparison. */
export function symmetryGap(t: Tris, tol = DEFAULTS.weld) {
  const have = new Set<string>(), keys: [string, string][] = [];
  for (let i = 0; i + 2 < t.length; i += 3) { const k = vkey(t, i, tol, false); if (!have.has(k)) { have.add(k); keys.push([k, vkey(t, i, tol, true)]); } }
  let missing = 0; for (const [, m] of keys) if (!have.has(m)) missing++;
  return keys.length ? missing / keys.length : 0;
}

/** Rounded 32-bit hash of coordinates (1e-6 grid) and length. For comparing two builds, not for security. */
export function hashTris(t: Tris): number {
  let h = t.length | 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + Math.round(t[i] * 1e6)) | 0;
  return h;
}

const fmt = (v: number, d = 3) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
const list = (names: string[], max = 4) => names.slice(0, max).join(', ') + (names.length > max ? `, +${names.length - max} more` : '');

/** Q1..Q7 over a built asset. `skipped` names the unchecked gates and why they were skipped. */
export function qaGates(parts: Parts, o: QAOptions = {}): { gates: Gate[]; skipped: string[]; stats: Record<string, unknown> } {
  const gates: Gate[] = [], skipped: string[] = [], all = flatten(parts), names = Object.keys(parts);
  const tris = triCount(all), bad = all.findIndex((v) => !Number.isFinite(v));
  const stats: Record<string, unknown> = { triangles: tris, parts: Object.fromEntries(names.map((n) => [n, triCount(parts[n])])), hash: hashTris(all) };
  const badPart = names.find((n) => parts[n].length % 9 !== 0);
  gates.push({
    gate: 'Q1 finite',
    value: tris === 0 ? 'no triangles' : badPart ? `part "${badPart}" has ${parts[badPart].length} numbers (not a multiple of 9)` : bad >= 0 ? `NaN or Infinity at number ${bad} (triangle ${Math.floor(bad / 9)})` : `${tris} triangles, all coordinates finite`,
    pass: tris > 0 && !badPart && bad < 0,
    hint: 'a division by zero or a zero-length normalize upstream; a part must hold whole triangles (9 numbers each)',
  });
  if (!gates[0].pass) return { gates, skipped: ['Q2 to Q7 (Q1 failed, the numbers would be meaningless)'], stats };

  const b = boundsOf(all);
  stats.size = b.size.map((v) => +v.toFixed(3)); stats.min = b.min.map((v) => +v.toFixed(3)); stats.max = b.max.map((v) => +v.toFixed(3));
  const degen = degenerateTris(all), maxDeg = o.maxDegenerate ?? 0;
  gates.push({ gate: 'Q2 degenerate', value: `${degen.length} zero-area triangles${degen.length ? ` (first: ${list(degen.slice(0, 4).map(String), 4)})` : ''}`, pass: degen.length <= maxDeg, hint: 'a collapsed ring or a ring of radius 0 (tube end, loft stage with scale 0) emits zero-area triangles; cap with a fan or drop the ring' });

  const openAll = (o.open ?? []).includes('all'), isOpen = (n: string) => openAll || (o.open ?? []).includes(n);
  const closed = names.filter((n) => !isOpen(n) && parts[n].length >= 9);
  if (openAll) { skipped.push('Q3 winding', 'Q4 closed (--open all)'); gates.push({ gate: 'Q3 winding', value: 'skipped (--open all)', pass: true, hint: '' }, { gate: 'Q4 closed', value: 'skipped (--open all)', pass: true, hint: '' }); }
  else {
    const vols = closed.map((n) => [n, signedVolume(parts[n])] as const), neg = vols.filter(([, v]) => !(v > 1e-9));
    gates.push({ gate: 'Q3 winding', value: neg.length ? neg.map(([n, v]) => `${n} volume ${fmt(v, 4)}`).join(', ') : `${closed.length} closed part(s), all volumes > 0${names.length > closed.length ? ` (open: ${list(names.filter((n) => !closed.includes(n)))})` : ''}`, pass: neg.length === 0, hint: 'volume < 0 while Q4 passes: the part is inside-out, swap two vertices per triangle (mirrorTris does this). If Q4 lists open edges for the same part, it is a sheet (fan, flag, wing; its "volume" is meaningless and can be negative): list it in --open' });
    const reps = closed.map((n) => [n, edgeReport(parts[n], o.weld)] as const), leaky = reps.filter(([, r]) => r.boundary || r.duplicated);
    gates.push({ gate: 'Q4 closed', value: leaky.length ? leaky.map(([n, r]) => `${n}: ${r.boundary} open edges, ${r.duplicated} duplicated`).join('; ') : `${closed.length} closed part(s), every edge has a partner`, pass: leaky.length === 0, hint: 'open edges: a missing cap or a seam that is not welded (jitter before add(), then weld). duplicated edges: overlapping faces or one triangle with flipped winding' });
  }

  if (o.budget === undefined) skipped.push('Q5 budget (set --profile or --budget)');
  else gates.push({ gate: 'Q5 budget', value: `${tris} of ${o.budget} triangles`, pass: tris <= o.budget, hint: 'reduce segments or sides, merge parts, or drop small details to fit the selected limit' });

  if (o.grounding === false) skipped.push('Q6 grounding (raw kernel: groundAsset does this; check the final asset with --tris, or pass --grounded if this builder grounds itself)');
  else {
  const gy = o.groundY ?? 0, off = b.min[1] - gy, size = Math.max(b.size[0], b.size[2]) || 1;
  const cx = b.center[0] / size, cz = b.center[2] / size, centred = Math.abs(cx) <= DEFAULTS.footprintTol && Math.abs(cz) <= DEFAULTS.footprintTol;
  gates.push({
    gate: 'Q6 grounding',
    value: `lowest Y ${fmt(b.min[1])} (expected ${fmt(gy)})${o.footprint ? `, footprint centre ${fmt(b.center[0])}, ${fmt(b.center[2])}` : ''}`,
    pass: Math.abs(off) <= DEFAULTS.groundTol && (!o.footprint || centred),
    hint: Math.abs(off) > DEFAULTS.groundTol ? `asset floats or sinks by ${fmt(off)} m: wrap it with groundAsset (src/lifecycle.ts) and test the wrapped result` : 'footprint is off-centre: groundAsset(content, true) centres x and z',
  });
  if (!o.footprint) skipped.push('Q6 footprint centring (pass --footprint on the final grounded asset)');
  }

  if (o.symmetric) {
    const gap = symmetryGap(all, o.weld);
    gates.push({ gate: 'Q7 symmetry', value: `${(gap * 100).toFixed(1)}% of vertices have no mirror partner`, pass: gap <= DEFAULTS.symmetryTol, hint: 'one side was built twice with different streams, or a bare negative-scale applyMatrix4 was used: build one side and mirror through add()/mirrorTris. Also: a tube or loft with an ODD side count has a vertex on one side and a flat on the other when its ring starts on the X axis, use an even count' });
  } else skipped.push('Q7 symmetry (opt-in: --symmetric)');
  return { gates, skipped, stats };
}

type Build = (params: Record<string, unknown>) => unknown | Promise<unknown>;
const SEEDS = [1, 2, 42, 101, 12345];
/** Q8 and Q9: needs the builder itself, so it only runs in module mode. */
export async function determinismGates(build: Build, params: Record<string, unknown> = {}, seedKey = 'seed'): Promise<Gate[]> {
  const run = async (p: Record<string, unknown>) => flatten(normalizeParts(await build({ ...p })));
  const a = await run(params), c = await run(params);
  let at = -1; const n = Math.max(a.length, c.length); for (let i = 0; i < n; i++) if (!Object.is(a[i], c[i])) { at = i; break; }
  const gates: Gate[] = [{ gate: 'Q8 determinism', value: at < 0 ? `two builds identical (${triCount(a)} triangles)` : `builds differ at number ${at} (triangle ${Math.floor(at / 9)})`, pass: at < 0, hint: 'no Math.random, Date.now, DOM or module-level mutable state; give each feature its own forked stream (SKILL.md §2)' }];
  const zero = await run({ ...params, [seedKey]: 0 }), others = await Promise.all(SEEDS.map((s) => run({ ...params, [seedKey]: s }))), hs = others.map(hashTris), h0 = hashTris(zero);
  const seeded = new Set(hs).size > 1, alias = seeded ? SEEDS[hs.indexOf(h0)] : undefined, finite = zero.length > 0 && zero.every(Number.isFinite);
  gates.push({
    gate: 'Q9 seed 0',
    value: !finite ? 'seed 0 gives no or non-finite triangles' : !seeded ? `asset does not depend on "${seedKey}"` : alias !== undefined ? `seed 0 gives the same asset as seed ${alias}` : 'seed 0 builds its own asset',
    pass: finite && alias === undefined,
    hint: 'seed 0 is being replaced: look for `seed || fallback` (use ??) or a schema `min` above 0',
  });
  return gates;
}
~~~

## scripts/ref-compare.ts

~~~typescript source-excerpt
// Compare geometry, global palette (G3), and semantic regional color (G4 via CIEDE2000) with ref.json.
//   1. Write the same triangle formats as qa-asset and mesh-stats. Add hex colors to { tris, colors } or { parts, colors } for G3.
//   2. npx tsx ref-compare.ts ref.json tris.json [--mode fast|quick|balance|quality] [--regions model-regions.json | --module ./asset.ts [--export buildAsset]] [--g4-threshold 12]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractObjectParts, selectBuilder, unpackAsset } from './asset-builder';
import {
  evaluateRegionalColorQC,
  sampleModelRegionColors,
  type ModelRegionSample,
  type RegionalColorQCReport,
} from './color-qc';
import { scaleNearestRgba, writePngRgba } from './png';
import { compareToRef, formatGates, RES, type RefData } from './refcheck';
import { flatten, normalizeParts } from './qacheck';
import { emit, registerThreeHook } from './result';

const rawArgs = process.argv.slice(2);
const positional: string[] = [];
const opts = new Map<string, string>();
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const val = rawArgs[i + 1];
    if (val !== undefined && !val.startsWith('--')) { opts.set(key, val); i++; }
    else opts.set(key, 'true');
  } else positional.push(a);
}

const refFile = positional[0] ?? 'ref.json';
const trisFile = positional[1] ?? 'tris.json';
const mode = opts.get('mode') ?? 'balance';
const regionsPath = opts.get('regions');
const modulePath = opts.get('module');
const g4ThreshRaw = opts.get('g4-threshold');
const fail = (error: string): never => { console.error(error); process.exit(emit({ tool: 'ref-compare', ok: false, error }, 1)); };

function normalizeModelSamples(raw: unknown): Record<string, ModelRegionSample> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = (raw as Record<string, unknown>).regionColors && typeof (raw as Record<string, unknown>).regionColors === 'object'
    ? (raw as Record<string, unknown>).regionColors as Record<string, unknown>
    : raw as Record<string, unknown>;
  const out: Record<string, ModelRegionSample> = {};
  for (const [region, val] of Object.entries(obj)) {
    if (typeof val === 'string') out[region] = { region, hex: val, source: 'declared' };
    else if (val && typeof val === 'object') {
      const v = val as Partial<ModelRegionSample>;
      out[region] = { region, source: v.source ?? 'declared', ...v };
    }
  }
  return out;
}

let ref: RefData;
let compared: ReturnType<typeof compareToRef>;
let g4Report: RegionalColorQCReport | undefined;

try {
  ref = JSON.parse(readFileSync(refFile, 'utf8')) as RefData;
  let tris: number[];
  let colors: string[] = [];
  let modelSamples: Record<string, ModelRegionSample> = {};

  if (modulePath) {
    const THREE = await import('three');
    const hooks = registerThreeHook();
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(resolve(modulePath)).href)) as Record<string, unknown>;
    } finally {
      hooks?.deregister();
    }
    const { build } = selectBuilder(mod, opts.get('export'), modulePath);
    const params = opts.get('params') ? JSON.parse(opts.get('params')!) : {};
    const { root } = unpackAsset(await build(params, THREE));
    const parts = extractObjectParts(root, THREE);
    tris = flatten(parts);
    if (ref.regions?.length && mode.toLowerCase() !== 'fast' && mode.toLowerCase() !== 'quick') {
      modelSamples = sampleModelRegionColors(root, ref.regions);
      colors = Object.values(modelSamples).map((s) => s.hex).filter((h): h is string => Boolean(h));
    }
  } else {
    const model = JSON.parse(readFileSync(trisFile, 'utf8'));
    const parts = normalizeParts(model);
    tris = flatten(parts);
    colors = Array.isArray(model?.colors) ? model.colors.filter((color: unknown): color is string => typeof color === 'string') : [];
    if (model?.regionColors) modelSamples = normalizeModelSamples(model.regionColors);
  }

  if (regionsPath) {
    modelSamples = { ...modelSamples, ...normalizeModelSamples(JSON.parse(readFileSync(resolve(regionsPath), 'utf8'))) };
  }

  if (!tris.length || tris.length % 9 || !tris.every(Number.isFinite)) {
    throw new Error('model needs finite coordinates in groups of nine per triangle');
  }
  compared = compareToRef(tris, ref, colors);

  if (ref.regions?.length) {
    const thresholds = g4ThreshRaw ? { maxDeltaE00: Number(g4ThreshRaw) } : undefined;
    if (g4ThreshRaw && !Number.isFinite(thresholds!.maxDeltaE00)) throw new Error('--g4-threshold must be a finite number');
    g4Report = evaluateRegionalColorQC(ref.regions, modelSamples, { mode, thresholds });
    if (g4Report.gate) compared.gates.push(g4Report.gate);
  }
} catch (e) {
  fail(`cannot compare ${refFile} and ${modulePath ?? trisFile}: ${(e as Error).message}`);
}

const { gates, diffs, angles } = compared;
console.log(formatGates(gates));
if (g4Report && !g4Report.gate) {
  console.log(`${g4Report.status}  G4 regional color: ${g4Report.reason}`);
}
const written: string[] = [];
for (const [view, rgba] of Object.entries(diffs)) {
  const f = `diff-${view}.png`, up = scaleNearestRgba(rgba, RES, RES, 4);
  try { writePngRgba(f, up, RES * 4, RES * 4); }
  catch (e) { fail(`cannot write ${f}: ${(e as Error).message}`); }
  written.push(f);
  console.log('wrote', f);
}
const g4Error = g4Report?.status === 'ERROR';
const failed = gates.filter((g) => !g.pass);
console.log(failed.length || g4Error ? `\n${failed.length} numeric check(s) failed. Inspect the relevant view and compare it with the reference.` : '\nNumeric checks passed. Compare the rendered identifying features with the reference.');
process.exit(emit({
  tool: 'ref-compare',
  ok: failed.length === 0 && !g4Error,
  gates,
  failed: failed.length,
  diffs: written,
  angles,
  ...(g4Report ? { g4: g4Report } : {}),
}));
~~~

## scripts/ref-intake.ts

~~~typescript source-excerpt
// scripts/ref-intake.ts: reference image(s) or a multi-view turnaround sheet -> ref.json (silhouette masks, aspect, palette). Run ONCE per reference.
//   Separate views:   npx tsx ref-intake.ts front=ref_front.png side=ref_side.png --out ref.json [--tol 40] [--w 1.2 --d 2.5] [--no-flood]
//   Multi-view sheet: npx tsx ref-intake.ts --sheet sheet.png --grid 3x2 --views front,back,top,bottom,side,34 --out ref.json [--tol 18]
//   Uneven 3-view:    npx tsx ref-intake.ts --sheet sheet.png --grid auto --views front,side,back --out ref.json
// Reads standard 8-bit PNGs without external dependencies; uses `sharp` when installed (required for JPEG/WebP).
// Writes <out-stem>-<view>-mask.png beside --out. LOOK at it once; if the silhouette is wrong, adjust --tol.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, parse, resolve } from 'node:path';
import { loadSharp } from './sharp';
import { decodePngRgba, writePngRgba } from './png';
import { extractROIBoxStats, rgbToHex, type SemanticRegionRef } from './color-qc';
import { maskFromRGBA, frameMask, dominantColors, maskToB64, splitGridSheet, splitAutoHorizontalBands, fitRgba, type RefData, type View } from './refcheck';
import { emit } from './result';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes('--' + k);
const fail = (error: string): never => { console.error(error); process.exit(emit({ tool: 'ref-intake', ok: false, error }, 1)); };
const out = resolve(opt('out') ?? 'ref.json'), tol = Number(opt('tol') ?? 40), flood = !flag('no-flood');
const sheetFile = opt('sheet'), gridStr = opt('grid') ?? '3x2', viewsStr = opt('views') ?? 'front,back,top,bottom,side,34';
const regionsFile = opt('regions');
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--no-flood'].includes(args[i - 1]))).map((a) => (a.includes('=') ? a.split('=') : ['front', a]) as [string, string]);

if (flag('out') && !opt('out')) fail('--out needs a file path');
if (!sheetFile && !files.length) {
  fail('usage: tsx ref-intake.ts ([front=]img.png [side=img.png] [top=img.png] | --sheet sheet.png --grid 3x2|auto --views front,back,top,bottom,side,34) --out ref.json [--tol 40] [--no-flood] [--regions regions.json]');
}

const sharp = await loadSharp();
async function loadImageRgba(file: string, maxDim = 512): Promise<{ rgba: Uint8Array; w: number; h: number }> {
  if (sharp) {
    const { data, info } = await sharp(file).resize(maxDim, maxDim, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { rgba: new Uint8Array(data), w: info.width, h: info.height };
  }
  const decoded = decodePngRgba(readFileSync(file));
  if (!decoded) {
    fail(`cannot decode "${file}" without \`sharp\` (pure-Node reader supports 8-bit PNG only; install sharp via \`npm i sharp\` for JPEG/WebP).`);
  }
  return fitRgba(decoded.rgba, decoded.width, decoded.height, maxDim);
}

const inputs: { view: View; rgba: Uint8Array; w: number; h: number }[] = [];
const VALID_VIEWS = new Set<string>(['front', 'back', 'side', 'top', '34', '34_back']);
if (sheetFile) {
  const names = viewsStr.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isAuto = gridStr.trim().toLowerCase() === 'auto';
  let cols: number, rows: number;
  if (isAuto) {
    if (names.length < 2) fail('--grid auto requires at least 2 view names in --views (e.g. front,side,back)');
    cols = names.length;
    rows = 1;
  } else {
    const gm = /^(\d+)x(\d+)$/i.exec(gridStr);
    if (!gm) fail(`--grid must be COLSxROWS or "auto", got "${gridStr}"`);
    cols = Number(gm[1]); rows = Number(gm[2]);
  }
  const full = await loadImageRgba(sheetFile, Math.max(cols, rows) * 512);
  const tiles = rows === 1 && cols > 1
    ? splitAutoHorizontalBands(full.rgba, full.w, full.h, cols, { tol, flood })
    : splitGridSheet(full.rgba, full.w, full.h, cols, rows);
  names.forEach((v, idx) => {
    if (!VALID_VIEWS.has(v) || idx >= tiles.length) return;
    const tile = fitRgba(tiles[idx].rgba, tiles[idx].w, tiles[idx].h, 512);
    inputs.push({ view: v as View, ...tile });
  });
  if (!inputs.length) fail(`--views "${viewsStr}" matched none of front, back, side, top, 34, 34_back in ${cols}x${rows} grid`);
} else {
  for (const [view, file] of files) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(view)) fail(`invalid view name "${view}"`);
    const img = await loadImageRgba(file, 512);
    inputs.push({ view: view as View, ...img });
  }
}

const ref: RefData = { views: {}, palette: [] }, views: Partial<Record<View, { aspect: number; foreground: number; mask: string }>> = {}, warnings: string[] = [];
const outDir = dirname(out), outStem = parse(out).name;
if (opt('w') || opt('d')) ref.proportions = { w: opt('w') ? Number(opt('w')) : undefined, d: opt('d') ? Number(opt('d')) : undefined };
try {
  if (statSync(out, { throwIfNoEntry: false })?.isDirectory()) throw new Error('--out points to a directory');
  mkdirSync(outDir, { recursive: true });
  const rawViews = new Map<string, { rgba: Uint8Array; w: number; h: number }>();
  for (const { view, rgba, w, h } of inputs) {
    rawViews.set(view, { rgba, w, h });
    const mask = maskFromRGBA(rgba, w, h, { tol, flood }), { mask: framed, aspect } = frameMask(mask);
    const maskFile = `${outStem}-${view}-mask.png`, maskPath = join(outDir, maskFile);
    ref.views[view] = { w: framed.w, h: framed.h, data: maskToB64(framed), aspect, mask: maskFile };
    if (view === 'front' || !ref.palette.length) ref.palette = dominantColors(rgba, w, h, 6, mask);
    const png = new Uint8Array(framed.data.length * 4);
    framed.data.forEach((v, i) => png.set([v ? 40 : 255, v ? 40 : 255, v ? 40 : 255, 255], i * 4));
    writePngRgba(maskPath, png, framed.w, framed.h);
    const fg = mask.data.reduce((a, b) => a + b, 0) / mask.data.length;
    views[view] = { aspect: +aspect.toFixed(3), foreground: +fg.toFixed(3), mask: maskPath };
    const suspicious = fg < 0.03 || fg > 0.9;
    if (suspicious) warnings.push(`${view}: foreground ${(fg * 100).toFixed(0)}%, check ${maskPath} and adjust --tol`);
    console.log(`${view}: aspect ${aspect.toFixed(2)} (w/h), foreground ${(fg * 100).toFixed(0)}% of the image${suspicious ? '  <- suspicious, inspect mask and adjust --tol' : ''}`);
    console.log('wrote', maskPath);
  }
  if (regionsFile) {
    const rawRegions = JSON.parse(readFileSync(resolve(regionsFile), 'utf8'));
    const list: SemanticRegionRef[] = Array.isArray(rawRegions) ? rawRegions : Array.isArray(rawRegions?.regions) ? rawRegions.regions : [];
    const fallbackView = rawViews.get('front') ?? [...rawViews.values()][0];
    ref.regions = list.map((entry) => {
      if (entry.status === 'uncertain' || entry.hex || !entry.roi) return entry;
      const viewBuf = rawViews.get(entry.roi.view ?? 'front') ?? fallbackView;
      if (!viewBuf) return { ...entry, status: 'uncertain' as const };
      const stats = extractROIBoxStats(viewBuf.rgba, viewBuf.w, viewBuf.h, entry.roi);
      if (!stats.pixelCount) return { ...entry, status: 'uncertain' as const };
      return { ...entry, hex: rgbToHex(stats.meanRgb), status: entry.status ?? ('confident' as const) };
    });
    const hash = createHash('sha256').update(JSON.stringify(ref.regions)).digest('hex').slice(0, 12);
    ref.regionCacheKey = `regions-${hash}`;
  }
  writeFileSync(out, JSON.stringify(ref));
} catch (e) {
  fail(`cannot write reference outputs beside ${out}: ${(e as Error).message}`);
}
console.log('palette:', ref.palette.map((c) => `${c.hex} ${(c.share * 100).toFixed(0)}%`).join('  '));
if (ref.regions?.length) {
  console.log('regions:', ref.regions.map((r) => `${r.region}=${r.status === 'uncertain' ? 'uncertain' : r.hex ?? 'uncertain'}`).join('  '));
}
console.log('wrote', out);
process.exit(emit({ tool: 'ref-intake', ok: true, out, views, palette: ref.palette, regions: ref.regions ?? [], regionCacheKey: ref.regionCacheKey ?? null, warnings }));
~~~

## scripts/refcheck.ts

~~~typescript source-excerpt
// scripts/refcheck.ts: pure reference-vs-result measurements. No THREE, no DOM, no image library. Node-testable.
// Views (creature/asset faces +Z, y up):  front = camera at +Z (u = x)  ·  back = camera at -Z (u = -x)  ·  side = camera at +X (u = -z, +Z faces LEFT)  ·  top = camera at +Y (u = x, v = -z, +Z faces DOWN)  ·  34 / 34_back = angled 3/4 front & rear projections (flipH auto-matched)
import type { SemanticRegionRef } from './color-qc';
export type View = 'front' | 'back' | 'side' | 'top' | '34' | '34_back';
export type Mask = { w: number; h: number; data: Uint8Array };              // 1 = inside the shape
export type Tris = number[];                                                // 9 numbers per triangle
export const RES = 64;                                                      // masks are compared on a RES x RES grid

type CameraAngles = { azimuthDeg: number; elevationDeg: number };
type AngleMatch = CameraAngles & { azimuthOffsetDeg: number; elevationOffsetDeg: number };
const CANONICAL_ANGLES = {
  '34': { azimuthDeg: 38, elevationDeg: 16 },
  '34_back': { azimuthDeg: 142, elevationDeg: 16 },
};
const AZIMUTH_OFFSETS = [0, -6, 6, -12, 12];
const ELEVATION_OFFSETS = [0, -6, 6];

export const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const unhex = (h: string): [number, number, number] => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function boundsOf(t: Tris) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], t[i + k]); max[k] = Math.max(max[k], t[i + k]); }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}
/** Size ratios relative to height: { w: x/y, d: z/y }. Compare with the ratios you measured on the reference. */
export function proportions(t: Tris) { const s = boundsOf(t).size; return { w: s[0] / (s[1] || 1), d: s[2] / (s[1] || 1) }; }

/** Crops to the tight bounding box of the shape, scales it to fit res x res keeping its aspect, centres it. aspect = bbox width / height. */
export function frameMask(m: Mask, res = RES): { mask: Mask; aspect: number } {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out = new Uint8Array(res * res);
  if (x1 < 0) return { mask: { w: res, h: res, data: out }, aspect: 1 };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = res / Math.max(bw, bh), ow = Math.round(bw * s), oh = Math.round(bh * s), ox = Math.floor((res - ow) / 2), oy = Math.floor((res - oh) / 2);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) out[(oy + y) * res + ox + x] = m.data[(y0 + Math.min(bh - 1, Math.floor((y + 0.5) / s))) * m.w + x0 + Math.min(bw - 1, Math.floor((x + 0.5) / s))];
  return { mask: { w: res, h: res, data: out }, aspect: bw / bh };
}

/** Orthographic silhouette of a triangle array, already framed (see frameMask). */
export function silhouette(t: Tris, view: View, res = RES, camera?: CameraAngles) {
  const n = t.length / 3, U = new Float64Array(n), V = new Float64Array(n);
  const { azimuthDeg, elevationDeg } = camera ?? CANONICAL_ANGLES[view === '34_back' ? '34_back' : '34'];
  const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
  const caz = Math.cos(az), saz = Math.sin(az), cel = Math.cos(el), sel = Math.sin(el);
  for (let i = 0; i < n; i++) {
    const x = t[i * 3], y = t[i * 3 + 1], z = t[i * 3 + 2];
    if (view === 'front') { U[i] = x; V[i] = y; }
    else if (view === 'back') { U[i] = -x; V[i] = y; }
    else if (view === 'side') { U[i] = -z; V[i] = y; }
    else if (view === 'top') { U[i] = x; V[i] = -z; }
    else {
      U[i] = x * caz - z * saz;
      const depth = x * saz + z * caz;
      V[i] = y * cel - depth * sel;
    }
  }
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let i = 0; i < n; i++) { u0 = Math.min(u0, U[i]); u1 = Math.max(u1, U[i]); v0 = Math.min(v0, V[i]); v1 = Math.max(v1, V[i]); }
  const S = Math.max(256, res * 4), k = (S - 1) / (Math.max(u1 - u0, v1 - v0) || 1), data = new Uint8Array(S * S);
  const px = (i: number) => (U[i] - u0) * k, py = (i: number) => (v1 - V[i]) * k;          // image row 0 is the top
  for (let q = 0; q + 2 < n; q += 3) {
    const ax = px(q), ay = py(q), bx = px(q + 1), by = py(q + 1), cx = px(q + 2), cy = py(q + 2);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(area) < 1e-9) continue;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(S - 1, Math.ceil(Math.max(ay, by, cy))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx))); x++) {
        const X = x + 0.5, Y = y + 0.5, w0 = ((bx - X) * (cy - Y) - (by - Y) * (cx - X)) / area, w1 = ((cx - X) * (ay - Y) - (cy - Y) * (ax - X)) / area, w2 = 1 - w0 - w1;
        if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) data[y * S + x] = 1;
      }
  }
  return frameMask({ w: S, h: S, data }, res);
}

/** Crops a sub-rectangle out of an RGBA image (used for multi-view turnaround sheets). */
export function cropRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, x0: number, y0: number, cw: number, ch: number) {
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const sy = Math.min(h - 1, Math.max(0, y0 + y));
    for (let x = 0; x < cw; x++) {
      const sx = Math.min(w - 1, Math.max(0, x0 + x));
      const si = (sy * w + sx) * 4, di = (y * cw + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, w: cw, h: ch };
}

/** Splits a horizontal multi-view strip at vertical whitespace gaps, handling unevenly spaced panels. Falls back to uniform splitGridSheet when clean gaps cannot isolate expectedCount views. */
export function splitAutoHorizontalBands(
  rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, expectedCount: number,
  o: { tol?: number; alphaCut?: number; flood?: boolean } = {},
) {
  if (expectedCount < 2 || w < expectedCount * 4) return splitGridSheet(rgba, w, h, expectedCount, 1);
  const tol = o.tol ?? 40, border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const med = (k: number) => { const v = border.map((p) => rgba[p * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const transparent = med(3) < 250, bg = [med(0), med(1), med(2)];
  const fg = new Uint8Array(w * h);
  if (transparent || o.flood === false) {
    for (let i = 0; i < w * h; i++) fg[i] = transparent ? (rgba[i * 4 + 3] >= (o.alphaCut ?? 128) ? 1 : 0) : dist([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], bg) > tol ? 1 : 0;
  } else {
    const isBg = new Uint8Array(w * h), q = new Int32Array(w * h);
    let head = 0, tail = 0;
    const nearBg = (p: number) => dist([rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]], bg) <= tol;
    for (const p of border) if (!isBg[p] && nearBg(p)) { isBg[p] = 1; q[tail++] = p; }
    while (head < tail) {
      const p = q[head++], x = p % w, y = (p - x) / w;
      if (x > 0 && !isBg[p - 1] && nearBg(p - 1)) { isBg[p - 1] = 1; q[tail++] = p - 1; }
      if (x + 1 < w && !isBg[p + 1] && nearBg(p + 1)) { isBg[p + 1] = 1; q[tail++] = p + 1; }
      if (y > 0 && !isBg[p - w] && nearBg(p - w)) { isBg[p - w] = 1; q[tail++] = p - w; }
      if (y + 1 < h && !isBg[p + w] && nearBg(p + w)) { isBg[p + w] = 1; q[tail++] = p + w; }
    }
    for (let i = 0; i < w * h; i++) fg[i] = isBg[i] ? 0 : 1;
  }

  const colThresh = Math.max(1, Math.floor(h * 0.005));
  const occupiedCols = new Uint8Array(w);
  let totalOcc = 0;
  for (let x = 0; x < w; x++) {
    let col = 0;
    for (let y = 0; y < h; y++) col += fg[y * w + x];
    if (col > colThresh) { occupiedCols[x] = 1; totalOcc++; }
  }
  let minX = 0, maxX = w - 1;
  while (minX < w && !occupiedCols[minX]) minX++;
  while (maxX > minX && !occupiedCols[maxX]) maxX--;
  const minSliceOcc = Math.max(4, Math.floor(totalOcc / (expectedCount * 6)));
  if (totalOcc < expectedCount * 4) return splitGridSheet(rgba, w, h, expectedCount, 1);

  const prefix = new Int32Array(w + 1);
  for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + occupiedCols[x];
  const gaps: { mid: number; width: number }[] = [];
  for (let x = minX; x <= maxX; x++) {
    if (occupiedCols[x]) continue;
    let end = x;
    while (end + 1 <= maxX && !occupiedCols[end + 1]) end++;
    gaps.push({ mid: Math.floor((x + end + 1) / 2), width: end - x + 1 });
    x = end;
  }
  gaps.sort((a, b) => b.width - a.width || a.mid - b.mid);
  const chosen: number[] = [];
  for (const gap of gaps) {
    if (chosen.length === expectedCount - 1) break;
    const trial = [...chosen, gap.mid].sort((a, b) => a - b);
    const bounds = [0, ...trial, w];
    let ok = true;
    for (let i = 0; i + 1 < bounds.length; i++) {
      if (prefix[bounds[i + 1]] - prefix[bounds[i]] < minSliceOcc) { ok = false; break; }
    }
    if (ok) chosen.push(gap.mid);
  }
  if (chosen.length !== expectedCount - 1) return splitGridSheet(rgba, w, h, expectedCount, 1);
  chosen.sort((a, b) => a - b);
  const bounds = [0, ...chosen, w];
  return Array.from({ length: expectedCount }, (_, i) => cropRgba(rgba, w, h, bounds[i], 0, bounds[i + 1] - bounds[i], h));
}

/** Splits an even cols x rows turnaround sheet into row-major RGBA tiles. */
export function splitGridSheet(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, cols: number, rows: number) {
  const tw = Math.floor(w / cols), th = Math.floor(h / rows);
  const tiles: { rgba: Uint8Array; w: number; h: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.push(cropRgba(rgba, w, h, c * tw, r * th, tw, th));
  return tiles;
}

/** Downsamples an RGBA buffer to fit inside maxDim x maxDim (nearest-neighbor; preserves crisp edges). */
export function fitRgba(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, maxDim = 512) {
  if (w <= maxDim && h <= maxDim) return { rgba: rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba), w, h };
  const s = maxDim / Math.max(w, h), ow = Math.max(1, Math.round(w * s)), oh = Math.max(1, Math.round(h * s));
  const out = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) / s));
    for (let x = 0; x < ow; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) / s));
      const si = (sy * w + sx) * 4, di = (y * ow + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return { rgba: out, w: ow, h: oh };
}

/** Foreground mask from RGBA bytes. Transparent image: alpha. Opaque image: border flood-fill from median border colour (prevents light interior patches from poking holes), or flat threshold when flood=false. */
export function maskFromRGBA(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, o: { tol?: number; alphaCut?: number; flood?: boolean } = {}): Mask {
  const data = new Uint8Array(w * h), tol = o.tol ?? 40, border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);                      // background = per-channel median of the whole border,
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);               // so one stray corner pixel or a watermark cannot skew it
  const med = (k: number) => { const v = border.map((p) => rgba[p * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const transparent = med(3) < 250, bg = [med(0), med(1), med(2)];
  if (transparent || o.flood === false) {
    for (let i = 0; i < w * h; i++) data[i] = transparent ? (rgba[i * 4 + 3] >= (o.alphaCut ?? 128) ? 1 : 0) : dist([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], bg) > tol ? 1 : 0;
    return keepLargest({ w, h, data });
  }
  // Border flood-fill: mark exterior pixels close to bg; everything enclosed stays foreground (solid silhouette even with cream bellies/faces)
  const isBg = new Uint8Array(w * h), q = new Int32Array(w * h);
  let head = 0, tail = 0;
  const nearBg = (p: number) => dist([rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]], bg) <= tol;
  for (const p of border) if (!isBg[p] && nearBg(p)) { isBg[p] = 1; q[tail++] = p; }
  while (head < tail) {
    const p = q[head++], x = p % w, y = (p - x) / w;
    if (x > 0 && !isBg[p - 1] && nearBg(p - 1)) { isBg[p - 1] = 1; q[tail++] = p - 1; }
    if (x + 1 < w && !isBg[p + 1] && nearBg(p + 1)) { isBg[p + 1] = 1; q[tail++] = p + 1; }
    if (y > 0 && !isBg[p - w] && nearBg(p - w)) { isBg[p - w] = 1; q[tail++] = p - w; }
    if (y + 1 < h && !isBg[p + w] && nearBg(p + w)) { isBg[p + w] = 1; q[tail++] = p + w; }
  }
  for (let i = 0; i < w * h; i++) data[i] = isBg[i] ? 0 : 1;
  return keepLargest({ w, h, data });
}
/** Drops specks: keeps only the biggest 8-connected blob (a shadow or watermark will not stretch the frame). */
export function keepLargest(m: Mask): Mask {
  const lab = new Int32Array(m.w * m.h), sizes: number[] = [0]; let id = 0;
  for (let s = 0; s < lab.length; s++) {
    if (!m.data[s] || lab[s]) continue;
    id++; let cnt = 0; const st = [s]; lab[s] = id;
    while (st.length) {
      const p = st.pop()!; cnt++; const x = p % m.w, y = (p - x) / m.w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue; const q = ny * m.w + nx; if (m.data[q] && !lab[q]) { lab[q] = id; st.push(q); } }
    }
    sizes[id] = cnt;
  }
  let best = 0; for (let i = 1; i <= id; i++) if (sizes[i] > (sizes[best] || 0)) best = i;
  return { w: m.w, h: m.h, data: Uint8Array.from(lab, (v) => (v && v === best ? 1 : 0)) };
}

export const flipH = (m: Mask): Mask => { const d = new Uint8Array(m.data.length); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) d[y * m.w + x] = m.data[y * m.w + (m.w - 1 - x)]; return { ...m, data: d }; };
export const flipV = (m: Mask): Mask => { const d = new Uint8Array(m.data.length); for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) d[y * m.w + x] = m.data[(m.h - 1 - y) * m.w + x]; return { ...m, data: d }; };

export function maskIoU(a: Mask, b: Mask) {
  let i = 0, u = 0; for (let k = 0; k < a.data.length; k++) { const p = a.data[k], q = b.data[k]; if (p && q) i++; if (p || q) u++; }
  return u ? i / u : 1;
}
/** Best IoU over the allowed mirror images of the reference mask (the reference may face the other way). */
export function bestIoU(model: Mask, ref: Mask, view: View) {
  const tries: [string, Mask][] = [['none', ref], ['flipH', flipH(ref)], ...(view === 'top' ? [['flipV', flipV(ref)] as [string, Mask]] : [])];
  return tries.map(([flip, m]) => ({ flip, iou: maskIoU(model, m), ref: m })).sort((p, q) => q.iou - p.iou)[0];
}

/** Prefer a camera that passes aspect, then maximize IoU. Evaluate the canonical pose first so it wins ties. */
function matchSilhouette(tris: Tris, view: View, ref: Mask, referenceAspect: number, aspectLimit: number) {
  const project = (angles?: AngleMatch) => {
    const { mask, aspect } = silhouette(tris, view, RES, angles);
    const aspectError = Math.abs(aspect / referenceAspect - 1);
    return { mask, aspect, aspectError, aspectPass: aspectError <= aspectLimit, match: bestIoU(mask, ref, view), angles };
  };
  if (view !== '34' && view !== '34_back') return { ...project(), canonicalIoU: undefined as number | undefined };

  const canonical = CANONICAL_ANGLES[view];
  const canonicalWinner = project({ ...canonical, azimuthOffsetDeg: 0, elevationOffsetDeg: 0 });
  let winner = canonicalWinner;
  for (const azimuthOffsetDeg of AZIMUTH_OFFSETS) {
    for (const elevationOffsetDeg of ELEVATION_OFFSETS) {
      if (winner.aspectPass && winner.match.iou === 1) return { ...winner, canonicalIoU: canonicalWinner.match.iou };
      if (azimuthOffsetDeg === 0 && elevationOffsetDeg === 0) continue;
      const candidate = project({
        azimuthDeg: canonical.azimuthDeg + azimuthOffsetDeg,
        elevationDeg: canonical.elevationDeg + elevationOffsetDeg,
        azimuthOffsetDeg,
        elevationOffsetDeg,
      });
      const better = candidate.aspectPass === winner.aspectPass
        ? candidate.match.iou > winner.match.iou
        : candidate.aspectPass;
      if (better) winner = candidate;
    }
  }
  return { ...winner, canonicalIoU: canonicalWinner.match.iou as number | undefined };
}
/** RGBA picture: reference only = red, model only = blue, both = light grey, empty = white. Write it as PNG and look at it. */
export function diffRGBA(model: Mask, ref: Mask) {
  const out = new Uint8Array(model.w * model.h * 4);
  for (let i = 0; i < model.data.length; i++) { const m = model.data[i], r = ref.data[i], c = m && r ? [225, 225, 225] : r ? [235, 70, 70] : m ? [70, 120, 245] : [255, 255, 255]; out.set([c[0], c[1], c[2], 255], i * 4); }
  return out;
}

/** Most common colours (4 bits per channel buckets, merged by distance). Pass mask to ignore the background. Returns hex + share, biggest first. */
export function dominantColors(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, k = 6, mask?: Mask) {
  const b = new Map<number, { n: number; r: number; g: number; b: number }>(); let total = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask && !mask.data[i]) continue; if (rgba[i * 4 + 3] < 128) continue;
    const r = rgba[i * 4], g = rgba[i * 4 + 1], bl = rgba[i * 4 + 2], key = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4), e = b.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += bl; b.set(key, e); total++;
  }
  const list = [...b.values()].sort((p, q) => q.n - p.n).map((e) => ({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n], n: e.n })), out: { rgb: number[]; n: number }[] = [];
  for (const c of list) { const near = out.find((o) => dist(o.rgb, c.rgb) < 40); if (near) near.n += c.n; else out.push({ ...c }); }
  return out.sort((p, q) => q.n - p.n).slice(0, k).map((c) => ({ hex: hex(c.rgb[0], c.rgb[1], c.rgb[2]), share: total ? c.n / total : 0 }));
}
/** For every reference colour above minShare: distance (0..441) to the nearest colour you use. Returns the worst one. */
export function paletteGap(refColors: { hex: string; share: number }[], used: string[], minShare = 0.05) {
  const u = used.map(unhex); let worst = { hex: '', gap: 0, nearest: '' };
  for (const c of refColors) { if (c.share < minShare) continue; const r = unhex(c.hex); let best = Infinity, who = ''; used.forEach((h, i) => { const d = dist(r, u[i]); if (d < best) { best = d; who = h; } }); if (best > worst.gap) worst = { hex: c.hex, gap: best, nearest: who }; }
  return worst;
}

export type RefData = {
  views: Partial<Record<View, { w: number; h: number; data: string; aspect: number; mask?: string }>>;
  palette: { hex: string; share: number }[];
  proportions?: { w?: number; d?: number };
  regions?: SemanticRegionRef[];
  regionCacheKey?: string;
};
export const maskToB64 = (m: Mask) => Buffer.from(m.data).toString('base64');
export const maskFromB64 = (s: string, res = RES): Mask => ({ w: res, h: res, data: new Uint8Array(Buffer.from(s, 'base64')) });

export type Gate = { gate: string; value: string; pass: boolean; hint: string };
export const THRESH = { iou: 0.85, iou34: 0.70, aspect: 0.08, aspect34: 0.14, prop: 0.1, palette: 60 };
const formatOffset = (deg: number) => `${deg > 0 ? '+' : ''}${deg}°`;
/** Runs every gate that the reference data can answer, cheapest first. */
export function compareToRef(tris: Tris, ref: RefData, usedColors: string[] = [], th = THRESH) {
  const gates: Gate[] = [], diffs: Partial<Record<View, Uint8Array>> = {}, angles: Partial<Record<View, AngleMatch>> = {};
  const p = proportions(tris);
  if (ref.proportions?.w) { const e = Math.abs(p.w / ref.proportions.w - 1); gates.push({ gate: 'G1 width/height', value: `${p.w.toFixed(2)} vs ${ref.proportions.w.toFixed(2)} (${(e * 100).toFixed(0)}% off)`, pass: e <= th.prop, hint: p.w > ref.proportions.w ? 'too wide: narrow x or lengthen y' : 'too narrow: widen x or shorten y' }); }
  if (ref.proportions?.d) { const e = Math.abs(p.d / ref.proportions.d - 1); gates.push({ gate: 'G1 depth/height', value: `${p.d.toFixed(2)} vs ${ref.proportions.d.toFixed(2)} (${(e * 100).toFixed(0)}% off)`, pass: e <= th.prop, hint: p.d > ref.proportions.d ? 'too deep: shorten z' : 'too shallow: lengthen z' }); }
  for (const view of ['front', 'back', 'side', 'top', '34', '34_back'] as View[]) {
    const r = ref.views[view]; if (!r) continue;
    const angled = view === '34' || view === '34_back';
    const aspectLimit = angled ? (th.aspect34 ?? 0.14) : th.aspect;
    const iouLimit = angled ? (th.iou34 ?? 0.70) : th.iou;
    const { mask, aspect, aspectError, aspectPass, match, angles: camera, canonicalIoU } = matchSilhouette(tris, view, maskFromB64(r.data), r.aspect, aspectLimit);
    let cameraText = '';
    if (camera) {
      angles[view] = camera;
      let sweepNote = '';
      if ((camera.azimuthOffsetDeg !== 0 || camera.elevationOffsetDeg !== 0) && canonicalIoU !== undefined) {
        sweepNote = `; canonical IoU ${canonicalIoU.toFixed(2)}${canonicalIoU < iouLimit && match.iou >= iouLimit ? ', passed via angle sweep' : ''}`;
      }
      cameraText = ` (3/4 threshold ${iouLimit.toFixed(2)}; azimuth ${camera.azimuthDeg}° [${formatOffset(camera.azimuthOffsetDeg)}], elevation ${camera.elevationDeg}° [${formatOffset(camera.elevationOffsetDeg)}]${sweepNote})`;
    }
    gates.push({ gate: `G2 ${view} aspect`, value: `${aspect.toFixed(2)} vs ${r.aspect.toFixed(2)} (${(aspectError * 100).toFixed(0)}% off)`, pass: aspectPass, hint: 'fix overall proportions before details' });
    const mirrored = match.flip !== 'none' ? ` (reference mirrored: ${match.flip})` : '';
    gates.push({ gate: `G2 ${view} silhouette IoU`, value: `${match.iou.toFixed(2)}${mirrored}${cameraText}`, pass: match.iou >= iouLimit, hint: 'open the diff PNG: red = missing in model, blue = extra in model' });
    diffs[view] = diffRGBA(mask, match.ref);
  }
  if (usedColors.length && ref.palette.length) { const g = paletteGap(ref.palette, usedColors); gates.push({ gate: 'G3 palette', value: g.hex ? `${g.hex} nearest ${g.nearest}, distance ${g.gap.toFixed(0)}` : 'all main colours covered', pass: g.gap <= th.palette, hint: `retune the colour nearest to ${g.hex}` }); }
  return { gates, diffs, angles };
}
export const formatGates = (g: Gate[]) => g.map((x) => `${x.pass ? 'PASS' : 'FAIL'}  ${x.gate}: ${x.value}${x.pass ? '' : '  -> ' + x.hint}`).join('\n');
~~~

## scripts/result.ts

~~~typescript source-excerpt
// scripts/result.ts: the output contract shared by every tool and script (lives in scripts/ so a copied scripts/ folder stays self-contained).
// Human-readable text goes first. The LAST stdout line is exactly one line of JSON behind a fixed marker:
//   @@RESULT {"tool":"run-tests","ok":true,"gates":[{"gate":"...","value":"...","pass":true,"hint":""}], ...}
// Exit codes: 0 = ok, 2 = a gate failed, 1 = usage or internal error. `gates` uses the same shape as scripts/refcheck.ts `Gate`.
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import * as nodeModule from 'node:module';
export const MARKER = '@@RESULT ';
export type Gate = { gate: string; value: string; pass: boolean; hint: string };
export type Result = { tool: string; ok: boolean; gates?: Gate[] } & Record<string, unknown>;

/** Builds the single marker line. JSON.stringify never emits a raw newline, so the line stays one line. */
export const resultLine = (r: Result): string => MARKER + JSON.stringify(r);

/** Prints the marker line as the last stdout line and returns the exit code to use: 0 when ok, else `failCode` (2 = a gate failed, 1 = usage or internal error). */
export function emit(r: Result, failCode = 2): number {
  console.log(resultLine(r));
  return r.ok ? 0 : failCode;
}

/** Reads the LAST marker line of some stdout. Returns null when there is none or it is not valid JSON. */
export function parseResult(stdout: string): Result | null {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith(MARKER)) continue;
    try { const r = JSON.parse(lines[i].slice(MARKER.length)); return r && typeof r.tool === 'string' && typeof r.ok === 'boolean' ? (r as Result) : null; } catch { return null; }
  }
  return null;
}

/** Runs a .ts script under the active tsx loader without shell quoting issues (Windows/macOS/Linux and npx tsx). */
export function spawnTsx(file: string, args: string[], opts: Partial<SpawnSyncOptionsWithStringEncoding> = {}) {
  const loaderArgs: string[] = [];
  for (let i = 0; i < process.execArgv.length; i++) {
    const a = process.execArgv[i];
    if (a === '--require' || a === '-r' || a === '--import' || a === '--loader') loaderArgs.push(a, process.execArgv[++i]);
  }
  const base = { encoding: 'utf8' as const, ...opts };
  return loaderArgs.length
    ? spawnSync(process.execPath, [...loaderArgs, file, ...args], base)
    : spawnSync('tsx', [file, ...args], { ...base, shell: process.platform === 'win32' });
}

/** Lets external user builders resolve `three` and `three/*` from this skill's install when missing in cwd. */
export function registerThreeHook() {
  return nodeModule.registerHooks?.({
    resolve(specifier, context, nextResolve) {
      if (specifier !== 'three' && !specifier.startsWith('three/')) return nextResolve(specifier, context);
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') throw error;
        return nextResolve(import.meta.resolve(specifier), context);
      }
    },
  });
}
~~~

## scripts/review.ts

~~~typescript source-excerpt
// scripts/review.ts: pure orthographic software renderer for the review image. No THREE, no DOM, no image library (qa-asset.ts writes the PNG).
// Sheet layout (2 x 2):   front (camera +Z)  |  side (camera +X, +Z faces LEFT)
//                         top (camera +Y, +Z faces DOWN)  |  3/4 view (from +X, +Y, +Z)
// Same view conventions as scripts/refcheck.ts. One scale for all four panels, so sizes can be compared.
// Colours: one muted colour per part, Lambert shaded. MAGENTA = a triangle that faces away from the camera but is still the nearest surface,
// i.e. an inside-out or missing face. A grey line marks Y = 0 in the front and side panels.
import type { Parts } from './qacheck';

export const PALETTE = ['#6f8fb5', '#c98b5c', '#7ea36f', '#b87fa8', '#c2b05a', '#6fb0aa', '#a3a3a3', '#b56f6f'];
export const WRONG_FACE: [number, number, number] = [255, 0, 255];
/** Magenta pixels per part that count as rasterisation noise (a 1 px speck appeared on a healthy crate where two closed parts intersect). More than this fails Q10. */
export const WRONG_TOL = 4;
const BG: [number, number, number] = [245, 245, 243], GROUND: [number, number, number] = [196, 196, 190], FRAME: [number, number, number] = [60, 60, 60];
type V = [number, number, number];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const unhex = (h: string): V => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** f = direction towards the camera, r = image right, u = image up. */
function viewBases(): { name: string; f: V; r: V; u: V }[] {
  const yaw = (35 * Math.PI) / 180, pitch = (25 * Math.PI) / 180;
  const f: V = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], r = unit(cross([0, 1, 0], f));
  return [
    { name: 'front', f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
    { name: 'side', f: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
    { name: 'top', f: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1] },
    { name: '3/4', f, r, u: cross(f, r) },
  ];
}

export type Sheet = { rgba: Uint8Array; width: number; height: number; legend: { part: string; color: string }[]; wrong: Record<string, number> };

export function renderSheet(parts: Parts, o: { open?: string[]; panel?: number } = {}): Sheet {
  const P = o.panel ?? 320, names = Object.keys(parts), openAll = (o.open ?? []).includes('all');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const n of names) for (let i = 0; i + 2 < parts[n].length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], parts[n][i + k]); max[k] = Math.max(max[k], parts[n][i + k]); }
  const c: V = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], R = Math.max(0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]), 1e-6), scale = (P * 0.46) / R, eps = 1e-5 * R;
  const W = P * 2, H = P * 2, rgba = new Uint8Array(W * H * 4), wrong: Record<string, number> = {}, base = names.map((_, i) => unhex(PALETTE[i % PALETTE.length]));
  const L = unit([-0.4, 0.7, 0.6]);                                                // light, in the camera frame (right, up, towards camera)

  viewBases().forEach((vw, vi) => {
    const color = new Uint8Array(P * P * 4), depth = new Float32Array(P * P).fill(-Infinity), owner = new Int16Array(P * P).fill(-1), light = unit([vw.r[0] * L[0] + vw.u[0] * L[1] + vw.f[0] * L[2], vw.r[1] * L[0] + vw.u[1] * L[1] + vw.f[1] * L[2], vw.r[2] * L[0] + vw.u[2] * L[1] + vw.f[2] * L[2]]);
    for (let i = 0; i < P * P; i++) color.set([...BG, 255], i * 4);
    if (vw.name === 'front' || vw.name === 'side') {                               // ground line: world point (0, 0, 0)
      const gy = Math.round(P / 2 - scale * dot([-c[0], -c[1], -c[2]], vw.u));
      if (gy >= 0 && gy < P) for (let x = 0; x < P; x++) color.set([...GROUND, 255], (gy * P + x) * 4);
    }
    const sx = new Float64Array(3), sy = new Float64Array(3), sz = new Float64Array(3);
    names.forEach((name, pi) => {
      const t = parts[name], twoSided = openAll || (o.open ?? []).includes(name);
      for (let q = 0; q + 8 < t.length; q += 9) {
        const p: V[] = [0, 1, 2].map((k) => [t[q + k * 3] - c[0], t[q + k * 3 + 1] - c[1], t[q + k * 3 + 2] - c[2]] as V);
        let n = cross([p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]);
        if (Math.hypot(n[0], n[1], n[2]) < 1e-12) continue;
        n = unit(n);
        const facing = dot(n, vw.f) >= 0, back = !facing;
        if (back && twoSided) n = [-n[0], -n[1], -n[2]];
        for (let k = 0; k < 3; k++) { sx[k] = P / 2 + scale * dot(p[k], vw.r); sy[k] = P / 2 - scale * dot(p[k], vw.u); sz[k] = dot(p[k], vw.f); }
        const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sy[1] - sy[0]) * (sx[2] - sx[0]); if (Math.abs(area) < 1e-9) continue;
        const wrongFace = back && !twoSided, lam = Math.abs(dot(n, light)), shade = 0.4 + 0.6 * lam, rgb: V = wrongFace ? WRONG_FACE : [base[pi][0] * shade, base[pi][1] * shade, base[pi][2] * shade];
        const x0 = Math.max(0, Math.floor(Math.min(sx[0], sx[1], sx[2]))), x1 = Math.min(P - 1, Math.ceil(Math.max(sx[0], sx[1], sx[2])));
        const y0 = Math.max(0, Math.floor(Math.min(sy[0], sy[1], sy[2]))), y1 = Math.min(P - 1, Math.ceil(Math.max(sy[0], sy[1], sy[2])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const X = x + 0.5, Y = y + 0.5;
          const w0 = ((sx[1] - X) * (sy[2] - Y) - (sy[1] - Y) * (sx[2] - X)) / area, w1 = ((sx[2] - X) * (sy[0] - Y) - (sy[2] - Y) * (sx[0] - X)) / area, w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const z = w0 * sz[0] + w1 * sz[1] + w2 * sz[2], at = y * P + x;
          if (wrongFace ? z <= depth[at] + eps : z < depth[at] - eps) continue;  // ties go to correctly facing triangles, so a grazing silhouette pixel is not painted magenta
          depth[at] = z; owner[at] = pi; color.set([rgb[0], rgb[1], rgb[2], 255], at * 4);
        }
      }
    });
    // Copy the panel into the sheet and count the magenta pixels that survived, per owning part (overdrawn magenta is not counted).
    const ox = (vi % 2) * P, oy = Math.floor(vi / 2) * P;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      const at = y * P + x, s = at * 4, d = ((oy + y) * W + ox + x) * 4;
      rgba[d] = color[s]; rgba[d + 1] = color[s + 1]; rgba[d + 2] = color[s + 2]; rgba[d + 3] = 255;
      if (owner[at] >= 0 && color[s] === 255 && color[s + 1] === 0 && color[s + 2] === 255) wrong[names[owner[at]]] = (wrong[names[owner[at]]] ?? 0) + 1;
    }
  });
  for (let i = 0; i < W; i++) for (const y of [P - 1, P]) rgba.set([...FRAME, 255], (y * W + i) * 4);       // panel separators
  for (let i = 0; i < H; i++) for (const x of [P - 1, P]) rgba.set([...FRAME, 255], (i * W + x) * 4);
  return { rgba, width: W, height: H, legend: names.map((part, i) => ({ part, color: PALETTE[i % PALETTE.length] })), wrong };
}

~~~

## scripts/rig-check.ts

~~~typescript source-excerpt
// scripts/rig-check.ts: CLI validator for rigged character/creature/vehicle metadata, clip contracts, track sanity, expression mappings, clearance & motion (R1 to R7).
//   npx tsx scripts/rig-check.ts --meta char_metadata.json [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--static-clips a,b] [--allow-refpose]
// Prints gate table; last stdout line is @@RESULT {json}. Exit 0 = ok, 2 = gate failed, 1 = usage/load error.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_MAX_PIVOTS, rigGates, type RigKind, type RigMeta } from './rigcheck';
import { emit, type Gate } from './result';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'rig-check', ok: false, error: msg }, 1)); };
const fmtGates = (g: Gate[]) => g.map((x) => `${x.pass ? 'PASS' : 'FAIL'}  ${x.gate}: ${x.value}${x.pass ? '' : '  -> ' + x.hint}`).join('\n');

const metaFile = opt('meta') ?? args.find((a) => !a.startsWith('--'));
if (!metaFile) fail('usage: tsx scripts/rig-check.ts --meta char_metadata.json [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--static-clips a,b] [--allow-refpose]');
const kind = (opt('kind') ?? 'hero') as RigKind;
if (!(kind in DEFAULT_MAX_PIVOTS)) fail(`--kind must be one of ${Object.keys(DEFAULT_MAX_PIVOTS).join(', ')}, got "${kind}"`);
const motionMode = opt('motion') as 'in-place' | 'free' | undefined;
if (motionMode !== undefined && motionMode !== 'in-place' && motionMode !== 'free') fail('--motion must be in-place or free');
const maxPivots = opt('max-pivots') !== undefined ? Number(opt('max-pivots')) : undefined;
if (maxPivots !== undefined && (!Number.isFinite(maxPivots) || maxPivots <= 0)) fail('--max-pivots needs a positive number');
const staticClips = (opt('static-clips') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

let meta: RigMeta;
try { meta = JSON.parse(readFileSync(resolve(metaFile), 'utf8')); } catch (e) { fail(`cannot read ${metaFile}: ${(e as Error).message}`); }

const { gates, skipped, stats } = rigGates(meta!, {
  kind,
  motionMode,
  maxPivots,
  staticClips: staticClips.length ? staticClips : undefined,
  excludeClips: flag('allow-refpose') ? [] : ['RefPose'],
});
const unverified = ['Visual skinning/animation playback and engine-native import (e.g. Roblox Motor6D / Blender) are not tested by JSON checks'];

console.log(fmtGates(gates));
console.log(`\nstats: ${JSON.stringify(stats)}`);
if (skipped.length) console.log(`not checked: ${skipped.join('; ')}`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} rig check(s) failed. Inspect the affected tracks or metadata and verify the revised export.`
  : skipped.length ? '\nAll evaluated rig & clip checks pass. See not checked for missing evidence.' : '\nAll rig & clip checks pass.');
process.exit(emit({ tool: 'rig-check', ok: failed.length === 0, gates, stats, skipped, unverified }));
~~~

## scripts/rigcheck.ts

~~~typescript source-excerpt
// scripts/rigcheck.ts: pure rig, clip, track, expression, clearance & motion gates (R1 to R7). No THREE, no fs.
import type { Gate } from './result';

export type RigTrack = { name: string; times: number[]; values: number[] };
export type RigClip = { name: string; durationSeconds: number; loop?: boolean; expression?: string; tracks?: RigTrack[] };
export type RigMeta = {
  rig?: {
    rootNode?: string;
    pivotNames?: string[];
    hierarchy?: { parent: string; child: string }[];
    restLocalPositions?: Record<string, number[]>;
  };
  animations?: RigClip[];
  face?: {
    defaultExpressionInGlb?: string;
    textureResolution?: [number, number];
    expressions?: string[];
    animationExpressionMapping?: Record<string, string>;
  };
  files?: { expressions?: Record<string, unknown> };
  qa?: {
    maxHorizDrift?: number;
    motionMode?: 'in-place' | 'free';
    slideDropPct?: number;
    slideMinY?: number;
    clipMinY?: number;
    staticClips?: string[];
  };
};

export type RigKind = 'hero' | 'creature' | 'vehicle' | 'building' | 'prop';
export const DEFAULT_MAX_PIVOTS: Record<RigKind, number> = { hero: 16, creature: 64, vehicle: 32, building: 24, prop: 16 };

export type RigCheckOptions = {
  maxPivots?: number;
  kind?: RigKind;
  motionMode?: 'in-place' | 'free';
  excludeClips?: string[];
  minSlideDropPct?: number;
  minSlideY?: number;
  maxHorizDrift?: number;
  staticClips?: string[];
  minAngle?: number;
  minDistance?: number;
};

const isFinite3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export function rigGates(meta: RigMeta, o: RigCheckOptions = {}): { gates: Gate[]; skipped: string[]; stats: Record<string, unknown> } {
  const gates: Gate[] = [], skipped: string[] = [];
  const kind = o.kind ?? 'hero';
  const maxPivots = o.maxPivots ?? DEFAULT_MAX_PIVOTS[kind];
  const motionMode = o.motionMode ?? meta.qa?.motionMode ?? 'in-place';
  const excluded = new Set(o.excludeClips ?? ['RefPose']);
  const minSlideDrop = o.minSlideDropPct ?? 22;
  const minSlideY = o.minSlideY ?? -0.025;
  const maxDrift = o.maxHorizDrift ?? 1e-5;

  const pivots = Array.isArray(meta.rig?.pivotNames) ? meta.rig!.pivotNames! : [];
  const rawEdges = meta.rig?.hierarchy;
  const edgesValid = rawEdges === undefined || Array.isArray(rawEdges);
  const edges = Array.isArray(rawEdges) ? rawEdges : [];
  const pivotSet = new Set(pivots);

  // R1 hierarchy
  const hIssues: string[] = [];
  if (!pivots.length) hIssues.push('no pivotNames');
  if (!edgesValid) hIssues.push('rig.hierarchy must be an array of { parent, child } objects (not a map)');
  if (pivotSet.size !== pivots.length) hIssues.push('duplicate pivot names');
  if (pivots.length > maxPivots) hIssues.push(`${pivots.length} pivots exceeds max ${maxPivots} (${kind})`);
  const childrenOf = new Map<string, string[]>(), parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (!edge || typeof edge.parent !== 'string' || typeof edge.child !== 'string') {
      hIssues.push('invalid hierarchy edge (expected { parent: string, child: string })');
      continue;
    }
    const { parent, child } = edge;
    if (!pivotSet.has(parent)) hIssues.push(`unknown parent "${parent}"`);
    if (!pivotSet.has(child)) hIssues.push(`unknown child "${child}"`);
    if (parent === child) hIssues.push(`self-loop on "${parent}"`);
    if (parentOf.has(child)) hIssues.push(`multiple parents for "${child}"`);
    parentOf.set(child, parent);
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(child);
  }
  const roots = pivots.filter((p) => !parentOf.has(p));
  if (pivots.length && roots.length !== 1) hIssues.push(`expected 1 root pivot, found ${roots.length} (${roots.join(', ') || 'none'})`);
  const seen = new Set<string>(), stack = roots.length === 1 ? [roots[0]] : [];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const ch of childrenOf.get(cur) ?? []) stack.push(ch);
  }
  if (roots.length === 1 && seen.size !== pivotSet.size) {
    const unreachable = pivots.filter((p) => !seen.has(p));
    hIssues.push(`unreachable or cyclic pivot(s): ${unreachable.join(', ')}`);
  }
  gates.push({
    gate: 'R1 hierarchy',
    value: hIssues.length ? hIssues.join('; ') : `${pivots.length} pivots, root ${roots[0]}, acyclic tree`,
    pass: hIssues.length === 0,
    hint: 'keep one root pivot, unique names, valid parent->child edges, and <= maxPivots',
  });

  // R2 rest-pose
  const rest = meta.rig?.restLocalPositions;
  if (rest && pivots.length) {
    const bad = pivots.filter((p) => !isFinite3(rest[p]));
    gates.push({
      gate: 'R2 rest-pose',
      value: bad.length ? `missing or non-finite rest position for: ${bad.join(', ')}` : `all ${pivots.length} pivots have finite [x,y,z] rest positions`,
      pass: bad.length === 0,
      hint: 'record restLocalPositions as finite [x, y, z] for every pivot in rest pose',
    });
  } else skipped.push('R2 rest-pose (no rig.restLocalPositions in metadata)');

  // R3 clips
  const clips = meta.animations;
  if (clips) {
    const cIssues: string[] = [], names = new Set<string>();
    if (!clips.length) cIssues.push('no animations listed');
    for (const c of clips) {
      if (!c.name) cIssues.push('clip with empty name');
      else if (names.has(c.name)) cIssues.push(`duplicate clip "${c.name}"`);
      names.add(c.name);
      if (excluded.has(c.name)) cIssues.push(`inspection clip "${c.name}" must be excluded from exported gameplay clips`);
      if (!(typeof c.durationSeconds === 'number' && Number.isFinite(c.durationSeconds) && c.durationSeconds > 0))
        cIssues.push(`invalid duration on "${c.name}": ${c.durationSeconds}`);
    }
    gates.push({
      gate: 'R3 clips',
      value: cIssues.length ? cIssues.join('; ') : `${clips.length} gameplay clips, unique names, finite positive durations`,
      pass: cIssues.length === 0,
      hint: 'exclude RefPose from export and ensure every gameplay clip has a unique name and positive duration',
    });
  } else skipped.push('R3 clips (no animations array in metadata)');

  // R4 tracks & horizontal drift
  const trackClips = (clips ?? []).filter((c) => Array.isArray(c.tracks) && c.tracks.length > 0);
  const suppliedDrift = meta.qa?.maxHorizDrift;
  const hasDrift = suppliedDrift !== undefined;
  if (trackClips.length || hasDrift) {
    const tIssues: string[] = [];
    let totalTracks = 0;
    let hasRootPosition = false;
    for (const c of trackClips) {
      for (const tr of c.tracks!) {
        totalTracks++;
        const lastDot = tr.name.lastIndexOf('.');
        const target = lastDot >= 0 ? tr.name.slice(0, lastDot) : tr.name;
        const rawProp = lastDot >= 0 ? tr.name.slice(lastDot + 1) : '';
        const prop = rawProp.replace(/\[[^\]]*\]$/, '');
        if (pivotSet.size && !pivotSet.has(target)) tIssues.push(`${c.name}: unknown track target "${target}"`);
        if (prop === 'rotation') {
          tIssues.push(`${c.name}/${tr.name}: Euler rotation track is dropped by GLTFExporter; bake rotation to .quaternion`);
          continue;
        }
        if (!Array.isArray(tr.times) || !Array.isArray(tr.values) || !tr.times.length || !tr.values.length) {
          tIssues.push(`${c.name}/${tr.name}: missing or empty track samples`);
          continue;
        }
        const valuesPerKey = tr.values.length / tr.times.length;
        const isPosition = tr.name.endsWith('.position');
        const isVector3 = isPosition || tr.name.endsWith('.scale');
        const isQuaternion = tr.name.endsWith('.quaternion');
        if (!Number.isInteger(valuesPerKey) || (isVector3 && valuesPerKey !== 3) || (isQuaternion && valuesPerKey !== 4)) {
          tIssues.push(`${c.name}/${tr.name}: ${tr.values.length} values do not match ${tr.times.length} timestamps`);
          continue;
        }
        if (tr.times.some((v) => !Number.isFinite(v)) || tr.values.some((v) => !Number.isFinite(v))) tIssues.push(`${c.name}/${tr.name}: non-finite sample`);
        for (let i = 1; i < tr.times.length; i++) if (!(tr.times[i] > tr.times[i - 1])) { tIssues.push(`${c.name}/${tr.name}: non-increasing timestamps`); break; }
        if (isPosition && target === roots[0]) {
          hasRootPosition = true;
          if (motionMode === 'in-place') {
            const x0 = tr.values[0], z0 = tr.values[2];
            let d = 0;
            for (let i = 0; i + 2 < tr.values.length; i += 3) d = Math.max(d, Math.abs(tr.values[i] - x0), Math.abs(tr.values[i + 2] - z0));
            if (d > maxDrift) tIssues.push(`${c.name}: horizontal root drift ${d.toFixed(4)}m > ${maxDrift}m`);
          }
        }
      }
    }
    if (hasDrift && motionMode === 'in-place') {
      if (!Number.isFinite(suppliedDrift) || suppliedDrift < 0 || suppliedDrift > maxDrift) {
        tIssues.push(`maxHorizDrift ${suppliedDrift} must be between 0 and ${maxDrift}m`);
      }
    } else if (hasDrift && (!Number.isFinite(suppliedDrift) || suppliedDrift < 0)) {
      tIssues.push(`maxHorizDrift ${suppliedDrift} must be finite and >= 0`);
    }
    if (!hasRootPosition && !hasDrift && motionMode === 'in-place') skipped.push('R4 horizontal root drift (no root position track or qa.maxHorizDrift provided)');
    const checks = [];
    if (totalTracks) checks.push(`${totalTracks} track(s) checked for finite, ordered samples and matching value counts`);
    if (motionMode === 'free') checks.push('motionMode=free (natural horizontal sway/lunge allowed)');
    else {
      if (hasRootPosition) checks.push(`root track drift <= ${maxDrift}m`);
      if (hasDrift) checks.push(`supplied maxHorizDrift <= ${maxDrift}m`);
    }
    gates.push({
      gate: 'R4 tracks & drift',
      value: tIssues.length ? tIssues.join('; ') : checks.join(', '),
      pass: tIssues.length === 0,
      hint: motionMode === 'free'
        ? 'bake one finite value tuple per strictly increasing timestamp'
        : 'bake one value tuple per strictly increasing timestamp and keep root motion in-place (X/Z constant), or pass --motion free for hovering/leaping creatures',
    });
  } else skipped.push('R4 tracks & drift (no per-clip tracks or qa.maxHorizDrift provided)');

  // R5 expressions
  if (meta.face) {
    const fIssues: string[] = [];
    const { defaultExpressionInGlb: defaultExpression, textureResolution: res, animationExpressionMapping: mapping } = meta.face;
    const allowed = new Set(meta.face.expressions ?? Object.keys(meta.files?.expressions ?? {}));
    const missing = [
      !allowed.size && 'face.expressions or files.expressions',
      !defaultExpression && 'face.defaultExpressionInGlb',
      res === undefined && 'face.textureResolution',
    ].filter(Boolean);
    const pow2 = (n: number) => Number.isSafeInteger(n) && n >= 64 && n === 2 ** Math.round(Math.log2(n));
    if (res !== undefined && (!Array.isArray(res) || res.length !== 2 || res[0] !== res[1] || !pow2(res[0]))) {
      fIssues.push('textureResolution should be square power-of-two >= 64');
    }
    if (defaultExpression && allowed.size && !allowed.has(defaultExpression)) {
      fIssues.push(`defaultExpressionInGlb "${defaultExpression}" not in expressions`);
    }
    for (const [clipName, expr] of Object.entries(mapping ?? {})) {
      if (allowed.size && !allowed.has(expr)) fIssues.push(`mapping ${clipName}->"${expr}" not in expressions`);
    }
    for (const c of clips ?? []) {
      if (c.expression && allowed.size && !allowed.has(c.expression)) fIssues.push(`clip ${c.name} expression "${c.expression}" not in expressions`);
    }
    if (missing.length) skipped.push(`R5 expressions (missing ${missing.join(', ')})`);
    if (fIssues.length || !missing.length) {
      gates.push({
        gate: 'R5 expressions',
        value: fIssues.length ? fIssues.join('; ') : `${allowed.size} declared expression(s), ${res!.join('x')}, supplied clip mappings valid`,
        pass: fIssues.length === 0,
        hint: 'keep static expression PNGs square power-of-two (e.g. 512x512) and map clips to declared expressions',
      });
    }
  } else skipped.push('R5 expressions (no face section in metadata)');

  // R6 floor / slide clearance
  const drop = meta.qa?.slideDropPct, minY = meta.qa?.slideMinY, clipMinY = meta.qa?.clipMinY;
  const sIssues: string[] = [];
  if (drop !== undefined && (!Number.isFinite(drop) || drop < minSlideDrop)) sIssues.push(`slide drop ${drop}% must be finite and >= ${minSlideDrop}%`);
  if (minY !== undefined && (!Number.isFinite(minY) || minY < minSlideY)) sIssues.push(`slide minY ${minY}m must be finite and >= ${minSlideY}m`);
  if (clipMinY !== undefined && (!Number.isFinite(clipMinY) || clipMinY < minSlideY)) sIssues.push(`clip minY ${clipMinY}m must be finite and >= ${minSlideY}m`);
  if (drop !== undefined || minY !== undefined) {
    if (drop === undefined || minY === undefined) {
      const missing = [drop === undefined && 'qa.slideDropPct', minY === undefined && 'qa.slideMinY'].filter(Boolean);
      skipped.push(`R6 slide clearance (missing ${missing.join(' and ')})`);
    }
    if (sIssues.length || (drop !== undefined && minY !== undefined)) {
      gates.push({
        gate: 'R6 slide clearance',
        value: sIssues.length ? sIssues.join('; ') : `drop ${drop}%, minY ${minY}m`,
        pass: sIssues.length === 0,
        hint: 'raise root Y slightly or bend legs/tail upward at Slide peak so lowest Y stays >= -0.025m while height drops >= 22%',
      });
    }
  } else if (clipMinY !== undefined) {
    gates.push({
      gate: 'R6 floor clearance',
      value: sIssues.length ? sIssues.join('; ') : `clip minY ${clipMinY}m >= ${minSlideY}m`,
      pass: sIssues.length === 0,
      hint: 'adjust root Y or limb/tail arc so no animated frame dips below the floor',
    });
  } else {
    skipped.push('R6 slide clearance (missing qa.slideDropPct and qa.slideMinY)');
  }

  // R7 clip motion
  if (trackClips.length) {
    const staticSet = new Set([...(o.staticClips ?? []), ...(meta.qa?.staticClips ?? [])]);
    const minAngle = o.minAngle ?? 1e-3;
    const minDistance = o.minDistance ?? 1e-4;
    const mIssues: string[] = [];
    const mNotes: string[] = [];
    for (const c of trackClips) {
      if (staticSet.has(c.name)) {
        mNotes.push(`${c.name} (static-allowed)`);
        continue;
      }
      let clipMoves = false;
      for (const tr of c.tracks!) {
        if (!Array.isArray(tr.times) || !Array.isArray(tr.values) || tr.times.length < 2) continue;
        const width = tr.values.length / tr.times.length;
        if (!Number.isInteger(width) || width <= 0 || tr.values.some((v) => !Number.isFinite(v))) continue;
        const isQuat = tr.name.endsWith('.quaternion') && width === 4;
        if (isQuat) {
          const l0 = Math.hypot(tr.values[0], tr.values[1], tr.values[2], tr.values[3]);
          if (!(l0 > 0)) continue;
          const x0 = tr.values[0] / l0, y0 = tr.values[1] / l0, z0 = tr.values[2] / l0, w0 = tr.values[3] / l0;
          for (let i = 4; i + 3 < tr.values.length; i += 4) {
            const li = Math.hypot(tr.values[i], tr.values[i + 1], tr.values[i + 2], tr.values[i + 3]);
            if (!(li > 0)) continue;
            const dot = Math.min(1, Math.abs(x0 * (tr.values[i] / li) + y0 * (tr.values[i + 1] / li) + z0 * (tr.values[i + 2] / li) + w0 * (tr.values[i + 3] / li)));
            if (2 * Math.acos(dot) > minAngle) { clipMoves = true; break; }
          }
        } else {
          for (let i = width; i + width - 1 < tr.values.length; i += width) {
            let sq = 0;
            for (let k = 0; k < width; k++) { const d = tr.values[i + k] - tr.values[k]; sq += d * d; }
            if (Math.sqrt(sq) > minDistance) { clipMoves = true; break; }
          }
        }
        if (clipMoves) break;
      }
      if (!clipMoves) mIssues.push(`${c.name}: all ${c.tracks!.length} track(s) hold their first key`);
      else mNotes.push(c.name);
    }
    const untracked = (clips?.length ?? 0) - trackClips.length;
    const suffix = untracked > 0 ? `, ${untracked} clip(s) without tracks unchecked` : '';
    gates.push({
      gate: 'R7 clip motion',
      value: mIssues.length ? mIssues.join('; ') : `${mNotes.join(', ')} move across keys${suffix}`,
      pass: mIssues.length === 0,
      hint: 'animate at least one pivot between keys, or list intentionally static clips in qa.staticClips / --static-clips',
    });
  }

  return {
    gates,
    skipped,
    stats: {
      pivots: pivots.length,
      edges: edges.length,
      clips: clips?.length ?? 0,
      root: roots[0] ?? null,
    },
  };
}
~~~

## scripts/sharp.ts

~~~typescript source-excerpt
// scripts/sharp.ts: loads `sharp` from the project, or from NODE_PATH / global installs (ESM import ignores NODE_PATH, require does not).
import { createRequire } from 'node:module';
export async function loadSharp(): Promise<any | null> {
  try { return (await import('sharp')).default; } catch { /* fall through */ }
  try { return createRequire(import.meta.url)('sharp'); } catch { return null; }
}
~~~

## scripts/studio/framing.ts

~~~typescript source-excerpt
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { StudioConfig, StudioView } from './types';

export const samplesPerClip = 25;

export function poseBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root, true);
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) {
    throw new Error('The asset pose has no finite bounds to frame');
  }
  return bounds;
}

export function boundsRecord(box: THREE.Box3) {
  return { min: box.min.toArray(), max: box.max.toArray() };
}

export function collectPoseVertices(root: THREE.Object3D, maxPerMesh = 1500): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  root.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.hasAttribute('position')) return;
    const total = mesh.geometry.getAttribute('position').count;
    const step = Math.max(1, Math.ceil(total / maxPerMesh));
    for (let i = 0; i < total; i += step) {
      points.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
    }
  });
  return points;
}

function viewDirection(view: StudioView, frontSide: StudioConfig['frontSide']): THREE.Vector3 {
  const side = frontSide === 'left' ? 1 : -1;
  switch (view) {
    case '34-front': return new THREE.Vector3(side, 0.65, 1.35).normalize();
    case '34-back': return new THREE.Vector3(-side, 0.65, -1.35).normalize();
    case 'front': return new THREE.Vector3(0, 0.20, 1).normalize();
    case 'side': return new THREE.Vector3(side, 0.20, 0).normalize();
    case 'back': return new THREE.Vector3(0, 0.20, -1).normalize();
    case 'top': return new THREE.Vector3(0, 1, 0.001).normalize();
  }
}

function boxCorners(bounds: THREE.Box3): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        corners.push(new THREE.Vector3(x, y, z));
  return corners;
}

export function frameCamera(
  camera: THREE.PerspectiveCamera, controls: OrbitControls,
  bounds: THREE.Box3, view: StudioView, config: StudioConfig,
  samplePoints?: readonly THREE.Vector3[],
) {
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.001);
  const direction = viewDirection(view, config.frontSide);
  camera.position.copy(center).addScaledVector(direction, radius);
  camera.lookAt(center);
  const inverseRotation = camera.quaternion.clone().invert();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;

  // Project actual posed vertices (or box corners as fallback) so tight silhouettes fill the stage cleanly.
  const points = samplePoints?.length ? samplePoints : boxCorners(bounds);
  const projected = new THREE.Vector3();
  let distance = radius * 0.1;
  for (const point of points) {
    projected.copy(point).sub(center).applyQuaternion(inverseRotation);
    const inset = config.margin * Math.max(Math.abs(projected.x) / tanX, Math.abs(projected.y) / tanY);
    distance = Math.max(distance, projected.z + Math.max(inset, radius * 0.05));
  }

  camera.near = radius / 1000;
  camera.far = distance + radius * 100;
  camera.updateProjectionMatrix();
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.target.copy(center);
  controls.minDistance = radius / 20;
  controls.maxDistance = Math.max(distance * 5, radius * 20);
  controls.update();
}
~~~

## scripts/studio/index.html

~~~html source-excerpt
<!doctype html>
<html lang="en" data-studio-state="loading">
<head>
  <meta charset="utf-8">
  <!-- THREE_LICENSE -->
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <link rel="icon" href="data:,">
  <title>Three.js Asset Studio</title>
  <style>
    :root {
      font: 14px/1.4 system-ui, sans-serif;
      color: #f0f4f9;
      background: #131b26;
      color-scheme: dark;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; }
    main {
      height: 100vh;
      height: 100dvh;
      min-height: 430px;
      display: grid;
      grid-template-rows: auto minmax(200px, 1fr) auto;
    }
    header, footer {
      padding: 12px clamp(12px, 3vw, 32px);
      background: #131b26;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 16px;
      border-bottom: 1px solid #314154;
    }
    h1 { margin: 0; font-weight: 650; font-size: 1.16rem; overflow-wrap: anywhere; }
    #asset-name, #metrics, .hint { color: #aebdd0; }
    #asset-name { overflow-wrap: anywhere; }
    .header-info { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; min-width: 0; }
    #stage { position: relative; background: #0d1422; min-width: 0; }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    #notice {
      position: absolute;
      inset: 50% auto auto 50%;
      transform: translate(-50%, -50%);
      width: max-content;
      max-width: calc(100% - 24px);
      max-height: calc(100% - 24px);
      overflow: auto;
      padding: 12px 16px;
      background: #131b26;
      border: 1px solid #556880;
      border-radius: 6px;
      overflow-wrap: anywhere;
    }
    footer { border-top: 1px solid #314154; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
    .views, .clip-controls, .utility-controls, label { display: flex; align-items: center; gap: 8px; }
    .views, .clip-controls, .utility-controls { flex-wrap: wrap; min-width: 0; }
    select, button {
      min-height: 34px;
      border: 1px solid #52637b;
      border-radius: 5px;
      padding: 4px 9px;
      font: inherit;
      background: #202b3a;
      color: inherit;
    }
    select { max-width: min(210px, 55vw); }
    button:not(:disabled) { cursor: pointer; }
    button[aria-pressed="true"] { background: #244766; border-color: #8acbff; }
    button:disabled, select:disabled, input:disabled { opacity: .58; }
    #play { min-width: 62px; }
    #time, #glb-status { font-variant-numeric: tabular-nums; color: #aebdd0; }
    #time { min-width: 104px; }
    #glb-status { font-size: .88rem; overflow-wrap: anywhere; }
    #scrub { width: clamp(86px, 15vw, 210px); }
    input { accent-color: #8acbff; }
    :focus-visible { outline: 2px solid #8acbff; outline-offset: 2px; }
    .hint { margin: 7px 0 0; font-size: .88rem; }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="header-info">
        <h1 id="capture-label">3/4 front</h1>
        <span id="asset-name"></span>
      </div>
      <span id="metrics"></span>
    </header>
    <div id="stage">
      <canvas id="view" aria-label="Interactive asset preview"></canvas>
      <div id="notice" role="status">Loading the asset…</div>
    </div>
    <footer>
      <div class="toolbar">
        <div class="views" role="group" aria-label="Camera presets">
          <button type="button" data-view="34-front" aria-pressed="true">3/4 front</button>
          <button type="button" data-view="34-back" aria-pressed="false">3/4 back</button>
          <button type="button" data-view="front" aria-pressed="false">Front</button>
          <button type="button" data-view="side" aria-pressed="false">Side</button>
          <button type="button" data-view="back" aria-pressed="false">Back</button>
          <button type="button" data-view="top" aria-pressed="false">Top</button>
        </div>
        <div class="clip-controls">
          <label>Clip <select id="clip"><option value="-1">Rest pose</option></select></label>
          <button id="play" type="button" disabled>Play</button>
          <label>Time <input id="scrub" type="range" min="0" max="0" step="any" disabled></label>
          <output id="time" for="scrub">0.00 / 0.00 s</output>
        </div>
        <div class="utility-controls">
          <label id="effects-label" hidden><input id="effects" type="checkbox"> Studio VFX</label>
          <button id="bg-toggle" type="button" aria-pressed="false">Light bg</button>
          <button id="export-glb" type="button">Export .glb</button>
          <button id="verify-glb" type="button">Verify GLB</button>
          <output id="glb-status" aria-live="polite"></output>
        </div>
      </div>
      <p class="hint">Drag to orbit · Right-drag or two fingers to pan · Scroll or pinch to zoom</p>
    </footer>
  </main>
  <script type="module">
    /* STUDIO_BUNDLE */
  </script>
</body>
</html>
~~~

## scripts/studio/runtime.ts

~~~typescript source-excerpt
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetFingerprint } from '../../src/fingerprint';
import { countScene, selectBuilder, unpackAsset } from '../asset-builder';
import { clipMotion } from '../clip-motion';
import { boundsRecord, collectPoseVertices, frameCamera, poseBounds, samplesPerClip } from './framing';
import type {
  StudioApi, StudioBackground, StudioConfig, StudioDiagnostic, StudioFrame, StudioFrameEvidence, StudioInfo, StudioPose,
  StudioVfx, StudioVfxFactory, StudioView,
} from './types';

type NamespaceLoader = () => Promise<Record<string, unknown>>;
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const viewNames: Record<StudioView, string> = {
  '34-front': '3/4 front',
  '34-back': '3/4 back',
  front: 'Front',
  side: 'Side',
  back: 'Back',
  top: 'Top',
};
const backgrounds: Record<StudioBackground, string> = { dark: '#0d1422', light: '#eef2f6' };
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose();
      }
      material.dispose?.();
    }
  });
}

export async function startStudio(
  config: StudioConfig, loadModule: NamespaceLoader, loadVfx?: NamespaceLoader, vfxExport?: string,
) {
  const canvas = byId<HTMLCanvasElement>('view');
  const notice = byId('notice');
  const diagnostics: StudioDiagnostic[] = [];
  const api: StudioApi = { version: 1, getErrors: () => diagnostics.slice() };
  window.threejsStudio = api;

  function fail(kind: StudioDiagnostic['kind'], error: unknown) {
    const message = messageOf(error);
    if (!diagnostics.some((item) => item.kind === kind && item.message === message)) diagnostics.push({ kind, message });
    document.documentElement.dataset.studioState = 'error';
    notice.textContent = message;
    notice.hidden = false;
  }

  window.addEventListener('error', (event) => fail('javascript', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => fail('javascript', event.reason));
  canvas.addEventListener('webglcontextcreationerror', (event) => {
    fail('webgl', event.statusMessage || 'WebGL context creation failed');
  });
  canvas.addEventListener('webglcontextlost', () => fail('webgl', 'WebGL context lost'));

  try {
    byId('asset-name').textContent = config.module;
    const { name: builder, build } = selectBuilder(await loadModule(), config.builder, config.module);
    const asset = await build(structuredClone(config.params), THREE);
    const { root, animations: clips } = unpackAsset(asset);
    const stats = countScene(root);
    if (!stats.meshes) throw new Error('The asset has no meshes with vertex positions');
    if (clips.some((clip) => typeof clip?.name !== 'string' || !Number.isFinite(clip.duration) || clip.duration < 0 || !Array.isArray(clip.tracks))) {
      throw new Error('The builder returned an invalid animation clip');
    }

    const mixer = new THREE.AnimationMixer(root);
    let activeIndex = -1, time = 0;
    let action: THREE.AnimationAction | undefined;
    function selectClip(index: number) {
      mixer.stopAllAction();
      activeIndex = index;
      time = 0;
      action = clips[index] ? mixer.clipAction(clips[index]).reset().play() : undefined;
    }
    function applyPose(seconds: number) {
      time = seconds;
      if (!action) return;
      action.time = time;
      // Sampling with a zero delta preserves the exact end of a looping clip.
      mixer.update(0);
    }

    const rest = poseBounds(root);
    const restPoints = collectPoseVertices(root, 1500);
    const sampled = rest.clone();
    const clipPoints: THREE.Vector3[][] = [];
    const clipBounds = clips.map((clip, index) => {
      selectClip(index);
      const count = clip.duration > 0 ? samplesPerClip : 1;
      const envelope = new THREE.Box3();
      const points: THREE.Vector3[] = [];
      for (let sample = 0; sample < count; sample++) {
        applyPose(clip.duration * sample / (samplesPerClip - 1));
        envelope.union(poseBounds(root));
        if (sample % 3 === 0 || sample === count - 1) points.push(...collectPoseVertices(root, 400));
      }
      sampled.union(envelope);
      clipPoints.push(points);
      return envelope;
    });
    selectClip(-1);

    const scene = new THREE.Scene();
    const sceneBgColor = new THREE.Color(backgrounds.dark);
    scene.background = sceneBgColor;
    scene.add(root);
    // Three.js caches a skinned mesh's culling sphere. Its animated vertices can leave that sphere.
    root.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
      if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).castShadow = true;
    });

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      const room = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(room).texture;
      scene.environmentIntensity = 0.45;
      room.dispose();
      pmrem.dispose();
    } catch (error) {
      fail('webgl', error);
      return;
    }

    const width = Math.max(0.001, sampled.getSize(new THREE.Vector3()).length());
    const center = sampled.getCenter(new THREE.Vector3());
    const span = Math.max(2, width * 0.85);
    const key = new THREE.DirectionalLight('#fff5e6', 2.45);
    key.position.set(center.x - span * 0.9, span * 1.8, center.z + span * 1.2);
    key.target.position.set(center.x, Math.max(0, center.y * 0.5), center.z);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    key.shadow.camera.left = -span;
    key.shadow.camera.right = span;
    key.shadow.camera.top = span;
    key.shadow.camera.bottom = -span;
    key.shadow.camera.near = 0.2;
    key.shadow.camera.far = Math.max(20, width * 6);
    const rim = new THREE.DirectionalLight('#7cc8ff', 0.85);
    rim.position.set(center.x + span, span * 1.2, center.z - span * 1.3);
    rim.target.position.set(center.x, Math.max(0, center.y * 0.5), center.z);
    scene.add(key, key.target, rim, rim.target, new THREE.HemisphereLight('#dceaff', '#2a3548', 0.68));
    const darkGrid = new THREE.GridHelper(width * 1.8, 16, '#32445d', '#1e2c40');
    const lightGrid = new THREE.GridHelper(width * 1.8, 16, '#9ca8ba', '#cbd3df');
    darkGrid.position.set(center.x, 0, center.z);
    lightGrid.position.set(center.x, 0, center.z);
    const shadowGeo = new THREE.PlaneGeometry(width * 2.4, width * 2.4);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowPlane = new THREE.Mesh(shadowGeo, new THREE.ShadowMaterial({ opacity: 0.24 }));
    shadowPlane.position.set(center.x, 0.001, center.z);
    shadowPlane.receiveShadow = true;
    scene.add(darkGrid, lightGrid, shadowPlane);

    const vfxGroup = new THREE.Group();
    vfxGroup.name = '_studio_vfx';
    vfxGroup.visible = false;
    scene.add(vfxGroup);
    let vfx: StudioVfx | void;
    if (loadVfx) {
      const { build: create } = selectBuilder(await loadVfx(), vfxExport, 'studio VFX module', '--vfx-export');
      vfx = await (create as unknown as StudioVfxFactory)({ root, asset, params: structuredClone(config.params), group: vfxGroup, THREE });
    }

    const info: StudioInfo = {
      ...config, builder, stats, fingerprint: assetFingerprint(root),
      clips: clips.map((clip) => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })),
      bounds: { rest: boundsRecord(rest), sampled: boundsRecord(sampled), samplesPerClip },
      vfxAvailable: Boolean(loadVfx), threeRevision: THREE.REVISION,
    };

    const stage = byId('stage');
    const clipSelect = byId<HTMLSelectElement>('clip');
    const play = byId<HTMLButtonElement>('play');
    const scrub = byId<HTMLInputElement>('scrub');
    const effects = byId<HTMLInputElement>('effects');
    const bgToggle = byId<HTMLButtonElement>('bg-toggle');
    const exportGlbBtn = byId<HTMLButtonElement>('export-glb');
    const verifyGlbBtn = byId<HTMLButtonElement>('verify-glb');
    const glbStatus = byId<HTMLOutputElement>('glb-status');
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'));
    const camera = new THREE.PerspectiveCamera(34);
    const controls = new OrbitControls(camera, canvas);
    const gl = renderer.getContext();
    let view: StudioView | null = '34-front';
    let currentBackground: StudioBackground = config.background === 'light' ? 'light' : 'dark';
    let ticking = 0, lastTick = 0, fitting = false;

    function applyBackground(mode: StudioBackground) {
      currentBackground = mode;
      sceneBgColor.set(backgrounds[mode]);
      stage.style.background = backgrounds[mode];
      darkGrid.visible = mode === 'dark';
      lightGrid.visible = mode === 'light';
      bgToggle.textContent = mode === 'dark' ? 'Light bg' : 'Dark bg';
      bgToggle.setAttribute('aria-pressed', String(mode === 'light'));
    }
    applyBackground(currentBackground);

    function pose(): StudioPose {
      const clip = clips[activeIndex];
      return { clip: clip?.name ?? null, duration: clip?.duration ?? 0, time };
    }

    function setEffectsEnabled(enabled: boolean) {
      effects.checked = info.vfxAvailable && enabled;
      vfxGroup.visible = effects.checked;
    }

    function draw() {
      if (effects.checked && vfx?.update) {
        root.updateMatrixWorld(true);
        vfx.update(pose());
      }
      renderer.render(scene, camera);
    }

    function checkWebGL() {
      if (gl.isContextLost()) fail('webgl', 'WebGL context lost');
      for (let i = 0; i < 8; i++) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        const name = ['INVALID_ENUM', 'INVALID_VALUE', 'INVALID_OPERATION', 'INVALID_FRAMEBUFFER_OPERATION', 'OUT_OF_MEMORY', 'CONTEXT_LOST_WEBGL']
          .find((key) => gl[key as keyof typeof gl] === code);
        fail('webgl', name ?? `WebGL error 0x${code.toString(16)}`);
      }
    }

    function checkRenderedFrame() {
      checkWebGL();
      if (!diagnostics.length && renderer.info.render.triangles === 0) throw new Error('The asset did not draw any triangles in this frame');
    }

    function syncAnimation() {
      const { duration } = pose();
      play.disabled = duration <= 0;
      play.textContent = ticking ? 'Pause' : 'Play';
      scrub.disabled = duration <= 0;
      scrub.max = String(duration);
      scrub.value = String(time);
      byId('time').textContent = `${time.toFixed(2)} / ${duration.toFixed(2)} s`;
    }

    function pause() {
      cancelAnimationFrame(ticking);
      ticking = 0;
      lastTick = 0;
    }

    function tick(now: number) {
      if (lastTick) applyPose((time + (now - lastTick) / 1000) % pose().duration);
      lastTick = now;
      draw();
      ticking = requestAnimationFrame(tick);
      syncAnimation();
    }

    function syncCamera() {
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }

    function fit(preset: StudioView) {
      fitting = true;
      view = preset;
      const envelope = clipBounds[activeIndex] ?? rest;
      const basePoints = clipPoints[activeIndex]?.length ? clipPoints[activeIndex] : restPoints;
      const pts = [...basePoints, ...collectPoseVertices(root, 1500)];
      frameCamera(camera, controls, envelope.clone().union(poseBounds(root)), preset, config, pts);
      fitting = false;
      syncCamera();
    }

    function resize() {
      const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (view) fit(view);
      draw();
    }

    function setFrame(frame: StudioFrame): StudioFrameEvidence {
      if (!Object.hasOwn(viewNames, frame.view)) throw new Error(`Unknown camera preset: ${frame.view}`);
      if (frame.background !== undefined && frame.background !== 'dark' && frame.background !== 'light') {
        throw new Error(`Unknown background mode: ${frame.background}`);
      }
      const matches = info.clips.flatMap((clip, index) => clip.name === frame.clip ? [index] : []);
      if (frame.clip !== undefined && matches.length !== 1) throw new Error(`Clip name must match one clip: ${frame.clip}`);
      const index = matches[0] ?? -1;
      const duration = clips[index]?.duration ?? 0;
      const seconds = frame.time ?? 0;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > duration) throw new Error(`Frame time must be between 0 and ${duration} seconds`);

      if (frame.background !== undefined) applyBackground(frame.background);
      pause();
      selectClip(index);
      applyPose(seconds);
      clipSelect.value = String(index);
      byId('capture-label').textContent = frame.label ?? viewNames[frame.view];
      fit(frame.view);
      syncAnimation();

      setEffectsEnabled(false);
      draw();
      checkRenderedFrame();
      let vfxEvidence: StudioFrameEvidence['vfx'] = frame.vfx ? 'unavailable' : 'off';
      if (frame.vfx && info.vfxAvailable) {
        const withoutEffects = canvas.toDataURL();
        setEffectsEnabled(true);
        draw();
        vfxEvidence = canvas.toDataURL() === withoutEffects ? 'no-visible-change' : 'visible';
        checkWebGL();
      }
      return { ...pose(), view: frame.view, background: currentBackground, vfx: vfxEvidence };
    }

    async function exportFreshGlb() {
      const { build: freshBuild } = selectBuilder(await loadModule(), config.builder, config.module);
      const fresh = unpackAsset(await freshBuild(structuredClone(config.params), THREE));
      try {
        const buffer = await new GLTFExporter().parseAsync(fresh.root, {
          binary: true, animations: fresh.animations, onlyVisible: true,
        }) as ArrayBuffer;
        const before = countScene(fresh.root);
        const clipNames = fresh.animations.map((clip) => clip.name);
        const sourceMotion = fresh.animations.length ? clipMotion(THREE, fresh.root, fresh.animations) : [];
        return { buffer, before, clipNames, sourceMotion };
      } finally {
        disposeObjectTree(fresh.root);
      }
    }

    bgToggle.addEventListener('click', () => {
      applyBackground(currentBackground === 'dark' ? 'light' : 'dark');
      draw();
    });

    exportGlbBtn.addEventListener('click', async () => {
      exportGlbBtn.disabled = true;
      verifyGlbBtn.disabled = true;
      glbStatus.textContent = 'Exporting .glb…';
      try {
        const { buffer } = await exportFreshGlb();
        const fileName = `${config.module.replace(/\.[^.]+$/, '') || 'asset'}.glb`;
        const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        glbStatus.textContent = `Exported ${fileName} (${(buffer.byteLength / 1024).toFixed(1)} KB)`;
      } catch (error) {
        glbStatus.textContent = `Export failed: ${messageOf(error)}`;
      } finally {
        exportGlbBtn.disabled = false;
        verifyGlbBtn.disabled = false;
      }
    });

    verifyGlbBtn.addEventListener('click', async () => {
      exportGlbBtn.disabled = true;
      verifyGlbBtn.disabled = true;
      glbStatus.textContent = 'Verifying GLB…';
      try {
        const { buffer, before, clipNames, sourceMotion } = await exportFreshGlb();
        const reloaded = await new GLTFLoader().parseAsync(buffer, '');
        try {
          const after = countScene(reloaded.scene);
          const reloadedClips = reloaded.animations ?? [];
          const outClips = reloadedClips.map((clip) => clip.name);
          const reloadedMotion = reloadedClips.length ? clipMotion(THREE, reloaded.scene, reloadedClips) : [];
          let bindingOk = true;
          let motionPreserved = true;
          const staticNames: string[] = [];
          let movingCount = 0;
          for (let i = 0; i < sourceMotion.length; i++) {
            const src = sourceMotion[i];
            const rel = reloadedMotion[i]?.clip === src.clip ? reloadedMotion[i] : reloadedMotion.find((r) => r.clip === src.clip);
            const hasMorphMove = src.moving.some((m) => m.property === 'morphTargetInfluences');
            if (src.unsupported.length || src.unbound.length || !rel || rel.unsupported.length || rel.unbound.length
              || (rel.tracks < src.tracks && !hasMorphMove)) {
              bindingOk = false;
            }
            if (src.static || !rel || rel.static) staticNames.push(src.clip);
            else movingCount++;
            if (!src.static) {
              if (!rel || rel.static) motionPreserved = false;
              else {
                const relKeys = new Set(rel.moving.map((m) => `${m.node}|${m.property}`));
                if (src.moving.some((m) => !relKeys.has(`${m.node}|${m.property}`))) motionPreserved = false;
              }
            }
          }
          const ok = before.tris > 0 && before.tris === after.tris
            && before.meshes === after.meshes && before.vertexColorMeshes === after.vertexColorMeshes
            && before.skins === after.skins && before.bones === after.bones
            && clipNames.length === outClips.length && clipNames.every((name, idx) => outClips[idx] === name)
            && bindingOk && motionPreserved;
          const motionNote = reloadedMotion.length
            ? ` · moving clips ${movingCount}/${reloadedMotion.length}${staticNames.length ? ` · static: ${staticNames.join(', ')}` : ''}`
            : '';
          glbStatus.textContent = ok
            ? `GLB OK · ${(buffer.byteLength / 1024).toFixed(1)} KB · ${after.tris} tris · ${after.meshes} meshes · ${after.bones} bones · ${outClips.length} clips${motionNote}`
            : `GLB FAIL · tris ${before.tris}->${after.tris}, meshes ${before.meshes}->${after.meshes}, bones ${before.bones}->${after.bones}, clips ${clipNames.length}->${outClips.length}, binding=${bindingOk ? 'ok' : 'fail'}, motion=${motionPreserved ? 'ok' : 'lost'}${motionNote}`;
        } finally {
          disposeObjectTree(reloaded.scene);
        }
      } catch (error) {
        glbStatus.textContent = `Verify failed: ${messageOf(error)}`;
      } finally {
        exportGlbBtn.disabled = false;
        verifyGlbBtn.disabled = false;
      }
    });

    byId('metrics').textContent = `${stats.tris.toLocaleString('en-US')} triangles · ${stats.meshes} ${stats.meshes === 1 ? 'mesh' : 'meshes'}`;
    for (const [index, clip] of clips.entries()) clipSelect.add(new Option(clip.name || '(unnamed clip)', String(index)));
    clipSelect.value = String(activeIndex);
    clipSelect.disabled = clips.length === 0;
    byId('effects-label').hidden = !loadVfx;
    for (const button of buttons) button.addEventListener('click', () => {
      const preset = button.dataset.view as StudioView;
      byId('capture-label').textContent = viewNames[preset];
      fit(preset);
      draw();
    });
    clipSelect.addEventListener('change', () => {
      pause();
      selectClip(Number(clipSelect.value));
      applyPose(0);
      if (view) fit(view);
      syncAnimation();
      draw();
    });
    play.addEventListener('click', () => {
      if (ticking) pause();
      else ticking = requestAnimationFrame(tick);
      syncAnimation();
    });
    scrub.addEventListener('input', () => {
      pause();
      applyPose(Number(scrub.value));
      syncAnimation();
      draw();
    });
    effects.addEventListener('change', () => { setEffectsEnabled(effects.checked); draw(); });
    controls.addEventListener('start', () => { view = null; syncCamera(); byId('capture-label').textContent = 'Orbit'; });
    controls.addEventListener('change', () => { if (!fitting) draw(); });

    setEffectsEnabled(true);
    const initialIndex = config.initialClip
      ? clips.findIndex((clip) => clip.name === config.initialClip)
      : (config.autoplay && clips.length ? Math.max(0, clips.findIndex((clip) => /idle/i.test(clip.name))) : -1);
    if (config.initialClip && initialIndex < 0) {
      throw new Error(`Unknown initial clip "${config.initialClip}"`);
    }
    if (initialIndex >= 0) {
      selectClip(initialIndex);
      applyPose(0);
      clipSelect.value = String(initialIndex);
    }
    syncAnimation();
    resize();
    checkRenderedFrame();
    api.info = () => structuredClone(info);
    api.setFrame = setFrame;
    if (!diagnostics.length) {
      document.documentElement.dataset.studioState = 'ready';
      notice.hidden = true;
    }
    new ResizeObserver(resize).observe(stage);
    if (config.autoplay && initialIndex >= 0 && (clips[initialIndex]?.duration ?? 0) > 0 && !ticking) {
      ticking = requestAnimationFrame(tick);
      syncAnimation();
    }
  } catch (error) {
    fail('javascript', error);
  }
}
~~~

## scripts/studio/types.ts

~~~typescript source-excerpt
import type * as THREE from 'three';
import type { countScene } from '../asset-builder';
import type { assetFingerprint } from '../../src/fingerprint';

export type StudioView = '34-front' | '34-back' | 'front' | 'side' | 'back' | 'top';
export type StudioBackground = 'dark' | 'light';
export type StudioConfig = {
  module: string;
  builder?: string;
  params: Record<string, unknown>;
  margin: number;
  frontSide: 'left' | 'right';
  background: StudioBackground;
  initialClip?: string;
  autoplay?: boolean;
};

export type StudioVfxContext = {
  root: THREE.Object3D;
  asset: unknown;
  params: Record<string, unknown>;
  group: THREE.Group;
  THREE: typeof THREE;
};
export type StudioPose = { clip: string | null; time: number; duration: number };
export type StudioVfx = { update?: (pose: StudioPose) => void };
export type StudioVfxFactory = (context: StudioVfxContext) => StudioVfx | void | Promise<StudioVfx | void>;

export type StudioFrame = {
  view: StudioView;
  clip?: string;
  time?: number;
  vfx?: boolean;
  background?: StudioBackground;
  label?: string;
};
export type StudioFrameEvidence = StudioPose & {
  view: StudioView;
  background: StudioBackground;
  vfx: 'off' | 'visible' | 'unavailable' | 'no-visible-change';
};

type Bounds = { min: number[]; max: number[] };
export type StudioInfo = Omit<StudioConfig, 'builder'> & {
  builder: string;
  clips: { name: string; duration: number; tracks: number }[];
  stats: ReturnType<typeof countScene>;
  fingerprint: ReturnType<typeof assetFingerprint>;
  bounds: { rest: Bounds; sampled: Bounds; samplesPerClip: number };
  vfxAvailable: boolean;
  threeRevision: string;
};
export type StudioDiagnostic = { kind: 'javascript' | 'webgl'; message: string };

export type StudioApi = {
  version: 1;
  getErrors: () => StudioDiagnostic[];
  info?: () => StudioInfo;
  setFrame?: (frame: StudioFrame) => StudioFrameEvidence;
};

declare global {
  interface Window {
    threejsStudio?: StudioApi;
  }
}
~~~

## tools/check.ts

~~~typescript source-excerpt
// npx tsx tools/check.ts [--strict]       (or: cd tools && npm run check)
// THE one command: validate-skills + trigger-check + run-tests, then one combined verdict.
// --strict is passed to run-tests: a test that is skipped because `three` is not installed counts as a failure.
// Exit 0 = everything ran and passed (skips are reported as UNVERIFIED), 2 = something failed, 1 = a tool broke the output contract.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, MARKER, parseResult, spawnTsx, type Gate, type Result } from '../scripts/result';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const strict = process.argv.includes('--strict');
const steps: { name: string; file: string; args: string[] }[] = [
  { name: 'validate-skills', file: 'validate-skills.ts', args: [root] },
  { name: 'trigger-check', file: 'trigger-check.ts', args: [] },
  { name: 'run-tests', file: 'run-tests.ts', args: [root, ...(strict ? ['--strict'] : [])] },
];

const gates: Gate[] = [], results: Record<string, Result | null> = {};
let broken = false;
for (const s of steps) {
  console.log(`\n=== ${s.name} ===`);
  const r = spawnTsx(join(here, s.file), s.args, { cwd: here, timeout: 600_000 });
  process.stdout.write((r.stdout ?? '').split('\n').filter((l) => !l.startsWith(MARKER)).join('\n'));
  if (r.stderr) process.stderr.write(r.stderr);
  const res = parseResult(r.stdout ?? '');
  results[s.name] = res;
  if (!res) { broken = true; gates.push({ gate: s.name, value: 'no result line', pass: false, hint: `${s.name} exited ${r.status ?? r.signal} without a final "${MARKER.trim()}" JSON line` }); continue; }
  gates.push({ gate: s.name, value: res.ok ? 'ok' : 'failed', pass: res.ok, hint: res.ok ? '' : (res.gates?.find((g) => !g.pass)?.hint || 'see the output above') });
}

const rt = results['run-tests'], unverified = ((rt?.tests as { file: string; status: string }[] | undefined) ?? []).filter((t) => t.status === 'skip').map((t) => t.file);
console.log('\n=== summary ===');
for (const g of gates) console.log(`${g.pass ? 'PASS' : 'FAIL'} ${g.gate}${g.hint ? `  (${g.hint})` : ''}`);
if (unverified.length) console.log(`UNVERIFIED (not run, \`three\` missing): ${unverified.join(', ')}. Install three and rerun with --strict before calling this done.`);
const ok = gates.every((g) => g.pass);
console.log(ok ? (unverified.length ? 'ALL RUN CHECKS PASS, with unverified tests above.' : 'ALL CHECKS PASS.') : 'CHECKS FAILED.');
process.exit(emit({ tool: 'check', ok, gates, strict, unverified }, broken ? 1 : 2));
~~~

## tools/package.json

~~~json source-excerpt
{
  "type": "module",
  "private": true,
  "scripts": {
    "check": "tsx check.ts",
    "validate": "tsx validate-skills.ts",
    "trigger": "tsx trigger-check.ts",
    "test": "tsx run-tests.ts"
  }
}
~~~

## tools/run-tests.ts

~~~typescript source-excerpt
// npx tsx tools/run-tests.ts [skill-dir] [--strict] [--only <substring>] [--timeout <ms>]
// Runs every *.test.ts under the skill folder (src/, scripts/, tools/) with tsx, each in its own folder.
// pass  = exit code 0
// skip  = the run died only because the `three` package is not installed (sandbox without network). NOT a pass: it is counted
//         as "unverified" and listed. With --strict a skip fails the run, so use --strict on a machine where `npm i three` works.
// fail  = anything else. The last lines of its output are printed.
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, spawnTsx, type Gate } from '../scripts/result';

export type Status = 'pass' | 'fail' | 'skip';
export type TestRun = { file: string; status: Status; ms: number; reason?: string };

export const findTests = (root: string, out: string[] = []): string[] => {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) findTests(p, out); else if (e.name.endsWith('.test.ts')) out.push(p);
  }
  return out.sort();
};

/** True when the output shows the run stopped because `three` (or a `three/...` path) could not be resolved. */
export const missingThree = (output: string) =>
  /Cannot find (module|package) ['"]three(\/[^'"]*)?['"]/.test(output) || /ERR_MODULE_NOT_FOUND[^\n]*['"]three(\/[^'"]*)?['"]/.test(output);

export function runOne(file: string, timeoutMs: number): TestRun & { output: string } {
  const t0 = Date.now(), r = spawnTsx(file, [], { cwd: dirname(file), timeout: timeoutMs, env: process.env });
  const ms = Date.now() - t0, output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') return { file, status: 'fail', ms, reason: `timeout after ${timeoutMs} ms`, output };
  if (r.error) return { file, status: 'fail', ms, reason: `could not start tsx: ${r.error.message}`, output };
  if (r.status === 0) return { file, status: 'pass', ms, output };
  if (missingThree(output)) return { file, status: 'skip', ms, reason: 'needs the `three` package (npm i three)', output };
  return { file, status: 'fail', ms, reason: `exit code ${r.status ?? r.signal}`, output };
}

export function main(argv: string[]): number {
  let root = '', strict = false, only = '', timeout = 120_000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') strict = true; else if (a === '--only') only = argv[++i] ?? ''; else if (a === '--timeout') timeout = Number(argv[++i]);
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); return 1; } else root = a;
  }
  if (!Number.isFinite(timeout) || timeout <= 0) { console.error('--timeout needs a positive number of milliseconds'); return 1; }
  root = resolve(root || join(dirname(fileURLToPath(import.meta.url)), '..'));
  const files = findTests(root).filter((f) => !only || f.includes(only));
  if (!files.length) { console.error(`no *.test.ts found under ${root}${only ? ` matching "${only}"` : ''}`); return 1; }
  const runs: TestRun[] = [], gates: Gate[] = [];
  for (const f of files) {
    const { output, ...run } = runOne(f, timeout), rel = relative(root, f);
    runs.push({ ...run, file: rel });
    console.log(`${run.status.toUpperCase().padEnd(4)} ${rel} (${(run.ms / 1000).toFixed(1)}s)${run.reason ? `  ${run.reason}` : ''}`);
    if (run.status === 'fail') console.log(output.trim().split('\n').slice(-15).map((l) => `     | ${l}`).join('\n'));
    gates.push({ gate: rel, value: run.status, pass: run.status === 'pass' || (run.status === 'skip' && !strict), hint: run.status === 'skip' ? (strict ? 'needs the `three` package: npm i three' : 'unverified: install three and rerun with --strict') : run.status === 'fail' ? (run.reason ?? '') : '' });
  }
  const n = (s: Status) => runs.filter((r) => r.status === s).length, passed = n('pass'), failed = n('fail'), skipped = n('skip');
  const ok = failed === 0 && (!strict || skipped === 0);
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped${skipped ? ` (UNVERIFIED: ${runs.filter((r) => r.status === 'skip').map((r) => r.file).join(', ')})` : ''}${strict ? ' [strict]' : ''}`);
  return emit({ tool: 'run-tests', ok, gates, passed, failed, skipped, strict, tests: runs });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
~~~

## tools/trigger-check.ts

~~~typescript source-excerpt
// npx tsx tools/trigger-check.ts [cases.json] [--skills-dir <dir>]... [--min <score>] [--verbose]
// "Example prompt -> which skill must win", checked offline against the skills' name + description.
//
// HOW IT WORKS (and what it is not): each prompt is scored against every skill description with BM25 over stemmed words.
// The highest score wins; below `min` nobody wins ("none"). The competitors are the real skills found in --skills-dir
// plus the `decoys` in the cases file (made-up neighbours such as a glTF loader), because a description is only
// good if it beats its neighbours, not if it matches in isolation.
// This is a lexical proxy. It catches a description that lost its key words, or that grabs prompts meant for another
// skill. It does NOT model how a language model reads a description (it cannot understand "Not for loading glTF files"),
// so a green run is necessary, not sufficient. English prompts only.
//
// cases.json: { "min": 1.2, "decoys": [{ "name", "description" }], "cases": [{ "prompt", "expect": "<skill name>" | null }] }
// expect null = no skill should trigger. "$self" = the skill folder that contains tools/.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, type Gate } from '../scripts/result';
import { findSkills, parseFrontmatter } from './validate-skills';

export type Doc = { name: string; text: string };
export type Case = { prompt: string; expect: string | null };
export type Ranked = { name: string; score: number }[];

const STOP = new Set('a an and are as at be but by can could do does for from had has have how i if in into is it its me my of on or our so that the their them then there these they this to us was we what when where which while who will with would you your please want need like just some any also not no use using used get make made build create new one'.split(' '));

export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(sh|ch|x|ss|z)es$/.test(w)) return w.slice(0, -2);              // meshes -> mesh, boxes -> box, classes -> class
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Lower-cases, splits camelCase, hyphens, dots and symbols, drops stop words, stems. A hyphenated compound also adds its joined form. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const spaced = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  for (const chunk of spaced.split(/\s+/)) {
    const parts = chunk.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (/[a-z0-9]-[a-z0-9]/i.test(chunk) && parts.length > 1) out.push(stem(parts.join('')));
    for (const p of parts) if (!STOP.has(p) && p.length > 1) out.push(stem(p));
  }
  return out;
}

/** BM25 of one query against a small set of documents (k1 = 1.2, b = 0.75). Returns every doc, best first. */
export function rank(query: string, docs: Doc[]): Ranked {
  const toks = docs.map((d) => tokenize(`${d.name.replace(/-/g, ' ')} ${d.text}`));
  const N = docs.length, avg = toks.reduce((s, t) => s + t.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const q = [...new Set(tokenize(query))];
  return docs.map((d, i) => {
    const tf = new Map<string, number>(); for (const w of toks[i]) tf.set(w, (tf.get(w) ?? 0) + 1);
    let score = 0;
    for (const w of q) {
      const f = tf.get(w); if (!f) continue;
      const n = df.get(w) ?? 0, idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (toks[i].length / avg))));
    }
    return { name: d.name, score };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Winner of a ranking: null when nobody reaches `min`. Margin = how far the winner is ahead of the runner-up. */
export const pick = (r: Ranked, min: number) => ({ winner: r[0] && r[0].score >= min ? r[0].name : null, score: r[0]?.score ?? 0, margin: (r[0]?.score ?? 0) - (r[1]?.score ?? 0), runnerUp: r[1]?.name ?? null });

export function loadSkillDocs(dirs: string[]): Doc[] {
  const docs: Doc[] = [];
  for (const d of dirs.flatMap(findSkills)) {
    const fm = parseFrontmatter(readFileSync(join(d, 'SKILL.md'), 'utf8'));
    docs.push({ name: fm?.fm.name || basename(d), text: fm?.fm.description ?? '' });
  }
  return docs;
}

export function main(argv: string[]): number {
  const here = dirname(fileURLToPath(import.meta.url)), self = resolve(here, '..');
  let casesFile = join(here, 'trigger-cases.json'), minArg: number | null = null, verbose = false;
  const skillDirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skills-dir') skillDirs.push(argv[++i]); else if (a === '--min') minArg = Number(argv[++i]); else if (a === '--verbose') verbose = true;
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); return 1; } else casesFile = resolve(a);
  }
  if (!existsSync(casesFile)) { console.error(`cases file not found: ${casesFile}`); return 1; }
  let spec: { min?: number; decoys?: Doc[] & { description?: string }[]; cases: Case[] };
  try { spec = JSON.parse(readFileSync(casesFile, 'utf8')); } catch (e) { console.error(`cannot parse ${casesFile}: ${(e as Error).message}`); return 1; }
  if (!Array.isArray(spec.cases) || !spec.cases.length) { console.error('cases file has no "cases"'); return 1; }
  const min = minArg ?? spec.min ?? 1;
  if (!Number.isFinite(min)) { console.error('--min needs a number'); return 1; }

  const selfDoc = loadSkillDocs([self])[0];
  const docs: Doc[] = [selfDoc, ...loadSkillDocs(skillDirs).filter((d) => d.name !== selfDoc.name), ...(spec.decoys ?? []).map((d: any) => ({ name: d.name as string, text: d.description as string }))];
  const names = new Set(docs.map((d) => d.name));
  const gates: Gate[] = [], rows: unknown[] = [];
  for (const c of spec.cases) {
    const expect = c.expect === '$self' ? selfDoc.name : c.expect;
    if (expect !== null && !names.has(expect)) { console.error(`case "${c.prompt.slice(0, 50)}": expected skill "${expect}" is not a known skill or decoy`); return 1; }
    const r = rank(c.prompt, docs), p = pick(r, min), pass = p.winner === expect;
    console.log(`${pass ? 'PASS' : 'FAIL'} -> ${p.winner ?? 'none'} (${p.score.toFixed(2)}, +${p.margin.toFixed(2)} over ${p.runnerUp})  expected ${expect ?? 'none'}  | ${c.prompt}`);
    if (verbose || !pass) console.log(`     ${r.slice(0, 3).map((x) => `${x.name} ${x.score.toFixed(2)}`).join('  ')}`);
    gates.push({ gate: c.prompt.length > 70 ? `${c.prompt.slice(0, 67)}...` : c.prompt, value: `${p.winner ?? 'none'} (${p.score.toFixed(2)})`, pass, hint: pass ? '' : `expected ${expect ?? 'none'}; sharpen the description of the expected skill or narrow the one that won` });
    rows.push({ prompt: c.prompt, expect, winner: p.winner, score: +p.score.toFixed(3), margin: +p.margin.toFixed(3), pass });
  }
  const failed = gates.filter((g) => !g.pass).length;
  console.log(`\n${gates.length - failed}/${gates.length} prompts routed correctly (min score ${min}, ${docs.length} competing descriptions). Lexical proxy: see the header of tools/trigger-check.ts.`);
  return emit({ tool: 'trigger-check', ok: failed === 0, gates, failed, min, competitors: docs.map((d) => d.name), cases: rows });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
~~~

## tools/validate-skills.ts

~~~typescript source-excerpt
// npx tsx tools/validate-skills.ts [skill-dir | dir-of-skills ...] [--max-tokens 5000] [--max-lines 500] [--max-desc 400]
// Default target: the skill folder that contains this tools/ folder.
// Checks: frontmatter (name = folder name, description <= 400 chars, no ': '), SKILL.md token budget and line count,
// relative links, mentioned files exist, `Contents:` in every reference, no orphan references.
// Tokens are estimated as bytes / 4, the same rough count as HANDOFF.md.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, type Gate } from '../scripts/result';

export type Issue = { level: 'error' | 'warn'; check: string; file: string; msg: string };
export type Limits = { maxTokens: number; maxLines: number; maxDesc: number };
export const DEFAULT_LIMITS: Limits = { maxTokens: 5000, maxLines: 500, maxDesc: 400 };
export const tokensOf = (text: string) => Math.ceil(Buffer.byteLength(text, 'utf8') / 4);

const KNOWN_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const PREFIXES = ['references/', 'src/', 'scripts/', 'tools/'];
// Files the skill tells the agent to CREATE in the user's project, so they are not expected inside the skill folder.
const GENERATED = /^(ref(-spec)?\.(json|md|png)|ref_.*|ref-.*-mask\.png|diff-.*\.png|tris\.json|package\.json|tsconfig\.json|SKILL\.md|AGENTS\.md|CLAUDE\.md|README\.md|HANDOFF\.md)$/;

export function parseFrontmatter(text: string): { fm: Record<string, string>; problems: string[]; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  const fm: Record<string, string> = {}, problems: string[] = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) { problems.push('multi-line value: keep each frontmatter value on one line'); continue; }
    const km = /^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!km) { problems.push(`unparseable frontmatter line: ${line.slice(0, 40)}`); continue; }
    let v = (km[2] ?? '').trim();
    if (/^[>|][+-]?$/.test(v)) { problems.push(`${km[1]}: block scalars (${v}) are not supported, use one line`); v = ''; }
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) v = v.slice(1, -1);
    fm[km[1]] = v;
  }
  return { fm, problems, body: text.slice(m[0].length) };
}

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

const codeFence = /^(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm;

/** Collects the file mentions of one markdown file: markdown links, inline-code paths, and relative imports inside code fences. */
export function mentions(md: string) {
  const prose = md.replace(codeFence, (block) => block.replace(/[^\n]/g, ' '));
  const links: string[] = [], paths: string[] = [], bare: string[] = [], imports: string[] = [];
  for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const t = m[1];
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t)) continue;           // http:, mailto:, #anchor
    links.push(t.split('#')[0]);
  }
  for (const m of prose.matchAll(/`([^`\n]+)`/g)) {
    for (let w of m[1].split(/\s+/)) {
      w = w.replace(/^["'(]+|["'),.;:]+$/g, '');
      if (!w || /[<>*{}$…=]|^--?\w/.test(w) || /^(~|\/|[a-z]+:\/\/)/.test(w)) continue;
      const isPrefixed = PREFIXES.some((p) => w.startsWith(p));
      if (isPrefixed) { if (w !== 'src/' && !/^[\w./-]+$/.test(w)) continue; paths.push(w); }
      else if (/^[\w.-]+\.(ts|md)$/.test(w)) bare.push(w);
    }
  }
  // Imports of the user's own project are exempt: a line that says "project-specific", or a bundler query such as ?raw.
  for (const [, , info, code] of md.matchAll(codeFence)) {
    // Source excerpts preserve paths from the harness. The packer checks them against the canonical files.
    if (info.trim().split(/\s+/).includes('source-excerpt')) continue;
    for (const line of code.split('\n')) {
      if (/project-specific/i.test(line)) continue;
      for (const m of line.matchAll(/from\s+['"](\.{1,2}\/[^'"?]+)['"]/g)) imports.push(m[1]);
    }
  }
  return { links, paths, bare, imports };
}

export function validateSkill(dir: string, limits: Limits = DEFAULT_LIMITS) {
  const issues: Issue[] = [], root = resolve(dir), folder = basename(root);
  const add = (level: Issue['level'], check: string, file: string, msg: string) => issues.push({ level, check, file: relative(root, file) || '.', msg });
  const skillFile = join(root, 'SKILL.md');
  if (!existsSync(skillFile)) { add('error', 'skill-file', root, 'SKILL.md not found'); return { name: folder, issues, metrics: {} as Record<string, number> }; }
  const text = readFileSync(skillFile, 'utf8'), fmr = parseFrontmatter(text);
  const metrics: Record<string, number> = { skillTokens: tokensOf(text), skillLines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0), descChars: 0 };

  // 1. frontmatter
  if (!fmr) add('error', 'frontmatter', skillFile, 'no frontmatter block (--- ... ---) at the top');
  else {
    const { fm, problems } = fmr;
    for (const p of problems) add('error', 'frontmatter', skillFile, p);
    for (const k of Object.keys(fm)) if (!KNOWN_KEYS.has(k)) add('warn', 'frontmatter', skillFile, `unknown key "${k}"`);
    const name = fm.name ?? '', desc = fm.description ?? '';
    if (!name) add('error', 'name', skillFile, 'missing name');
    else {
      if (name !== folder) add('error', 'name', skillFile, `name "${name}" must equal the folder name "${folder}"`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) add('error', 'name', skillFile, 'name must be lowercase letters, digits and single hyphens, max 64 chars');
      if (/anthropic|claude/.test(name)) add('error', 'name', skillFile, 'name must not contain "anthropic" or "claude"');
    }
    metrics.descChars = desc.length;
    if (!desc.trim()) add('error', 'description', skillFile, 'missing or empty description');
    if (desc.length > limits.maxDesc) add('error', 'description', skillFile, `description is ${desc.length} chars, max ${limits.maxDesc}`);
    if (desc.includes(': ')) add('error', 'description', skillFile, 'description contains ": " (breaks simple YAML parsers); use a dash, comma or sentence break');
    if (/<\/?[a-z][^>]*>/i.test(desc)) add('error', 'description', skillFile, 'description must not contain XML or HTML tags');
  }

  // 2. budget
  if (metrics.skillTokens > limits.maxTokens) add('error', 'budget', skillFile, `SKILL.md is about ${metrics.skillTokens} tokens, budget ${limits.maxTokens}`);
  if (metrics.skillLines > limits.maxLines) add('error', 'budget', skillFile, `SKILL.md has ${metrics.skillLines} lines, max ${limits.maxLines}`);

  // 3. references: Contents line, links, mentions
  const mdFiles = walk(root).filter((f) => f.endsWith('.md') && !/(^|[\\/])HANDOFF\.md$/.test(f));
  const refDir = join(root, 'references'), refs = mdFiles.filter((f) => dirname(f) === refDir).sort();
  metrics.references = refs.length;
  for (const r of refs) {
    const head = readFileSync(r, 'utf8').split('\n').slice(0, 15);
    if (!head.some((l) => /^Contents:\s*\S/.test(l))) add('error', 'contents', r, 'no "Contents:" line in the first 15 lines');
  }
  const exists = (p: string) => existsSync(p);
  const mentioned = new Set<string>();
  const bareCandidates = (name: string, from: string) => [join(dirname(from), name), ...['', 'references', 'src', 'scripts', 'tools'].map((d) => join(root, d, name))];
  for (const f of mdFiles) {
    const md = readFileSync(f, 'utf8'), m = mentions(md);
    for (const l of m.links) { const t = resolve(dirname(f), l); if (l && !exists(t)) add('error', 'link', f, `broken link: ${l}`); else if (l) mentioned.add(t); }
    for (const p of m.paths) { const t = resolve(root, p); if (!exists(t)) add('error', 'mention', f, `mentioned file does not exist: ${p}`); else mentioned.add(t); }
    for (const b of m.bare) {
      const hit = bareCandidates(b, f).find(exists);
      if (hit) mentioned.add(resolve(hit)); else if (!GENERATED.test(b)) add('warn', 'mention', f, `bare file name not found anywhere in the skill: ${b}`);
    }
    for (const i of m.imports) {
      const base = resolve(join(root, 'src'), i);
      if (!['', '.ts', '/index.ts'].some((e) => exists(base + e) && statSync(base + e).isFile())) add('warn', 'code-import', f, `code example imports ${i}, which does not exist under src/`);
    }
  }

  // 4. orphans: every reference must be reachable from SKILL.md; every non-test src file should be mentioned somewhere
  const fromSkill = new Set<string>(), sm = mentions(text);
  for (const p of [...sm.paths, ...sm.links]) fromSkill.add(resolve(root, p));
  for (const l of sm.links) fromSkill.add(resolve(root, l));
  for (const r of refs) if (!fromSkill.has(r)) add('error', 'orphan', r, 'reference is not linked from SKILL.md (agents will never find it)');
  const srcDir = join(root, 'src');
  if (exists(srcDir)) for (const f of walk(srcDir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
    const base = basename(f), allText = mdFiles.map((x) => readFileSync(x, 'utf8')).join('\n');
    if (!mentioned.has(f) && !allText.includes(base) && !allText.includes(base.replace(/\.ts$/, ''))) add('warn', 'orphan', f, 'source file is not mentioned in any markdown file');
  }
  return { name: fm_name(fmr, folder), issues, metrics };
}
const fm_name = (fmr: ReturnType<typeof parseFrontmatter>, folder: string) => fmr?.fm.name || folder;

/** A dir with SKILL.md is a skill; otherwise every child dir with SKILL.md is. */
export function findSkills(p: string): string[] {
  const r = resolve(p);
  if (existsSync(join(r, 'SKILL.md'))) return [r];
  return existsSync(r) && statSync(r).isDirectory() ? readdirSync(r, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(r, e.name, 'SKILL.md'))).map((e) => join(r, e.name)).sort() : [];
}

export function main(argv: string[]): number {
  const limits = { ...DEFAULT_LIMITS }, targets: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], num = () => Number(argv[++i]);
    if (a === '--max-tokens') limits.maxTokens = num(); else if (a === '--max-lines') limits.maxLines = num(); else if (a === '--max-desc') limits.maxDesc = num();
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); return 1; } else targets.push(a);
  }
  if (Object.values(limits).some((v) => !Number.isFinite(v))) { console.error('limit options need a number'); return 1; }
  const dirs = (targets.length ? targets : [join(dirname(fileURLToPath(import.meta.url)), '..')]).flatMap(findSkills);
  if (!dirs.length) { console.error('no skill folder (a directory with SKILL.md) found'); return 1; }
  const gates: Gate[] = [], all: Issue[] = [], skills: unknown[] = [];
  for (const d of dirs) {
    const { name, issues, metrics } = validateSkill(d, limits);
    all.push(...issues); skills.push({ name, ...metrics });
    for (const i of issues) console.log(`${i.level === 'error' ? 'ERROR' : 'WARN '} [${i.check}] ${i.file}: ${i.msg}`);
    const errors = issues.filter((i) => i.level === 'error').length, warns = issues.length - errors;
    console.log(`${errors ? 'FAIL' : 'PASS'} ${name}: ${metrics.skillLines ?? '?'} lines, ~${metrics.skillTokens ?? '?'} tokens, description ${metrics.descChars ?? '?'} chars, ${metrics.references ?? 0} references, ${errors} error(s), ${warns} warning(s)`);
    gates.push({ gate: `validate ${name}`, value: `${errors} error(s), ${warns} warning(s)`, pass: errors === 0, hint: errors ? issues.find((i) => i.level === 'error')!.msg : '' });
  }
  const errors = all.filter((i) => i.level === 'error').length;
  return emit({ tool: 'validate-skills', ok: errors === 0, gates, errors, warnings: all.length - errors, skills, issues: all });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
~~~

## assets/fast-preview.html

~~~html source-excerpt
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Fast Preview</title>
  <link rel="icon" href="data:,">
  <style>
    :root {
      font: 16px/1.5 system-ui, sans-serif;
      color: #19201e;
      background: #f2f4f0;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; }
    main { max-width: 1120px; margin: auto; padding: clamp(16px, 4vw, 44px); }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    h1 { margin: 0; font-size: clamp(1.35rem, 3vw, 2rem); letter-spacing: -.035em; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button, select {
      padding: 8px 14px;
      border: 1px solid #b5beb5;
      border-radius: 6px;
      background: #fff;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    :is(button, select, input):focus-visible { outline: 3px solid #1c664d; outline-offset: 3px; }
    .primary { border-color: #164434; background: #164434; color: #fff; }
    button:disabled { opacity: .55; cursor: default; }
    #stage {
      position: relative;
      min-height: 260px;
      height: min(68vh, 720px);
      overflow: hidden;
      border: 1px solid #b5beb5;
      border-radius: 10px;
      background: #dce2db;
    }
    #stage[data-dragging] { outline: 3px solid #1c664d; outline-offset: 2px; }
    model-viewer { display: block; width: 100%; height: 100%; }
    #stage-message {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 20px;
      text-align: center;
      pointer-events: none;
    }
    #status { margin: 10px 0 0; overflow-wrap: anywhere; }
    #animation {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 16px;
      margin-top: 12px;
    }
    #playback { min-width: 78px; }
    .clip-picker, .timeline-control { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .clip-picker { flex: 0 1 240px; }
    .clip-picker select { min-width: 0; width: 100%; }
    .timeline-control { flex: 1 1 280px; }
    #timeline { min-width: 0; width: 100%; accent-color: #164434; }
    #time { min-width: 13ch; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Fast Preview</h1>
      <div class="actions">
        <button type="button" id="reset" disabled>Reset view</button>
        <button type="button" id="open" class="primary">Open GLB</button>
        <input type="file" id="file" accept=".glb,model/gltf-binary" hidden>
      </div>
    </header>
    <section id="stage" aria-label="3D model preview">
      <model-viewer id="viewer" camera-controls camera-orbit="0deg 75deg 105%" animation-crossfade-duration="0" touch-action="pan-y" alt="3D asset preview"></model-viewer>
      <p id="stage-message">Drop a GLB here or choose one with Open GLB.</p>
    </section>
    <section id="animation" aria-label="Animation playback" hidden>
      <button type="button" id="playback">Play</button>
      <label class="clip-picker">Clip <select id="clip" aria-label="Animation clip"></select></label>
      <div class="timeline-control">
        <input type="range" id="timeline" min="0" max="0" step="any" value="0" aria-label="Animation timeline">
        <span id="time">0.00 / 0.00 s</span>
      </div>
    </section>
    <p id="status" role="status">The viewer uses your browser to load the selected file.</p>
  </main>
  <script type="module">
    const viewer = document.querySelector('#viewer');
    const stage = document.querySelector('#stage');
    const stageMessage = document.querySelector('#stage-message');
    const status = document.querySelector('#status');
    const fileInput = document.querySelector('#file');
    const reset = document.querySelector('#reset');
    const animation = document.querySelector('#animation');
    const play = document.querySelector('#playback');
    const clip = document.querySelector('#clip');
    const timeline = document.querySelector('#timeline');
    const time = document.querySelector('#time');
    const initialOrbit = viewer.getAttribute('camera-orbit');
    // Looping clips wrap at the exact duration. Seek just inside the final frame.
    const lastFrameRatio = 1 - 1e-6;
    let viewerLibrary;
    let loadRequest = 0;
    let modelUrl;
    let fileName;
    let playbackFrame = 0;

    function setStatus(message, showOnStage = true) {
      status.textContent = message;
      stageMessage.textContent = message;
      stageMessage.hidden = !showOnStage;
    }

    function renderTimeline() {
      const elapsed = Math.max(0, Math.min(viewer.currentTime, viewer.duration));
      timeline.value = String(elapsed);
      time.textContent = elapsed.toFixed(2) + ' / ' + viewer.duration.toFixed(2) + ' s';
      timeline.setAttribute('aria-valuetext', time.textContent);
      playbackFrame = viewer.paused ? 0 : requestAnimationFrame(renderTimeline);
    }

    function syncPlayback() {
      cancelAnimationFrame(playbackFrame);
      playbackFrame = 0;
      play.textContent = viewer.paused ? 'Play' : 'Pause';
      if (!animation.hidden) renderTimeline();
    }

    function hidePlayback() {
      animation.hidden = true;
      if (modelUrl) viewer.pause();
      cancelAnimationFrame(playbackFrame);
      playbackFrame = 0;
    }

    async function selectClip() {
      const request = loadRequest;
      const name = clip.value;
      play.disabled = timeline.disabled = true;
      viewer.pause();
      viewer.animationName = name;
      await viewer.updateComplete;
      if (request !== loadRequest || animation.hidden || clip.value !== name) return;
      viewer.currentTime = 0;
      timeline.max = String(viewer.duration);
      play.disabled = timeline.disabled = viewer.duration <= 0;
      syncPlayback();
    }

    async function openModel(file) {
      if (!file) return;
      if (!/\.glb$/i.test(file.name)) {
        status.textContent = 'Choose a .glb file.';
        return;
      }
      const request = ++loadRequest;
      hidePlayback();
      reset.disabled = true;
      setStatus('Loading ' + file.name + '…');
      try {
        viewerLibrary ??= import('https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer.min.js');
        await viewerLibrary;
      } catch {
        viewerLibrary = undefined;
        if (request === loadRequest) setStatus('Viewer unavailable. Check the connection or open the four-view PNG.');
        return;
      }
      if (request !== loadRequest) return;
      const previousUrl = modelUrl;
      modelUrl = URL.createObjectURL(file);
      fileName = file.name;
      viewer.src = modelUrl;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    }

    document.querySelector('#open').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      openModel(fileInput.files[0]);
      fileInput.value = '';
    });

    stage.addEventListener('dragover', event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      stage.toggleAttribute('data-dragging', true);
    });
    stage.addEventListener('dragleave', event => {
      if (!(event.relatedTarget instanceof Node) || !stage.contains(event.relatedTarget)) stage.removeAttribute('data-dragging');
    });
    stage.addEventListener('drop', event => {
      event.preventDefault();
      stage.removeAttribute('data-dragging');
      openModel(event.dataTransfer.files[0]);
    });

    viewer.addEventListener('load', () => {
      reset.disabled = false;
      setStatus(fileName + ' · Drag to orbit. Right-drag or two-finger drag to pan. Scroll or pinch to zoom.', false);
      const names = viewer.availableAnimations;
      clip.replaceChildren(...names.map(name => new Option(name, name)));
      animation.hidden = !names.length;
      if (names.length) selectClip();
    });
    viewer.addEventListener('error', () => {
      hidePlayback();
      reset.disabled = true;
      setStatus('Could not display ' + fileName + '. Try another GLB or open the four-view PNG.');
    });
    reset.addEventListener('click', () => {
      viewer.cameraOrbit = initialOrbit;
      viewer.cameraTarget = 'auto auto auto';
      viewer.fieldOfView = 'auto';
      viewer.jumpCameraToGoal();
    });
    clip.addEventListener('change', selectClip);
    play.addEventListener('click', () => {
      if (viewer.paused) {
        if (viewer.currentTime >= viewer.duration * lastFrameRatio) viewer.currentTime = 0;
        viewer.play();
      } else {
        viewer.pause();
      }
    });
    timeline.addEventListener('input', () => {
      const position = Number(timeline.value);
      viewer.currentTime = Math.min(position, viewer.duration * lastFrameRatio);
      syncPlayback();
    });
    for (const event of ['play', 'pause', 'finished']) viewer.addEventListener(event, syncPlayback);
  </script>
</body>
</html>
~~~
