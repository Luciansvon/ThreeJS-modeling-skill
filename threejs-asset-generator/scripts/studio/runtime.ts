import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { assetFingerprint } from '../../src/fingerprint';
import { countScene, selectBuilder, unpackAsset } from '../asset-builder';
import { boundsRecord, frameCamera, poseBounds, samplesPerClip } from './framing';
import type {
  StudioApi, StudioConfig, StudioDiagnostic, StudioFrame, StudioFrameEvidence, StudioInfo, StudioPose,
  StudioVfx, StudioVfxFactory, StudioView,
} from './types';

type NamespaceLoader = () => Promise<Record<string, unknown>>;
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const viewNames: Record<StudioView, string> = { '34-front': '3/4 front', '34-back': '3/4 back' };
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function startStudio(
  config: StudioConfig, loadModule: NamespaceLoader, loadVfx?: NamespaceLoader, vfxExport?: string,
) {
  const canvas = byId<HTMLCanvasElement>('view');
  const notice = byId('notice');
  const diagnostics: StudioDiagnostic[] = [];
  const api: StudioApi = { version: 1, getErrors: () => diagnostics.slice() };
  window.threejsStudio = api;

  function fail(kind: StudioDiagnostic['kind'], error: unknown) {
    const message = messageOf(error);
    if (!diagnostics.some((item) => item.kind === kind && item.message === message)) diagnostics.push({ kind, message });
    document.documentElement.dataset.studioState = 'error';
    notice.textContent = message;
    notice.hidden = false;
  }

  window.addEventListener('error', (event) => fail('javascript', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => fail('javascript', event.reason));
  canvas.addEventListener('webglcontextcreationerror', (event) => {
    fail('webgl', event.statusMessage || 'WebGL context creation failed');
  });
  canvas.addEventListener('webglcontextlost', () => fail('webgl', 'WebGL context lost'));

  try {
    byId('asset-name').textContent = config.module;
    const { name: builder, build } = selectBuilder(await loadModule(), config.builder, config.module);
    const asset = await build(structuredClone(config.params), THREE);
    const { root, animations: clips } = unpackAsset(asset);
    const stats = countScene(root);
    if (!stats.meshes) throw new Error('The asset has no meshes with vertex positions');
    if (clips.some((clip) => typeof clip?.name !== 'string' || !Number.isFinite(clip.duration) || clip.duration < 0 || !Array.isArray(clip.tracks))) {
      throw new Error('The builder returned an invalid animation clip');
    }

    const mixer = new THREE.AnimationMixer(root);
    let activeIndex = -1, time = 0;
    let action: THREE.AnimationAction | undefined;
    function selectClip(index: number) {
      mixer.stopAllAction();
      activeIndex = index;
      time = 0;
      action = clips[index] ? mixer.clipAction(clips[index]).reset().play() : undefined;
    }
    function applyPose(seconds: number) {
      time = seconds;
      if (!action) return;
      action.time = time;
      // Sampling with a zero delta preserves the exact end of a looping clip.
      mixer.update(0);
    }

    const rest = poseBounds(root);
    const sampled = rest.clone();
    const clipBounds = clips.map((clip, index) => {
      selectClip(index);
      const count = clip.duration > 0 ? samplesPerClip : 1;
      const envelope = new THREE.Box3();
      for (let sample = 0; sample < count; sample++) {
        applyPose(clip.duration * sample / (samplesPerClip - 1));
        envelope.union(poseBounds(root));
      }
      sampled.union(envelope);
      return envelope;
    });
    selectClip(-1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#202b3a');
    scene.add(root);
    // Three.js caches a skinned mesh's culling sphere. Its animated vertices can leave that sphere.
    root.traverse((object) => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) object.frustumCulled = false; });

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const room = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(room).texture;
      scene.environmentIntensity = 0.65;
      room.dispose();
      pmrem.dispose();
    } catch (error) {
      fail('webgl', error);
      return;
    }

    const key = new THREE.DirectionalLight('#fff4df', 2.35);
    key.position.set(-3, 6, 4);
    scene.add(key, new THREE.HemisphereLight('#edf6ff', '#6c7480', 1.25));
    const width = Math.max(0.001, sampled.getSize(new THREE.Vector3()).length());
    const grid = new THREE.GridHelper(width * 1.8, 16, '#65778e', '#4a5b70');
    const center = sampled.getCenter(new THREE.Vector3());
    grid.position.set(center.x, 0, center.z);
    scene.add(grid);

    const vfxGroup = new THREE.Group();
    vfxGroup.name = '_studio_vfx';
    vfxGroup.visible = false;
    scene.add(vfxGroup);
    let vfx: StudioVfx | void;
    if (loadVfx) {
      const { build: create } = selectBuilder(await loadVfx(), vfxExport, 'studio VFX module', '--vfx-export');
      vfx = await (create as unknown as StudioVfxFactory)({ root, asset, params: structuredClone(config.params), group: vfxGroup, THREE });
    }

    const info: StudioInfo = {
      ...config, builder, stats, fingerprint: assetFingerprint(root),
      clips: clips.map((clip) => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })),
      bounds: { rest: boundsRecord(rest), sampled: boundsRecord(sampled), samplesPerClip },
      vfxAvailable: Boolean(loadVfx), threeRevision: THREE.REVISION,
    };

    const stage = byId('stage');
    const clipSelect = byId<HTMLSelectElement>('clip');
    const play = byId<HTMLButtonElement>('play');
    const scrub = byId<HTMLInputElement>('scrub');
    const effects = byId<HTMLInputElement>('effects');
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'));
    const camera = new THREE.PerspectiveCamera(34);
    const controls = new OrbitControls(camera, canvas);
    const gl = renderer.getContext();
    let view: StudioView | null = '34-front';
    let ticking = 0, lastTick = 0, fitting = false;

    function pose(): StudioPose {
      const clip = clips[activeIndex];
      return { clip: clip?.name ?? null, duration: clip?.duration ?? 0, time };
    }

    function draw() {
      if (vfxGroup.visible && vfx?.update) {
        root.updateMatrixWorld(true);
        vfx.update(pose());
      }
      renderer.render(scene, camera);
    }

    function checkWebGL() {
      if (gl.isContextLost()) fail('webgl', 'WebGL context lost');
      for (let i = 0; i < 8; i++) {
        const code = gl.getError();
        if (code === gl.NO_ERROR) break;
        const name = ['INVALID_ENUM', 'INVALID_VALUE', 'INVALID_OPERATION', 'INVALID_FRAMEBUFFER_OPERATION', 'OUT_OF_MEMORY', 'CONTEXT_LOST_WEBGL']
          .find((key) => gl[key as keyof typeof gl] === code);
        fail('webgl', name ?? `WebGL error 0x${code.toString(16)}`);
      }
    }

    function syncAnimation() {
      const { duration } = pose();
      play.disabled = duration <= 0;
      play.textContent = ticking ? 'Pause' : 'Play';
      scrub.disabled = duration <= 0;
      scrub.max = String(duration);
      scrub.value = String(time);
      byId('time').textContent = `${time.toFixed(2)} / ${duration.toFixed(2)} s`;
    }

    function pause() {
      cancelAnimationFrame(ticking);
      ticking = 0;
      lastTick = 0;
    }

    function tick(now: number) {
      if (lastTick) applyPose((time + (now - lastTick) / 1000) % pose().duration);
      lastTick = now;
      draw();
      ticking = requestAnimationFrame(tick);
      syncAnimation();
    }

    function syncCamera() {
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }

    function fit(preset: StudioView) {
      fitting = true;
      view = preset;
      const envelope = clipBounds[activeIndex] ?? rest;
      frameCamera(camera, controls, envelope.clone().union(poseBounds(root)), preset, config);
      fitting = false;
      syncCamera();
    }

    function resize() {
      const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (view) fit(view);
      draw();
    }

    function setFrame(frame: StudioFrame): StudioFrameEvidence {
      if (!Object.hasOwn(viewNames, frame.view)) throw new Error(`Unknown camera preset: ${frame.view}`);
      const matches = info.clips.flatMap((clip, index) => clip.name === frame.clip ? [index] : []);
      if (frame.clip !== undefined && matches.length !== 1) throw new Error(`Clip name must match one clip: ${frame.clip}`);
      const index = matches[0] ?? -1;
      const duration = clips[index]?.duration ?? 0;
      const seconds = frame.time ?? 0;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > duration) throw new Error(`Frame time must be between 0 and ${duration} seconds`);

      pause();
      selectClip(index);
      applyPose(seconds);
      clipSelect.value = String(index);
      byId('capture-label').textContent = frame.label ?? viewNames[frame.view];
      fit(frame.view);
      syncAnimation();

      vfxGroup.visible = false;
      effects.checked = Boolean(frame.vfx && loadVfx);
      draw();
      checkWebGL();
      if (!diagnostics.length && renderer.info.render.triangles === 0) throw new Error('The asset did not draw any triangles in this frame');
      let vfxEvidence: StudioFrameEvidence['vfx'] = frame.vfx ? 'unavailable' : 'off';
      if (effects.checked) {
        const withoutEffects = canvas.toDataURL();
        vfxGroup.visible = true;
        draw();
        vfxEvidence = canvas.toDataURL() === withoutEffects ? 'no-visible-change' : 'visible';
        checkWebGL();
      }
      return { ...pose(), view: frame.view, vfx: vfxEvidence };
    }

    byId('metrics').textContent = `${stats.tris.toLocaleString('en-US')} triangles · ${stats.meshes} ${stats.meshes === 1 ? 'mesh' : 'meshes'}`;
    for (const [index, clip] of clips.entries()) clipSelect.add(new Option(clip.name || '(unnamed clip)', String(index)));
    clipSelect.disabled = clips.length === 0;
    byId('effects-label').hidden = !loadVfx;
    for (const button of buttons) button.addEventListener('click', () => {
      const preset = button.dataset.view as StudioView;
      byId('capture-label').textContent = viewNames[preset];
      fit(preset);
      draw();
    });
    clipSelect.addEventListener('change', () => {
      pause();
      selectClip(Number(clipSelect.value));
      applyPose(0);
      if (view) fit(view);
      syncAnimation();
      draw();
    });
    play.addEventListener('click', () => {
      if (ticking) pause();
      else ticking = requestAnimationFrame(tick);
      syncAnimation();
    });
    scrub.addEventListener('input', () => {
      pause();
      applyPose(Number(scrub.value));
      syncAnimation();
      draw();
    });
    effects.addEventListener('change', () => { vfxGroup.visible = effects.checked; draw(); });
    controls.addEventListener('start', () => { view = null; syncCamera(); byId('capture-label').textContent = 'Orbit'; });
    controls.addEventListener('change', () => { if (!fitting) draw(); });

    resize();
    setFrame({ view: '34-front' });
    api.info = () => structuredClone(info);
    api.setFrame = setFrame;
    if (!diagnostics.length) {
      document.documentElement.dataset.studioState = 'ready';
      notice.hidden = true;
    }
    new ResizeObserver(resize).observe(stage);
  } catch (error) {
    fail('javascript', error);
  }
}
