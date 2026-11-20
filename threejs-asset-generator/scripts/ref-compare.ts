// scripts/ref-compare.ts: your generator's triangles vs ref.json. Run after EVERY build step (it takes well under a second).
//   1. In your generator test/driver write the result:  fs.writeFileSync('tris.json', JSON.stringify({ tris, colors: ['#8a5a2b', ...] }))
//      tris = all triangles in asset space (kernel output, or groupToTris(root) from references/reference-matching.md), colors = hex colours you used.
//   2. npx tsx ref-compare.ts ref.json tris.json        -> prints PASS/FAIL per gate, writes diff-<view>.png (red = reference only, blue = model only)
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSharp } from './sharp';
import { compareToRef, formatGates, type RefData } from './refcheck';
import { emit } from './result';

const [refFile = 'ref.json', trisFile = 'tris.json'] = process.argv.slice(2);
let ref: RefData, model: { tris: number[]; colors?: string[] };
try { ref = JSON.parse(readFileSync(refFile, 'utf8')); model = JSON.parse(readFileSync(trisFile, 'utf8')); } catch (e) { console.error(`cannot read ${refFile} / ${trisFile}: ${(e as Error).message}`); process.exit(emit({ tool: 'ref-compare', ok: false, error: (e as Error).message }, 1)); }
const { gates, diffs } = compareToRef(model.tris, ref, model.colors ?? []);
console.log(formatGates(gates));
const sharp = await loadSharp(); if (!sharp) console.log('(sharp missing: diff PNGs skipped)');
if (sharp) for (const [view, rgba] of Object.entries(diffs)) { const f = `diff-${view}.png`; await sharp(rgba, { raw: { width: 64, height: 64, channels: 4 } }).resize(256, 256, { kernel: 'nearest' }).png().toFile(f); console.log('wrote', f); }
const failed = gates.filter((g) => !g.pass); console.log(failed.length ? `\n${failed.length} gate(s) failing. Fix the FIRST failing gate only, then run again.` : '\nAll numeric gates pass. Do the visual checklist (G4) next.');
process.exit(emit({ tool: 'ref-compare', ok: failed.length === 0, gates, failed: failed.length, diffs: sharp ? Object.keys(diffs).map((v) => `diff-${v}.png`) : [] }));
