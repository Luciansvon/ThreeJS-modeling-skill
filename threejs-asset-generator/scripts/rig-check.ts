// scripts/rig-check.ts: CLI validator for rigged character/creature/vehicle metadata or direct (params, THREE) asset modules (R1 to R7).
//   npx tsx scripts/rig-check.ts (--meta char_metadata.json | --module ./asset.ts [--export name] [--params json]) [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--static-clips a,b] [--allow-refpose]
// Prints gate table; last stdout line is @@RESULT {json}. Exit 0 = ok, 2 = gate failed, 1 = usage/load error.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractModuleMeta, selectBuilder } from './asset-builder';
import { DEFAULT_MAX_PIVOTS, rigGates, type RigKind, type RigMeta } from './rigcheck';
import { emit, registerThreeHook, type Gate } from './result';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes('--' + k);
const fail = (msg: string): never => { console.error(msg); process.exit(emit({ tool: 'rig-check', ok: false, error: msg }, 1)); };
const fmtGates = (g: Gate[]) => g.map((x) => `${x.pass ? 'PASS' : 'FAIL'}  ${x.gate}: ${x.value}${x.pass ? '' : '  -> ' + x.hint}`).join('\n');

const modFile = opt('module');
const metaFile = modFile ? undefined : (opt('meta') ?? args.find((a, idx) => !a.startsWith('--') && !(idx > 0 && args[idx - 1]?.startsWith('--'))));
if (!modFile === !metaFile || (modFile && opt('meta'))) {
  fail('usage: tsx scripts/rig-check.ts (--meta char_metadata.json | --module ./asset.ts [--export name] [--params json]) [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--static-clips a,b] [--allow-refpose]');
}
const kind = (opt('kind') ?? 'hero') as RigKind;
if (!(kind in DEFAULT_MAX_PIVOTS)) fail(`--kind must be one of ${Object.keys(DEFAULT_MAX_PIVOTS).join(', ')}, got "${kind}"`);
const motionMode = opt('motion') as 'in-place' | 'free' | undefined;
if (motionMode !== undefined && motionMode !== 'in-place' && motionMode !== 'free') fail('--motion must be in-place or free');
const maxPivots = opt('max-pivots') !== undefined ? Number(opt('max-pivots')) : undefined;
if (maxPivots !== undefined && (!Number.isFinite(maxPivots) || maxPivots <= 0)) fail('--max-pivots needs a positive number');
const staticClips = (opt('static-clips') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
let params: Record<string, unknown> = {};
try { if (opt('params')) params = JSON.parse(opt('params')!); } catch (e) { fail(`--params is not valid JSON: ${(e as Error).message}`); }

let meta: RigMeta;
if (modFile) {
  let threeMod: typeof import('three');
  try {
    threeMod = await import('three');
  } catch (e) {
    fail(`--module requires \`three\`: ${(e as Error).message}`);
  }
  const hooks = registerThreeHook();
  try {
    const mod = (await import(pathToFileURL(resolve(modFile)).href)) as Record<string, unknown>;
    const { build } = selectBuilder(mod, opt('export'), modFile);
    const built = await build({ ...params }, threeMod!);
    meta = extractModuleMeta(built, threeMod!, motionMode).rigMetadata;
  } catch (e) {
    fail(`cannot build or inspect ${modFile}: ${(e as Error).message}`);
  } finally {
    hooks?.deregister();
  }
} else {
  try { meta = JSON.parse(readFileSync(resolve(metaFile!), 'utf8')); } catch (e) { fail(`cannot read ${metaFile}: ${(e as Error).message}`); }
}

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
