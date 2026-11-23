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
