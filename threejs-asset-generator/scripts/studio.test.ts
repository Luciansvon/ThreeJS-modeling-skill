import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResult, spawnTsx } from './result';

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
} finally {
  assert.equal(dirname(dir), temp);
  rmSync(dir, { recursive: true, force: true });
}
