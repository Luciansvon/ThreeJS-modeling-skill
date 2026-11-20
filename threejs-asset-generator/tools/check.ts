// npx tsx tools/check.ts [--strict]       (or: cd tools && npm run check)
// THE one command: validate-skills + trigger-check + run-tests, then one combined verdict.
// --strict is passed to run-tests: a test that is skipped because `three` is not installed counts as a failure.
// Exit 0 = everything ran and passed (skips are reported as UNVERIFIED), 2 = something failed, 1 = a tool broke the output contract.
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { emit, MARKER, parseResult, type Gate, type Result } from '../scripts/result';

const here = dirname(new URL(import.meta.url).pathname), root = resolve(here, '..');
const strict = process.argv.includes('--strict');
const steps: { name: string; file: string; args: string[] }[] = [
  { name: 'validate-skills', file: 'validate-skills.ts', args: [root] },
  { name: 'trigger-check', file: 'trigger-check.ts', args: [] },
  { name: 'run-tests', file: 'run-tests.ts', args: [root, ...(strict ? ['--strict'] : [])] },
];

const gates: Gate[] = [], results: Record<string, Result | null> = {};
let broken = false;
for (const s of steps) {
  console.log(`\n=== ${s.name} ===`);
  const r = spawnSync('tsx', [join(here, s.file), ...s.args], { cwd: here, encoding: 'utf8', timeout: 600_000 });
  process.stdout.write((r.stdout ?? '').split('\n').filter((l) => !l.startsWith(MARKER)).join('\n'));
  if (r.stderr) process.stderr.write(r.stderr);
  const res = parseResult(r.stdout ?? '');
  results[s.name] = res;
  if (!res) { broken = true; gates.push({ gate: s.name, value: 'no result line', pass: false, hint: `${s.name} exited ${r.status ?? r.signal} without a final "${MARKER.trim()}" JSON line` }); continue; }
  gates.push({ gate: s.name, value: res.ok ? 'ok' : 'failed', pass: res.ok, hint: res.ok ? '' : (res.gates?.find((g) => !g.pass)?.hint || 'see the output above') });
}

const rt = results['run-tests'], unverified = ((rt?.tests as { file: string; status: string }[] | undefined) ?? []).filter((t) => t.status === 'skip').map((t) => t.file);
console.log('\n=== summary ===');
for (const g of gates) console.log(`${g.pass ? 'PASS' : 'FAIL'} ${g.gate}${g.hint ? `  (${g.hint})` : ''}`);
if (unverified.length) console.log(`UNVERIFIED (not run, \`three\` missing): ${unverified.join(', ')}. Install three and rerun with --strict before calling this done.`);
const ok = gates.every((g) => g.pass);
console.log(ok ? (unverified.length ? 'ALL RUN CHECKS PASS, with unverified tests above.' : 'ALL CHECKS PASS.') : 'CHECKS FAILED.');
process.exit(emit({ tool: 'check', ok, gates, strict, unverified }, broken ? 1 : 2));
