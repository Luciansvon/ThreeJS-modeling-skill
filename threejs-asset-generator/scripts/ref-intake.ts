// scripts/ref-intake.ts: reference image(s) or a multi-view turnaround sheet -> ref.json (silhouette masks, aspect, palette). Run ONCE per reference.
//   Separate views:   npx tsx ref-intake.ts front=ref_front.png side=ref_side.png --out ref.json [--tol 40] [--w 1.2 --d 2.5] [--no-flood]
//   Multi-view sheet: npx tsx ref-intake.ts --sheet sheet.png --grid 3x2 --views front,back,top,bottom,side,34 --out ref.json [--tol 18]
// Reads standard 8-bit PNGs without external dependencies; uses `sharp` when installed (required for JPEG/WebP).
// Writes <out-stem>-<view>-mask.png beside --out. LOOK at it once; if the silhouette is wrong, adjust --tol.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { loadSharp } from './sharp';
import { decodePngRgba, writePngRgba } from './png';
import { maskFromRGBA, frameMask, dominantColors, maskToB64, splitGridSheet, fitRgba, type RefData, type View } from './refcheck';
import { emit } from './result';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 && !args[i + 1]?.startsWith('--') ? args[i + 1] : undefined; };
const flag = (k: string) => args.includes('--' + k);
const fail = (error: string): never => { console.error(error); process.exit(emit({ tool: 'ref-intake', ok: false, error }, 1)); };
const out = resolve(opt('out') ?? 'ref.json'), tol = Number(opt('tol') ?? 40), flood = !flag('no-flood');
const sheetFile = opt('sheet'), gridStr = opt('grid') ?? '3x2', viewsStr = opt('views') ?? 'front,back,top,bottom,side,34';
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--no-flood'].includes(args[i - 1]))).map((a) => (a.includes('=') ? a.split('=') : ['front', a]) as [string, string]);

if (flag('out') && !opt('out')) fail('--out needs a file path');
if (!sheetFile && !files.length) {
  fail('usage: tsx ref-intake.ts ([front=]img.png [side=img.png] [top=img.png] | --sheet sheet.png --grid 3x2 --views front,back,top,bottom,side,34) --out ref.json [--tol 40] [--no-flood]');
}

const sharp = await loadSharp();
async function loadImageRgba(file: string, maxDim = 512): Promise<{ rgba: Uint8Array; w: number; h: number }> {
  if (sharp) {
    const { data, info } = await sharp(file).resize(maxDim, maxDim, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { rgba: new Uint8Array(data), w: info.width, h: info.height };
  }
  const decoded = decodePngRgba(readFileSync(file));
  if (!decoded) {
    fail(`cannot decode "${file}" without \`sharp\` (pure-Node reader supports 8-bit PNG only; install sharp via \`npm i sharp\` for JPEG/WebP).`);
  }
  return fitRgba(decoded.rgba, decoded.width, decoded.height, maxDim);
}

const inputs: { view: View; rgba: Uint8Array; w: number; h: number }[] = [];
const VALID_VIEWS = new Set<string>(['front', 'side', 'top', '34', '34_back']);
if (sheetFile) {
  const gm = /^(\d+)x(\d+)$/i.exec(gridStr);
  if (!gm) fail(`--grid must be COLSxROWS (e.g. 3x2), got "${gridStr}"`);
  const cols = Number(gm[1]), rows = Number(gm[2]);
  const full = await loadImageRgba(sheetFile, Math.max(cols, rows) * 512);
  const tiles = splitGridSheet(full.rgba, full.w, full.h, cols, rows);
  const names = viewsStr.split(',').map((s) => s.trim().toLowerCase());
  names.forEach((v, idx) => {
    if (!VALID_VIEWS.has(v) || idx >= tiles.length) return;
    const tile = fitRgba(tiles[idx].rgba, tiles[idx].w, tiles[idx].h, 512);
    inputs.push({ view: v as View, ...tile });
  });
  if (!inputs.length) fail(`--views "${viewsStr}" matched none of front, side, top, 34, 34_back in ${cols}x${rows} grid`);
} else {
  for (const [view, file] of files) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(view)) fail(`invalid view name "${view}"`);
    const img = await loadImageRgba(file, 512);
    inputs.push({ view: view as View, ...img });
  }
}

const ref: RefData = { views: {}, palette: [] }, views: Partial<Record<View, { aspect: number; foreground: number; mask: string }>> = {}, warnings: string[] = [];
const outDir = dirname(out), outStem = parse(out).name;
if (opt('w') || opt('d')) ref.proportions = { w: opt('w') ? Number(opt('w')) : undefined, d: opt('d') ? Number(opt('d')) : undefined };
try {
  if (statSync(out, { throwIfNoEntry: false })?.isDirectory()) throw new Error('--out points to a directory');
  mkdirSync(outDir, { recursive: true });
  for (const { view, rgba, w, h } of inputs) {
    const mask = maskFromRGBA(rgba, w, h, { tol, flood }), { mask: framed, aspect } = frameMask(mask);
    const maskFile = `${outStem}-${view}-mask.png`, maskPath = join(outDir, maskFile);
    ref.views[view] = { w: framed.w, h: framed.h, data: maskToB64(framed), aspect, mask: maskFile };
    if (view === 'front' || !ref.palette.length) ref.palette = dominantColors(rgba, w, h, 6, mask);
    const png = new Uint8Array(framed.data.length * 4);
    framed.data.forEach((v, i) => png.set([v ? 40 : 255, v ? 40 : 255, v ? 40 : 255, 255], i * 4));
    writePngRgba(maskPath, png, framed.w, framed.h);
    const fg = mask.data.reduce((a, b) => a + b, 0) / mask.data.length;
    views[view] = { aspect: +aspect.toFixed(3), foreground: +fg.toFixed(3), mask: maskPath };
    const suspicious = fg < 0.03 || fg > 0.9;
    if (suspicious) warnings.push(`${view}: foreground ${(fg * 100).toFixed(0)}%, check ${maskPath} and adjust --tol`);
    console.log(`${view}: aspect ${aspect.toFixed(2)} (w/h), foreground ${(fg * 100).toFixed(0)}% of the image${suspicious ? '  <- suspicious, inspect mask and adjust --tol' : ''}`);
    console.log('wrote', maskPath);
  }
  writeFileSync(out, JSON.stringify(ref));
} catch (e) {
  fail(`cannot write reference outputs beside ${out}: ${(e as Error).message}`);
}
console.log('palette:', ref.palette.map((c) => `${c.hex} ${(c.share * 100).toFixed(0)}%`).join('  '));
console.log('wrote', out);
process.exit(emit({ tool: 'ref-intake', ok: true, out, views, palette: ref.palette, warnings }));
