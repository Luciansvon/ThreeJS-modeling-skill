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
