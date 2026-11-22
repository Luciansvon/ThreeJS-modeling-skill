// scripts/rigcheck.test.ts: R1 to R7 must pass on valid rigged metadata and catch every defect class.
// Run: npx tsx scripts/rigcheck.test.ts
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { rigGates, type RigMeta } from './rigcheck';
import { parseResult, spawnTsx } from './result';

const here = dirname(fileURLToPath(import.meta.url));
const baseMeta = (): RigMeta => ({
  rig: {
    rootNode: 'char_root',
    pivotNames: ['root_body_pivot', 'head_pivot', 'armL_pivot', 'armR_pivot', 'tail_0_pivot'],
    hierarchy: [
      { parent: 'root_body_pivot', child: 'head_pivot' },
      { parent: 'root_body_pivot', child: 'armL_pivot' },
      { parent: 'root_body_pivot', child: 'armR_pivot' },
      { parent: 'root_body_pivot', child: 'tail_0_pivot' },
    ],
    restLocalPositions: {
      root_body_pivot: [0, 0.24, 0], head_pivot: [0, 0.24, 0],
      armL_pivot: [0.12, 0.2, 0], armR_pivot: [-0.12, 0.2, 0], tail_0_pivot: [0, 0.03, -0.1],
    },
  },
  animations: [
    { name: 'CuriousIdle', durationSeconds: 3.6, loop: true, expression: 'neutral', tracks: [
      { name: 'root_body_pivot.position', times: [0, 0.5, 1.0], values: [0, 0.24, 0, 0, 0.25, 0, 0, 0.24, 0] },
      { name: 'head_pivot.quaternion', times: [0, 1.0], values: [0, 0, 0, 1, 0, 0.1, 0, 0.995] },
    ] },
    { name: 'BouncyRun', durationSeconds: 0.72, loop: true, expression: 'happy' },
    { name: 'Slide', durationSeconds: 0.85, loop: false, expression: 'focused' },
  ],
  face: {
    defaultExpressionInGlb: 'neutral',
    textureResolution: [512, 512],
    expressions: ['neutral', 'happy', 'focused'],
    animationExpressionMapping: { CuriousIdle: 'neutral', BouncyRun: 'happy', Slide: 'focused' },
  },
  qa: { maxHorizDrift: 0, slideDropPct: 26, slideMinY: -0.008 },
});

const failedNames = (m: RigMeta) => rigGates(m).gates.filter((g) => !g.pass).map((g) => g.gate);

// 1. valid character passes all 7 gates
assert.deepEqual(failedNames(baseMeta()), [], 'valid rig passes R1 to R7');
const valid = rigGates(baseMeta());
assert.equal(valid.gates.length, 7, 'valid rig evaluates all seven gates');
assert.deepEqual(valid.skipped, [], 'valid rig has complete evidence');

// 2. each defect triggers its own gate
const cyclic = baseMeta(); cyclic.rig!.hierarchy!.push({ parent: 'head_pivot', child: 'root_body_pivot' });
assert.ok(failedNames(cyclic).includes('R1 hierarchy'), 'cycle caught by R1');

const badRest = baseMeta(); badRest.rig!.restLocalPositions!.head_pivot = [0, NaN, 0];
assert.ok(failedNames(badRest).includes('R2 rest-pose'), 'NaN rest position caught by R2');

const hasRef = baseMeta(); hasRef.animations!.push({ name: 'RefPose', durationSeconds: 1.0 });
assert.ok(failedNames(hasRef).includes('R3 clips'), 'RefPose leak caught by R3');

const drift = baseMeta(); drift.animations![0].tracks![0].values = [0, 0.24, 0, 0.15, 0.25, 0, 0, 0.24, 0];
assert.ok(failedNames(drift).includes('R4 tracks & drift'), 'horizontal drift caught by R4');

const nonMono = baseMeta(); nonMono.animations![0].tracks![0].times = [0, 0.5, 0.5];
assert.ok(failedNames(nonMono).includes('R4 tracks & drift'), 'duplicate timestamp caught by R4');

const shortTrack = baseMeta(); shortTrack.animations![0].tracks![0].values = [0, 0.24, 0];
assert.ok(failedNames(shortTrack).includes('R4 tracks & drift'), 'three position timestamps require nine values');

const shortRotation = baseMeta(); shortRotation.animations![0].tracks![1].values = [0, 0, 0, 1];
assert.ok(failedNames(shortRotation).includes('R4 tracks & drift'), 'two quaternion timestamps require eight values');

const negativeDrift = baseMeta(); negativeDrift.qa!.maxHorizDrift = -1;
assert.ok(failedNames(negativeDrift).includes('R4 tracks & drift'), 'negative drift magnitude is invalid');

const badExpr = baseMeta(); badExpr.face!.animationExpressionMapping!.Slide = 'angry';
assert.ok(failedNames(badExpr).includes('R5 expressions'), 'unmapped expression caught by R5');

const partialFace = baseMeta(); delete partialFace.face!.textureResolution;
const partialFaceResult = rigGates(partialFace);
assert.ok(!partialFaceResult.gates.some((g) => g.gate === 'R5 expressions'), 'missing resolution cannot pass the full expression gate');
assert.ok(partialFaceResult.skipped.some((s) => s.includes('textureResolution')), 'missing expression resolution is reported');
partialFace.face!.animationExpressionMapping!.Slide = 'angry';
assert.ok(failedNames(partialFace).includes('R5 expressions'), 'a known mapping failure stays a failure with partial data');

const badSlide = baseMeta(); badSlide.qa!.slideMinY = -0.04;
assert.ok(failedNames(badSlide).includes('R6 slide clearance'), 'floor-clipping slide caught by R6');

const partialSlide = baseMeta(); delete partialSlide.qa!.slideMinY;
const partialResult = rigGates(partialSlide);
assert.ok(!partialResult.gates.some((g) => g.gate === 'R6 slide clearance'), 'one valid slide measure cannot pass the full gate');
assert.ok(partialResult.skipped.some((s) => s.includes('slideMinY')), 'missing slide measure is reported');
partialSlide.qa!.slideDropPct = 10;
assert.ok(failedNames(partialSlide).includes('R6 slide clearance'), 'a known slide failure stays a failure with partial data');

// 3. CLI end-to-end
const dir = mkdtempSync(join(tmpdir(), 'rigcheck-'));
const goodFile = join(dir, 'good.json'), badFile = join(dir, 'bad.json');
writeFileSync(goodFile, JSON.stringify(baseMeta()));
writeFileSync(badFile, JSON.stringify(badSlide));
const run = (...a: string[]) => spawnTsx(join(here, 'rig-check.ts'), a);
const ok = run('--meta', goodFile); assert.equal(ok.status, 0, ok.stdout + ok.stderr);
assert.equal(parseResult(ok.stdout)!.ok, true);
const no = run('--meta', badFile); assert.equal(no.status, 2, no.stdout + no.stderr);
assert.equal(parseResult(no.stdout)!.ok, false);
const miss = run(); assert.equal(miss.status, 1);

// 4. v4.2: malformed hierarchy map fails cleanly (no crash), creature multi-pivot rig (44 pivots), motionMode=free, general clipMinY
{
  const badMap = baseMeta();
  (badMap.rig as unknown as Record<string, unknown>).hierarchy = { head_pivot: 'root_body_pivot' };
  const mapRes = rigGates(badMap);
  assert.ok(mapRes.gates.some((g) => g.gate === 'R1 hierarchy' && !g.pass && /array of \{ parent, child \}/.test(g.value)), 'non-array hierarchy reports clean R1 failure');

  // 44-pivot kraken/spider creature rig
  const krakenPivots = ['root'];
  const krakenEdges: { parent: string; child: string }[] = [];
  const krakenRest: Record<string, number[]> = { root: [0, 1, 0] };
  for (let arm = 0; arm < 8; arm++) {
    let prev = 'root';
    for (let seg = 0; seg < 5; seg++) {
      const name = `tentacle_${arm}_${seg}`;
      krakenPivots.push(name);
      krakenEdges.push({ parent: prev, child: name });
      krakenRest[name] = [0.2, 0, 0.2];
      prev = name;
    }
  }
  const krakenMeta: RigMeta = {
    rig: { pivotNames: krakenPivots, hierarchy: krakenEdges, restLocalPositions: krakenRest },
    animations: [{
      name: 'SwimSway', durationSeconds: 2.0, loop: true,
      tracks: [
        { name: 'root.position', times: [0, 1, 2], values: [0, 1, 0, 0.25, 1.15, -0.18, 0, 1, 0] },
        { name: 'tentacle_0_0.quaternion', times: [0, 1, 2], values: [0, 0, 0, 1, 0, 0.2, 0, 0.98, 0, 0, 0, 1] },
      ],
    }],
    qa: { clipMinY: 0.05 },
  };
  assert.ok(rigGates(krakenMeta).gates.some((g) => g.gate === 'R1 hierarchy' && !g.pass), 'hero default max 16 rejects 41 pivots');
  const krakenPass = rigGates(krakenMeta, { kind: 'creature', motionMode: 'free' });
  assert.deepEqual(krakenPass.gates.filter((g) => !g.pass), [], 'creature kind + free motion passes 41-pivot kraken with root sway & floor clearance');
  const krakenFile = join(dir, 'kraken.json');
  writeFileSync(krakenFile, JSON.stringify(krakenMeta));
  const kCli = run('--meta', krakenFile, '--kind', 'creature', '--motion', 'free');
  assert.equal(kCli.status, 0, kCli.stdout + kCli.stderr);
}

// 5. v4.3.3: Euler rotation tracks fail R4; static clips fail R7 unless listed in staticClips / --static-clips
{
  const eulerMeta = baseMeta();
  eulerMeta.animations![0].tracks!.push({ name: 'head_pivot.rotation[x]', times: [0, 1], values: [0, 0.5] });
  const eulerRes = rigGates(eulerMeta);
  const r4 = eulerRes.gates.find((g) => g.gate === 'R4 tracks & drift')!;
  assert.equal(r4.pass, false, 'Euler rotation track must fail R4');
  assert.match(r4.value, /Euler|\.quaternion/);

  const staticMeta = baseMeta();
  staticMeta.animations = [{
    name: 'Hold', durationSeconds: 1.0, loop: true, expression: 'neutral',
    tracks: [{ name: 'head_pivot.quaternion', times: [0, 0.5, 1.0], values: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }],
  }];
  assert.ok(failedNames(staticMeta).includes('R7 clip motion'), 'static clip holding first key fails R7');
  const holdFile = join(dir, 'hold.json');
  writeFileSync(holdFile, JSON.stringify(staticMeta));
  const holdFail = run('--meta', holdFile);
  assert.equal(holdFail.status, 2, 'CLI fails on static clip without --static-clips');

  const holdCliOk = run('--meta', holdFile, '--static-clips', 'Hold');
  assert.equal(holdCliOk.status, 0, holdCliOk.stdout + holdCliOk.stderr);
  assert.equal(parseResult(holdCliOk.stdout)!.ok, true);

  staticMeta.qa!.staticClips = ['Hold'];
  assert.deepEqual(failedNames(staticMeta), [], 'qa.staticClips allows intentional static clip');
}

console.log('RIGCHECK OK');
