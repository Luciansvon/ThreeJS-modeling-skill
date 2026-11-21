// Build the browser-readable references from the canonical harness files.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit } from '../scripts/result';

const harness = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(harness, '..', 'threejs-asset-generator-web');
const destination = join(web, 'references');
const verificationGuides = new Set([
  'references/budget.md',
  'references/export.md',
  'references/glb-export.md',
  'references/qa-gates.md',
  'references/reference-matching.md',
  'references/rig-check.md',
  'references/studio-preview.md',
]);
const languages: Record<string, string> = {
  '.md': 'markdown',
  '.ts': 'typescript',
  '.json': 'json',
  '.html': 'html',
};

function filesIn(folder: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(join(harness, folder), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = folder + '/' + entry.name;
    if (entry.isDirectory()) entries.push(...filesIn(path));
    if (entry.isFile()) entries.push(path);
  }
  return entries.sort();
}

function sourceChapter(path: string): string {
  const source = path === 'THIRD_PARTY_NOTICES.md' ? join(harness, '..', path) : join(harness, path);
  const text = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
  const content = text.endsWith('\n') ? text : text + '\n';
  const innerFences = (content.match(/^~+/gm) ?? []).map((fence) => fence.length);
  const fence = '~'.repeat(Math.max(2, ...innerFences) + 1);
  return [
    '## ' + path,
    '',
    fence + languages[extname(path)] + ' source-excerpt',
    content + fence,
    '',
  ].join('\n');
}

function renderPack(title: string, sources: readonly string[]): string {
  return [
    '# ' + title,
    '',
    'Contents: ' + sources.join(' · '),
    '',
    'Generated from the canonical harness files. Search by original file path and use the [web runtime guide](runtime.md) to choose which commands or helpers to use in this session.',
    '',
    ...sources.map(sourceChapter),
  ].join('\n');
}

function packWeb(check: boolean): number {
  if (!existsSync(join(web, 'SKILL.md'))) {
    throw new Error('Run this tool from a repository checkout that contains both editions.');
  }

  const guides = filesIn('references').filter((path) => path.endsWith('.md'));
  const builders = filesIn('src').filter((path) => path.endsWith('.ts'));
  const tooling = ['package.json', ...filesIn('scripts'), ...filesIn('tools'), ...filesIn('assets')]
    .filter((path) => path !== 'tools/pack-web.ts' && /\.(ts|json|html)$/.test(path));
  const testFiles = [...builders, ...tooling].filter((path) => path.endsWith('.test.ts'));
  const isProductionFile = (path: string) => !path.endsWith('.test.ts') && path !== 'tools/trigger-cases.json';
  const packs = [
    ['modeling-guide.md', 'Harness modeling guide', ['SKILL.md', ...guides.filter((path) => !verificationGuides.has(path))]],
    ['verification-guide.md', 'Harness verification and delivery guide', guides.filter((path) => verificationGuides.has(path))],
    ['source-builders.md', 'Builder and geometry source', builders.filter(isProductionFile)],
    ['source-tools.md', 'Tool and fixture source', tooling.filter(isProductionFile)],
    ['source-tests.md', 'Test source and third-party notices', [...testFiles, 'tools/trigger-cases.json', 'THIRD_PARTY_NOTICES.md']],
  ] as const;
  const outputs = packs.map(([name, title, sources]) => ({
    name,
    text: renderPack(title, sources),
    chapters: sources.length,
  }));
  const stale: string[] = [];
  if (!check) mkdirSync(destination, { recursive: true });
  for (const { name, text } of outputs) {
    const target = join(destination, name);
    const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : undefined;
    if (current === text) continue;
    if (check) stale.push(name);
    else writeFileSync(target, text, 'utf8');
  }

  const chapters = Object.fromEntries(outputs.map(({ name, chapters }) => [name, chapters]));
  const count = Object.values(chapters).reduce((total, value) => total + value, 0);
  if (stale.length) console.log('Stale or missing web references: ' + stale.join(', ') + '. Run npm run pack:web.');
  else console.log((check ? 'Verified ' : 'Packed ') + count + ' source chapters across ' + outputs.length + ' Markdown references.');
  return emit({ tool: 'pack-web', ok: stale.length === 0, check, chapters, stale });
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  process.exit(emit({ tool: 'pack-web', ok: false, error: 'Usage: tsx tools/pack-web.ts [--check]' }, 1));
}
try {
  process.exit(packWeb(args.length === 1));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(emit({ tool: 'pack-web', ok: false, error: message }, 1));
}
