// npx tsx tools/validate-skills.ts [skill-dir | dir-of-skills ...] [--max-tokens 5000] [--max-lines 500] [--max-desc 400]
// Default target: the skill folder that contains this tools/ folder.
// Checks: frontmatter (name = folder name, description <= 400 chars, no ': '), SKILL.md token budget and line count,
// relative links, mentioned files exist, `Contents:` in every reference, no orphan references.
// Tokens are estimated as bytes / 4, the same rough count as HANDOFF.md.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit, type Gate } from '../scripts/result';

export type Issue = { level: 'error' | 'warn'; check: string; file: string; msg: string };
export type Limits = { maxTokens: number; maxLines: number; maxDesc: number };
export const DEFAULT_LIMITS: Limits = { maxTokens: 5000, maxLines: 500, maxDesc: 400 };
export const tokensOf = (text: string) => Math.ceil(Buffer.byteLength(text, 'utf8') / 4);

const KNOWN_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const PREFIXES = ['references/', 'src/', 'scripts/', 'tools/'];
// Files the skill tells the agent to CREATE in the user's project, so they are not expected inside the skill folder.
const GENERATED = /^(ref(-spec)?\.(json|md|png)|ref_.*|ref-.*-mask\.png|diff-.*\.png|tris\.json|package\.json|tsconfig\.json|SKILL\.md|AGENTS\.md|CLAUDE\.md|README\.md|HANDOFF\.md)$/;

export function parseFrontmatter(text: string): { fm: Record<string, string>; problems: string[]; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return null;
  const fm: Record<string, string> = {}, problems: string[] = [];
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) { problems.push('multi-line value: keep each frontmatter value on one line'); continue; }
    const km = /^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!km) { problems.push(`unparseable frontmatter line: ${line.slice(0, 40)}`); continue; }
    let v = (km[2] ?? '').trim();
    if (/^[>|][+-]?$/.test(v)) { problems.push(`${km[1]}: block scalars (${v}) are not supported, use one line`); v = ''; }
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) v = v.slice(1, -1);
    fm[km[1]] = v;
  }
  return { fm, problems, body: text.slice(m[0].length) };
}

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

const stripFences = (t: string) => t.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (b) => b.replace(/[^\n]/g, ' '));
const fencedBlocks = (t: string) => [...t.matchAll(/^(?:```|~~~)[^\n]*\n([\s\S]*?)^(?:```|~~~)[ \t]*$/gm)].map((m) => m[1]);

/** Collects the file mentions of one markdown file: markdown links, inline-code paths, and relative imports inside code fences. */
export function mentions(md: string) {
  const prose = stripFences(md);
  const links: string[] = [], paths: string[] = [], bare: string[] = [], imports: string[] = [];
  for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const t = m[1];
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t)) continue;           // http:, mailto:, #anchor
    links.push(t.split('#')[0]);
  }
  for (const m of prose.matchAll(/`([^`\n]+)`/g)) {
    for (let w of m[1].split(/\s+/)) {
      w = w.replace(/^["'(]+|["'),.;:]+$/g, '');
      if (!w || /[<>*{}$…=]|^--?\w/.test(w) || /^(~|\/|[a-z]+:\/\/)/.test(w)) continue;
      const isPrefixed = PREFIXES.some((p) => w.startsWith(p));
      if (isPrefixed) { if (w !== 'src/' && !/^[\w./-]+$/.test(w)) continue; paths.push(w); }
      else if (/^[\w.-]+\.(ts|md)$/.test(w)) bare.push(w);
    }
  }
  // Imports of the user's own project are exempt: a line that says "project-specific", or a bundler query such as ?raw.
  for (const code of fencedBlocks(md)) for (const line of code.split('\n')) {
    if (/project-specific/i.test(line)) continue;
    for (const m of line.matchAll(/from\s+['"](\.{1,2}\/[^'"?]+)['"]/g)) imports.push(m[1]);
  }
  return { links, paths, bare, imports };
}

export function validateSkill(dir: string, limits: Limits = DEFAULT_LIMITS) {
  const issues: Issue[] = [], root = resolve(dir), folder = basename(root);
  const add = (level: Issue['level'], check: string, file: string, msg: string) => issues.push({ level, check, file: relative(root, file) || '.', msg });
  const skillFile = join(root, 'SKILL.md');
  if (!existsSync(skillFile)) { add('error', 'skill-file', root, 'SKILL.md not found'); return { name: folder, issues, metrics: {} as Record<string, number> }; }
  const text = readFileSync(skillFile, 'utf8'), fmr = parseFrontmatter(text);
  const metrics: Record<string, number> = { skillTokens: tokensOf(text), skillLines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0), descChars: 0 };

  // 1. frontmatter
  if (!fmr) add('error', 'frontmatter', skillFile, 'no frontmatter block (--- ... ---) at the top');
  else {
    const { fm, problems } = fmr;
    for (const p of problems) add('error', 'frontmatter', skillFile, p);
    for (const k of Object.keys(fm)) if (!KNOWN_KEYS.has(k)) add('warn', 'frontmatter', skillFile, `unknown key "${k}"`);
    const name = fm.name ?? '', desc = fm.description ?? '';
    if (!name) add('error', 'name', skillFile, 'missing name');
    else {
      if (name !== folder) add('error', 'name', skillFile, `name "${name}" must equal the folder name "${folder}"`);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) add('error', 'name', skillFile, 'name must be lowercase letters, digits and single hyphens, max 64 chars');
      if (/anthropic|claude/.test(name)) add('error', 'name', skillFile, 'name must not contain "anthropic" or "claude"');
    }
    metrics.descChars = desc.length;
    if (!desc.trim()) add('error', 'description', skillFile, 'missing or empty description');
    if (desc.length > limits.maxDesc) add('error', 'description', skillFile, `description is ${desc.length} chars, max ${limits.maxDesc}`);
    if (desc.includes(': ')) add('error', 'description', skillFile, 'description contains ": " (breaks simple YAML parsers); use a dash, comma or sentence break');
    if (/<\/?[a-z][^>]*>/i.test(desc)) add('error', 'description', skillFile, 'description must not contain XML or HTML tags');
  }

  // 2. budget
  if (metrics.skillTokens > limits.maxTokens) add('error', 'budget', skillFile, `SKILL.md is about ${metrics.skillTokens} tokens, budget ${limits.maxTokens}`);
  if (metrics.skillLines > limits.maxLines) add('error', 'budget', skillFile, `SKILL.md has ${metrics.skillLines} lines, max ${limits.maxLines}`);

  // 3. references: Contents line, links, mentions
  const mdFiles = walk(root).filter((f) => f.endsWith('.md') && !/(^|[\\/])HANDOFF\.md$/.test(f));
  const refDir = join(root, 'references'), refs = mdFiles.filter((f) => dirname(f) === refDir).sort();
  metrics.references = refs.length;
  for (const r of refs) {
    const head = readFileSync(r, 'utf8').split('\n').slice(0, 15);
    if (!head.some((l) => /^Contents:\s*\S/.test(l))) add('error', 'contents', r, 'no "Contents:" line in the first 15 lines');
  }
  const exists = (p: string) => existsSync(p);
  const mentioned = new Set<string>();
  const bareCandidates = (name: string, from: string) => [join(dirname(from), name), ...['', 'references', 'src', 'scripts', 'tools'].map((d) => join(root, d, name))];
  for (const f of mdFiles) {
    const md = readFileSync(f, 'utf8'), m = mentions(md);
    for (const l of m.links) { const t = resolve(dirname(f), l); if (l && !exists(t)) add('error', 'link', f, `broken link: ${l}`); else if (l) mentioned.add(t); }
    for (const p of m.paths) { const t = resolve(root, p); if (!exists(t)) add('error', 'mention', f, `mentioned file does not exist: ${p}`); else mentioned.add(t); }
    for (const b of m.bare) {
      const hit = bareCandidates(b, f).find(exists);
      if (hit) mentioned.add(resolve(hit)); else if (!GENERATED.test(b)) add('warn', 'mention', f, `bare file name not found anywhere in the skill: ${b}`);
    }
    for (const i of m.imports) {
      const base = resolve(join(root, 'src'), i);
      if (!['', '.ts', '/index.ts'].some((e) => exists(base + e) && statSync(base + e).isFile())) add('warn', 'code-import', f, `code example imports ${i}, which does not exist under src/`);
    }
  }

  // 4. orphans: every reference must be reachable from SKILL.md; every non-test src file should be mentioned somewhere
  const fromSkill = new Set<string>(), sm = mentions(text);
  for (const p of [...sm.paths, ...sm.links]) fromSkill.add(resolve(root, p));
  for (const l of sm.links) fromSkill.add(resolve(root, l));
  for (const r of refs) if (!fromSkill.has(r)) add('error', 'orphan', r, 'reference is not linked from SKILL.md (agents will never find it)');
  const srcDir = join(root, 'src');
  if (exists(srcDir)) for (const f of walk(srcDir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
    const base = basename(f), allText = mdFiles.map((x) => readFileSync(x, 'utf8')).join('\n');
    if (!mentioned.has(f) && !allText.includes(base) && !allText.includes(base.replace(/\.ts$/, ''))) add('warn', 'orphan', f, 'source file is not mentioned in any markdown file');
  }
  return { name: fm_name(fmr, folder), issues, metrics };
}
const fm_name = (fmr: ReturnType<typeof parseFrontmatter>, folder: string) => fmr?.fm.name || folder;

/** A dir with SKILL.md is a skill; otherwise every child dir with SKILL.md is. */
export function findSkills(p: string): string[] {
  const r = resolve(p);
  if (existsSync(join(r, 'SKILL.md'))) return [r];
  return existsSync(r) && statSync(r).isDirectory() ? readdirSync(r, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(r, e.name, 'SKILL.md'))).map((e) => join(r, e.name)).sort() : [];
}

export function main(argv: string[]): number {
  const limits = { ...DEFAULT_LIMITS }, targets: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], num = () => Number(argv[++i]);
    if (a === '--max-tokens') limits.maxTokens = num(); else if (a === '--max-lines') limits.maxLines = num(); else if (a === '--max-desc') limits.maxDesc = num();
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); return 1; } else targets.push(a);
  }
  if (Object.values(limits).some((v) => !Number.isFinite(v))) { console.error('limit options need a number'); return 1; }
  const dirs = (targets.length ? targets : [join(dirname(fileURLToPath(import.meta.url)), '..')]).flatMap(findSkills);
  if (!dirs.length) { console.error('no skill folder (a directory with SKILL.md) found'); return 1; }
  const gates: Gate[] = [], all: Issue[] = [], skills: unknown[] = [];
  for (const d of dirs) {
    const { name, issues, metrics } = validateSkill(d, limits);
    all.push(...issues); skills.push({ name, ...metrics });
    for (const i of issues) console.log(`${i.level === 'error' ? 'ERROR' : 'WARN '} [${i.check}] ${i.file}: ${i.msg}`);
    const errors = issues.filter((i) => i.level === 'error').length, warns = issues.length - errors;
    console.log(`${errors ? 'FAIL' : 'PASS'} ${name}: ${metrics.skillLines ?? '?'} lines, ~${metrics.skillTokens ?? '?'} tokens, description ${metrics.descChars ?? '?'} chars, ${metrics.references ?? 0} references, ${errors} error(s), ${warns} warning(s)`);
    gates.push({ gate: `validate ${name}`, value: `${errors} error(s), ${warns} warning(s)`, pass: errors === 0, hint: errors ? issues.find((i) => i.level === 'error')!.msg : '' });
  }
  const errors = all.filter((i) => i.level === 'error').length;
  return emit({ tool: 'validate-skills', ok: errors === 0, gates, errors, warnings: all.length - errors, skills, issues: all });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
