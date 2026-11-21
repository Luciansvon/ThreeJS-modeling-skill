import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { emit } from './result';
import type { StudioConfig } from './studio/types';

const usage = 'Usage: tsx scripts/pack-studio.ts --module ./asset.ts [--export buildAsset] [--params json] [--vfx ./effect.ts] [--vfx-export createStudioVfx] [--margin 1.18] [--front-side left|right] --out index.html';
const harness = fileURLToPath(new URL('../', import.meta.url));
const scriptImport = (path: string) => JSON.stringify(process.platform === 'win32' ? path.replace(/\\/g, '/') : path);

async function main() {
  const { values } = parseArgs({ options: {
    module: { type: 'string' }, export: { type: 'string' }, params: { type: 'string' },
    out: { type: 'string' }, vfx: { type: 'string' }, 'vfx-export': { type: 'string' },
    margin: { type: 'string' }, 'front-side': { type: 'string' },
  } });
  if (!values.module || !values.out) throw new Error(usage);
  if (extname(values.out).toLowerCase() !== '.html') throw new Error('--out must end in .html');
  if (values['vfx-export'] && !values.vfx) throw new Error('--vfx-export requires --vfx <module>');

  let params: unknown;
  try {
    params = JSON.parse(values.params ?? '{}');
  } catch (error) {
    throw new Error(`--params is not valid JSON: ${(error as Error).message}`);
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('--params must be a JSON object');
  const margin = Number(values.margin ?? 1.18);
  if (!Number.isFinite(margin) || margin < 1) throw new Error('--margin must be a finite number at least 1');
  const frontSide = values['front-side'] ?? 'left';
  if (frontSide !== 'left' && frontSide !== 'right') throw new Error('--front-side must be left or right');

  const modulePath = resolve(values.module);
  const vfxPath = values.vfx && resolve(values.vfx);
  const out = resolve(values.out);
  const config: StudioConfig = {
    module: basename(modulePath), builder: values.export, params: params as Record<string, unknown>, margin, frontSide,
  };
  const runtime = fileURLToPath(new URL('./studio/runtime.ts', import.meta.url));
  const configJson = JSON.stringify(config);
  // Parse the JSON string to preserve parameter names such as "__proto__" as own properties.
  const entry = `
    import { startStudio } from ${scriptImport(runtime)};
    await startStudio(
      JSON.parse(${JSON.stringify(configJson)}),
      () => import(${scriptImport(modulePath)}),
      ${vfxPath ? `() => import(${scriptImport(vfxPath)})` : 'undefined'},
      ${JSON.stringify(values['vfx-export']) ?? 'undefined'},
    );
  `;

  const { build } = await import('esbuild');
  const skipCanonicalResolve = Symbol('studio-three-resolve');
  const bundle = await build({
    stdin: { contents: entry, loader: 'ts', sourcefile: 'studio-entry.ts', resolveDir: harness },
    bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
    minify: true, legalComments: 'inline', logLevel: 'silent', write: false, metafile: true,
    absWorkingDir: harness,
    loader: Object.fromEntries(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ktx2'].map((ext) => [ext, 'dataurl'])),
    plugins: [{
      name: 'studio-three',
      setup(build) {
        // The studio, asset, and addons share the same Three.js instance, even for external asset paths.
        build.onResolve({ filter: /^three(?:\/|$)/ }, (args) => {
          if (args.pluginData === skipCanonicalResolve) return;
          return build.resolve(args.path, { kind: args.kind, resolveDir: harness, pluginData: skipCanonicalResolve });
        });
      },
    }],
  });
  const external = Object.values(bundle.metafile.outputs).flatMap((output) => output.imports.map((item) => item.path));
  if (external.length) throw new Error(`Studio cannot bundle external imports: ${external.join(', ')}`);
  if (bundle.outputFiles.length !== 1) throw new Error('Studio bundle must contain one inline script');
  const script = bundle.outputFiles[0].text;
  if (/<\/script/i.test(script)) throw new Error('Studio bundle contains an unescaped script closing tag');
  const template = await readFile(new URL('./studio/index.html', import.meta.url), 'utf8');
  const threeEntry = createRequire(import.meta.url).resolve('three');
  const license = await readFile(resolve(dirname(threeEntry), '..', 'LICENSE'), 'utf8');
  const html = template.replace('<!-- THREE_LICENSE -->', () => `<!-- Three.js license\n${license.trim()}\n-->`)
    .replace('/* STUDIO_BUNDLE */', () => script);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, 'utf8');

  for (const warning of bundle.warnings) console.warn(`esbuild: ${warning.text}`);
  console.log(`Wrote ${out} (${Buffer.byteLength(html)} bytes)`);
  const unverified = ['Browser render and capture; run capture-studio to verify'];
  console.log(`UNVERIFIED: ${unverified[0]}`);
  return emit({
    tool: 'pack-studio', ok: true, out, bytes: Buffer.byteLength(html), module: modulePath,
    builder: config.builder ?? null, params: config.params, vfx: vfxPath || null, margin, frontSide,
    unverified,
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = emit({ tool: 'pack-studio', ok: false, error: message }, 1);
}
