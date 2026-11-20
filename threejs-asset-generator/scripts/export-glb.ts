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
