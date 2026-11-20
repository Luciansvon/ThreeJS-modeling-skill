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
