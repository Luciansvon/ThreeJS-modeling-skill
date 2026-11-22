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
