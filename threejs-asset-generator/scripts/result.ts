// scripts/result.ts: the output contract shared by every tool and script (lives in scripts/ so a copied scripts/ folder stays self-contained).
// Human-readable text goes first. The LAST stdout line is exactly one line of JSON behind a fixed marker:
//   @@RESULT {"tool":"run-tests","ok":true,"gates":[{"gate":"...","value":"...","pass":true,"hint":""}], ...}
// Exit codes: 0 = ok, 2 = a gate failed, 1 = usage or internal error. `gates` uses the same shape as scripts/refcheck.ts `Gate`.
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
export const MARKER = '@@RESULT ';
export type Gate = { gate: string; value: string; pass: boolean; hint: string };
export type Result = { tool: string; ok: boolean; gates?: Gate[] } & Record<string, unknown>;

/** Builds the single marker line. JSON.stringify never emits a raw newline, so the line stays one line. */
export const resultLine = (r: Result): string => MARKER + JSON.stringify(r);

/** Prints the marker line as the last stdout line and returns the exit code to use: 0 when ok, else `failCode` (2 = a gate failed, 1 = usage or internal error). */
export function emit(r: Result, failCode = 2): number {
  console.log(resultLine(r));
  return r.ok ? 0 : failCode;
}

/** Reads the LAST marker line of some stdout. Returns null when there is none or it is not valid JSON. */
export function parseResult(stdout: string): Result | null {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith(MARKER)) continue;
    try { const r = JSON.parse(lines[i].slice(MARKER.length)); return r && typeof r.tool === 'string' && typeof r.ok === 'boolean' ? (r as Result) : null; } catch { return null; }
  }
  return null;
}

/** Runs a .ts script under the active tsx loader without shell quoting issues (Windows/macOS/Linux and npx tsx). */
export function spawnTsx(file: string, args: string[], opts: Partial<SpawnSyncOptionsWithStringEncoding> = {}) {
  const loaderArgs: string[] = [];
  for (let i = 0; i < process.execArgv.length; i++) {
    const a = process.execArgv[i];
    if (a === '--require' || a === '-r' || a === '--import' || a === '--loader') loaderArgs.push(a, process.execArgv[++i]);
  }
  const base = { encoding: 'utf8' as const, ...opts };
  return loaderArgs.length
    ? spawnSync(process.execPath, [...loaderArgs, file, ...args], base)
    : spawnSync('tsx', [file, ...args], { ...base, shell: process.platform === 'win32' });
}
