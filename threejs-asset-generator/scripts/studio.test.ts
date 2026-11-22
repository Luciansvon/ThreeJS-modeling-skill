import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseResult, spawnTsx } from './result';
import type { StudioPose } from './studio/types';

declare global {
  interface Window {
    studioVfxProbe: { readbacks: number; pose?: StudioPose };
  }
}

async function verifyStudioVfx(browserPath: string, studio: string, withoutVfx: string) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: browserPath, headless: true, timeout: 15_000,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.studioVfxProbe = { readbacks: 0 };
      const readback = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        if (this.id === 'view') window.studioVfxProbe.readbacks++;
        return readback.apply(this, args);
      };
    });
    const open = async (file: string) => {
      await page.goto(pathToFileURL(file).href);
      await page.waitForFunction(() => document.documentElement.dataset.studioState !== 'loading');
      assert.deepEqual(await page.evaluate(() => window.threejsStudio?.getErrors()), []);
    };
    const probe = () => page.evaluate(() => window.studioVfxProbe);
    const toggle = page.getByLabel('Studio VFX');
    const scrub = (seconds: number) => page.locator('#scrub').evaluate((element, value) => {
      const slider = element as HTMLInputElement;
      slider.value = String(value);
      slider.dispatchEvent(new Event('input'));
    }, seconds);

    await open(studio);
    assert.equal(await toggle.isChecked(), true, 'Bundled VFX must start enabled');
    assert.equal((await probe()).pose?.clip, null);
    await page.selectOption('#clip', { label: 'Pulse' });
    assert.equal((await probe()).pose?.clip, 'Pulse');
    await scrub(0.5);
    assert.equal((await probe()).pose?.time, 0.5);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => (window.studioVfxProbe.pose?.time ?? 0) > 0.5);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await toggle.uncheck();
    const pausedPose = (await probe()).pose;
    await scrub(0.75);
    assert.deepEqual((await probe()).pose, pausedPose);
    await toggle.check();
    assert.equal((await probe()).pose?.time, 0.75);
    assert.equal((await probe()).readbacks, 0);

    const capture = (vfx: boolean) => page.evaluate((enabled) => window.threejsStudio!.setFrame!({
      view: '34-front', clip: 'Pulse', time: 0.5, vfx: enabled,
    }).vfx, vfx);
    assert.equal(await capture(true), 'visible');
    assert.equal(await capture(false), 'off');
    assert.equal(await toggle.isChecked(), false);
    assert.equal((await probe()).readbacks, 2);

    await open(withoutVfx);
    assert.equal(await toggle.isVisible(), false);
    assert.equal((await probe()).readbacks, 0);
  } finally {
    await browser.close();
  }
}

const temp = realpathSync(tmpdir());
const dir = mkdtempSync(join(temp, 'three studio '));
try {
  const module = join(dir, 'asset builder.ts');
  const out = join(dir, 'review', 'index.html');
  const params = { seed: 0, label: '</script><script>throw new Error("unexpected")</script>' };
  writeFileSync(join(dir, 'material.ts'), `export const colour = '#9012ac';`);
  writeFileSync(module, `
    import * as THREE from 'three';
    import { colour } from './material';
    export function build({ seed, label }: { seed: number, label: string }) {
      const root = new THREE.Mesh(new THREE.BoxGeometry(1 + seed, 1, 1), new THREE.MeshStandardMaterial({ color: colour }));
      root.name = label;
      return root;
    }
  `);
  const pack = spawnTsx(fileURLToPath(new URL('./pack-studio.ts', import.meta.url)), [
    '--module', module, '--params', JSON.stringify(params), '--background', 'light', '--out', out,
  ], { timeout: 15_000 });
  assert.equal(pack.status, 0, pack.stdout + pack.stderr);
  const packed = parseResult(pack.stdout);
  assert.equal(packed?.ok, true);
  assert.equal(packed?.background, 'light');
  assert.deepEqual(packed?.params, params);
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<canvas id="view"/);
  for (const view of ['34-front', '34-back', 'front', 'side', 'back', 'top']) {
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
  assert.match(html, /id="bg-toggle"/);
  assert.match(html, /id="export-glb"/);
  assert.match(html, /id="verify-glb"/);
  assert.match(html, /#9012ac/);
  assert.match(html, /Three\.js license/);
  assert.equal(html.match(/<\/script\s*>/gi)?.length, 1);
  assert.doesNotMatch(html, /<script\b[^>]+src\s*=/i);

  const png = join(dir, 'studio-contact-sheet.png');
  const capture = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
    '--studio', out, '--out', png, '--motion-view', 'side', '--background', 'light', '--browser', join(dir, 'browser-does-not-exist'),
  ], { timeout: 15_000 });
  assert.equal(capture.status, 2, capture.stdout + capture.stderr);
  const captured = parseResult(capture.stdout);
  assert.equal(captured?.status, 'UNVERIFIED');
  assert.equal(captured?.motionView, 'side');
  assert.equal(captured?.background, 'light');
  assert.equal(captured?.out, null);
  assert.equal(existsSync(png), false);

  const badView = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
    '--studio', out, '--out', png, '--motion-view', 'invalid-view',
  ], { timeout: 15_000 });
  assert.equal(badView.status, 1);
  const badBg = spawnTsx(fileURLToPath(new URL('./capture-studio.ts', import.meta.url)), [
    '--studio', out, '--out', png, '--background', 'neon',
  ], { timeout: 15_000 });
  assert.equal(badBg.status, 1);
  console.log('Studio self-contained bundle and browser-unavailable result verified.');

  const browserPath = process.env.THREE_STUDIO_TEST_BROWSER;
  if (browserPath) {
    const animated = join(dir, 'animated.ts');
    const effects = join(dir, 'effect.ts');
    const withVfx = join(dir, 'vfx.html');
    writeFileSync(animated, `
      export function build(params, THREE) {
        const root = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#9012ac' }));
        const track = new THREE.VectorKeyframeTrack('.position', [0, 0.5, 1], [0, 0, 0, 0, 0.2, 0, 0, 0, 0]);
        return { root, animations: [new THREE.AnimationClip('Pulse', 1, [track])] };
      }
    `);
    writeFileSync(effects, `
      export function createEffect({ group, THREE }) {
        const pulse = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24), new THREE.MeshBasicMaterial({ color: '#43edff' }));
        pulse.position.set(0.48, 0.15, 0.4);
        group.add(pulse);
        return { update(pose) {
          window.studioVfxProbe.pose = pose;
          group.visible = pose.clip === 'Pulse' && pose.time > 0;
        } };
      }
    `);
    const bundledVfx = spawnTsx(fileURLToPath(new URL('./pack-studio.ts', import.meta.url)), [
      '--module', animated, '--vfx', effects, '--out', withVfx,
    ], { timeout: 15_000 });
    assert.equal(bundledVfx.status, 0, bundledVfx.stdout + bundledVfx.stderr);
    await verifyStudioVfx(browserPath, withVfx, out);
    console.log('Studio VFX defaults, playback, scrub, toggle, and capture readbacks verified in browser.');
  }
} finally {
  assert.equal(dirname(dir), temp);
  rmSync(dir, { recursive: true, force: true });
}
