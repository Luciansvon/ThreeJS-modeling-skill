// scripts/ref-intake.ts: reference image(s) -> ref.json (silhouette masks, aspect, palette). Run ONCE per reference.
//   npx tsx ref-intake.ts front=ref_front.png side=ref_side.png --out ref.json [--tol 40] [--w 1.2 --d 2.5]
//   one image with no view name = front. --w / --d: width/height and depth/height you MEASURED on the reference (optional, enables gate G1).
// Needs the `sharp` package. Also writes ref-<view>-mask.png: LOOK at it once; if the silhouette is wrong, raise or lower --tol.
import { writeFileSync } from 'node:fs';
import { loadSharp } from './sharp';
import { maskFromRGBA, frameMask, dominantColors, maskToB64, type RefData, type View } from './refcheck';
import { emit } from './result';

const args = process.argv.slice(2), opt = (k: string) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const out = opt('out') ?? 'ref.json', tol = Number(opt('tol') ?? 40);
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).map((a) => (a.includes('=') ? a.split('=') : ['front', a]) as [string, string]);
if (!files.length) { const e = 'usage: tsx ref-intake.ts [front=]img.png [side=img.png] [top=img.png] --out ref.json'; console.error(e); process.exit(emit({ tool: 'ref-intake', ok: false, error: e }, 1)); }

const sharp = await loadSharp();
if (!sharp) { const e = 'ref-intake needs the `sharp` package (npm i sharp). Without it, convert the image to a raw RGBA buffer yourself and call maskFromRGBA from refcheck.ts.'; console.error(e); process.exit(emit({ tool: 'ref-intake', ok: false, error: e }, 1)); }
const ref: RefData = { views: {}, palette: [] }, views: Record<string, { aspect: number; foreground: number }> = {}, warnings: string[] = [];
if (opt('w') || opt('d')) ref.proportions = { w: opt('w') ? Number(opt('w')) : undefined, d: opt('d') ? Number(opt('d')) : undefined };
for (const [view, file] of files) {
  const { data, info } = await sharp(file).resize(512, 512, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = maskFromRGBA(data, info.width, info.height, { tol }), { mask: framed, aspect } = frameMask(mask);
  ref.views[view as View] = { w: framed.w, h: framed.h, data: maskToB64(framed), aspect };
  if (view === 'front' || !ref.palette.length) ref.palette = dominantColors(data, info.width, info.height, 6, mask);
  const png = new Uint8Array(framed.data.length * 4); framed.data.forEach((v, i) => png.set([v ? 40 : 255, v ? 40 : 255, v ? 40 : 255, 255], i * 4));
  await sharp(png, { raw: { width: framed.w, height: framed.h, channels: 4 } }).png().toFile(`ref-${view}-mask.png`);
  const fg = mask.data.reduce((a, b) => a + b, 0) / mask.data.length;
  views[view] = { aspect: +aspect.toFixed(3), foreground: +fg.toFixed(3) }; if (fg < 0.03 || fg > 0.9) warnings.push(`${view}: foreground ${(fg * 100).toFixed(0)}%, check ref-${view}-mask.png and adjust --tol`);
  console.log(`${view}: aspect ${aspect.toFixed(2)} (w/h), foreground ${(fg * 100).toFixed(0)}% of the image${fg < 0.03 || fg > 0.9 ? '  <- suspicious, check ref-' + view + '-mask.png and adjust --tol' : ''}`);
}
console.log('palette:', ref.palette.map((c) => `${c.hex} ${(c.share * 100).toFixed(0)}%`).join('  '));
writeFileSync(out, JSON.stringify(ref)); console.log('wrote', out);
process.exit(emit({ tool: 'ref-intake', ok: true, out, views, palette: ref.palette, warnings }));
