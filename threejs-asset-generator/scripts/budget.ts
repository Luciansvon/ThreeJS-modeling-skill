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
