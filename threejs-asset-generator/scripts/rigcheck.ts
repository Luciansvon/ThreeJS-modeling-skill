// scripts/rigcheck.ts: pure rig, clip, track, expression & slide-clearance gates (R1 to R6). No THREE, no fs.
import type { Gate } from './result';

export type RigTrack = { name: string; times: number[]; values: number[] };
export type RigClip = { name: string; durationSeconds: number; loop?: boolean; expression?: string; tracks?: RigTrack[] };
export type RigMeta = {
  rig?: {
    rootNode?: string;
    pivotNames?: string[];
    hierarchy?: { parent: string; child: string }[];
    restLocalPositions?: Record<string, number[]>;
  };
  animations?: RigClip[];
  face?: {
    defaultExpressionInGlb?: string;
    textureResolution?: [number, number];
    expressions?: string[];
    animationExpressionMapping?: Record<string, string>;
  };
  files?: { expressions?: Record<string, unknown> };
  qa?: {
    maxHorizDrift?: number;
    motionMode?: 'in-place' | 'free';
    slideDropPct?: number;
    slideMinY?: number;
    clipMinY?: number;
  };
};

export type RigKind = 'hero' | 'creature' | 'vehicle' | 'building' | 'prop';
export const DEFAULT_MAX_PIVOTS: Record<RigKind, number> = { hero: 16, creature: 64, vehicle: 32, building: 24, prop: 16 };

export type RigCheckOptions = {
  maxPivots?: number;
  kind?: RigKind;
  motionMode?: 'in-place' | 'free';
  excludeClips?: string[];
  minSlideDropPct?: number;
  minSlideY?: number;
  maxHorizDrift?: number;
};

const isFinite3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export function rigGates(meta: RigMeta, o: RigCheckOptions = {}): { gates: Gate[]; skipped: string[]; stats: Record<string, unknown> } {
  const gates: Gate[] = [], skipped: string[] = [];
  const kind = o.kind ?? 'hero';
  const maxPivots = o.maxPivots ?? DEFAULT_MAX_PIVOTS[kind];
  const motionMode = o.motionMode ?? meta.qa?.motionMode ?? 'in-place';
  const excluded = new Set(o.excludeClips ?? ['RefPose']);
  const minSlideDrop = o.minSlideDropPct ?? 22;
  const minSlideY = o.minSlideY ?? -0.025;
  const maxDrift = o.maxHorizDrift ?? 1e-5;

  const pivots = Array.isArray(meta.rig?.pivotNames) ? meta.rig!.pivotNames! : [];
  const rawEdges = meta.rig?.hierarchy;
  const edgesValid = rawEdges === undefined || Array.isArray(rawEdges);
  const edges = Array.isArray(rawEdges) ? rawEdges : [];
  const pivotSet = new Set(pivots);

  // R1 hierarchy
  const hIssues: string[] = [];
  if (!pivots.length) hIssues.push('no pivotNames');
  if (!edgesValid) hIssues.push('rig.hierarchy must be an array of { parent, child } objects (not a map)');
  if (pivotSet.size !== pivots.length) hIssues.push('duplicate pivot names');
  if (pivots.length > maxPivots) hIssues.push(`${pivots.length} pivots exceeds max ${maxPivots} (${kind})`);
  const childrenOf = new Map<string, string[]>(), parentOf = new Map<string, string>();
  for (const edge of edges) {
    if (!edge || typeof edge.parent !== 'string' || typeof edge.child !== 'string') {
      hIssues.push('invalid hierarchy edge (expected { parent: string, child: string })');
      continue;
    }
    const { parent, child } = edge;
    if (!pivotSet.has(parent)) hIssues.push(`unknown parent "${parent}"`);
    if (!pivotSet.has(child)) hIssues.push(`unknown child "${child}"`);
    if (parent === child) hIssues.push(`self-loop on "${parent}"`);
    if (parentOf.has(child)) hIssues.push(`multiple parents for "${child}"`);
    parentOf.set(child, parent);
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(child);
  }
  const roots = pivots.filter((p) => !parentOf.has(p));
  if (pivots.length && roots.length !== 1) hIssues.push(`expected 1 root pivot, found ${roots.length} (${roots.join(', ') || 'none'})`);
  const seen = new Set<string>(), stack = roots.length === 1 ? [roots[0]] : [];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const ch of childrenOf.get(cur) ?? []) stack.push(ch);
  }
  if (roots.length === 1 && seen.size !== pivotSet.size) {
    const unreachable = pivots.filter((p) => !seen.has(p));
    hIssues.push(`unreachable or cyclic pivot(s): ${unreachable.join(', ')}`);
  }
  gates.push({
    gate: 'R1 hierarchy',
    value: hIssues.length ? hIssues.join('; ') : `${pivots.length} pivots, root ${roots[0]}, acyclic tree`,
    pass: hIssues.length === 0,
    hint: 'keep one root pivot, unique names, valid parent->child edges, and <= maxPivots',
  });

  // R2 rest-pose
  const rest = meta.rig?.restLocalPositions;
  if (rest && pivots.length) {
    const bad = pivots.filter((p) => !isFinite3(rest[p]));
    gates.push({
      gate: 'R2 rest-pose',
      value: bad.length ? `missing or non-finite rest position for: ${bad.join(', ')}` : `all ${pivots.length} pivots have finite [x,y,z] rest positions`,
      pass: bad.length === 0,
      hint: 'record restLocalPositions as finite [x, y, z] for every pivot in rest pose',
    });
  } else skipped.push('R2 rest-pose (no rig.restLocalPositions in metadata)');

  // R3 clips
  const clips = meta.animations;
  if (clips) {
    const cIssues: string[] = [], names = new Set<string>();
    if (!clips.length) cIssues.push('no animations listed');
    for (const c of clips) {
      if (!c.name) cIssues.push('clip with empty name');
      else if (names.has(c.name)) cIssues.push(`duplicate clip "${c.name}"`);
      names.add(c.name);
      if (excluded.has(c.name)) cIssues.push(`inspection clip "${c.name}" must be excluded from exported gameplay clips`);
      if (!(typeof c.durationSeconds === 'number' && Number.isFinite(c.durationSeconds) && c.durationSeconds > 0))
        cIssues.push(`invalid duration on "${c.name}": ${c.durationSeconds}`);
    }
    gates.push({
      gate: 'R3 clips',
      value: cIssues.length ? cIssues.join('; ') : `${clips.length} gameplay clips, unique names, finite positive durations`,
      pass: cIssues.length === 0,
      hint: 'exclude RefPose from export and ensure every gameplay clip has a unique name and positive duration',
    });
  } else skipped.push('R3 clips (no animations array in metadata)');

  // R4 tracks & horizontal drift
  const trackClips = (clips ?? []).filter((c) => Array.isArray(c.tracks) && c.tracks.length > 0);
  const suppliedDrift = meta.qa?.maxHorizDrift;
  const hasDrift = suppliedDrift !== undefined;
  if (trackClips.length || hasDrift) {
    const tIssues: string[] = [];
    let totalTracks = 0;
    let hasRootPosition = false;
    for (const c of trackClips) {
      for (const tr of c.tracks!) {
        totalTracks++;
        const target = tr.name.includes('.') ? tr.name.slice(0, tr.name.lastIndexOf('.')) : tr.name;
        if (pivotSet.size && !pivotSet.has(target)) tIssues.push(`${c.name}: unknown track target "${target}"`);
        if (!Array.isArray(tr.times) || !Array.isArray(tr.values) || !tr.times.length || !tr.values.length) {
          tIssues.push(`${c.name}/${tr.name}: missing or empty track samples`);
          continue;
        }
        const valuesPerKey = tr.values.length / tr.times.length;
        const isPosition = tr.name.endsWith('.position');
        const isVector3 = isPosition || tr.name.endsWith('.scale');
        const isQuaternion = tr.name.endsWith('.quaternion');
        if (!Number.isInteger(valuesPerKey) || (isVector3 && valuesPerKey !== 3) || (isQuaternion && valuesPerKey !== 4)) {
          tIssues.push(`${c.name}/${tr.name}: ${tr.values.length} values do not match ${tr.times.length} timestamps`);
          continue;
        }
        if (tr.times.some((v) => !Number.isFinite(v)) || tr.values.some((v) => !Number.isFinite(v))) tIssues.push(`${c.name}/${tr.name}: non-finite sample`);
        for (let i = 1; i < tr.times.length; i++) if (!(tr.times[i] > tr.times[i - 1])) { tIssues.push(`${c.name}/${tr.name}: non-increasing timestamps`); break; }
        if (isPosition && target === roots[0]) {
          hasRootPosition = true;
          if (motionMode === 'in-place') {
            const x0 = tr.values[0], z0 = tr.values[2];
            let d = 0;
            for (let i = 0; i + 2 < tr.values.length; i += 3) d = Math.max(d, Math.abs(tr.values[i] - x0), Math.abs(tr.values[i + 2] - z0));
            if (d > maxDrift) tIssues.push(`${c.name}: horizontal root drift ${d.toFixed(4)}m > ${maxDrift}m`);
          }
        }
      }
    }
    if (hasDrift && motionMode === 'in-place') {
      if (!Number.isFinite(suppliedDrift) || suppliedDrift < 0 || suppliedDrift > maxDrift) {
        tIssues.push(`maxHorizDrift ${suppliedDrift} must be between 0 and ${maxDrift}m`);
      }
    } else if (hasDrift && (!Number.isFinite(suppliedDrift) || suppliedDrift < 0)) {
      tIssues.push(`maxHorizDrift ${suppliedDrift} must be finite and >= 0`);
    }
    if (!hasRootPosition && !hasDrift && motionMode === 'in-place') skipped.push('R4 horizontal root drift (no root position track or qa.maxHorizDrift provided)');
    const checks = [];
    if (totalTracks) checks.push(`${totalTracks} track(s) checked for finite, ordered samples and matching value counts`);
    if (motionMode === 'free') checks.push('motionMode=free (natural horizontal sway/lunge allowed)');
    else {
      if (hasRootPosition) checks.push(`root track drift <= ${maxDrift}m`);
      if (hasDrift) checks.push(`supplied maxHorizDrift <= ${maxDrift}m`);
    }
    gates.push({
      gate: 'R4 tracks & drift',
      value: tIssues.length ? tIssues.join('; ') : checks.join(', '),
      pass: tIssues.length === 0,
      hint: motionMode === 'free'
        ? 'bake one finite value tuple per strictly increasing timestamp'
        : 'bake one value tuple per strictly increasing timestamp and keep root motion in-place (X/Z constant), or pass --motion free for hovering/leaping creatures',
    });
  } else skipped.push('R4 tracks & drift (no per-clip tracks or qa.maxHorizDrift provided)');

  // R5 expressions
  if (meta.face) {
    const fIssues: string[] = [];
    const { defaultExpressionInGlb: defaultExpression, textureResolution: res, animationExpressionMapping: mapping } = meta.face;
    const allowed = new Set(meta.face.expressions ?? Object.keys(meta.files?.expressions ?? {}));
    const missing = [
      !allowed.size && 'face.expressions or files.expressions',
      !defaultExpression && 'face.defaultExpressionInGlb',
      res === undefined && 'face.textureResolution',
    ].filter(Boolean);
    const pow2 = (n: number) => Number.isSafeInteger(n) && n >= 64 && n === 2 ** Math.round(Math.log2(n));
    if (res !== undefined && (!Array.isArray(res) || res.length !== 2 || res[0] !== res[1] || !pow2(res[0]))) {
      fIssues.push('textureResolution should be square power-of-two >= 64');
    }
    if (defaultExpression && allowed.size && !allowed.has(defaultExpression)) {
      fIssues.push(`defaultExpressionInGlb "${defaultExpression}" not in expressions`);
    }
    for (const [clipName, expr] of Object.entries(mapping ?? {})) {
      if (allowed.size && !allowed.has(expr)) fIssues.push(`mapping ${clipName}->"${expr}" not in expressions`);
    }
    for (const c of clips ?? []) {
      if (c.expression && allowed.size && !allowed.has(c.expression)) fIssues.push(`clip ${c.name} expression "${c.expression}" not in expressions`);
    }
    if (missing.length) skipped.push(`R5 expressions (missing ${missing.join(', ')})`);
    if (fIssues.length || !missing.length) {
      gates.push({
        gate: 'R5 expressions',
        value: fIssues.length ? fIssues.join('; ') : `${allowed.size} declared expression(s), ${res!.join('x')}, supplied clip mappings valid`,
        pass: fIssues.length === 0,
        hint: 'keep static expression PNGs square power-of-two (e.g. 512x512) and map clips to declared expressions',
      });
    }
  } else skipped.push('R5 expressions (no face section in metadata)');

  // R6 floor / slide clearance
  const drop = meta.qa?.slideDropPct, minY = meta.qa?.slideMinY, clipMinY = meta.qa?.clipMinY;
  const sIssues: string[] = [];
  if (drop !== undefined && (!Number.isFinite(drop) || drop < minSlideDrop)) sIssues.push(`slide drop ${drop}% must be finite and >= ${minSlideDrop}%`);
  if (minY !== undefined && (!Number.isFinite(minY) || minY < minSlideY)) sIssues.push(`slide minY ${minY}m must be finite and >= ${minSlideY}m`);
  if (clipMinY !== undefined && (!Number.isFinite(clipMinY) || clipMinY < minSlideY)) sIssues.push(`clip minY ${clipMinY}m must be finite and >= ${minSlideY}m`);
  if (drop !== undefined || minY !== undefined) {
    if (drop === undefined || minY === undefined) {
      const missing = [drop === undefined && 'qa.slideDropPct', minY === undefined && 'qa.slideMinY'].filter(Boolean);
      skipped.push(`R6 slide clearance (missing ${missing.join(' and ')})`);
    }
    if (sIssues.length || (drop !== undefined && minY !== undefined)) {
      gates.push({
        gate: 'R6 slide clearance',
        value: sIssues.length ? sIssues.join('; ') : `drop ${drop}%, minY ${minY}m`,
        pass: sIssues.length === 0,
        hint: 'raise root Y slightly or bend legs/tail upward at Slide peak so lowest Y stays >= -0.025m while height drops >= 22%',
      });
    }
  } else if (clipMinY !== undefined) {
    gates.push({
      gate: 'R6 floor clearance',
      value: sIssues.length ? sIssues.join('; ') : `clip minY ${clipMinY}m >= ${minSlideY}m`,
      pass: sIssues.length === 0,
      hint: 'adjust root Y or limb/tail arc so no animated frame dips below the floor',
    });
  } else {
    skipped.push('R6 slide clearance (missing qa.slideDropPct and qa.slideMinY)');
  }

  return {
    gates,
    skipped,
    stats: {
      pivots: pivots.length,
      edges: edges.length,
      clips: clips?.length ?? 0,
      root: roots[0] ?? null,
    },
  };
}
