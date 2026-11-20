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
import { loadSharp } from './sharp';
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
  const sharp = await loadSharp();
  if (!sharp) unverified.push('review.png (the `sharp` package is missing: npm i sharp)');
  else { mkdirSync(out, { recursive: true }); review = join(out, 'review.png'); await sharp(sheet.rgba, { raw: { width: sheet.width, height: sheet.height, channels: 4 } }).png().toFile(review); }
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
