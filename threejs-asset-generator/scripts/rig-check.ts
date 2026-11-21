// scripts/rig-check.ts: CLI validator for rigged character/creature/vehicle metadata, clip contracts, track sanity, expression mappings & clearance (R1 to R6).
//   npx tsx scripts/rig-check.ts --meta char_metadata.json [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--allow-refpose]
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
if (!metaFile) fail('usage: tsx scripts/rig-check.ts --meta char_metadata.json [--kind hero|creature|vehicle|building|prop] [--max-pivots N] [--motion in-place|free] [--allow-refpose]');
const kind = (opt('kind') ?? 'hero') as RigKind;
if (!(kind in DEFAULT_MAX_PIVOTS)) fail(`--kind must be one of ${Object.keys(DEFAULT_MAX_PIVOTS).join(', ')}, got "${kind}"`);
const motionMode = opt('motion') as 'in-place' | 'free' | undefined;
if (motionMode !== undefined && motionMode !== 'in-place' && motionMode !== 'free') fail('--motion must be in-place or free');
const maxPivots = opt('max-pivots') !== undefined ? Number(opt('max-pivots')) : undefined;
if (maxPivots !== undefined && (!Number.isFinite(maxPivots) || maxPivots <= 0)) fail('--max-pivots needs a positive number');

let meta: RigMeta;
try { meta = JSON.parse(readFileSync(resolve(metaFile), 'utf8')); } catch (e) { fail(`cannot read ${metaFile}: ${(e as Error).message}`); }

const { gates, skipped, stats } = rigGates(meta!, {
  kind,
  motionMode,
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
