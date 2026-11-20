// npx tsx tools.test.ts   Tests the tooling itself. Every checker needs a case where it must FAIL, or green means nothing.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKER, resultLine, parseResult, spawnTsx } from '../scripts/result';
import { parseFrontmatter, validateSkill, mentions, tokensOf, findSkills } from './validate-skills';
import { tokenize, stem, rank, pick } from './trigger-check';
import { missingThree } from './run-tests';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'tools-test-'));
const put = (root: string, rel: string, text: string) => { const p = join(root, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, text); };
const tsx = (file: string, args: string[], cwd = here) => spawnTsx(join(here, file), args, { cwd });

// ---- output contract
{
  const r = { tool: 'x', ok: false, gates: [{ gate: 'g', value: 'v', pass: false, hint: 'h\nwith newline' }] };
  const line = resultLine(r); assert.ok(line.startsWith(MARKER) && !line.includes('\n'), 'one line');
  assert.deepEqual(parseResult(`noise\n${resultLine({ tool: 'old', ok: true })}\nmore\n${line}\n`), r, 'last marker wins, newline in hint survives');
  assert.equal(parseResult('no marker here'), null); assert.equal(parseResult(`${MARKER}{not json`), null); assert.equal(parseResult(`${MARKER}{"tool":1,"ok":true}`), null);
}

// ---- frontmatter + token estimate
{
  const f = parseFrontmatter('---\nname: a-b\ndescription: "quoted text"\n---\nbody')!; assert.equal(f.fm.name, 'a-b'); assert.equal(f.fm.description, 'quoted text'); assert.equal(f.body, 'body');
  assert.equal(parseFrontmatter('no frontmatter'), null);
  assert.ok(parseFrontmatter('---\nname: a\ndescription: >\n  folded\n---\n')!.problems.length >= 1, 'block scalar rejected');
  assert.equal(tokensOf('abcdefgh'), 2); assert.equal(tokensOf('é'), 1);
}

// ---- mention extraction ignores code fences for inline paths, reads imports, skips placeholders and URLs
{
  const md = '[ok](references/a.md#x) [web](https://e.com/a.md) `src/real.ts` `src/<name>.test.ts` `src/*.ts` `~/.claude/skills`\n```ts\nimport x from \'./prng\';\nimport y from \'./mine\'; // project-specific\nconst s = `src/in-fence.ts`;\n```\n';
  const m = mentions(md);
  assert.deepEqual(m.links, ['references/a.md']); assert.deepEqual(m.paths, ['src/real.ts']); assert.deepEqual(m.imports, ['./prng']);
}

// ---- validate: a good skill passes, a broken one reports every problem
const GOOD_SKILL = '---\nname: good-skill\ndescription: Builds small things from seeds.\n---\n# Good\nSee `references/a.md` and [more](references/a.md). Code in `src/x.ts`.\n';
{
  const d = join(tmp(), 'good-skill');
  put(d, 'SKILL.md', GOOD_SKILL); put(d, 'references/a.md', '# A\n\nContents: one · two\n'); put(d, 'src/x.ts', 'export const x = 1;\n');
  const r = validateSkill(d); assert.deepEqual(r.issues, [], JSON.stringify(r.issues));
  assert.deepEqual(findSkills(join(d, '..')), [d], 'a directory of skills is expanded');
}
{
  const d = join(tmp(), 'folder-name');
  put(d, 'SKILL.md', `---\nname: other-name\ndescription: ${'x'.repeat(401)}: and a colon\n---\n${'line\n'.repeat(600)}[dead](references/missing.md) \`src/ghost.ts\` \`references/b.md\`\n`);
  put(d, 'references/a.md', '# A with no contents line\n'); put(d, 'references/b.md', '# B\nContents: b\n');
  const r = validateSkill(d, { maxTokens: 100, maxLines: 500, maxDesc: 400 }), has = (check: string, re: RegExp) => assert.ok(r.issues.some((i) => i.level === 'error' && i.check === check && re.test(i.msg)), `${check} ${re}: ${JSON.stringify(r.issues)}`);
  has('name', /must equal the folder name/); has('description', /is 4\d\d chars/); has('description', /": "/); has('budget', /tokens/); has('budget', /lines/);
  has('link', /references\/missing\.md/); has('mention', /src\/ghost\.ts/); has('contents', /Contents/); has('orphan', /not linked from SKILL\.md/);
  assert.ok(!r.issues.some((i) => i.check === 'orphan' && i.file.endsWith('b.md')), 'b.md is linked, so it is not an orphan');
  assert.ok(r.issues.filter((i) => i.file.endsWith('a.md')).every((i) => ['contents', 'orphan'].includes(i.check)));
}
{
  const d = join(tmp(), 'no-front'); put(d, 'SKILL.md', '# nothing');
  assert.ok(validateSkill(d).issues.some((i) => i.check === 'frontmatter'));
  const e = join(tmp(), 'no-file'); mkdirSync(e); assert.ok(validateSkill(e).issues.some((i) => i.check === 'skill-file'));
  const x = join(tmp(), 'bad-desc'); put(x, 'SKILL.md', '---\nname: bad-desc\ndescription: has <b>tags</b>\n---\n'); assert.ok(validateSkill(x).issues.some((i) => /tags/.test(i.msg)));
}

// ---- trigger-check scoring
{
  assert.equal(stem('assets'), 'asset'); assert.equal(stem('bodies'), 'body'); assert.equal(stem('class'), 'class'); assert.equal(stem('meshes'), 'mesh'); assert.equal(stem('boxes'), 'box'); assert.equal(stem('faces'), 'face');
  assert.deepEqual(tokenize('Low-Poly meshes'), ['lowpoly', 'low', 'poly', 'mesh']); assert.ok(tokenize('buildTreeAsset').includes('tree'), 'camelCase is split');
  const docs = [{ name: 'a', text: 'procedural low poly trees' }, { name: 'b', text: 'spreadsheet formulas' }];
  const r = rank('make a low poly tree', docs); assert.equal(r[0].name, 'a'); assert.equal(pick(r, 0.1).winner, 'a');
  assert.equal(pick(rank('weather today', docs), 0.1).winner, null, 'nothing matches -> no winner');
  assert.equal(pick(r, 1e9).winner, null, 'below min -> no winner');
}
{
  const dir = tmp(), self = join(here, '..');
  put(dir, 'ok.json', JSON.stringify({ min: 1, decoys: [{ name: 'xlsx-skill', description: 'spreadsheet formulas and csv files' }], cases: [{ prompt: 'low-poly tree generator', expect: '$self' }, { prompt: 'fix spreadsheet formulas', expect: 'xlsx-skill' }, { prompt: 'weather today', expect: null }] }));
  const ok = tsx('trigger-check.ts', [join(dir, 'ok.json')]); assert.equal(ok.status, 0, ok.stdout + ok.stderr); assert.equal(parseResult(ok.stdout)!.ok, true);
  put(dir, 'wrong.json', JSON.stringify({ min: 1, decoys: [{ name: 'xlsx-skill', description: 'spreadsheet formulas and csv files' }], cases: [{ prompt: 'fix spreadsheet formulas', expect: '$self' }, { prompt: 'low-poly tree generator', expect: null }] }));
  const bad = tsx('trigger-check.ts', [join(dir, 'wrong.json')]), br = parseResult(bad.stdout)!; assert.equal(bad.status, 2, 'wrong expectations must exit 2'); assert.equal(br.ok, false); assert.equal(br.gates!.filter((g) => !g.pass).length, 2);
  put(dir, 'unknown.json', JSON.stringify({ cases: [{ prompt: 'x', expect: 'nobody' }] })); assert.equal(tsx('trigger-check.ts', [join(dir, 'unknown.json')]).status, 1, 'unknown expected skill is a usage error, not a pass');
  assert.equal(tsx('trigger-check.ts', [join(dir, 'missing.json')]).status, 1); void self;
}

// ---- run-tests classification: pass, fail, skip (only for a missing `three`), and --strict
{
  assert.ok(missingThree("Error: Cannot find module 'three'\nRequire stack:")); assert.ok(missingThree("Cannot find package 'three/addons' imported from x")); assert.ok(missingThree("ERR_MODULE_NOT_FOUND: Cannot import 'three'".replace('Cannot import', 'Cannot find package')));
  assert.ok(!missingThree("Cannot find module './three-helper'")); assert.ok(!missingThree("Cannot find module 'threejs-other'"));
  const dir = tmp();
  put(dir, 'package.json', '{ "type": "module" }'); put(dir, 'a.test.ts', 'console.log("fine");'); put(dir, 'b.test.ts', 'throw new Error("boom");'); put(dir, 'c.test.ts', "import 'three-not-installed-here';");
  put(dir, 'd.test.ts', "import 'three';");
  const r = tsx('run-tests.ts', [dir]), res = parseResult(r.stdout)!;
  const status = Object.fromEntries((res.tests as { file: string; status: string }[]).map((t) => [t.file, t.status]));
  assert.equal(status['a.test.ts'], 'pass'); assert.equal(status['b.test.ts'], 'fail'); assert.equal(status['c.test.ts'], 'fail', 'a different missing module is a failure, not a skip');
  assert.ok(['skip', 'pass'].includes(status['d.test.ts']), 'three missing -> skip (or pass where three is installed)');
  assert.equal(r.status, 2); assert.equal(res.ok, false);
  const only = tsx('run-tests.ts', [dir, '--only', 'a.test']); assert.equal(only.status, 0); assert.equal(parseResult(only.stdout)!.ok, true);
  if (status['d.test.ts'] === 'skip') { const s = tsx('run-tests.ts', [dir, '--only', 'd.test']); assert.equal(s.status, 0, 'skip is ok without --strict'); assert.equal(tsx('run-tests.ts', [dir, '--only', 'd.test', '--strict']).status, 2, 'skip fails with --strict'); }
  assert.equal(tsx('run-tests.ts', [dir, '--only', 'nothing-matches']).status, 1);
}

console.log('TOOLS OK');
