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
  qa?: {
    maxHorizDrift?: number;
    slideDropPct?: number;
    slideMinY?: number;
  };
};

export type RigCheckOptions = {
  maxPivots?: number;
  excludeClips?: string[];
  minSlideDropPct?: number;
  minSlideY?: number;
  maxHorizDrift?: number;
};

const isFinite3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export function rigGates(meta: RigMeta, o: RigCheckOptions = {}): { gates: Gate[]; skipped: string[]; stats: Record<string, unknown> } {
  const gates: Gate[] = [], skipped: string[] = [];
  const maxPivots = o.maxPivots ?? 16;
  const excluded = new Set(o.excludeClips ?? ['RefPose']);
  const minSlideDrop = o.minSlideDropPct ?? 22;
  const minSlideY = o.minSlideY ?? -0.025;
  const maxDrift = o.maxHorizDrift ?? 1e-5;

  const pivots = meta.rig?.pivotNames ?? [];
  const edges = meta.rig?.hierarchy ?? [];
  const pivotSet = new Set(pivots);

  // R1 hierarchy
  const hIssues: string[] = [];
  if (!pivots.length) hIssues.push('no pivotNames');
  if (pivotSet.size !== pivots.length) hIssues.push('duplicate pivot names');
  if (pivots.length > maxPivots) hIssues.push(`${pivots.length} pivots exceeds max ${maxPivots}`);
  const childrenOf = new Map<string, string[]>(), parentOf = new Map<string, string>();
  for (const { parent, child } of edges) {
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
  const hasDrift = typeof meta.qa?.maxHorizDrift === 'number';
  if (trackClips.length || hasDrift) {
    const tIssues: string[] = [];
    let totalTracks = 0;
    for (const c of trackClips) {
      for (const tr of c.tracks!) {
        totalTracks++;
        const target = tr.name.includes('.') ? tr.name.slice(0, tr.name.lastIndexOf('.')) : tr.name;
        if (pivotSet.size && !pivotSet.has(target)) tIssues.push(`${c.name}: unknown track target "${target}"`);
        if (!tr.times.length || !tr.values.length) { tIssues.push(`${c.name}/${tr.name}: empty track`); continue; }
        if (tr.times.some((v) => !Number.isFinite(v)) || tr.values.some((v) => !Number.isFinite(v))) tIssues.push(`${c.name}/${tr.name}: non-finite sample`);
        for (let i = 1; i < tr.times.length; i++) if (!(tr.times[i] > tr.times[i - 1])) { tIssues.push(`${c.name}/${tr.name}: non-increasing timestamps`); break; }
        if (tr.name.endsWith('.position') && target === roots[0] && tr.values.length >= 3) {
          const x0 = tr.values[0], z0 = tr.values[2];
          let d = 0;
          for (let i = 0; i + 2 < tr.values.length; i += 3) d = Math.max(d, Math.abs(tr.values[i] - x0), Math.abs(tr.values[i + 2] - z0));
          if (d > maxDrift) tIssues.push(`${c.name}: horizontal root drift ${d.toFixed(4)}m > ${maxDrift}m`);
        }
      }
    }
    if (hasDrift) {
      const d = meta.qa!.maxHorizDrift!;
      if (!Number.isFinite(d) || d > maxDrift) tIssues.push(`maxHorizDrift ${d} exceeds ${maxDrift}m`);
    }
    gates.push({
      gate: 'R4 tracks & drift',
      value: tIssues.length ? tIssues.join('; ') : `${totalTracks ? `${totalTracks} tracks finite/monotonic, ` : ''}horizontal drift <= ${maxDrift}m`,
      pass: tIssues.length === 0,
      hint: 'bake strictly increasing Float32 timestamps and keep root motion strictly in-place (X/Z constant)',
    });
  } else skipped.push('R4 tracks & drift (no per-clip tracks or qa.maxHorizDrift provided)');

  // R5 expressions
  if (meta.face) {
    const fIssues: string[] = [];
    const allowed = new Set<string>(meta.face.expressions ?? Object.keys((meta as any).files?.expressions ?? {}));
    if (!allowed.size && meta.face.defaultExpressionInGlb) allowed.add(meta.face.defaultExpressionInGlb);
    const res = meta.face.textureResolution;
    if (res) {
      const [rw, rh] = res;
      const pow2 = (n: number) => Number.isInteger(n) && n >= 64 && (n & (n - 1)) === 0;
      if (!pow2(rw) || !pow2(rh) || rw !== rh) fIssues.push(`textureResolution ${rw}x${rh} should be square power-of-two >= 64`);
    }
    if (meta.face.defaultExpressionInGlb && allowed.size && !allowed.has(meta.face.defaultExpressionInGlb)) {
      fIssues.push(`defaultExpressionInGlb "${meta.face.defaultExpressionInGlb}" not in expressions`);
    }
    const map = meta.face.animationExpressionMapping ?? {};
    for (const [clipName, expr] of Object.entries(map)) {
      if (allowed.size && !allowed.has(expr)) fIssues.push(`mapping ${clipName}->"${expr}" not in expressions`);
    }
    for (const c of clips ?? []) {
      if (c.expression && allowed.size && !allowed.has(c.expression)) fIssues.push(`clip ${c.name} expression "${c.expression}" not in expressions`);
    }
    gates.push({
      gate: 'R5 expressions',
      value: fIssues.length ? fIssues.join('; ') : `${allowed.size} expression(s)${res ? `, ${res[0]}x${res[1]}` : ''}, all clip mappings valid`,
      pass: fIssues.length === 0,
      hint: 'keep static expression PNGs square power-of-two (e.g. 512x512) and map every clip to a declared expression',
    });
  } else skipped.push('R5 expressions (no face section in metadata)');

  // R6 slide clearance
  if (typeof meta.qa?.slideDropPct === 'number' || typeof meta.qa?.slideMinY === 'number') {
    const sIssues: string[] = [];
    const drop = meta.qa!.slideDropPct, minY = meta.qa!.slideMinY;
    if (typeof drop === 'number' && (!Number.isFinite(drop) || drop < minSlideDrop)) sIssues.push(`slide drop ${drop?.toFixed(1)}% < ${minSlideDrop}%`);
    if (typeof minY === 'number' && (!Number.isFinite(minY) || minY < minSlideY)) sIssues.push(`slide minY ${minY?.toFixed(3)}m < ${minSlideY}m (clips below floor)`);
    gates.push({
      gate: 'R6 slide clearance',
      value: sIssues.length ? sIssues.join('; ') : `drop ${drop?.toFixed(1) ?? '?'}%, minY ${minY?.toFixed(3) ?? '?'}m`,
      pass: sIssues.length === 0,
      hint: 'raise root Y slightly or bend legs/tail upward at Slide peak so lowest Y stays >= -0.025m while height drops >= 22%',
    });
  } else skipped.push('R6 slide clearance (no qa.slideDropPct / qa.slideMinY provided)');

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
