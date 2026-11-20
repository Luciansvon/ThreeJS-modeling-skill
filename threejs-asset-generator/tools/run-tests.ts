// npx tsx tools/run-tests.ts [skill-dir] [--strict] [--only <substring>] [--timeout <ms>]
// Runs every *.test.ts under the skill folder (src/, scripts/, tools/) with tsx, each in its own folder.
// pass  = exit code 0
// skip  = the run died only because the `three` package is not installed (sandbox without network). NOT a pass: it is counted
//         as "unverified" and listed. With --strict a skip fails the run, so use --strict on a machine where `npm i three` works.
// fail  = anything else. The last lines of its output are printed.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { emit, type Gate } from '../scripts/result';

export type Status = 'pass' | 'fail' | 'skip';
export type TestRun = { file: string; status: Status; ms: number; reason?: string };

export const findTests = (root: string, out: string[] = []): string[] => {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) findTests(p, out); else if (e.name.endsWith('.test.ts')) out.push(p);
  }
  return out.sort();
};

/** True when the output shows the run stopped because `three` (or a `three/...` path) could not be resolved. */
export const missingThree = (output: string) =>
  /Cannot find (module|package) ['"]three(\/[^'"]*)?['"]/.test(output) || /ERR_MODULE_NOT_FOUND[^\n]*['"]three(\/[^'"]*)?['"]/.test(output);

export function runOne(file: string, timeoutMs: number): TestRun & { output: string } {
  const t0 = Date.now(), r = spawnSync('tsx', [file], { cwd: dirname(file), encoding: 'utf8', timeout: timeoutMs, env: process.env });
  const ms = Date.now() - t0, output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') return { file, status: 'fail', ms, reason: `timeout after ${timeoutMs} ms`, output };
  if (r.error) return { file, status: 'fail', ms, reason: `could not start tsx: ${r.error.message}`, output };
  if (r.status === 0) return { file, status: 'pass', ms, output };
  if (missingThree(output)) return { file, status: 'skip', ms, reason: 'needs the `three` package (npm i three)', output };
  return { file, status: 'fail', ms, reason: `exit code ${r.status ?? r.signal}`, output };
}

export function main(argv: string[]): number {
  let root = '', strict = false, only = '', timeout = 120_000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') strict = true; else if (a === '--only') only = argv[++i] ?? ''; else if (a === '--timeout') timeout = Number(argv[++i]);
    else if (a.startsWith('--')) { console.error(`unknown option ${a}`); return 1; } else root = a;
  }
  if (!Number.isFinite(timeout) || timeout <= 0) { console.error('--timeout needs a positive number of milliseconds'); return 1; }
  root = resolve(root || join(dirname(new URL(import.meta.url).pathname), '..'));
  const files = findTests(root).filter((f) => !only || f.includes(only));
  if (!files.length) { console.error(`no *.test.ts found under ${root}${only ? ` matching "${only}"` : ''}`); return 1; }
  const runs: TestRun[] = [], gates: Gate[] = [];
  for (const f of files) {
    const { output, ...run } = runOne(f, timeout), rel = relative(root, f);
    runs.push({ ...run, file: rel });
    console.log(`${run.status.toUpperCase().padEnd(4)} ${rel} (${(run.ms / 1000).toFixed(1)}s)${run.reason ? `  ${run.reason}` : ''}`);
    if (run.status === 'fail') console.log(output.trim().split('\n').slice(-15).map((l) => `     | ${l}`).join('\n'));
    gates.push({ gate: rel, value: run.status, pass: run.status === 'pass' || (run.status === 'skip' && !strict), hint: run.status === 'skip' ? (strict ? 'needs the `three` package: npm i three' : 'unverified: install three and rerun with --strict') : run.status === 'fail' ? (run.reason ?? '') : '' });
  }
  const n = (s: Status) => runs.filter((r) => r.status === s).length, passed = n('pass'), failed = n('fail'), skipped = n('skip');
  const ok = failed === 0 && (!strict || skipped === 0);
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped${skipped ? ` (UNVERIFIED: ${runs.filter((r) => r.status === 'skip').map((r) => r.file).join(', ')})` : ''}${strict ? ' [strict]' : ''}`);
  return emit({ tool: 'run-tests', ok, gates, passed, failed, skipped, strict, tests: runs });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) process.exit(main(process.argv.slice(2)));
