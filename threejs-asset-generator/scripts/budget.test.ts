// scripts/budget.test.ts: the budget gates must pass inside the limits AND fail just outside them; the LOD gates must fail on each defect they exist for. Run: npx tsx scripts/budget.test.ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES, textureMiB, assetStats, budgetGates, lodGates, type Stats } from './budget';
import { normalizeParts, type Parts } from './qacheck';
import { parseResult, spawnTsx } from './result';
import { box, buildCrateTris } from './fixtures/crate.qa';
import { buildDragon } from './fixtures/dragon.qa';

const here = dirname(fileURLToPath(import.meta.url));
const base: Stats = { triangles: 100, gpuVertices: 300, meshes: 1, drawCalls: 1, drawCallsExact: true, materials: 1, bones: null, textures: [], textureMiB: 0 };
const gate = (s: Partial<Stats>, id: string, o: Parameters<typeof budgetGates>[1] = {}) => { const g = budgetGates({ ...base, ...s }, o).gates.find((x) => x.gate.startsWith(id)); assert.ok(g, `gate ${id} missing`); return g!; };

// 0. the table: the figures of references/budget.md, and its internal order
assert.equal(PROFILES.web.tris.prop.max, 10000); assert.equal(PROFILES.mobile.tris.hero.max, 15000); assert.equal(PROFILES.desktop.bones.max, 300); assert.equal(PROFILES.mobile.texture, 1024);
for (const [name, p] of Object.entries(PROFILES)) for (const k of ['hero', 'prop'] as const) { assert.ok(p.tris[k].target <= p.tris[k].max, `${name} ${k}`); assert.ok(p.tris.prop.max <= p.tris.hero.max, `${name}: a prop is not bigger than a hero`); }
assert.ok(Math.abs(textureMiB(1024) - 5.33) < 0.01 && Math.abs(textureMiB(2048) - 21.33) < 0.01 && Math.abs(textureMiB(4096) - 85.33) < 0.01, 'the 5.3 / 21 / 85 MiB of the table');
assert.equal(textureMiB(1024, 1024, false), 4);

// 1. stats: GPU vertices are 3 x triangles (flat, non-indexed); draw calls group by (bone, material) when meta says so, else one per part (an upper bound)
{
  const parts: Parts = { a: box(0, 0, 0, 1, 1, 1), b: box(2, 0, 0, 3, 1, 1), c: box(4, 0, 0, 5, 1, 1) };
  const plain = assetStats(parts); assert.equal(plain.triangles, 36); assert.equal(plain.gpuVertices, 108); assert.equal(plain.meshes, 3); assert.equal(plain.drawCalls, 3); assert.equal(plain.drawCallsExact, false); assert.equal(plain.materials, null);
  const meta = { parts: { a: { material: 'wood', bone: 'root' }, b: { material: 'wood', bone: 'root' }, c: { material: 'metal', bone: 'root' } }, bones: ['root'], textures: [1024, { name: 'atlas', width: 2048, height: 1024 }] };
  const exact = assetStats(parts, meta); assert.equal(exact.drawCalls, 2, 'a and b share bone and material'); assert.equal(exact.drawCallsExact, true); assert.equal(exact.materials, 2); assert.equal(exact.bones, 1);
  assert.ok(Math.abs(exact.textureMiB - (textureMiB(1024) + textureMiB(2048, 1024))) < 1e-9); assert.equal(exact.textures[1].name, 'atlas');
  assert.equal(assetStats(parts, { ...meta, parts: { ...meta.parts, a: { material: 'wood', bone: 'arm' } } }).drawCalls, 3, 'another bone is another draw call');
  assert.equal(assetStats(parts, { parts: { a: { material: 'm' } } }).drawCallsExact, false, 'meta that misses a part is not exact');
  assert.equal(assetStats(parts, { bones: 12 }).bones, 12);
}

// 2. triangles: pass at the limit, fail one above, the target is a note
assert.equal(gate({ triangles: 10000 }, 'B1').pass, true); assert.equal(gate({ triangles: 10001 }, 'B1').pass, false);
assert.match(gate({ triangles: 5000 }, 'B1').value, /above the target/); assert.doesNotMatch(gate({ triangles: 900 }, 'B1').value, /above the target/);
assert.equal(gate({ triangles: 3001 }, 'B1', { platform: 'mobile' }).pass, false, 'a mobile prop is limited to 3000');
assert.equal(gate({ triangles: 3001 }, 'B1', { platform: 'mobile', kind: 'hero' }).pass, true, 'but a hero may have 15000');
assert.equal(gate({ triangles: 150001 }, 'B1', { platform: 'desktop', kind: 'hero' }).pass, false);
// materials, bones, textures
assert.equal(gate({ materials: 2 }, 'B2').pass, true); assert.equal(gate({ materials: 3 }, 'B2').pass, false);
assert.equal(gate({ bones: 100 }, 'B4').pass, true); assert.equal(gate({ bones: 101 }, 'B4').pass, false); assert.equal(gate({ bones: 76 }, 'B4', { platform: 'mobile' }).pass, false);
{ const t = (n: number) => ({ textures: [{ name: 'atlas', w: n, h: n, mib: textureMiB(n) }], textureMiB: textureMiB(n) });
  assert.equal(gate(t(2048), 'B3').pass, true); assert.equal(gate(t(4096), 'B3').pass, false, 'web allows 2048'); assert.equal(gate(t(4096), 'B3', { platform: 'desktop' }).pass, true); assert.equal(gate(t(2048), 'B3', { platform: 'mobile' }).pass, false); assert.match(gate(t(2048), 'B3').value, /21\.33 MiB/); }
// draw calls: only mobile and web have a limit in the table; the number is labelled an upper bound when meta is missing
assert.equal(gate({ drawCalls: 100 }, 'B5').pass, true); assert.equal(gate({ drawCalls: 51 }, 'B5', { platform: 'mobile' }).pass, false); assert.match(gate({ drawCallsExact: false }, 'B5').value, /upper bound/);
for (const platform of ['vr', 'desktop'] as const) { assert.equal(budgetGates(base, { platform }).gates.some((g) => g.gate.startsWith('B5')), false); assert.ok(budgetGates(base, { platform }).skipped.some((s) => s.startsWith('B5')), `${platform}: no limit is reported as not checked, not invented`); }
// GLB size: hero on mobile or web only
assert.equal(gate({}, 'B6', { kind: 'hero', glbBytes: 5 * 1048576 }).pass, true); assert.equal(gate({}, 'B6', { kind: 'hero', glbBytes: 5 * 1048576 + 1 }).pass, false);
assert.match(gate({}, 'B6', { kind: 'hero', glbBytes: 3 * 1048576 }).value, /above the target/);
assert.ok(budgetGates(base, { kind: 'prop', glbBytes: 1 }).skipped.some((s) => s.startsWith('B6')), 'no table value for a prop GLB');
assert.ok(budgetGates(base, { kind: 'hero', platform: 'desktop', glbBytes: 1 }).skipped.some((s) => s.startsWith('B6')));
assert.ok(budgetGates(base).skipped.some((s) => /B6.*no --glb/.test(s)));
// unknown facts are skipped, never guessed
{ const r = budgetGates({ ...base, materials: null }); assert.ok(r.skipped.some((s) => s.startsWith('B2')) && r.skipped.some((s) => s.startsWith('B3')) && r.skipped.some((s) => s.startsWith('B4'))); }

// 3. LOD gates: the real kernel passes; each defect trips its own gate and only that one
// A row of closed boxes with gaps (touching boxes would share faces and fail Q4, which is a real finding) from x = 0 to x = 2: 4 / 2 / 1 boxes at detail 2 / 1 / 0 (48, 24, 12 triangles),
// the same part, the same bounds. Each defect changes ONE thing.
const row = (detail: number, o: { boxes?: number[]; lift?: number; extra?: boolean; hole?: boolean; wobble?: number } = {}): Parts => {
  const n = (o.boxes ?? [1, 2, 4])[detail], bw = n === 1 ? 2 : 0.8 * (2 / n), step = n === 1 ? 0 : (2 - bw) / (n - 1), y = detail === 0 ? (o.lift ?? 0) : 0;
  let t: number[] = []; for (let i = 0; i < n; i++) t.push(...box(i * step, y, 0, i * step + bw, y + 1 + (o.wobble ?? 0), 1));
  if (o.hole && detail === 0) t = t.slice(9);
  const parts: Parts = { a: t }; if (o.extra && detail > 0) parts.b = box(5, 0, 0, 6, 1, 1);
  return parts;
};
const lodOf = async (o: Parameters<typeof row>[1] = {}, flaky = false) => { let calls = 0; const r = await lodGates(async (p) => row(Number(p.detail), { ...o, wobble: flaky ? 1e-3 * (calls++ % 2) : 0 }), normalizeParts, {}, {}); return { by: Object.fromEntries(r.gates.map((g) => [g.gate.split(' ')[0], g])), gates: r.gates, levels: r.levels }; };
const failing = (r: { gates: { gate: string; pass: boolean }[] }) => r.gates.filter((g) => !g.pass).map((g) => g.gate.split(' ')[0]);
{
  const kernel = await lodGates(async (p) => buildDragon(p), normalizeParts, { seed: 7 }, { open: ['wingL', 'wingR'], symmetric: true });
  assert.deepEqual(kernel.gates.filter((g) => !g.pass), []); assert.deepEqual(kernel.levels.map((l) => l.triangles), [388, 204, 96]); assert.equal(kernel.gates.length, 4, 'L1 to L4 only: no L0 when every level passes QA');
  const control = await lodOf(); assert.deepEqual(failing(control), [], 'control: the row builder passes'); assert.deepEqual(control.levels.map((l) => l.triangles), [48, 24, 12]);

  const ignores = await lodOf({ boxes: [4, 4, 4] }); assert.deepEqual(failing(ignores), ['L1'], 'a builder that ignores detail'); assert.match(ignores.by.L1.hint, /ignores `detail`/);
  const steep = await lodOf({ boxes: [1, 2, 8] }); assert.deepEqual(failing(steep), ['L1'], 'ratios 0.25 and 0.5 are not both "half"');
  const drops = await lodOf({ extra: true }); assert.ok(failing(drops).includes('L2'), 'a level that drops a part'); assert.match(drops.by.L2.value, /differ/);
  const moves = await lodOf({ lift: 0.5 }); assert.deepEqual(failing(moves), ['L3'], 'the lowest level floats half a metre: pivot moved'); assert.match(moves.by.L3.value, /2\d\.\d%/);
  const small = await lodOf({ lift: 0.05 }); assert.deepEqual(failing(small), [], '0.05 of a 2 m asset is 2.5%: inside the 5% limit');
  const rand = await lodOf({}, true); assert.ok(failing(rand).includes('L4'), 'two builds of one level differ');
  const hole = await lodOf({ hole: true }); assert.ok(hole.by.L0, 'a level with a hole reports its own QA failure'); assert.equal(hole.by.L0.pass, false); assert.match(hole.by.L0.gate, /detail 0/); assert.match(hole.by.L0.value, /Q4/);
}

// 4. the CLI end to end
{
  const out = mkdtempSync(join(tmpdir(), 'budget-')), cli = join(here, 'mesh-stats.ts');
  const run = (...a: string[]) => { const r = spawnTsx(cli, a, { cwd: out }); return { code: r.status, out: `${r.stdout}${r.stderr}`, res: parseResult(r.stdout) }; };
  const dragon = join(here, 'fixtures', 'dragon.qa.ts'), crate = join(here, 'fixtures', 'crate.qa.ts');

  const lods = run('--module', dragon, '--lods', '--open', 'wingL,wingR', '--symmetric');
  assert.equal(lods.code, 0, lods.out); assert.equal(lods.res?.ok, true); assert.equal((lods.res?.levels as unknown[]).length, 3);
  assert.ok((lods.res?.unverified as string[]).some((u) => /not measured in a renderer/.test(u)), 'the report says nothing was measured on a GPU');
  const noLods = run('--module', crate, '--export', 'buildCrateTris'); assert.equal(noLods.code, 0, noLods.out); assert.ok((noLods.res?.skipped as string[]).some((s) => s.startsWith('L1 to L4')));

  const big = join(out, 'big.json'), t: number[] = []; for (let i = 0; i < 4000; i++) t.push(i, 0, 0, i + 1, 0, 0, i, 1, 0.5);
  writeFileSync(big, JSON.stringify({ blob: t }));
  const over = run('--tris', big, '--profile', 'mobile', '--kind', 'prop');
  assert.equal(over.code, 2, over.out); assert.equal(over.res?.ok, false); assert.match(over.out, /FAIL {2}B1 triangles: 4000 triangles/);
  assert.equal(run('--tris', big, '--profile', 'desktop', '--kind', 'prop').code, 0, 'the same asset fits a desktop prop');

  const meta = join(out, 'meta.json'); writeFileSync(meta, JSON.stringify({ parts: { blob: { material: 'm', bone: 'root' } }, bones: 120, textures: [4096] }));
  const withMeta = run('--tris', big, '--profile', 'desktop', '--meta', meta); assert.equal(withMeta.code, 0, withMeta.out); assert.equal((withMeta.res?.stats as { materials: number }).materials, 1); assert.equal((withMeta.res?.stats as { drawCallsExact: boolean }).drawCallsExact, true);
  assert.equal(run('--tris', big, '--meta', meta).code, 2, 'web: the 4096 texture and 120 bones fail');
  const glb = join(out, 'a.glb'); writeFileSync(glb, new Uint8Array(6 * 1048576));
  assert.equal(run('--tris', big, '--kind', 'hero', '--glb', glb).code, 2, 'a 6 MiB hero GLB is over 5');

  assert.equal(run().code, 1); assert.equal(run('--tris', big, '--profile', 'phone').code, 1); assert.equal(run('--tris', big, '--kind', 'boss').code, 1);
  assert.equal(run('--tris', big, '--lods').code, 1, '--lods needs a builder'); assert.equal(run('--tris', big, '--meta', join(out, 'nope.json')).code, 1); assert.equal(run('--tris', big, '--glb', join(out, 'nope.glb')).code, 1);
  const missing = run('--module', join(out, 'nope.ts')); assert.equal(missing.code, 1); assert.match(String(missing.res?.error), /cannot build or read/);
}
console.log('BUDGET OK');
