// scripts/ref-compare.ts: your generator's triangles vs ref.json. Run after EVERY build step (it takes well under a second).
//   1. In your generator test/driver write the result:  fs.writeFileSync('tris.json', JSON.stringify({ tris, colors: ['#8a5a2b', ...] }))
//      tris = all triangles in asset space (kernel output, or groupToTris(root) from references/reference-matching.md), colors = hex colours you used.
//   2. npx tsx ref-compare.ts ref.json tris.json        -> prints PASS/FAIL per gate, writes diff-<view>.png (red = reference only, blue = model only)
import { readFileSync } from 'node:fs';
import { scaleNearestRgba, writePngRgba } from './png';
import { compareToRef, formatGates, RES, type RefData } from './refcheck';
import { emit } from './result';

const [refFile = 'ref.json', trisFile = 'tris.json'] = process.argv.slice(2);
let ref: RefData, model: { tris: number[]; colors?: string[] };
try { ref = JSON.parse(readFileSync(refFile, 'utf8')); model = JSON.parse(readFileSync(trisFile, 'utf8')); } catch (e) { console.error(`cannot read ${refFile} / ${trisFile}: ${(e as Error).message}`); process.exit(emit({ tool: 'ref-compare', ok: false, error: (e as Error).message }, 1)); }
const { gates, diffs } = compareToRef(model.tris, ref, model.colors ?? []);
console.log(formatGates(gates));
const written: string[] = [];
for (const [view, rgba] of Object.entries(diffs)) {
  const f = `diff-${view}.png`, up = scaleNearestRgba(rgba, RES, RES, 4);
  writePngRgba(f, up, RES * 4, RES * 4);
  written.push(f);
  console.log('wrote', f);
}
const failed = gates.filter((g) => !g.pass);
console.log(failed.length ? `\n${failed.length} gate(s) failing. Fix the FIRST failing gate only, then run again.` : '\nAll numeric gates pass. Do the visual checklist (G4) next.');
process.exit(emit({ tool: 'ref-compare', ok: failed.length === 0, gates, failed: failed.length, diffs: written }));
