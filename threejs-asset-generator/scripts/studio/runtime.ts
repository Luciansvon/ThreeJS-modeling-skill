import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetFingerprint } from '../../src/fingerprint';
import { countScene, selectBuilder, unpackAsset } from '../asset-builder';
import { boundsRecord, collectPoseVertices, frameCamera, poseBounds, samplesPerClip } from './framing';
import type {
  StudioApi, StudioBackground, StudioConfig, StudioDiagnostic, StudioFrame, StudioFrameEvidence, StudioInfo, StudioPose,
  StudioVfx, StudioVfxFactory, StudioView,
} from './types';

type NamespaceLoader = () => Promise<Record<string, unknown>>;
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const viewNames: Record<StudioView, string> = {
  '34-front': '3/4 front',
  '34-back': '3/4 back',
  front: 'Front',
  side: 'Side',
  back: 'Back',
  top: 'Top',
};
const backgrounds: Record<StudioBackground, string> = { dark: '#202b3a', light: '#c8ced8' };
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if ((value as THREE.Texture)?.isTexture) (value as THREE.Texture).dispose();
      }
      material.dispose?.();
    }
  });
}

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
    const restPoints = collectPoseVertices(root, 1500);
    const sampled = rest.clone();
    const clipPoints: THREE.Vector3[][] = [];
    const clipBounds = clips.map((clip, index) => {
      selectClip(index);
      const count = clip.duration > 0 ? samplesPerClip : 1;
      const envelope = new THREE.Box3();
      const points: THREE.Vector3[] = [];
      for (let sample = 0; sample < count; sample++) {
        applyPose(clip.duration * sample / (samplesPerClip - 1));
        envelope.union(poseBounds(root));
        if (sample % 3 === 0 || sample === count - 1) points.push(...collectPoseVertices(root, 400));
      }
      sampled.union(envelope);
      clipPoints.push(points);
      return envelope;
    });
    selectClip(-1);

    const scene = new THREE.Scene();
    const sceneBgColor = new THREE.Color(backgrounds.dark);
    scene.background = sceneBgColor;
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
    const darkGrid = new THREE.GridHelper(width * 1.8, 16, '#65778e', '#4a5b70');
    const lightGrid = new THREE.GridHelper(width * 1.8, 16, '#7d8696', '#a1a9b8');
    const center = sampled.getCenter(new THREE.Vector3());
    darkGrid.position.set(center.x, 0, center.z);
    lightGrid.position.set(center.x, 0, center.z);
    scene.add(darkGrid, lightGrid);

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
    const bgToggle = byId<HTMLButtonElement>('bg-toggle');
    const exportGlbBtn = byId<HTMLButtonElement>('export-glb');
    const verifyGlbBtn = byId<HTMLButtonElement>('verify-glb');
    const glbStatus = byId<HTMLOutputElement>('glb-status');
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'));
    const camera = new THREE.PerspectiveCamera(34);
    const controls = new OrbitControls(camera, canvas);
    const gl = renderer.getContext();
    let view: StudioView | null = '34-front';
    let currentBackground: StudioBackground = config.background === 'light' ? 'light' : 'dark';
    let ticking = 0, lastTick = 0, fitting = false;

    function applyBackground(mode: StudioBackground) {
      currentBackground = mode;
      sceneBgColor.set(backgrounds[mode]);
      stage.style.background = backgrounds[mode];
      darkGrid.visible = mode === 'dark';
      lightGrid.visible = mode === 'light';
      bgToggle.textContent = mode === 'dark' ? 'Light bg' : 'Dark bg';
      bgToggle.setAttribute('aria-pressed', String(mode === 'light'));
    }
    applyBackground(currentBackground);

    function pose(): StudioPose {
      const clip = clips[activeIndex];
      return { clip: clip?.name ?? null, duration: clip?.duration ?? 0, time };
    }

    function setEffectsEnabled(enabled: boolean) {
      effects.checked = info.vfxAvailable && enabled;
      vfxGroup.visible = effects.checked;
    }

    function draw() {
      if (effects.checked && vfx?.update) {
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

    function checkRenderedFrame() {
      checkWebGL();
      if (!diagnostics.length && renderer.info.render.triangles === 0) throw new Error('The asset did not draw any triangles in this frame');
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
      const basePoints = clipPoints[activeIndex]?.length ? clipPoints[activeIndex] : restPoints;
      const pts = [...basePoints, ...collectPoseVertices(root, 1500)];
      frameCamera(camera, controls, envelope.clone().union(poseBounds(root)), preset, config, pts);
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
      if (frame.background !== undefined && frame.background !== 'dark' && frame.background !== 'light') {
        throw new Error(`Unknown background mode: ${frame.background}`);
      }
      const matches = info.clips.flatMap((clip, index) => clip.name === frame.clip ? [index] : []);
      if (frame.clip !== undefined && matches.length !== 1) throw new Error(`Clip name must match one clip: ${frame.clip}`);
      const index = matches[0] ?? -1;
      const duration = clips[index]?.duration ?? 0;
      const seconds = frame.time ?? 0;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > duration) throw new Error(`Frame time must be between 0 and ${duration} seconds`);

      if (frame.background !== undefined) applyBackground(frame.background);
      pause();
      selectClip(index);
      applyPose(seconds);
      clipSelect.value = String(index);
      byId('capture-label').textContent = frame.label ?? viewNames[frame.view];
      fit(frame.view);
      syncAnimation();

      setEffectsEnabled(false);
      draw();
      checkRenderedFrame();
      let vfxEvidence: StudioFrameEvidence['vfx'] = frame.vfx ? 'unavailable' : 'off';
      if (frame.vfx && info.vfxAvailable) {
        const withoutEffects = canvas.toDataURL();
        setEffectsEnabled(true);
        draw();
        vfxEvidence = canvas.toDataURL() === withoutEffects ? 'no-visible-change' : 'visible';
        checkWebGL();
      }
      return { ...pose(), view: frame.view, background: currentBackground, vfx: vfxEvidence };
    }

    async function exportFreshGlb() {
      const { build: freshBuild } = selectBuilder(await loadModule(), config.builder, config.module);
      const fresh = unpackAsset(await freshBuild(structuredClone(config.params), THREE));
      try {
        const buffer = await new GLTFExporter().parseAsync(fresh.root, {
          binary: true, animations: fresh.animations, onlyVisible: true,
        }) as ArrayBuffer;
        const before = countScene(fresh.root);
        const clipNames = fresh.animations.map((clip) => clip.name);
        return { buffer, before, clipNames };
      } finally {
        disposeObjectTree(fresh.root);
      }
    }

    bgToggle.addEventListener('click', () => {
      applyBackground(currentBackground === 'dark' ? 'light' : 'dark');
      draw();
    });

    exportGlbBtn.addEventListener('click', async () => {
      exportGlbBtn.disabled = true;
      verifyGlbBtn.disabled = true;
      glbStatus.textContent = 'Exporting .glb…';
      try {
        const { buffer } = await exportFreshGlb();
        const fileName = `${config.module.replace(/\.[^.]+$/, '') || 'asset'}.glb`;
        const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        glbStatus.textContent = `Exported ${fileName} (${(buffer.byteLength / 1024).toFixed(1)} KB)`;
      } catch (error) {
        glbStatus.textContent = `Export failed: ${messageOf(error)}`;
      } finally {
        exportGlbBtn.disabled = false;
        verifyGlbBtn.disabled = false;
      }
    });

    verifyGlbBtn.addEventListener('click', async () => {
      exportGlbBtn.disabled = true;
      verifyGlbBtn.disabled = true;
      glbStatus.textContent = 'Verifying GLB…';
      try {
        const { buffer, before, clipNames } = await exportFreshGlb();
        const reloaded = await new GLTFLoader().parseAsync(buffer, '');
        try {
          const after = countScene(reloaded.scene);
          const outClips = (reloaded.animations ?? []).map((clip) => clip.name);
          const ok = before.tris > 0 && before.tris === after.tris
            && before.meshes === after.meshes && before.vertexColorMeshes === after.vertexColorMeshes
            && before.skins === after.skins && before.bones === after.bones
            && clipNames.length === outClips.length && clipNames.every((name, idx) => outClips[idx] === name);
          glbStatus.textContent = ok
            ? `GLB OK · ${(buffer.byteLength / 1024).toFixed(1)} KB · ${after.tris} tris · ${after.meshes} meshes · ${after.bones} bones · ${outClips.length} clips`
            : `GLB FAIL · tris ${before.tris}->${after.tris}, meshes ${before.meshes}->${after.meshes}, bones ${before.bones}->${after.bones}, clips ${clipNames.length}->${outClips.length}`;
        } finally {
          disposeObjectTree(reloaded.scene);
        }
      } catch (error) {
        glbStatus.textContent = `Verify failed: ${messageOf(error)}`;
      } finally {
        exportGlbBtn.disabled = false;
        verifyGlbBtn.disabled = false;
      }
    });

    byId('metrics').textContent = `${stats.tris.toLocaleString('en-US')} triangles · ${stats.meshes} ${stats.meshes === 1 ? 'mesh' : 'meshes'}`;
    for (const [index, clip] of clips.entries()) clipSelect.add(new Option(clip.name || '(unnamed clip)', String(index)));
    clipSelect.value = String(activeIndex);
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
    effects.addEventListener('change', () => { setEffectsEnabled(effects.checked); draw(); });
    controls.addEventListener('start', () => { view = null; syncCamera(); byId('capture-label').textContent = 'Orbit'; });
    controls.addEventListener('change', () => { if (!fitting) draw(); });

    setEffectsEnabled(true);
    syncAnimation();
    resize();
    checkRenderedFrame();
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
