import type * as THREE from 'three';
import type { countScene } from '../asset-builder';
import type { assetFingerprint } from '../../src/fingerprint';

export type StudioView = '34-front' | '34-back';
export type StudioConfig = {
  module: string;
  builder?: string;
  params: Record<string, unknown>;
  margin: number;
  frontSide: 'left' | 'right';
};

export type StudioVfxContext = {
  root: THREE.Object3D;
  asset: unknown;
  params: Record<string, unknown>;
  group: THREE.Group;
  THREE: typeof THREE;
};
export type StudioPose = { clip: string | null; time: number; duration: number };
export type StudioVfx = { update?: (pose: StudioPose) => void };
export type StudioVfxFactory = (context: StudioVfxContext) => StudioVfx | void | Promise<StudioVfx | void>;

export type StudioFrame = {
  view: StudioView;
  clip?: string;
  time?: number;
  vfx?: boolean;
  label?: string;
};
export type StudioFrameEvidence = StudioPose & {
  view: StudioView;
  vfx: 'off' | 'visible' | 'unavailable' | 'no-visible-change';
};

type Bounds = { min: number[]; max: number[] };
export type StudioInfo = Omit<StudioConfig, 'builder'> & {
  builder: string;
  clips: { name: string; duration: number; tracks: number }[];
  stats: ReturnType<typeof countScene>;
  fingerprint: ReturnType<typeof assetFingerprint>;
  bounds: { rest: Bounds; sampled: Bounds; samplesPerClip: number };
  vfxAvailable: boolean;
  threeRevision: string;
};
export type StudioDiagnostic = { kind: 'javascript' | 'webgl'; message: string };

export type StudioApi = {
  version: 1;
  getErrors: () => StudioDiagnostic[];
  info?: () => StudioInfo;
  setFrame?: (frame: StudioFrame) => StudioFrameEvidence;
};

declare global {
  interface Window {
    threejsStudio?: StudioApi;
  }
}
