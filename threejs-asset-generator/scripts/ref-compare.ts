// Compare geometry and palette with ref.json when those features change.
//   1. Write the same triangle formats as qa-asset and mesh-stats. Add hex colors to { tris, colors } or { parts, colors } for G3.
//   2. npx tsx ref-compare.ts ref.json tris.json        -> prints PASS/FAIL per gate, writes diff-<view>.png (red = reference only, blue = model only)
import { readFileSync } from 'node:fs';
import { scaleNearestRgba, writePngRgba } from './png';
import { compareToRef, formatGates, RES, type RefData } from './refcheck';
import { flatten, normalizeParts } from './qacheck';
import { emit } from './result';

const [refFile = 'ref.json', trisFile = 'tris.json'] = process.argv.slice(2);
const fail = (error: string): never => { console.error(error); process.exit(emit({ tool: 'ref-compare', ok: false, error }, 1)); };
let compared: ReturnType<typeof compareToRef>;
try {
  const ref = JSON.parse(readFileSync(refFile, 'utf8')) as RefData;
  const model = JSON.parse(readFileSync(trisFile, 'utf8'));
  const parts = normalizeParts(model);
  const tris = flatten(parts);
  if (!tris.length || Object.values(parts).some((part) => part.length % 9 || !part.every(Number.isFinite))) {
    throw new Error('model needs finite coordinates in groups of nine per triangle');
  }
  const colors = Array.isArray(model?.colors) ? model.colors.filter((color: unknown): color is string => typeof color === 'string') : [];
  compared = compareToRef(tris, ref, colors);
} catch (e) {
  fail(`cannot compare ${refFile} and ${trisFile}: ${(e as Error).message}`);
}
const { gates, diffs, angles } = compared;
console.log(formatGates(gates));
const written: string[] = [];
for (const [view, rgba] of Object.entries(diffs)) {
  const f = `diff-${view}.png`, up = scaleNearestRgba(rgba, RES, RES, 4);
  try { writePngRgba(f, up, RES * 4, RES * 4); }
  catch (e) { fail(`cannot write ${f}: ${(e as Error).message}`); }
  written.push(f);
  console.log('wrote', f);
}
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} numeric check(s) failed. Inspect the relevant view and compare it with the reference.` : '\nNumeric checks passed. Compare the rendered identifying features with the reference (G4).');
process.exit(emit({ tool: 'ref-compare', ok: failed.length === 0, gates, failed: failed.length, diffs: written, angles }));
