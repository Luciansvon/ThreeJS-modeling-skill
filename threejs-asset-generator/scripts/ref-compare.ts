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
