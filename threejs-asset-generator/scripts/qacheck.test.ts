// scripts/qacheck.test.ts: the gates must pass on a good asset AND fail on each defect they exist for. Run: npx tsx scripts/qacheck.test.ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { qaGates, determinismGates, normalizeParts, edgeReport, symmetryGap, degenerateTris, signedVolume, type Parts, type QAOptions } from './qacheck';
import { renderSheet } from './review';
import { parseResult } from './result';
import { box, buildCrateTris } from './fixtures/crate.qa';

const here = dirname(new URL(import.meta.url).pathname);
const gateOf = (parts: Parts, id: string, o: QAOptions = {}) => { const g = qaGates(parts, o).gates.find((x) => x.gate.startsWith(id)); assert.ok(g, `gate ${id} missing`); return g!; };
const flipAll = (t: number[]) => { const o = t.slice(); for (let i = 0; i < o.length; i += 9) for (let k = 0; k < 3; k++) { o[i + 3 + k] = t[i + 6 + k]; o[i + 6 + k] = t[i + 3 + k]; } return o; };   // swap vertices 1 and 2
const cube = box(-0.5, 0, -0.5, 0.5, 1, 0.5);

// 0. the helper itself: a box has volume 1 and is closed
assert.ok(Math.abs(signedVolume(cube) - 1) < 1e-9);
assert.deepEqual(edgeReport(cube), { boundary: 0, duplicated: 0, edges: 36 });

// 1. a good asset passes every gate that applies (symmetric, grounded, closed)
{
  const { gates, skipped } = qaGates(buildCrateTris({ seed: 3 }), { symmetric: true });
  assert.equal(gates.length, 7);
  assert.deepEqual(gates.filter((g) => !g.pass), []);
  assert.ok(skipped.some((s) => s.includes('footprint')), 'the report must say that footprint centring was not checked');
}

// 2. each defect trips its own gate
assert.equal(gateOf({ a: flipAll(cube) }, 'Q3').pass, false, 'inside-out: negative volume');
assert.equal(gateOf({ a: flipAll(cube) }, 'Q4').pass, true, 'consistently inside-out is closed: Q3 owns that defect');
{ const mixed = cube.slice(); mixed.splice(0, 9, ...flipAll(cube.slice(0, 9))); assert.equal(gateOf({ a: mixed }, 'Q4').pass, false, 'one flipped triangle'); }
{ const hole = gateOf({ a: cube.slice(9) }, 'Q4'); assert.equal(hole.pass, false); assert.match(hole.value, /3 open edges/); }
{ const nan = qaGates({ a: [...cube, NaN, 0, 0, 0, 0, 0, 0, 0, 0] }); assert.equal(nan.gates.length, 1, 'later gates are skipped after Q1 fails'); assert.equal(nan.gates[0].pass, false); }
assert.equal(qaGates({ a: [] }).gates[0].pass, false, 'empty asset');
assert.equal(qaGates({ a: [0, 0, 0, 1, 0, 0] }).gates[0].pass, false, 'not whole triangles');
{ const withDegenerate = { a: [...cube, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2] }; assert.equal(gateOf(withDegenerate, 'Q2').pass, false); assert.equal(gateOf(withDegenerate, 'Q2', { maxDegenerate: 1 }).pass, true); assert.deepEqual(degenerateTris(withDegenerate.a), [12]); }
{ const up = cube.map((v, i) => (i % 3 === 1 ? v + 0.5 : v)); assert.equal(gateOf({ a: up }, 'Q6').pass, false, 'floating'); assert.equal(gateOf({ a: up }, 'Q6', { groundY: 0.5 }).pass, true, 'slab top at 0.5'); }
{ const right = cube.map((v, i) => (i % 3 === 0 ? v + 1 : v)); assert.equal(gateOf({ a: right }, 'Q6').pass, true); assert.equal(gateOf({ a: right }, 'Q6', { footprint: true }).pass, false, 'footprint off-centre'); }
assert.equal(qaGates({ a: cube.map((v, i) => (i % 3 === 1 ? v + 3 : v)) }, { grounding: false }).gates.some((g) => g.gate.startsWith('Q6')), false, 'grounding: false removes Q6');
assert.equal(gateOf({ a: cube }, 'Q5', { budget: 10 }).pass, false);
assert.equal(gateOf({ a: cube }, 'Q5').pass, true);
{ const lopsided = { a: cube, b: box(0.7, 0, 0, 0.9, 0.2, 0.2) }; assert.equal(gateOf(lopsided, 'Q7', { symmetric: true }).pass, false); assert.ok(symmetryGap(cube) === 0); }

// 3. sheets: a quad has no volume, so it needs `open`; a closed part next to it is still checked
{
  const sheet = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
  const parts = { body: cube, flag: sheet };
  assert.equal(gateOf(parts, 'Q3').pass, false); assert.equal(gateOf(parts, 'Q4').pass, false);
  assert.equal(gateOf(parts, 'Q3', { open: ['flag'] }).pass, true); assert.equal(gateOf(parts, 'Q4', { open: ['flag'] }).pass, true);
  assert.equal(gateOf({ body: flipAll(cube), flag: sheet }, 'Q3', { open: ['flag'] }).pass, false, 'open must not hide an inside-out closed part');
  assert.match(gateOf(parts, 'Q3', { open: ['all'] }).value, /skipped/);
}

// 4. shapes accepted from a builder
assert.deepEqual(Object.keys(normalizeParts(cube)), ['asset']);
assert.deepEqual(Object.keys(normalizeParts({ tris: cube, colors: ['#fff'] })), ['asset']);
assert.deepEqual(Object.keys(normalizeParts({ body: cube, legs: cube, note: 'x' })), ['body', 'legs']);
assert.throws(() => normalizeParts('nope'), /builder must return/);
assert.throws(() => normalizeParts({ a: 'x' }), /builder must return/);

// 5. determinism and seed 0 (Q8, Q9)
{
  const ok = await determinismGates(buildCrateTris); assert.deepEqual(ok.filter((g) => !g.pass), []); assert.match(ok[1].value, /own asset/);
  const rnd = await determinismGates(() => ({ a: cube.map((v) => v + Math.random() * 1e-3) })); assert.equal(rnd[0].pass, false, 'Math.random in a builder');
  const orSeed = await determinismGates((p) => buildCrateTris({ ...p, seed: (p.seed as number) || 12345 })); assert.equal(orSeed[0].pass, true); assert.equal(orSeed[1].pass, false, 'seed || 12345'); assert.match(orSeed[1].value, /same asset as seed 12345/);
  const noSeed = await determinismGates(() => ({ a: cube })); assert.equal(noSeed[1].pass, true); assert.match(noSeed[1].value, /does not depend/);
  const nan = await determinismGates((p) => ({ a: p.seed === 0 ? [NaN, 0, 0, 0, 0, 0, 0, 0, 0] : cube })); assert.equal(nan[1].pass, false, 'seed 0 gives NaN');
}

// 6. review image: back faces show up as magenta, sheets are drawn two-sided, a good asset has none
{
  const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);
  const good = renderSheet({ body: cube }); assert.equal(good.width, 640); assert.equal(total(good.wrong), 0, 'outward cube has no magenta');
  assert.ok(good.rgba.some((v, i) => i % 4 === 0 && v !== 245), 'something was drawn');
  const bad = renderSheet({ body: flipAll(cube) }); assert.ok(total(bad.wrong) > 500, 'inside-out cube is visibly magenta'); assert.ok('body' in bad.wrong);
  const sheet = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0];
  assert.equal(total(renderSheet({ flag: sheet }, { open: ['flag'] }).wrong), 0, 'open sheet is two-sided');
  assert.equal(total(renderSheet({ flag: sheet }).wrong), 0, 'a sheet facing the cameras is plain shaded even when not listed as open');
  assert.ok(total(renderSheet({ flag: flipAll(sheet) }).wrong) > 0, 'a sheet facing away from the cameras (-Z) shows its back as magenta unless listed as open');
  assert.equal(total(renderSheet({ flag: flipAll(sheet) }, { open: ['flag'] }).wrong), 0);
  assert.deepEqual(renderSheet({ body: cube }).rgba, renderSheet({ body: cube }).rgba, 'rendering is deterministic');
}

// 7. the CLI end to end: exit codes and the last-line contract
{
  const run = (...a: string[]) => { const r = spawnSync('tsx', [join(here, 'qa-asset.ts'), ...a], { cwd: here, encoding: 'utf8', timeout: 120_000 }); return { code: r.status, res: parseResult(r.stdout ?? ''), out: r.stdout ?? '' }; };
  const out = mkdtempSync(join(tmpdir(), 'qa-'));
  const crate = join(here, 'fixtures/crate.qa.ts');

  const raw = run('--module', crate, '--export', 'buildCrateTris', '--no-render');
  assert.equal(raw.code, 0, raw.out); assert.ok(!(raw.res?.gates as { gate: string }[]).some((g) => g.gate.startsWith('Q6')), 'module mode does not run Q6 by default'); assert.ok((raw.res?.skipped as string[]).some((s) => s.startsWith('Q6 grounding')), 'and says so');
  const good = run('--module', crate, '--export', 'buildCrateTris', '--symmetric', '--grounded', '--out', out);
  assert.equal(good.code, 0, good.out); assert.equal(good.res?.ok, true); assert.equal((good.res?.gates as unknown[]).length, 10, 'Q1..Q10 with --symmetric');
  if (good.res?.review) assert.ok(existsSync(good.res.review as string), 'review.png written'); else assert.ok((good.res?.unverified as string[]).some((u) => u.startsWith('review.png')), 'no PNG must be reported as UNVERIFIED');
  assert.ok((good.res?.wrongFacePixels as number) <= 4, 'a healthy asset has at most the noise limit of magenta pixels');

  const bad = join(out, 'bad.qa.ts'); writeFileSync(bad, `export const build = () => ({ body: [${flipAll(cube).join(',')}].map((v) => v + Math.random() * 1e-3) });`);
  const broken = run('--module', bad, '--out', out);                                  // single export: --export is optional
  assert.equal(broken.code, 2, broken.out); assert.equal(broken.res?.ok, false);
  const failedGates = (broken.res?.gates as { gate: string; pass: boolean }[]).filter((g) => !g.pass).map((g) => g.gate.split(' ')[0]);
  for (const id of ['Q3', 'Q8', 'Q10']) assert.ok(failedGates.includes(id), `${id} must fail, failed: ${failedGates}`);
  assert.ok((broken.res?.wrongFacePixels as number) > 500, 'inside-out shows as magenta');

  const trisFile = join(out, 'tris.json'); writeFileSync(trisFile, JSON.stringify({ tris: cube, colors: ['#8a6a45'] }));
  const viaTris = run('--tris', trisFile, '--out', out);
  assert.equal(viaTris.code, 0, viaTris.out); assert.equal((viaTris.res?.gates as unknown[]).length, 7, 'Q1..Q6 and Q10'); assert.ok((viaTris.res?.unverified as string[]).some((u) => u.includes('Q8')), 'Q8/Q9 cannot run on tris.json');

  const usage = run(); assert.equal(usage.code, 1); assert.equal(usage.res?.ok, false);
  const missing = run('--module', join(out, 'nope.ts')); assert.equal(missing.code, 1); assert.match(String(missing.res?.error), /cannot build or read/);
  const needsThree = join(out, 'three.qa.ts'); writeFileSync(needsThree, `import * as THREE from 'three'; export const build = () => new THREE.BoxGeometry();`);
  const three = run('--module', needsThree); assert.equal(three.code, 1); assert.match(String(three.res?.error), /--tris|three/);
}
console.log('QACHECK OK');
