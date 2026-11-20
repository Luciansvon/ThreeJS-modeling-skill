// scripts/glb.test.ts: the writer must round-trip a good asset AND the gates must fail on each defect they exist for. Run: npx tsx scripts/glb.test.ts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { partsToGlb, readGlb, glbGates, faceNormal, type Parts } from './glb';
import { parseResult } from './result';
import { box, buildCrateTris } from './fixtures/crate.qa';

const here = dirname(new URL(import.meta.url).pathname);
const gateOf = (bytes: Uint8Array, source: Parts, id: string) => { const g = glbGates(bytes, source).find((x) => x.gate.startsWith(id)); assert.ok(g, `gate ${id} missing`); return g!; };
const crate = buildCrateTris({ seed: 3 }) as Parts, cube = box(-0.5, 0, -0.5, 0.5, 1, 0.5);
const setU32 = (b: Uint8Array, at: number, v: number) => new DataView(b.buffer, b.byteOffset).setUint32(at, v, true);

// 0. faceNormal: +Z triangle, and a degenerate one
assert.deepEqual(faceNormal([0, 0, 0, 1, 0, 0, 0, 1, 0], 0), [0, 0, 1]);
assert.deepEqual(faceNormal([0, 0, 0, 0, 0, 0, 0, 0, 0], 0), [0, 0, 0]);

// 1. a good asset: the container is well formed and every gate passes
{
  const glb = partsToGlb(crate);
  assert.equal(glb.length % 4, 0, 'whole file is 4-byte aligned');
  const dv = new DataView(glb.buffer), info = readGlb(glb);
  assert.equal(dv.getUint32(0, true), 0x46546c67); assert.equal(dv.getUint32(4, true), 2); assert.equal(dv.getUint32(8, true), glb.length);
  assert.deepEqual(info.json.nodes.map((n: any) => n.name), ['body', 'battens'], 'node names are the part names, in order');
  assert.equal(info.json.accessors.length, 4); assert.deepEqual(info.json.accessors[0].min.length, 3);
  const g = glbGates(glb, crate); assert.deepEqual(g.filter((x) => !x.pass), []); assert.equal(g.length, 6);
  assert.deepEqual(info.parts.body, Array.from(new Float32Array(crate.body)), 'positions round-trip at float32');
}

// 2. determinism: same parts, same bytes; seed 0 is its own asset
{
  const a = partsToGlb(buildCrateTris({ seed: 7 }) as Parts), b = partsToGlb(buildCrateTris({ seed: 7 }) as Parts);
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
  assert.notDeepEqual(Buffer.from(partsToGlb(buildCrateTris({ seed: 0 }) as Parts)), Buffer.from(partsToGlb(buildCrateTris({ seed: 1 }) as Parts)));
}

// 3. the writer refuses bad input
assert.throws(() => partsToGlb({}), /no parts/);
assert.throws(() => partsToGlb({ a: [] }), /whole number of triangles/);
assert.throws(() => partsToGlb({ a: [0, 0, 0, 1, 0, 0] }), /whole number of triangles/);
assert.throws(() => partsToGlb({ a: [...cube, NaN, 0, 0, 0, 0, 0, 0, 0, 0] }), /NaN or Infinity/);

// 4. each defect trips its own gate (the reader must name what is wrong, not crash)
{
  const good = partsToGlb({ cube });
  const badMagic = good.slice(); badMagic[0] = 0x58; assert.match(glbGates(badMagic, { cube })[0].value, /magic/);
  const badVersion = good.slice(); setU32(badVersion, 4, 1); assert.match(glbGates(badVersion, { cube })[0].value, /version 1/);
  const badLength = good.slice(); setU32(badLength, 8, good.length + 4); assert.match(glbGates(badLength, { cube })[0].value, /header length/);
  assert.equal(glbGates(good.slice(0, 30), { cube })[0].pass, false, 'truncated file');
  assert.equal(glbGates(new Uint8Array(5), { cube })[0].pass, false, 'shorter than a header');
  const badJson = good.slice(); badJson[20] = 0x7e;   // replaces the opening brace const r = glbGates(badJson, { cube })[0]; assert.equal(r.pass, false); assert.match(r.gate, /E2/);

  const other = partsToGlb({ cube: cube.map((v) => v + 0.25) });                                // valid GLB, but not made from this input
  assert.equal(gateOf(other, { cube }, 'E4').pass, false, 'round-trip catches changed vertices');
  assert.equal(gateOf(partsToGlb({ cube: cube.slice(9) }), { cube }, 'E6').pass, false, 'a lost triangle is counted');
  assert.equal(gateOf(partsToGlb({ renamed: cube }), { cube }, 'E2').pass, false, 'node names must equal part names');

  // flip a stored normal: E5 (normal against winding)
  const info = readGlb(good), nv = info.json.bufferViews[1], at = good.length - info.bin.length + nv.byteOffset;   // BIN is the last chunk, normals are the 2nd bufferView
  const flipped = good.slice(), fdv = new DataView(flipped.buffer); for (let k = 0; k < 3; k++) fdv.setFloat32(at + k * 4, -fdv.getFloat32(at + k * 4, true), true);   // negate the first vertex normal
  assert.equal(gateOf(flipped, { cube }, 'E5').pass, false, 'a changed normal is reported');
  // POSITION min is checked against the data
  const j = JSON.stringify(info.json), tampered = j.replace(/"min":\[[^\]]*\]/, '"min":[9,9,9]');
  assert.notEqual(j, tampered);
  const enc = new TextEncoder().encode(tampered), jl = new DataView(good.buffer).getUint32(12, true); assert.ok(enc.length <= jl, 'tampered JSON fits the original chunk');
  const bad = good.slice(); bad.fill(0x20, 20, 20 + jl); bad.set(enc, 20); assert.equal(gateOf(bad, { cube }, 'E3').pass, false, 'wrong min/max');
}

// 5. inside-out input is visible in the GLB too: the normal follows the winding, so the volume sign is recoverable from the file
{
  const flip = cube.slice(); for (let i = 0; i < flip.length; i += 9) for (let k = 0; k < 3; k++) { flip[i + 3 + k] = cube[i + 6 + k]; flip[i + 6 + k] = cube[i + 3 + k]; }
  const info = readGlb(partsToGlb({ flip })), n = info.normals.flip, p = info.parts.flip;
  let outward = 0; for (let i = 0; i < p.length; i += 9) { const cx = (p[i] + p[i + 3] + p[i + 6]) / 3, cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3 - 0.5, cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3; outward += n[i] * cx + n[i + 1] * cy + n[i + 2] * cz > 0 ? 1 : -1; }
  assert.equal(outward, -12, 'every normal of an inside-out cube points inward');
}

// 6. the CLI end to end: file on disk, exit codes, @@RESULT, QA refusal, --skip-qa, usage and load errors
{
  const out = mkdtempSync(join(tmpdir(), 'glb-')), cli = join(here, 'export-glb.ts');
  const run = (...a: string[]) => { const r = spawnSync('tsx', [cli, ...a], { encoding: 'utf8', cwd: out }); const o = `${r.stdout}${r.stderr}`; return { code: r.status, out: o, res: parseResult(r.stdout) }; };
  const crateFile = join(here, 'fixtures', 'crate.qa.ts'), file = join(out, 'crate.glb');

  const ok = run('--module', crateFile, '--export', 'buildCrateTris', '--params', '{"seed":0}', '--out', file);
  assert.equal(ok.code, 0, ok.out); assert.equal(ok.res?.ok, true); assert.equal(ok.res?.file, file);
  assert.deepEqual((ok.res?.gates as { pass: boolean }[]).filter((g) => !g.pass), []);
  assert.deepEqual(Array.from(readFileSync(file)), Array.from(partsToGlb(buildCrateTris({ seed: 0 }) as Parts)), 'the file equals the library output for the same seed');
  assert.ok((ok.res?.unverified as string[]).some((u) => u.includes('real viewer')), 'the report must say no third-party loader was run');

  const flip = cube.slice(); for (let i = 0; i < flip.length; i += 9) for (let k = 0; k < 3; k++) { flip[i + 3 + k] = cube[i + 6 + k]; flip[i + 6 + k] = cube[i + 3 + k]; }
  const bad = join(out, 'bad.json'); writeFileSync(bad, JSON.stringify({ body: flip }));
  const refused = run('--tris', bad, '--out', join(out, 'bad.glb'));
  assert.equal(refused.code, 2, refused.out); assert.equal(refused.res?.file, null, 'no file for an inside-out asset'); assert.match(refused.out, /Q3/);
  const forced = run('--tris', bad, '--skip-qa', '--out', join(out, 'forced.glb'));
  assert.equal(forced.code, 0, forced.out); assert.ok((forced.res?.unverified as string[]).some((u) => u.includes('--skip-qa')), '--skip-qa must be reported');

  const sheet = join(out, 'sheet.json'); writeFileSync(sheet, JSON.stringify({ flag: [0, 0, 0, 1, 0, 0, 0, 1, 0] }));
  assert.equal(run('--tris', sheet, '--out', join(out, 'sheet.glb')).code, 2, 'a sheet fails Q4 unless named in --open');
  assert.equal(run('--tris', sheet, '--open', 'flag', '--out', join(out, 'sheet.glb')).code, 0, '--open lets a sheet through');

  assert.equal(run().code, 1); assert.equal(run('--tris', bad, '--color', '2,0,0').code, 1, 'colour out of range');
  const missing = run('--module', join(out, 'nope.ts')); assert.equal(missing.code, 1); assert.match(String(missing.res?.error), /cannot build or read/);
}
console.log('GLB OK');
