# Tool and fixture source

Contents: package.json · scripts/budget.ts · scripts/export-glb.ts · scripts/fixtures/crate.qa.ts · scripts/fixtures/dragon.qa.ts · scripts/glb.ts · scripts/mesh-stats.ts · scripts/package.json · scripts/png.ts · scripts/qa-asset.ts · scripts/qacheck.ts · scripts/ref-compare.ts · scripts/ref-intake.ts · scripts/refcheck.ts · scripts/result.ts · scripts/review.ts · scripts/rig-check.ts · scripts/rigcheck.ts · scripts/sharp.ts · tools/check.ts · tools/package.json · tools/run-tests.ts · tools/trigger-check.ts · tools/validate-skills.ts · assets/fast-preview.html

Generated from the canonical harness files. Search by original file path and use the [web runtime guide](runtime.md) to choose which commands or helpers to use in this session.

## package.json

~~~json source-excerpt
{
  "name": "threejs-asset-generator",
  "version": "4.1.0",
  "private": true,
  "type": "module",
  "description": "Procedural low-poly Three.js asset generator skill, QA gates, LOD budgets, reference matching, rig checks and GLB exporter.",
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
    "rig-check": "tsx scripts/rig-check.ts",
    "ref-intake": "tsx scripts/ref-intake.ts",
    "ref-compare": "tsx scripts/ref-compare.ts"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "three": "^0.180.0"
  },
  "optionalDependencies": {
    "sharp": "^0.33.5"
  }
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
export type Kind = 'prop' | 'hero';
type Range = { target: number; max: number };
export type Profile = { tris: Record<Kind, Range>; materials: Range; texture: number; bones: Range; drawCalls?: number; glbMiB?: Partial<Record<Kind, Range>> };

export const PROFILES: Record<Platform, Profile> = {
  mobile: { tris: { hero: { target: 5000, max: 15000 }, prop: { target: 300, max: 3000 } }, materials: { target: 1, max: 2 }, texture: 1024, bones: { target: 75, max: 75 }, drawCalls: 50, glbMiB: { hero: { target: 2, max: 5 } } },
  web: { tris: { hero: { target: 10000, max: 30000 }, prop: { target: 1000, max: 10000 } }, materials: { target: 1, max: 2 }, texture: 2048, bones: { target: 100, max: 100 }, drawCalls: 100, glbMiB: { hero: { target: 2, max: 5 } } },
  vr: { tris: { hero: { target: 10000, max: 40000 }, prop: { target: 1000, max: 10000 } }, materials: { target: 1, max: 3 }, texture: 2048, bones: { target: 100, max: 100 } },
  desktop: { tris: { hero: { target: 50000, max: 150000 }, prop: { target: 5000, max: 50000 } }, materials: { target: 2, max: 6 }, texture: 4096, bones: { target: 150, max: 300 } },
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
export type BudgetOptions = { platform?: Platform; kind?: Kind; glbBytes?: number };

/** Budget gates for one asset. `skipped` lists what could not be checked and why. */
export function budgetGates(s: Stats, o: BudgetOptions = {}): { gates: Gate[]; skipped: string[] } {
  const platform = o.platform ?? 'web', kind = o.kind ?? 'prop', P = PROFILES[platform], gates: Gate[] = [], skipped: string[] = [];
  const range = (id: string, label: string, v: number, r: Range, hint: string, unit = '') => {
    const pass = v <= r.max;
    gates.push({ gate: id, value: `${label} ${fmt(v)}${unit} of max ${fmt(r.max)}${unit} (${platform}${id === 'B1 triangles' ? `, ${kind}` : ''}, target ${fmt(r.target)})${pass && v > r.target ? ', above the target' : ''}`, pass, hint });
  };
  range('B1 triangles', `${s.triangles} triangles`, s.triangles, P.tris[kind], 'lower `detail`, fewer segments, drop small details (references/budget.md)');
  if (s.materials === null) skipped.push('B2 materials (no --meta with a material per part)'); else range('B2 materials', `${s.materials} material(s)`, s.materials, P.materials, 'merge parts that share a look into one material');
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
    if (bad.length) gates.push({ gate: `L0 QA at detail ${detail}`, value: bad.map((g) => `${g.gate}: ${g.value}`).join('; '), pass: false, hint: 'every level is a full asset: it must pass Q1 to Q5 (and Q7 if asked) like the top level' });
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

## scripts/export-glb.ts

~~~typescript source-excerpt
// scripts/export-glb.ts: write a GLB from a pure kernel or a tris.json, then read it back and check it (E1 to E6, references/glb-export.md).
//   Kernel (no THREE):   npx tsx scripts/export-glb.ts --module ./myKernel.ts --export buildMyTris [--params '{"seed":3}'] [--out asset.glb]
//   Any asset via tris:  npx tsx scripts/export-glb.ts --tris tris.json [--out asset.glb]
// Options: --open a,b | all (sheets, passed to the QA gate)  --budget N  --skip-qa (export even if Q1 to Q5 fail; the result says so)  --color r,g,b (0..1, default 0.8,0.8,0.8)
// Before writing it runs the QA gates Q1 to Q5 on the same parts (a GLB of an inside-out or non-finite asset is worse than no file). Q6 to Q10 stay in qa-asset.ts.
// No THREE needed. Last stdout line is the @@RESULT JSON. Exit 0 = ok, 2 = a gate failed, 1 = usage or load error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeParts, qaGates, type Parts } from './qacheck';
import { partsToGlb, glbGates } from './glb';
import { emit, type Gate } from './result';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; }, flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'export-glb', ok: false, error: msg }, 1)); };
const modFile = opt('module'), trisFile = opt('tris'), outFile = resolve(opt('out') ?? 'asset.glb');
if (!modFile === !trisFile) fail('usage: tsx scripts/export-glb.ts (--module file.ts [--export name] [--params json] | --tris tris.json) [--out asset.glb] [--open a,b|all] [--budget N] [--skip-qa] [--color r,g,b]');

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
const qa = qaGates(parts!, { budget: Number(opt('budget')) || undefined, open: opt('open')?.split(',').map((s) => s.trim()).filter(Boolean), grounding: false });
const qaFail = qa.gates.filter((g) => !g.pass);
gates.push({ gate: 'QA Q1 to Q5', value: qaFail.length ? qaFail.map((g) => `${g.gate}: ${g.value}`).join('; ') : 'Q1 to Q5 pass', pass: qaFail.length === 0 || flag('skip-qa'), hint: qaFail.length ? 'run qa-asset.ts and fix the first failing gate, or pass --skip-qa knowingly' : '' });
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
if (bytes) console.log(`\nwrote ${outFile} (${bytes.length} bytes, ${Object.keys(parts!).length} part(s), ${qa.stats.triangles ?? '?'} triangles)`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} gate(s) failing. Fix the FIRST one, run again.` : '\nAll export gates pass. Repeat the UNVERIFIED list in the answer.');
process.exit(emit({ tool: 'export-glb', ok: failed.length === 0, gates, unverified, file: bytes ? outFile : null, bytes: bytes?.length ?? 0 }));
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
// scripts/mesh-stats.ts: budget report for one asset (references/budget.md). Triangles, GPU vertices, meshes, draw calls, materials, textures, bones, GLB size, against a platform profile.
//   Kernel (no THREE):   npx tsx scripts/mesh-stats.ts --module ./myKernel.ts --export buildMyTris [--params '{"seed":3}'] [--profile web] [--kind prop]
//   Any asset via tris:  npx tsx scripts/mesh-stats.ts --tris tris.json --meta meta.json --glb asset.glb --profile mobile --kind hero
//   LOD check:           npx tsx scripts/mesh-stats.ts --module ./myKernel.ts --lods [--open a,b] [--symmetric]    (builds detail 2, 1, 0; the builder must accept `detail`)
// Options: --profile mobile|web|vr|desktop (default web)  --kind prop|hero (default prop)  --meta meta.json  --glb file.glb  --open a,b|all  --symmetric  --lods
// meta.json (all optional): { "parts": { "body": { "material": "wood", "bone": "root" } }, "textures": [1024, { "name": "atlas", "width": 2048 }], "bones": 12 }
// What meta does not give is reported as "not checked", never guessed. Last stdout line is the @@RESULT JSON. Exit 0 = ok, 2 = a gate failed, 1 = usage or load error.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeParts, type Parts } from './qacheck';
import { assetStats, budgetGates, lodGates, PROFILES, type Kind, type Meta, type Platform } from './budget';
import { emit } from './result';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; }, flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'mesh-stats', ok: false, error: msg }, 1)); };
const modFile = opt('module'), trisFile = opt('tris'), platform = (opt('profile') ?? 'web') as Platform, kind = (opt('kind') ?? 'prop') as Kind;
if (!modFile === !trisFile) fail('usage: tsx scripts/mesh-stats.ts (--module file.ts [--export name] [--params json] [--lods] | --tris tris.json) [--profile mobile|web|vr|desktop] [--kind prop|hero] [--meta meta.json] [--glb file.glb] [--open a,b|all] [--symmetric]');
if (!(platform in PROFILES)) fail(`--profile must be one of ${Object.keys(PROFILES).join(', ')}, got "${platform}"`);
if (kind !== 'prop' && kind !== 'hero') fail(`--kind must be prop or hero, got "${kind}"`);
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

const stats = assetStats(parts!, meta), { gates, skipped } = budgetGates(stats, { platform, kind, glbBytes }), unverified: string[] = [];
let levels: unknown = null;
if (flag('lods')) { const l = await lodGates(build!, normalizeParts, params, { open, symmetric: flag('symmetric') }); gates.push(...l.gates); levels = l.levels; }
else if (modFile) skipped.push('L1 to L4 LOD (pass --lods; the builder must accept `detail`)');
if (!stats.drawCallsExact) unverified.push('draw calls are an upper bound (one per part); pass --meta with a material and bone per part for the real number');
unverified.push('triangle, vertex and texture numbers are counted from the arrays and sizes given, not measured in a renderer: no frame time, fill rate or real GPU memory');

console.log(gates.map((g) => `${g.pass ? 'PASS' : 'FAIL'}  ${g.gate}: ${g.value}${g.pass ? '' : '  -> ' + g.hint}`).join('\n'));
console.log(`\nstats: ${JSON.stringify(stats)}`);
if (skipped.length) console.log(`not checked: ${skipped.join('; ')}`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} gate(s) failing. Fix the FIRST one, run again.` : '\nWithin budget. Repeat `not checked` and UNVERIFIED in the answer.');
process.exit(emit({ tool: 'mesh-stats', ok: failed.length === 0, gates, stats, skipped, unverified, platform, kind, levels }));
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
// Options: --budget 2000  --open wingL,wingR | all  --symmetric  --footprint  --grounded  --ground-y 0  --out dir (default .)  --no-render
// Q6 grounding: on for --tris (the final asset). Off for --module (a raw kernel is grounded later by groundAsset) unless --grounded or --footprint.
// --module needs a function (params) => Tris | { tris } | { part: Tris, ... }; it is built several times, which enables Q8 determinism and Q9 seed 0.
// --tris reads { tris } | { part: Tris } | Tris from a file; Q8 and Q9 cannot run there and are reported as UNVERIFIED.
// Writes review.png (2 x 2: front | side / top | 3/4): LOOK at it. Prints the gate table; last stdout line is the @@RESULT JSON. Exit 0 = ok, 2 = a gate failed, 1 = usage or load error.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writePngRgba } from './png';
import { normalizeParts, qaGates, determinismGates, type Gate, type Parts, type QAOptions } from './qacheck';
import { renderSheet, WRONG_TOL } from './review';
import { emit } from './result';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; }, flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'qa-asset', ok: false, error: msg }, 1)); };
const fmtGates = (g: Gate[]) => g.map((x) => `${x.pass ? 'PASS' : 'FAIL'}  ${x.gate}: ${x.value}${x.pass ? '' : '  -> ' + x.hint}`).join('\n');

const num = (k: string) => { const v = opt(k); if (v === undefined) return undefined; const n = Number(v); if (!Number.isFinite(n)) fail(`--${k} needs a number, got "${v}"`); return n; };
const o: QAOptions = { budget: num('budget'), groundY: num('ground-y'), open: opt('open')?.split(',').map((s) => s.trim()).filter(Boolean), symmetric: flag('symmetric'), footprint: flag('footprint') };
const out = resolve(opt('out') ?? '.'), modFile = opt('module'), trisFile = opt('tris');
o.grounding = !modFile || flag('grounded') || flag('footprint');   // Q6 needs the final grounded asset: always for --tris, only on request for a raw kernel
if (!modFile === !trisFile) fail('usage: tsx scripts/qa-asset.ts (--module file.ts [--export name] [--params json] | --tris tris.json) [--budget N] [--open a,b|all] [--symmetric] [--footprint] [--grounded] [--ground-y N] [--out dir] [--no-render]');

let parts: Parts, build: ((p: Record<string, unknown>) => unknown) | undefined, params: Record<string, unknown> = {};
try { if (opt('params')) params = JSON.parse(opt('params')!); } catch (e) { fail(`--params is not valid JSON: ${(e as Error).message}`); }
try {
  if (modFile) {
    const mod = (await import(pathToFileURL(resolve(modFile)).href)) as Record<string, unknown>, fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
    const name = opt('export') ?? (fns.length === 1 ? fns[0] : mod.default ? 'default' : undefined);
    if (!name || typeof mod[name] !== 'function') fail(`pick the builder with --export <name>. Functions exported by ${modFile}: ${fns.join(', ') || 'none'}`);
    build = mod[name!] as (p: Record<string, unknown>) => unknown;
    parts = normalizeParts(await build({ ...params }));
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
console.log(failed.length ? `\n${failed.length} gate(s) failing. Fix the FIRST failing gate, rebuild, run again.` : review ? `\nAll gates pass. Now LOOK at ${review} (view tool) before reporting done; list anything listed under UNVERIFIED in the answer.` : '\nAll gates pass, but there is no review image: say so in the answer.');
process.exit(emit({ tool: 'qa-asset', ok: failed.length === 0, gates, stats, skipped, unverified, review, legend, wrongFacePixels: wrongTotal }));
~~~

## scripts/qacheck.ts

~~~typescript source-excerpt
// scripts/qacheck.ts: pure QA gates over triangle arrays (9 numbers per triangle, CCW seen from outside). No THREE, no DOM, no fs. Node-testable.
// A "build" is anything that returns Tris | { tris } | Record<string, Tris> (named parts). Parts let the winding and closed-mesh gates
// skip zero-thickness sheets (wings, flags) with `open`, while every closed part is still held to them.
// Gate ids: Q1 finite · Q2 degenerate · Q3 winding · Q4 closed · Q5 budget · Q6 grounding · Q7 symmetry (opt-in) · Q8 determinism · Q9 seed 0
// (Q10 visible faces comes from the rendered review image, see qa-asset.ts and review.ts.)
import type { Gate } from './result';
export type { Gate };
export type Tris = number[];
export type Parts = Record<string, Tris>;
export type QAOptions = {
  budget?: number;          // max triangles, default 2000 (a prop; use ~20000 for a composite plot, references/lifecycle.md §9)
  open?: string[];          // part names that are sheets (no volume); 'all' skips Q3 and Q4 for everything
  symmetric?: boolean;      // Q7: the vertex set must equal its mirror image through x = 0
  grounding?: boolean;      // run Q6, default true. A raw kernel is not grounded (groundAsset does that), so qa-asset turns it off for --module unless --grounded
  footprint?: boolean;      // Q6 also requires the footprint centred on x = z = 0 (use on the FINAL grounded asset, not on a raw kernel)
  groundY?: number;         // expected lowest Y, default 0 (a composite with a terrain slab defines Y = 0 as the slab top)
  weld?: number;            // vertex weld distance for Q4 and Q7, default 1e-4 (0.1 mm)
  maxDegenerate?: number;   // allowed degenerate triangles, default 0
};
export const DEFAULTS = { budget: 2000, weld: 1e-4, degenerate: 1e-9, groundTol: 1e-3, footprintTol: 0.02, symmetryTol: 0.01 };

const num = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number');
/** Accepts Tris, { tris }, or { name: Tris, ... } and returns named parts. Throws with a readable message on anything else. */
export function normalizeParts(out: unknown): Parts {
  if (num(out)) return { asset: out };
  if (out && typeof out === 'object') {
    const o = out as Record<string, unknown>;
    if (num(o.tris)) return { asset: o.tris };
    const parts: Parts = {};
    for (const [k, v] of Object.entries(o)) if (num(v)) parts[k] = v;
    if (Object.keys(parts).length) return parts;
  }
  throw new Error('builder must return number[] | { tris: number[] } | Record<string, number[]> (named triangle parts)');
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

/** Q1..Q7 over a built asset. `skipped` names the gates that a flag turned off, so the report can say so. */
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

  const budget = o.budget ?? DEFAULTS.budget;
  gates.push({ gate: 'Q5 budget', value: `${tris} of ${budget} triangles`, pass: tris <= budget, hint: 'lower segments/sides first, merge or drop small details; raise --budget only for a composite (about 20000)' });

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
// scripts/ref-compare.ts: your generator's triangles vs ref.json. Run after EVERY build step (it takes well under a second).
//   1. In your generator test/driver write the result:  fs.writeFileSync('tris.json', JSON.stringify({ tris, colors: ['#8a5a2b', ...] }))
//      tris = all triangles in asset space (kernel output, or groupToTris(root) from references/reference-matching.md), colors = hex colours you used.
//   2. npx tsx ref-compare.ts ref.json tris.json        -> prints PASS/FAIL per gate, writes diff-<view>.png (red = reference only, blue = model only)
import { readFileSync } from 'node:fs';
import { scaleNearestRgba, writePngRgba } from './png';
import { compareToRef, formatGates, RES, type RefData } from './refcheck';
import { emit } from './result';

const [refFile = 'ref.json', trisFile = 'tris.json'] = process.argv.slice(2);
let ref: RefData, model: { tris: number[]; colors?: string[] };
try { ref = JSON.parse(readFileSync(refFile, 'utf8')); model = JSON.parse(readFileSync(trisFile, 'utf8')); } catch (e) { console.error(`cannot read ${refFile} / ${trisFile}: ${(e as Error).message}`); process.exit(emit({ tool: 'ref-compare', ok: false, error: (e as Error).message }, 1)); }
const { gates, diffs } = compareToRef(model.tris, ref, model.colors ?? []);
console.log(formatGates(gates));
const written: string[] = [];
for (const [view, rgba] of Object.entries(diffs)) {
  const f = `diff-${view}.png`, up = scaleNearestRgba(rgba, RES, RES, 4);
  writePngRgba(f, up, RES * 4, RES * 4);
  written.push(f);
  console.log('wrote', f);
}
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} gate(s) failing. Fix the FIRST failing gate only, then run again.` : '\nAll numeric gates pass. Do the visual checklist (G4) next.');
process.exit(emit({ tool: 'ref-compare', ok: failed.length === 0, gates, failed: failed.length, diffs: written }));
~~~

## scripts/ref-intake.ts

~~~typescript source-excerpt
// scripts/ref-intake.ts: reference image(s) or a multi-view turnaround sheet -> ref.json (silhouette masks, aspect, palette). Run ONCE per reference.
//   Separate views:   npx tsx ref-intake.ts front=ref_front.png side=ref_side.png --out ref.json [--tol 40] [--w 1.2 --d 2.5] [--no-flood]
//   Multi-view sheet: npx tsx ref-intake.ts --sheet sheet.png --grid 3x2 --views front,back,top,bottom,side,34 --out ref.json [--tol 18]
// Reads standard 8-bit PNGs without external dependencies; uses `sharp` when installed (required for JPEG/WebP).
// Always writes ref-<view>-mask.png (pure Node PNG): LOOK at it once; if the silhouette is wrong, adjust --tol.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSharp } from './sharp';
import { decodePngRgba, writePngRgba } from './png';
import { maskFromRGBA, frameMask, dominantColors, maskToB64, splitGridSheet, fitRgba, type RefData, type View } from './refcheck';
import { emit } from './result';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes('--' + k);
const out = opt('out') ?? 'ref.json', tol = Number(opt('tol') ?? 40), flood = !flag('no-flood');
const sheetFile = opt('sheet'), gridStr = opt('grid') ?? '3x2', viewsStr = opt('views') ?? 'front,back,top,bottom,side,34';
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--no-flood'].includes(args[i - 1]))).map((a) => (a.includes('=') ? a.split('=') : ['front', a]) as [string, string]);

if (!sheetFile && !files.length) {
  const e = 'usage: tsx ref-intake.ts ([front=]img.png [side=img.png] [top=img.png] | --sheet sheet.png --grid 3x2 --views front,back,top,bottom,side,34) --out ref.json [--tol 40] [--no-flood]';
  console.error(e); process.exit(emit({ tool: 'ref-intake', ok: false, error: e }, 1));
}

const sharp = await loadSharp();
async function loadImageRgba(file: string, maxDim = 512): Promise<{ rgba: Uint8Array; w: number; h: number }> {
  if (sharp) {
    const { data, info } = await sharp(file).resize(maxDim, maxDim, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { rgba: new Uint8Array(data), w: info.width, h: info.height };
  }
  const decoded = decodePngRgba(readFileSync(file));
  if (!decoded) {
    const e = `cannot decode "${file}" without \`sharp\` (pure-Node reader supports 8-bit PNG only; install sharp via \`npm i sharp\` for JPEG/WebP).`;
    console.error(e); process.exit(emit({ tool: 'ref-intake', ok: false, error: e }, 1));
  }
  return fitRgba(decoded.rgba, decoded.width, decoded.height, maxDim);
}

const inputs: { view: View; rgba: Uint8Array; w: number; h: number }[] = [];
const VALID_VIEWS = new Set<string>(['front', 'side', 'top']);
if (sheetFile) {
  const gm = /^(\d+)x(\d+)$/i.exec(gridStr);
  if (!gm) { const e = `--grid must be COLSxROWS (e.g. 3x2), got "${gridStr}"`; console.error(e); process.exit(emit({ tool: 'ref-intake', ok: false, error: e }, 1)); }
  const cols = Number(gm[1]), rows = Number(gm[2]);
  const full = await loadImageRgba(sheetFile, Math.max(cols, rows) * 512);
  const tiles = splitGridSheet(full.rgba, full.w, full.h, cols, rows);
  const names = viewsStr.split(',').map((s) => s.trim().toLowerCase());
  names.forEach((v, idx) => {
    if (!VALID_VIEWS.has(v) || idx >= tiles.length) return;
    const tile = fitRgba(tiles[idx].rgba, tiles[idx].w, tiles[idx].h, 512);
    inputs.push({ view: v as View, ...tile });
  });
  if (!inputs.length) { const e = `--views "${viewsStr}" matched none of front, side, top in ${cols}x${rows} grid`; console.error(e); process.exit(emit({ tool: 'ref-intake', ok: false, error: e }, 1)); }
} else {
  for (const [view, file] of files) {
    const img = await loadImageRgba(file, 512);
    inputs.push({ view: view as View, ...img });
  }
}

const ref: RefData = { views: {}, palette: [] }, views: Record<string, { aspect: number; foreground: number }> = {}, warnings: string[] = [];
if (opt('w') || opt('d')) ref.proportions = { w: opt('w') ? Number(opt('w')) : undefined, d: opt('d') ? Number(opt('d')) : undefined };
for (const { view, rgba, w, h } of inputs) {
  const mask = maskFromRGBA(rgba, w, h, { tol, flood }), { mask: framed, aspect } = frameMask(mask);
  ref.views[view] = { w: framed.w, h: framed.h, data: maskToB64(framed), aspect };
  if (view === 'front' || !ref.palette.length) ref.palette = dominantColors(rgba, w, h, 6, mask);
  const png = new Uint8Array(framed.data.length * 4);
  framed.data.forEach((v, i) => png.set([v ? 40 : 255, v ? 40 : 255, v ? 40 : 255, 255], i * 4));
  writePngRgba(`ref-${view}-mask.png`, png, framed.w, framed.h);
  const fg = mask.data.reduce((a, b) => a + b, 0) / mask.data.length;
  views[view] = { aspect: +aspect.toFixed(3), foreground: +fg.toFixed(3) };
  if (fg < 0.03 || fg > 0.9) warnings.push(`${view}: foreground ${(fg * 100).toFixed(0)}%, check ref-${view}-mask.png and adjust --tol`);
  console.log(`${view}: aspect ${aspect.toFixed(2)} (w/h), foreground ${(fg * 100).toFixed(0)}% of the image${fg < 0.03 || fg > 0.9 ? '  <- suspicious, check ref-' + view + '-mask.png and adjust --tol' : ''}`);
}
console.log('palette:', ref.palette.map((c) => `${c.hex} ${(c.share * 100).toFixed(0)}%`).join('  '));
writeFileSync(out, JSON.stringify(ref)); console.log('wrote', out);
process.exit(emit({ tool: 'ref-intake', ok: true, out, views, palette: ref.palette, warnings }));
~~~

## scripts/refcheck.ts

~~~typescript source-excerpt
// scripts/refcheck.ts: pure reference-vs-result measurements. No THREE, no DOM, no image library. Node-testable.
// Views (creature/asset faces +Z, y up):  front = camera at +Z (u = x)  ·  side = camera at +X (u = -z, +Z faces LEFT)  ·  top = camera at +Y (u = x, v = -z, +Z faces DOWN)
export type View = 'front' | 'side' | 'top';
export type Mask = { w: number; h: number; data: Uint8Array };              // 1 = inside the shape
export type Tris = number[];                                                // 9 numbers per triangle
export const RES = 64;                                                      // masks are compared on a RES x RES grid

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
export function silhouette(t: Tris, view: View, res = RES) {
  const n = t.length / 3, U = new Float64Array(n), V = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = t[i * 3], y = t[i * 3 + 1], z = t[i * 3 + 2];
    if (view === 'front') { U[i] = x; V[i] = y; } else if (view === 'side') { U[i] = -z; V[i] = y; } else { U[i] = x; V[i] = -z; }
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

export type RefData = { views: Partial<Record<View, { w: number; h: number; data: string; aspect: number }>>; palette: { hex: string; share: number }[]; proportions?: { w?: number; d?: number } };
export const maskToB64 = (m: Mask) => Buffer.from(m.data).toString('base64');
export const maskFromB64 = (s: string, res = RES): Mask => ({ w: res, h: res, data: new Uint8Array(Buffer.from(s, 'base64')) });

export type Gate = { gate: string; value: string; pass: boolean; hint: string };
export const THRESH = { iou: 0.85, aspect: 0.08, prop: 0.1, palette: 60 };
/** Runs every gate that the reference data can answer, cheapest first. */
export function compareToRef(tris: Tris, ref: RefData, usedColors: string[] = [], th = THRESH) {
  const gates: Gate[] = [], diffs: Partial<Record<View, Uint8Array>> = {};
  const p = proportions(tris);
  if (ref.proportions?.w) { const e = Math.abs(p.w / ref.proportions.w - 1); gates.push({ gate: 'G1 width/height', value: `${p.w.toFixed(2)} vs ${ref.proportions.w.toFixed(2)} (${(e * 100).toFixed(0)}% off)`, pass: e <= th.prop, hint: p.w > ref.proportions.w ? 'too wide: narrow x or lengthen y' : 'too narrow: widen x or shorten y' }); }
  if (ref.proportions?.d) { const e = Math.abs(p.d / ref.proportions.d - 1); gates.push({ gate: 'G1 depth/height', value: `${p.d.toFixed(2)} vs ${ref.proportions.d.toFixed(2)} (${(e * 100).toFixed(0)}% off)`, pass: e <= th.prop, hint: p.d > ref.proportions.d ? 'too deep: shorten z' : 'too shallow: lengthen z' }); }
  for (const view of ['front', 'side', 'top'] as View[]) {
    const r = ref.views[view]; if (!r) continue;
    const { mask, aspect } = silhouette(tris, view), refMask = maskFromB64(r.data), best = bestIoU(mask, refMask, view), ae = Math.abs(aspect / r.aspect - 1);
    gates.push({ gate: `G2 ${view} aspect`, value: `${aspect.toFixed(2)} vs ${r.aspect.toFixed(2)} (${(ae * 100).toFixed(0)}% off)`, pass: ae <= th.aspect, hint: 'fix overall proportions before details' });
    gates.push({ gate: `G2 ${view} silhouette IoU`, value: `${best.iou.toFixed(2)}${best.flip !== 'none' ? ` (reference mirrored: ${best.flip})` : ''}`, pass: best.iou >= th.iou, hint: 'open the diff PNG: red = missing in model, blue = extra in model' });
    diffs[view] = diffRGBA(mask, best.ref);
  }
  if (usedColors.length && ref.palette.length) { const g = paletteGap(ref.palette, usedColors); gates.push({ gate: 'G3 palette', value: g.hex ? `${g.hex} nearest ${g.nearest}, distance ${g.gap.toFixed(0)}` : 'all main colours covered', pass: g.gap <= th.palette, hint: `retune the colour nearest to ${g.hex}` }); }
  return { gates, diffs };
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
// scripts/rig-check.ts: CLI validator for rigged character metadata, clip contracts, track sanity, expression mappings & slide clearance (R1 to R6).
//   npx tsx scripts/rig-check.ts --meta char_metadata.json [--max-pivots 16] [--allow-refpose]
// Prints gate table; last stdout line is @@RESULT {json}. Exit 0 = ok, 2 = gate failed, 1 = usage/load error.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rigGates, type RigMeta } from './rigcheck';
import { emit, type Gate } from './result';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'rig-check', ok: false, error: msg }, 1)); };
const fmtGates = (g: Gate[]) => g.map((x) => `${x.pass ? 'PASS' : 'FAIL'}  ${x.gate}: ${x.value}${x.pass ? '' : '  -> ' + x.hint}`).join('\n');

const metaFile = opt('meta') ?? args.find((a) => !a.startsWith('--'));
if (!metaFile) fail('usage: tsx scripts/rig-check.ts --meta char_metadata.json [--max-pivots 16] [--allow-refpose]');
const maxPivots = opt('max-pivots') !== undefined ? Number(opt('max-pivots')) : undefined;
if (maxPivots !== undefined && (!Number.isFinite(maxPivots) || maxPivots <= 0)) fail('--max-pivots needs a positive number');

let meta: RigMeta;
try { meta = JSON.parse(readFileSync(resolve(metaFile), 'utf8')); } catch (e) { fail(`cannot read ${metaFile}: ${(e as Error).message}`); }

const { gates, skipped, stats } = rigGates(meta!, {
  maxPivots,
  excludeClips: flag('allow-refpose') ? [] : ['RefPose'],
});
const unverified = ['Visual skinning/animation playback and engine-native import (e.g. Roblox Motor6D / Blender) are not tested by JSON checks'];

console.log(fmtGates(gates));
console.log(`\nstats: ${JSON.stringify(stats)}`);
if (skipped.length) console.log(`not checked: ${skipped.join('; ')}`);
console.log(`UNVERIFIED: ${unverified.join('; ')}`);
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} gate(s) failing. Fix the FIRST failing gate, re-export metadata, run again.`
  : skipped.length ? '\nAll evaluated rig & clip checks pass. See not checked for missing evidence.' : '\nAll rig & clip checks pass.');
process.exit(emit({ tool: 'rig-check', ok: failed.length === 0, gates, stats, skipped, unverified }));
~~~

## scripts/rigcheck.ts

~~~typescript source-excerpt
// scripts/rigcheck.ts: pure rig, clip, track, expression & slide-clearance gates (R1 to R6). No THREE, no fs.
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
    slideDropPct?: number;
    slideMinY?: number;
  };
};

export type RigCheckOptions = {
  maxPivots?: number;
  excludeClips?: string[];
  minSlideDropPct?: number;
  minSlideY?: number;
  maxHorizDrift?: number;
};

const isFinite3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export function rigGates(meta: RigMeta, o: RigCheckOptions = {}): { gates: Gate[]; skipped: string[]; stats: Record<string, unknown> } {
  const gates: Gate[] = [], skipped: string[] = [];
  const maxPivots = o.maxPivots ?? 16;
  const excluded = new Set(o.excludeClips ?? ['RefPose']);
  const minSlideDrop = o.minSlideDropPct ?? 22;
  const minSlideY = o.minSlideY ?? -0.025;
  const maxDrift = o.maxHorizDrift ?? 1e-5;

  const pivots = meta.rig?.pivotNames ?? [];
  const edges = meta.rig?.hierarchy ?? [];
  const pivotSet = new Set(pivots);

  // R1 hierarchy
  const hIssues: string[] = [];
  if (!pivots.length) hIssues.push('no pivotNames');
  if (pivotSet.size !== pivots.length) hIssues.push('duplicate pivot names');
  if (pivots.length > maxPivots) hIssues.push(`${pivots.length} pivots exceeds max ${maxPivots}`);
  const childrenOf = new Map<string, string[]>(), parentOf = new Map<string, string>();
  for (const { parent, child } of edges) {
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
        const target = tr.name.includes('.') ? tr.name.slice(0, tr.name.lastIndexOf('.')) : tr.name;
        if (pivotSet.size && !pivotSet.has(target)) tIssues.push(`${c.name}: unknown track target "${target}"`);
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
          const x0 = tr.values[0], z0 = tr.values[2];
          let d = 0;
          for (let i = 0; i + 2 < tr.values.length; i += 3) d = Math.max(d, Math.abs(tr.values[i] - x0), Math.abs(tr.values[i + 2] - z0));
          if (d > maxDrift) tIssues.push(`${c.name}: horizontal root drift ${d.toFixed(4)}m > ${maxDrift}m`);
        }
      }
    }
    if (hasDrift) {
      if (!Number.isFinite(suppliedDrift) || suppliedDrift < 0 || suppliedDrift > maxDrift) {
        tIssues.push(`maxHorizDrift ${suppliedDrift} must be between 0 and ${maxDrift}m`);
      }
    }
    if (!hasRootPosition && !hasDrift) skipped.push('R4 horizontal root drift (no root position track or qa.maxHorizDrift provided)');
    const checks = [];
    if (totalTracks) checks.push(`${totalTracks} track(s) checked for finite, ordered samples and matching value counts`);
    if (hasRootPosition) checks.push(`root track drift <= ${maxDrift}m`);
    if (hasDrift) checks.push(`supplied maxHorizDrift <= ${maxDrift}m`);
    gates.push({
      gate: 'R4 tracks & drift',
      value: tIssues.length ? tIssues.join('; ') : checks.join(', '),
      pass: tIssues.length === 0,
      hint: 'bake one value tuple per strictly increasing timestamp and keep root motion in-place (X/Z constant)',
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

  // R6 slide clearance
  const drop = meta.qa?.slideDropPct, minY = meta.qa?.slideMinY;
  const sIssues: string[] = [];
  if (drop !== undefined && (!Number.isFinite(drop) || drop < minSlideDrop)) sIssues.push(`slide drop ${drop}% must be finite and >= ${minSlideDrop}%`);
  if (minY !== undefined && (!Number.isFinite(minY) || minY < minSlideY)) sIssues.push(`slide minY ${minY}m must be finite and >= ${minSlideY}m`);
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
