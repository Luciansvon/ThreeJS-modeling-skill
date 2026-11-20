// scripts/rigcheck.test.ts: R1 to R6 must pass on valid rigged metadata and catch every defect class.
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

// 1. valid character passes all 6 gates
assert.deepEqual(failedNames(baseMeta()), [], 'valid rig passes R1 to R6');

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

const badExpr = baseMeta(); badExpr.face!.animationExpressionMapping!.Slide = 'angry';
assert.ok(failedNames(badExpr).includes('R5 expressions'), 'unmapped expression caught by R5');

const badSlide = baseMeta(); badSlide.qa!.slideMinY = -0.04;
assert.ok(failedNames(badSlide).includes('R6 slide clearance'), 'floor-clipping slide caught by R6');

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

console.log('RIGCHECK OK');
