// scripts/color-qc.ts: G4 Regional Color QC (Semantic ROI + CIEDE2000 ΔE00) for Three.js Asset Generator.
// Pure TypeScript, zero external dependencies (shared by Harness and Web Full).
// Core CIE transforms, CIEDE2000 (Sharma et al. 2005), and ROI statistics adapted from:
// https://github.com/Luciansvon/AI-COLOR-COMPARE (src/color_science/transforms.ts, ciede2000.ts, metrics.ts).
import type { Gate } from './result';

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface LinearRGB {
  r: number; // 0..1+
  g: number; // 0..1+
  b: number; // 0..1+
}

export interface XYZ {
  x: number; // 0..100+
  y: number; // 0..100
  z: number; // 0..100+
}

export interface Lab {
  l: number; // 0..100
  a: number; // -128..+127
  b: number; // -128..+127
}

export interface PixelDataStats {
  meanLab: Lab;
  meanRgb: RGB;
  brightness: number;
  contrast: number;
  saturation: number;
  shadowClippingRatio: number;
  highlightClippingRatio: number;
  pixelCount: number;
}

export interface SemanticRegionRoi {
  view?: string;
  x: number; // 0..100 percent
  y: number; // 0..100 percent
  width: number; // 0..100 percent
  height: number; // 0..100 percent
}

export interface SemanticRegionRef {
  region: string;
  hex?: string;
  label?: string;
  status?: 'confident' | 'uncertain';
  roi?: SemanticRegionRoi;
  emissive?: boolean;
}

export type RegionColorSource = 'vertex-color' | 'material' | 'texture' | 'render' | 'declared';

export interface ModelRegionSample {
  region: string;
  hex?: string;
  linearRgb?: LinearRGB;
  srgb?: RGB;
  source: RegionColorSource;
  unreadable?: boolean;
  note?: string;
}

export interface G4Thresholds {
  /** Maximum full CIEDE2000 ΔE00 allowed for unlit material/vertex/texture checks. */
  maxDeltaE00: number;
  /** Advisory ΔE00 notice threshold. */
  warnDeltaE00: number;
  /** Maximum lighting-invariant ΔE00 (kL=4, kC=3, kH=1) allowed on render samples before failing chromatic accuracy. */
  renderChromaticMaxDeltaE00: number;
  /** Minimum |ΔL*| required to classify an exceed on a render sample as exposure/lighting-driven. */
  minLightingDeltaL: number;
}

export const DEFAULT_G4_THRESHOLDS: G4Thresholds = {
  maxDeltaE00: 12.0,
  warnDeltaE00: 7.0,
  renderChromaticMaxDeltaE00: 7.5,
  minLightingDeltaL: 8.0,
};

export type G4Status = 'PASS' | 'FAIL' | 'SKIPPED' | 'ERROR';

export interface RegionQCResult {
  region: string;
  label?: string;
  status: G4Status;
  source?: RegionColorSource;
  refHex?: string;
  modelHex?: string;
  deltaE00?: number;
  chromaticDeltaE00?: number;
  deltaL?: number;
  deltaA?: number;
  deltaB?: number;
  lightingOnlyWarning?: boolean;
  reason: string;
}

export interface RegionalColorQCReport {
  status: G4Status;
  mode: string;
  evaluated: number;
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  maxDeltaE00: number;
  thresholds: G4Thresholds;
  regions: RegionQCResult[];
  gate: Gate | null;
  reason: string;
}

// CIE D65 2-degree standard illuminant (reused from AI-COLOR-COMPARE transforms.ts)
const D65_XN = 95.047;
const D65_YN = 100.0;
const D65_ZN = 108.883;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function sRGBToLinearRGB(rgb: RGB): LinearRGB {
  const toLinear = (c: number) => {
    const v = Math.max(0, Math.min(255, c)) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return { r: toLinear(rgb.r), g: toLinear(rgb.g), b: toLinear(rgb.b) };
}

export function linearRGBToSRGB(linear: LinearRGB): RGB {
  const toSRGB = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    const c = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return Math.round(c * 255);
  };
  return { r: toSRGB(linear.r), g: toSRGB(linear.g), b: toSRGB(linear.b) };
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.trim().replace(/^#/, '');
  const full = clean.length === 3
    ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
    : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex color: "${hex}"`);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgbToHex = (rgb: RGB): string =>
  '#' + [rgb.r, rgb.g, rgb.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function rgbToXyz(rgb: RGB): XYZ {
  return linearRgbToXyz(sRGBToLinearRGB(rgb));
}

export function linearRgbToXyz(lin: LinearRGB): XYZ {
  const r = Math.max(0, lin.r), g = Math.max(0, lin.g), b = Math.max(0, lin.b);
  return {
    x: (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) * 100,
    y: (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) * 100,
    z: (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) * 100,
  };
}

function fXYZ(t: number): number {
  const delta = 6 / 29;
  return t > delta * delta * delta ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

export function xyzToLab(xyz: XYZ): Lab {
  const fx = fXYZ(xyz.x / D65_XN);
  const fy = fXYZ(xyz.y / D65_YN);
  const fz = fXYZ(xyz.z / D65_ZN);
  return { l: Math.max(0, 116 * fy - 16), a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export const rgbToLab = (rgb: RGB): Lab => xyzToLab(rgbToXyz(rgb));
export const linearRgbToLab = (lin: LinearRGB): Lab => xyzToLab(linearRgbToXyz(lin));

/**
 * CIEDE2000 color difference (ΔE00) per CIE & Sharma et al. (2005).
 * Ported directly from Luciansvon/AI-COLOR-COMPARE `src/color_science/ciede2000.ts`.
 */
export function calculateDeltaE00(lab1: Lab, lab2: Lab, kL = 1.0, kC = 1.0, kH = 1.0): number {
  const { l: l1, a: a1, b: b1 } = lab1;
  const { l: l2, a: a2, b: b2 } = lab2;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const cBar7 = Math.pow(cBar, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + Math.pow(25, 7))));

  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);

  let h1Prime = deg(Math.atan2(b1, a1Prime));
  if (h1Prime < 0) h1Prime += 360;
  let h2Prime = deg(Math.atan2(b2, a2Prime));
  if (h2Prime < 0) h2Prime += 360;

  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;

  let deltaHPrimeDegrees = 0;
  if (c1Prime * c2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) deltaHPrimeDegrees = diff;
    else if (diff > 180) deltaHPrimeDegrees = diff - 360;
    else deltaHPrimeDegrees = diff + 360;
  }
  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(rad(deltaHPrimeDegrees / 2));

  const lBarPrime = (l1 + l2) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;

  let hBarPrime = 0;
  if (c1Prime * c2Prime === 0) {
    hBarPrime = h1Prime + h2Prime;
  } else {
    const diff = Math.abs(h1Prime - h2Prime);
    const sum = h1Prime + h2Prime;
    if (diff <= 180) hBarPrime = sum / 2;
    else if (sum < 360) hBarPrime = (sum + 360) / 2;
    else hBarPrime = (sum - 360) / 2;
  }

  const t = 1
    - 0.17 * Math.cos(rad(hBarPrime - 30))
    + 0.24 * Math.cos(rad(2 * hBarPrime))
    + 0.32 * Math.cos(rad(3 * hBarPrime + 6))
    - 0.20 * Math.cos(rad(4 * hBarPrime - 63));

  const deltaTheta = 30 * Math.exp(-Math.pow((hBarPrime - 275) / 25, 2));
  const cBarPrime7 = Math.pow(cBarPrime, 7);
  const rc = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + Math.pow(25, 7)));

  const lBarMinus50Sq = Math.pow(lBarPrime - 50, 2);
  const sL = 1 + (0.015 * lBarMinus50Sq) / Math.sqrt(20 + lBarMinus50Sq);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin(rad(2 * deltaTheta)) * rc;

  const lTerm = deltaLPrime / (kL * sL);
  const cTerm = deltaCPrime / (kC * sC);
  const hTerm = deltaHPrime / (kH * sH);
  return Math.sqrt(Math.max(0, lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm));
}

/**
 * Extracts Lab/RGB/brightness/contrast/saturation statistics from RGBA pixel bytes
 * (reused from AI-COLOR-COMPARE `src/color_science/metrics.ts`, ignoring transparent pixels).
 */
export function extractROIStats(rgbaPixels: Uint8Array | Uint8ClampedArray | number[], alphaCut = 128): PixelDataStats {
  const total = Math.floor(rgbaPixels.length / 4);
  if (!total) {
    return {
      meanLab: { l: 0, a: 0, b: 0 },
      meanRgb: { r: 0, g: 0, b: 0 },
      brightness: 0, contrast: 0, saturation: 0,
      shadowClippingRatio: 0, highlightClippingRatio: 0, pixelCount: 0,
    };
  }

  let sumR = 0, sumG = 0, sumB = 0, sumL = 0, sumA = 0, sumBLab = 0, sumSat = 0;
  let shadowClipped = 0, highlightClipped = 0, count = 0;
  const lValues: number[] = [];

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    if (rgbaPixels[idx + 3] < alphaCut) continue;
    const r = rgbaPixels[idx], g = rgbaPixels[idx + 1], b = rgbaPixels[idx + 2];
    count++;
    sumR += r; sumG += g; sumB += b;
    if (r < 5 && g < 5 && b < 5) shadowClipped++;
    if (r > 250 || g > 250 || b > 250) highlightClipped++;
    const lab = rgbToLab({ r, g, b });
    lValues.push(lab.l);
    sumL += lab.l; sumA += lab.a; sumBLab += lab.b;
    sumSat += Math.hypot(lab.a, lab.b);
  }

  if (!count) {
    return {
      meanLab: { l: 0, a: 0, b: 0 },
      meanRgb: { r: 0, g: 0, b: 0 },
      brightness: 0, contrast: 0, saturation: 0,
      shadowClippingRatio: 0, highlightClippingRatio: 0, pixelCount: 0,
    };
  }

  const meanL = sumL / count;
  let sumVar = 0;
  for (const l of lValues) sumVar += (l - meanL) * (l - meanL);

  return {
    meanLab: { l: meanL, a: sumA / count, b: sumBLab / count },
    meanRgb: { r: Math.round(sumR / count), g: Math.round(sumG / count), b: Math.round(sumB / count) },
    brightness: meanL,
    contrast: Math.sqrt(sumVar / count),
    saturation: sumSat / count,
    shadowClippingRatio: shadowClipped / count,
    highlightClippingRatio: highlightClipped / count,
    pixelCount: count,
  };
}

/** Extracts ROI stats from a percentage bounding box `{ x, y, width, height }` on an RGBA image. */
export function extractROIBoxStats(
  rgba: Uint8Array | Uint8ClampedArray,
  totalWidth: number,
  totalHeight: number,
  box: SemanticRegionRoi,
  alphaCut = 128,
): PixelDataStats {
  const x0 = Math.max(0, Math.min(totalWidth - 1, Math.round((box.x / 100) * totalWidth)));
  const y0 = Math.max(0, Math.min(totalHeight - 1, Math.round((box.y / 100) * totalHeight)));
  const cw = Math.max(1, Math.min(totalWidth - x0, Math.round((box.width / 100) * totalWidth)));
  const ch = Math.max(1, Math.min(totalHeight - y0, Math.round((box.height / 100) * totalHeight)));
  const cropped = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcStart = ((y0 + y) * totalWidth + x0) * 4;
    cropped.set(rgba.subarray(srcStart, srcStart + cw * 4), y * cw * 4);
  }
  return extractROIStats(cropped, alphaCut);
}

/** Priority 3 fallback: sample a rendered frame's semantic ROI box into a ModelRegionSample. */
export function sampleRenderRegion(
  region: string,
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  box: SemanticRegionRoi,
): ModelRegionSample {
  const stats = extractROIBoxStats(rgba, width, height, box);
  if (!stats.pixelCount) return { region, source: 'render', unreadable: true, note: 'ROI contains no opaque pixels' };
  return {
    region,
    srgb: stats.meanRgb,
    hex: rgbToHex(stats.meanRgb),
    source: 'render',
  };
}

const normalizeName = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokensOf = (s: string) => normalizeName(s).split(/\s+/).filter(Boolean);

function matchRegionScore(region: string, candidates: string[], aliases?: Record<string, string | string[]>): number {
  const normRegion = normalizeName(region);
  const aliasList = aliases?.[region];
  const targets = [normRegion, ...(Array.isArray(aliasList) ? aliasList.map(normalizeName) : aliasList ? [normalizeName(aliasList)] : [])].filter(Boolean);
  let best = 0;
  for (const cand of candidates) {
    const nc = normalizeName(cand);
    if (!nc) continue;
    const cTokens = tokensOf(cand);
    for (const target of targets) {
      if (nc === target) best = Math.max(best, 100);
      else if (cTokens.includes(target)) best = Math.max(best, 80);
      else if (nc.includes(target)) best = Math.max(best, 60);
      else {
        const tTokens = tokensOf(target);
        if (tTokens.length && tTokens.every((t) => cTokens.includes(t))) best = Math.max(best, 70);
      }
    }
  }
  return best;
}

type DuckAttr = { count?: number; itemSize?: number; array?: ArrayLike<number>; getX?: (i: number) => number; getY?: (i: number) => number; getZ?: (i: number) => number };
type DuckMaterial = { color?: { r: number; g: number; b: number }; emissive?: { r: number; g: number; b: number }; map?: { image?: { data?: ArrayLike<number>; width?: number; height?: number } } };
type DuckNode = {
  name?: string;
  visible?: boolean;
  isMesh?: boolean;
  parent?: DuckNode | null;
  children?: DuckNode[];
  geometry?: { attributes?: Record<string, DuckAttr> };
  material?: DuckMaterial | DuckMaterial[];
};

function collectMeshesWithPaths(root: DuckNode): Array<{ mesh: DuckNode; names: string[] }> {
  const out: Array<{ mesh: DuckNode; names: string[] }> = [];
  const visit = (node: DuckNode, ancestors: string[]) => {
    if (!node || node.visible === false) return;
    const chain = node.name ? [...ancestors, node.name] : ancestors;
    if (node.isMesh && node.geometry?.attributes?.position) out.push({ mesh: node, names: chain });
    if (Array.isArray(node.children)) for (const child of node.children) visit(child, chain);
  };
  visit(root, []);
  return out;
}

function readAttrVec(attr: DuckAttr, index: number): [number, number, number] {
  if (typeof attr.getX === 'function' && typeof attr.getY === 'function' && typeof attr.getZ === 'function') {
    return [attr.getX(index), attr.getY(index), attr.getZ(index)];
  }
  const s = attr.itemSize ?? 3;
  const a = attr.array!;
  return [a[index * s] ?? 0, a[index * s + 1] ?? 0, a[index * s + 2] ?? 0];
}

function sampleMeshBaseColor(mesh: DuckNode, emissiveHint = false): { linear?: LinearRGB; srgb?: RGB; source: RegionColorSource; unreadable?: boolean; note?: string } {
  const matRaw = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const mat: DuckMaterial = matRaw ?? {};
  const tint = mat.color ? { r: mat.color.r, g: mat.color.g, b: mat.color.b } : { r: 1, g: 1, b: 1 };
  const colAttr = mesh.geometry?.attributes?.color;

  // Priority 1a: vertex colors multiplied by material.color (Three.js sRGB->linear shader rule)
  if (colAttr && (colAttr.count ?? 0) > 0) {
    const n = colAttr.count!;
    const step = Math.max(1, Math.floor(n / 1024));
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    for (let i = 0; i < n; i += step) {
      const [vx, vy, vz] = readAttrVec(colAttr, i);
      sr += vx * tint.r; sg += vy * tint.g; sb += vz * tint.b; cnt++;
    }
    const lin = { r: sr / cnt, g: sg / cnt, b: sb / cnt };
    return { linear: lin, srgb: linearRGBToSRGB(lin), source: 'vertex-color' };
  }

  // Priority 2: texture map pixel buffer (optionally indexed by mesh UVs so shared texture atlases stay per-part!)
  if (mat.map) {
    const img = mat.map.image;
    const data = img?.data;
    const w = img?.width ?? 0, h = img?.height ?? 0;
    if (!data || w <= 0 || h <= 0) {
      return { source: 'texture', unreadable: true, note: 'material.map has no readable pixel buffer in current runtime' };
    }
    const uv = mesh.geometry?.attributes?.uv;
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    if (uv && (uv.count ?? 0) > 0) {
      const step = Math.max(1, Math.floor(uv.count! / 512));
      for (let i = 0; i < uv.count!; i += step) {
        let u: number, v: number;
        if (typeof uv.getX === 'function' && typeof uv.getY === 'function') {
          u = uv.getX(i); v = uv.getY(i);
        } else {
          const s = uv.itemSize ?? 2;
          u = uv.array![i * s]; v = uv.array![i * s + 1];
        }
        const uu = ((u % 1) + 1) % 1;
        const vv = ((v % 1) + 1) % 1;
        const px = Math.min(w - 1, Math.floor(uu * w));
        const py = Math.min(h - 1, Math.floor((1 - vv) * h));
        const off = (py * w + px) * 4;
        if ((data[off + 3] ?? 255) < 128) continue;
        const linTex = sRGBToLinearRGB({ r: data[off], g: data[off + 1], b: data[off + 2] });
        sr += linTex.r * tint.r; sg += linTex.g * tint.g; sb += linTex.b * tint.b; cnt++;
      }
    }
    if (!cnt) {
      const stats = extractROIStats(data instanceof Uint8Array || data instanceof Uint8ClampedArray ? data : Array.from(data));
      if (!stats.pixelCount) return { source: 'texture', unreadable: true, note: 'texture contains no opaque pixels' };
      const linTex = sRGBToLinearRGB(stats.meanRgb);
      const lin = { r: linTex.r * tint.r, g: linTex.g * tint.g, b: linTex.b * tint.b };
      return { linear: lin, srgb: linearRGBToSRGB(lin), source: 'texture' };
    }
    const lin = { r: sr / cnt, g: sg / cnt, b: sb / cnt };
    return { linear: lin, srgb: linearRGBToSRGB(lin), source: 'texture' };
  }

  // Priority 1b: scalar material.color / emissive (zero lighting influence)
  if (emissiveHint && mat.emissive && (tint.r + tint.g + tint.b) < 0.05 && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.05) {
    const em = { r: mat.emissive.r, g: mat.emissive.g, b: mat.emissive.b };
    return { linear: em, srgb: linearRGBToSRGB(em), source: 'material' };
  }
  return { linear: tint, srgb: linearRGBToSRGB(tint), source: 'material' };
}

/**
 * Priority 1 & 2 model sampler: reads base material/vertex/texture colors from named meshes or parent groups
 * directly in memory without rendering frames or calling any AI.
 */
export function sampleModelRegionColors(
  root: unknown,
  regions: readonly SemanticRegionRef[],
  regionAliases?: Record<string, string | string[]>,
): Record<string, ModelRegionSample> {
  const result: Record<string, ModelRegionSample> = {};
  if (!root || !regions.length) return result;
  const entries = collectMeshesWithPaths(root as DuckNode);

  for (const ref of regions) {
    let bestScore = 0;
    const matched: DuckNode[] = [];
    for (const entry of entries) {
      const score = matchRegionScore(ref.region, entry.names, regionAliases);
      if (score <= 0) continue;
      if (score > bestScore) { bestScore = score; matched.length = 0; matched.push(entry.mesh); }
      else if (score === bestScore) matched.push(entry.mesh);
    }
    if (!matched.length) continue;

    let sr = 0, sg = 0, sb = 0, cnt = 0;
    let source: RegionColorSource = 'material';
    let unreadable = false;
    let note: string | undefined;
    for (const m of matched) {
      const s = sampleMeshBaseColor(m, ref.emissive);
      source = s.source;
      if (s.unreadable) { unreadable = true; note = s.note; continue; }
      if (s.linear) { sr += s.linear.r; sg += s.linear.g; sb += s.linear.b; cnt++; }
    }
    if (!cnt) {
      result[ref.region] = { region: ref.region, source, unreadable: true, note: unreadable ? note : 'unable to sample mesh color' };
      continue;
    }
    const lin = { r: sr / cnt, g: sg / cnt, b: sb / cnt };
    const srgb = linearRGBToSRGB(lin);
    result[ref.region] = { region: ref.region, linearRgb: lin, srgb, hex: rgbToHex(srgb), source };
  }
  return result;
}

const shiftHint = (dL: number, dA: number, dB: number) => {
  const notes: string[] = [];
  if (Math.abs(dL) >= 5) notes.push(dL > 0 ? 'too light' : 'too dark');
  if (Math.abs(dA) >= 5) notes.push(dA > 0 ? 'too red/magenta' : 'too green');
  if (Math.abs(dB) >= 5) notes.push(dB > 0 ? 'too yellow/warm' : 'too blue/cool');
  return notes.length ? notes.join(', ') : 'hue/chroma mismatch';
};

/**
 * Evaluates G4 Regional Color QC using CIEDE2000 (ΔE00).
 * Fast/Quick modes return SKIPPED immediately with zero G4 overhead.
 */
export function evaluateRegionalColorQC(
  refRegions: readonly SemanticRegionRef[] | undefined,
  modelSamples: Record<string, ModelRegionSample> | undefined,
  options: { mode?: string; thresholds?: Partial<G4Thresholds> } = {},
): RegionalColorQCReport {
  const mode = (options.mode ?? 'balance').toLowerCase();
  const thresholds: G4Thresholds = { ...DEFAULT_G4_THRESHOLDS, ...options.thresholds };

  if (mode === 'fast' || mode === 'quick') {
    return {
      status: 'SKIPPED', mode, evaluated: 0, passed: 0, failed: 0, skipped: 0, errored: 0,
      maxDeltaE00: 0, thresholds, regions: [], gate: null,
      reason: `Mode "${options.mode ?? mode}" runs G3 palette only (G4 skipped with zero overhead)`,
    };
  }

  if (!refRegions?.length) {
    return {
      status: 'SKIPPED', mode, evaluated: 0, passed: 0, failed: 0, skipped: 0, errored: 0,
      maxDeltaE00: 0, thresholds, regions: [], gate: null,
      reason: 'No cached semantic region metadata in reference; G4 skipped cleanly',
    };
  }

  const regions: RegionQCResult[] = [];
  let passed = 0, failed = 0, skipped = 0, errored = 0, maxDeltaE00 = 0;

  for (const ref of refRegions) {
    if (ref.status === 'uncertain' || !ref.hex) {
      skipped++;
      regions.push({
        region: ref.region, label: ref.label, status: 'SKIPPED', refHex: ref.hex,
        reason: 'reference region marked uncertain or missing hex',
      });
      continue;
    }

    const sample = modelSamples?.[ref.region];
    if (!sample) {
      skipped++;
      regions.push({
        region: ref.region, label: ref.label, status: 'SKIPPED', refHex: ref.hex,
        reason: `no model region sample found for "${ref.region}"`,
      });
      continue;
    }
    if (sample.unreadable) {
      skipped++;
      regions.push({
        region: ref.region, label: ref.label, status: 'SKIPPED', source: sample.source, refHex: ref.hex,
        reason: sample.note ?? 'model region color buffer unreadable',
      });
      continue;
    }

    try {
      const refRgb = hexToRgb(ref.hex);
      const refLab = rgbToLab(refRgb);
      const modelLab = sample.srgb ? rgbToLab(sample.srgb)
        : sample.linearRgb ? linearRgbToLab(sample.linearRgb)
          : sample.hex ? rgbToLab(hexToRgb(sample.hex))
            : null;
      if (!modelLab) {
        skipped++;
        regions.push({
          region: ref.region, label: ref.label, status: 'SKIPPED', source: sample.source, refHex: ref.hex,
          reason: 'model region sample lacks color values',
        });
        continue;
      }

      const modelHex = sample.hex ?? (sample.srgb ? rgbToHex(sample.srgb) : sample.linearRgb ? rgbToHex(linearRGBToSRGB(sample.linearRgb)) : undefined);
      const dE = Number(calculateDeltaE00(refLab, modelLab, 1, 1, 1).toFixed(2));
      const dEChromatic = Number(calculateDeltaE00(refLab, modelLab, 4.0, 3.0, 1.0).toFixed(2));
      const dL = Number((modelLab.l - refLab.l).toFixed(2));
      const dA = Number((modelLab.a - refLab.a).toFixed(2));
      const dB = Number((modelLab.b - refLab.b).toFixed(2));
      const refC = Math.hypot(refLab.a, refLab.b);
      const modC = Math.hypot(modelLab.a, modelLab.b);
      maxDeltaE00 = Math.max(maxDeltaE00, dE);

      const neutralSafe = refC >= 8 || modC < 12;
      const isLightingOnlyRenderShift = sample.source === 'render'
        && dE > thresholds.maxDeltaE00
        && neutralSafe
        && dEChromatic <= thresholds.renderChromaticMaxDeltaE00
        && Math.abs(dL) >= thresholds.minLightingDeltaL;

      if (isLightingOnlyRenderShift) {
        passed++;
        regions.push({
          region: ref.region, label: ref.label, status: 'PASS', source: sample.source,
          refHex: ref.hex, modelHex, deltaE00: dE, chromaticDeltaE00: dEChromatic,
          deltaL: dL, deltaA: dA, deltaB: dB, lightingOnlyWarning: true,
          reason: `render brightness/lighting shift (ΔE00=${dE}, chromatic ΔE00=${dEChromatic} <= ${thresholds.renderChromaticMaxDeltaE00}) — base hue preserved`,
        });
      } else if (dE <= thresholds.maxDeltaE00) {
        passed++;
        regions.push({
          region: ref.region, label: ref.label, status: 'PASS', source: sample.source,
          refHex: ref.hex, modelHex, deltaE00: dE, chromaticDeltaE00: dEChromatic,
          deltaL: dL, deltaA: dA, deltaB: dB,
          reason: dE > thresholds.warnDeltaE00 ? `within limit with mild drift (ΔE00=${dE})` : `matched (ΔE00=${dE})`,
        });
      } else {
        failed++;
        regions.push({
          region: ref.region, label: ref.label, status: 'FAIL', source: sample.source,
          refHex: ref.hex, modelHex, deltaE00: dE, chromaticDeltaE00: dEChromatic,
          deltaL: dL, deltaA: dA, deltaB: dB,
          reason: `ΔE00=${dE} > ${thresholds.maxDeltaE00} (ref ${ref.hex} vs model ${modelHex}: ${shiftHint(dL, dA, dB)})`,
        });
      }
    } catch (error) {
      errored++;
      regions.push({
        region: ref.region, label: ref.label, status: 'ERROR', source: sample.source, refHex: ref.hex,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const evaluated = passed + failed;
  const status: G4Status = errored > 0 ? 'ERROR' : failed > 0 ? 'FAIL' : evaluated === 0 ? 'SKIPPED' : 'PASS';
  const failedList = regions.filter((r) => r.status === 'FAIL').map((r) => `${r.region} (ΔE00 ${r.deltaE00})`);
  const errList = regions.filter((r) => r.status === 'ERROR').map((r) => `${r.region}: ${r.reason}`);

  let gate: Gate | null = null;
  if (status === 'PASS' || status === 'FAIL') {
    gate = {
      gate: 'G4 regional color',
      value: status === 'PASS'
        ? `${passed} region(s) matched via CIEDE2000 (max ΔE00 ${maxDeltaE00.toFixed(2)} <= ${thresholds.maxDeltaE00}${skipped ? `; ${skipped} skipped` : ''})`
        : `${failed} region(s) mismatched: ${failedList.join(', ')}`,
      pass: status === 'PASS',
      hint: status === 'PASS' ? '' : `adjust material/vertex colors for failing region(s): ${failedList.join(', ')} (max 1 correction round)`,
    };
  }

  const reason = status === 'PASS' ? gate!.value
    : status === 'FAIL' ? gate!.value
      : status === 'ERROR' ? `G4 technical error: ${errList.join('; ')}`
        : 'All regions were uncertain, unmapped, or unreadable — G4 reported as SKIPPED';

  return { status, mode, evaluated, passed, failed, skipped, errored, maxDeltaE00, thresholds, regions, gate, reason };
}
