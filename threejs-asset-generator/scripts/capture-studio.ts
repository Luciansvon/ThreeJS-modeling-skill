import { constants } from 'node:fs';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import { delimiter, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Browser, Page } from 'playwright-core';
import { decodePngRgba, encodePngRgba } from './png';
import { emit } from './result';
import type { StudioFrame, StudioFrameEvidence, StudioInfo } from './studio/types';

const usage = 'Usage: tsx scripts/capture-studio.ts --studio ./index.html --out studio-contact-sheet.png [--locomotion Clip] [--action Clip --peak seconds] [--vfx] [--browser executable]';
const tool = 'capture-studio';
const viewport = { width: 960, height: 600 };
type Issue = { kind: string; message: string; source?: string };
type MissingTile = { label: string; reason: string; status: 'UNVERIFIED' | 'NOT_APPLICABLE' };
type Tile = { label: string; status: 'CAPTURED'; evidence: StudioFrameEvidence } | (MissingTile & { evidence: null });
type PlannedTile = { label: string; frame: StudioFrame } | MissingTile;

async function installedBrowsers(explicit?: string) {
  const installDirs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA];
  const windows = installDirs.filter((path): path is string => Boolean(path)).flatMap((path) => [
    join(path, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(path, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]);
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  const names = process.platform === 'win32'
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : ['google-chrome', 'microsoft-edge', 'microsoft-edge-stable', 'chromium', 'chromium-browser'];
  const fromPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((path) => names.map((name) => join(path, name)));
  const candidates = explicit ? [resolve(explicit)] : [...new Set([
    ...(process.platform === 'win32' ? windows : process.platform === 'darwin' ? mac : []), ...fromPath,
  ])];
  const found = await Promise.all(candidates.map(async (path) => {
    try {
      await access(path, constants.X_OK);
      return (await stat(path)).isFile() ? path : null;
    } catch { return null; }
  }));
  return found.filter((path): path is string => path !== null);
}

function planTiles(info: StudioInfo, locomotion?: string, action?: string, peak?: number, vfx = false): PlannedTile[] {
  const hasAnimations = info.clips.some((clip) => clip.duration > 0 && clip.tracks > 0);
  const findClip = (name: string | undefined) => {
    const matches = info.clips.filter((clip) => clip.name === name);
    const clip = matches[0];
    return matches.length === 1 && clip.duration > 0 && clip.tracks > 0 ? clip : undefined;
  };
  const walk = findClip(locomotion), attack = findClip(action);
  const notApplicable = (label: string): MissingTile => ({
    label, status: 'NOT_APPLICABLE', reason: 'This asset has no positive-duration animation clips.',
  });
  const unverified = (label: string, reason: string): MissingTile => ({ label, reason, status: 'UNVERIFIED' });
  const missing = (name: string | undefined, option: string) => name === undefined
    ? `Select an exact animated clip with ${option}.`
    : `No unique, positive-duration animated clip named “${name}”.`;
  let midway: PlannedTile;
  if (walk) midway = { label: 'Mid locomotion', frame: { view: '34-front', clip: walk.name, time: walk.duration / 2 } };
  else if (!hasAnimations && locomotion === undefined) midway = notApplicable('Mid locomotion');
  else midway = unverified('Mid locomotion', missing(locomotion, '--locomotion'));
  let actionTile: PlannedTile;
  if (!hasAnimations && action === undefined && peak === undefined && !vfx) actionTile = notApplicable('Action peak');
  else if (!attack) actionTile = unverified('Action peak', missing(action, '--action'));
  else if (peak === undefined || peak > attack.duration) {
    actionTile = unverified('Action peak', `Set --peak to the authored peak time within 0–${attack.duration} seconds.`);
  } else actionTile = { label: 'Action peak', frame: { view: '34-front', clip: attack.name, time: peak, vfx } };
  return [
    { label: '3/4 front', frame: { view: '34-front' } },
    { label: '3/4 back', frame: { view: '34-back' } },
    midway, actionTile,
  ];
}

async function placeholder(page: Page, tile: MissingTile) {
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    body { margin: 0; background: #131b26; color: #f0f4f9; font: 20px system-ui, sans-serif; }
    main { margin: 130px 90px; }
    h1 { font-size: 32px; margin-bottom: 14px; }
    strong { color: #ffcd90; }
    p { color: #aebdd0; overflow-wrap: anywhere; }
    </style></head><body><main><h1></h1><strong></strong><p></p></main></body></html>`);
  await page.evaluate(({ label, reason, status }) => {
    document.querySelector('h1')!.textContent = label;
    document.querySelector('strong')!.textContent = status === 'NOT_APPLICABLE' ? 'NOT APPLICABLE' : status;
    document.querySelector('p')!.textContent = reason;
  }, tile);
  return page.screenshot({ animations: 'disabled', timeout: 8000 });
}

function contactSheet(tiles: Buffer[]) {
  const { width, height } = viewport;
  const stride = width * 2 * 4;
  const rgba = new Uint8Array(stride * height * 2);
  for (const [index, input] of tiles.entries()) {
    const tile = decodePngRgba(input);
    if (!tile || tile.width !== width || tile.height !== height) throw new Error(`Could not decode the ${width} × ${height} PNG for tile ${index + 1}`);
    const start = (index % 2) * width * 4 + Math.floor(index / 2) * height * stride;
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      rgba.set(tile.rgba.subarray(row, row + width * 4), start + y * stride);
    }
  }
  return encodePngRgba(rgba, width * 2, height * 2);
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

async function main() {
  const { values } = parseArgs({ options: {
    studio: { type: 'string' }, out: { type: 'string' }, locomotion: { type: 'string' },
    action: { type: 'string' }, peak: { type: 'string' }, vfx: { type: 'boolean' }, browser: { type: 'string' },
  } });
  if (!values.studio || !values.out) throw new Error(usage);
  if (extname(values.out).toLowerCase() !== '.png') throw new Error('--out must end in .png');
  const studio = resolve(values.studio), out = resolve(values.out);
  if (extname(studio).toLowerCase() !== '.html' || !(await stat(studio)).isFile()) throw new Error('--studio must point to a local HTML file');
  const peak = values.peak === undefined ? undefined : Number(values.peak);
  if (peak !== undefined && (!values.peak?.trim() || !Number.isFinite(peak) || peak < 0)) {
    throw new Error('--peak must be a finite non-negative time in seconds');
  }

  const errors: Issue[] = [], warnings: Issue[] = [], launchErrors: Issue[] = [];
  const unverified: string[] = [], tiles: Tile[] = [];
  let browserPath: string | undefined, info: StudioInfo | undefined, written: number | undefined;
  let status: 'PASS' | 'FAIL' | 'UNVERIFIED' = 'UNVERIFIED';
  function finish() {
    for (const error of errors) console.error(`${error.kind}: ${error.message}`);
    for (const reason of unverified) console.log(`UNVERIFIED: ${reason}`);
    if (written) console.log(`Wrote ${out} (${written} bytes, ${viewport.width * 2} × ${viewport.height * 2})`);
    return emit({
      tool, ok: status === 'PASS', status, studio, out: written ? out : null, bytes: written ?? 0,
      browser: browserPath, info, tiles, errors, warnings, launchErrors, unverified,
    });
  }
  function addIssue(list: Issue[], issue: Issue) {
    if (!list.some(({ kind, message, source }) => kind === issue.kind && message === issue.message && source === issue.source)) list.push(issue);
  }

  const candidates = await installedBrowsers(values.browser);
  if (!candidates.length) {
    unverified.push(values.browser
      ? `Browser executable not found: ${resolve(values.browser)}`
      : 'No local Chrome, Edge, or Chromium executable found. Supply --browser <path>.');
    return finish();
  }
  let chromium: typeof import('playwright-core').chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch (error) {
    unverified.push(`Browser driver unavailable (${messageOf(error)}). Install optional dependencies to enable capture.`);
    return finish();
  }

  let browser: Browser | undefined;
  for (const executablePath of candidates) {
    try {
      browser = await chromium.launch({
        executablePath, headless: true, timeout: 12_000,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
      browserPath = executablePath;
      break;
    } catch (error) { launchErrors.push({ kind: 'browser-launch', source: executablePath, message: messageOf(error) }); }
  }
  if (!browser) {
    unverified.push('The browser executable could not start. See launchErrors for details.');
    return finish();
  }

  let activePage: Page | undefined;
  async function capture(browser: Browser) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'en-US', serviceWorkers: 'block' });
    activePage = page;
    const studioUrl = pathToFileURL(studio).href;
    page.on('console', (event) => {
      if (event.type() !== 'error' && event.type() !== 'warning') return;
      const location = event.location();
      const source = location.url ? `${location.url}:${location.lineNumber + 1}` : undefined;
      const kind = event.type() === 'error' ? 'console-error' : 'console-warning';
      addIssue(event.type() === 'error' ? errors : warnings, { kind, source, message: event.text() });
    });
    page.on('pageerror', (error) => addIssue(errors, { kind: 'pageerror', message: error.message }));
    page.on('crash', () => addIssue(errors, { kind: 'crash', message: 'Studio page crashed' }));
    page.on('requestfailed', (request) => addIssue(errors, {
      kind: 'resource', source: request.url(), message: request.failure()?.errorText ?? 'Resource request failed',
    }));
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('file:') && url !== studioUrl) addIssue(errors, { kind: 'resource', source: url, message: 'Studio requested a separate local file' });
    });
    await page.route(/^https?:\/\//i, (route) => {
      addIssue(errors, { kind: 'network', source: route.request().url(), message: 'Studio requested an external resource during offline capture' });
      return route.abort();
    });
    await page.goto(studioUrl, { waitUntil: 'load', timeout: 18_000 });
    await page.waitForFunction(() => document.documentElement.dataset.studioState !== 'loading', null, { timeout: 18_000 });
    const boot = await page.evaluate(() => ({
      info: window.threejsStudio?.version === 1 ? window.threejsStudio.info?.() : undefined,
      diagnostics: window.threejsStudio?.getErrors?.() ?? [],
      state: document.documentElement.dataset.studioState,
    }));
    info = boot.info;
    for (const diagnostic of boot.diagnostics) addIssue(errors, diagnostic);
    if (boot.state !== 'ready' || !info) {
      if (boot.diagnostics.length && boot.diagnostics.every(({ kind }) => kind === 'webgl')) {
        unverified.push('WebGL did not initialize. No model frames were captured.');
      } else {
        if (!errors.length) addIssue(errors, { kind: 'studio', message: 'The page did not expose a ready Three.js Studio capture API' });
        status = 'FAIL';
      }
      return;
    }

    const plan = planTiles(info, values.locomotion, values.action, peak, values.vfx);
    const frames: Buffer[] = [];
    let fallback: Page | undefined;
    for (const tile of plan) {
      if ('reason' in tile) {
        if (tile.status === 'UNVERIFIED') unverified.push(`${tile.label}: ${tile.reason}`);
        tiles.push({ ...tile, evidence: null });
        fallback ??= await browser.newPage({ viewport, deviceScaleFactor: 1 });
        frames.push(await placeholder(fallback, tile));
        continue;
      }
      const evidence = await page.evaluate((frame) => {
        if (!window.threejsStudio?.setFrame) throw new Error('Studio capture API does not expose setFrame');
        const result = window.threejsStudio.setFrame(frame);
        if (document.documentElement.dataset.studioState !== 'ready') {
          throw new Error(window.threejsStudio.getErrors().map(({ message }) => message).join(', ') || 'Studio frame could not render');
        }
        return result;
      }, { ...tile.frame, label: tile.label });
      frames.push(await page.screenshot({ animations: 'disabled', timeout: 8000 }));
      tiles.push({ label: tile.label, status: 'CAPTURED', evidence });
    }
    if (values.vfx) {
      const vfxEvidence = tiles[3]?.evidence?.vfx;
      if (vfxEvidence === 'unavailable') unverified.push('Action VFX: the studio has no supplied VFX module.');
      else if (vfxEvidence === 'no-visible-change') unverified.push('Action VFX: enabling the effect did not change any canvas pixels at the requested time.');
      else if (!vfxEvidence) unverified.push('Action VFX: no action frame was available.');
    }
    const diagnostics = await page.evaluate(() => window.threejsStudio?.getErrors?.() ?? []);
    for (const diagnostic of diagnostics) addIssue(errors, diagnostic);
    const png = contactSheet(frames);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, png);
    written = png.byteLength;
    status = errors.length ? 'FAIL' : unverified.length ? 'UNVERIFIED' : 'PASS';
  }

  try {
    await capture(browser);
  } catch (error) {
    addIssue(errors, { kind: 'capture', message: messageOf(error) });
    const diagnostics = await activePage?.evaluate(() => window.threejsStudio?.getErrors?.() ?? []).catch(() => []);
    for (const diagnostic of diagnostics ?? []) addIssue(errors, diagnostic);
    status = 'FAIL';
  } finally {
    await browser.close().catch((error) => {
      addIssue(errors, { kind: 'browser-close', message: messageOf(error) });
      status = 'FAIL';
    });
  }
  return finish();
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = messageOf(error);
  console.error(message);
  process.exitCode = emit({ tool, ok: false, error: message }, 1);
}
