// scripts/qacheck.ts: pure QA gates over triangle arrays (9 numbers per triangle, CCW seen from outside). No THREE, no DOM, no fs. Node-testable.
// A "build" returns Tris, { tris }, named parts, or { parts: named parts }. Parts let the winding and closed-mesh gates
// skip zero-thickness sheets (wings, flags) with `open`, while every closed part is still held to them.
// Gate ids: Q1 finite · Q2 degenerate · Q3 winding · Q4 closed · Q5 budget · Q6 grounding · Q7 symmetry (opt-in) · Q8 determinism · Q9 seed 0
// (Q10 visible faces comes from the rendered review image, see qa-asset.ts and review.ts.)
import type { Gate } from './result';
export type { Gate };
export type Tris = number[];
export type Parts = Record<string, Tris>;
export type QAOptions = {
  budget?: number;          // max triangles when a deployment profile or explicit limit is selected
  open?: string[];          // part names that are sheets (no volume); 'all' skips Q3 and Q4 for everything
  symmetric?: boolean;      // Q7: the vertex set must equal its mirror image through x = 0
  grounding?: boolean;      // run Q6, default true. A raw kernel is not grounded (groundAsset does that), so qa-asset turns it off for --module unless --grounded
  footprint?: boolean;      // Q6 also requires the footprint centred on x = z = 0 (use on the FINAL grounded asset, not on a raw kernel)
  groundY?: number;         // expected lowest Y, default 0 (a composite with a terrain slab defines Y = 0 as the slab top)
  weld?: number;            // vertex weld distance for Q4 and Q7, default 1e-4 (0.1 mm)
  maxDegenerate?: number;   // allowed degenerate triangles, default 0
};
export const DEFAULTS = { weld: 1e-4, degenerate: 1e-9, groundTol: 1e-3, footprintTol: 0.02, symmetryTol: 0.01 };

const num = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number');
/** Normalize the triangle formats used by the QA, budget, export, and reference tools. */
export function normalizeParts(out: unknown): Parts {
  if (num(out)) return { asset: out };
  if (out && typeof out === 'object') {
    const o = out as Record<string, unknown>;
    if (num(o.tris)) return { asset: o.tris };
    const flat = Object.entries(o).filter((entry): entry is [string, Tris] => num(entry[1]));
    if (flat.length) return Object.fromEntries(flat);

    const wrapper = o.parts;
    if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
      const named: [string, Tris][] = [];
      for (const [name, tris] of Object.entries(wrapper)) {
        if (!num(tris)) throw new Error(`parts.${name} must be an array of triangle coordinates`);
        named.push([name, tris]);
      }
      if (!named.length) throw new Error('parts must contain at least one named triangle array');
      return Object.fromEntries(named);
    }
  }
  throw new Error('builder must return number[], { tris: number[] }, named triangle parts, or { parts: named triangle parts }');
}
export const flatten = (parts: Parts): Tris => { const out: number[] = []; for (const k of Object.keys(parts)) for (const v of parts[k]) out.push(v); return out; };
export const triCount = (t: Tris) => Math.floor(t.length / 9);

export function boundsOf(t: Tris) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < t.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], t[i + k]); max[k] = Math.max(max[k], t[i + k]); }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}

/** Signed volume of a closed mesh: > 0 means outward CCW. Same formula as src/tri.ts (kept here so scripts/ stays self-contained). */
export function signedVolume(t: Tris) {
  let v = 0;
  for (let i = 0; i + 8 < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5], cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

export const triArea = (t: Tris, i: number) => {
  const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
};
/** Indices (triangle numbers) whose area is below `rel` x diagonal^2 of the whole asset. */
export function degenerateTris(t: Tris, rel = DEFAULTS.degenerate): number[] {
  const diag = Math.hypot(...boundsOf(t).size) || 1, eps = rel * diag * diag, out: number[] = [];
  for (let q = 0; q < triCount(t); q++) if (!(triArea(t, q * 9) > eps)) out.push(q);
  return out;
}

// Rounds symmetrically around 0 so that x and -x always land in mirrored cells (Math.round(-0.5) is -0, Math.round(0.5) is 1).
const cell = (v: number, tol: number) => Math.sign(v) * Math.round(Math.abs(v) / tol) || 0;
const vkey = (t: Tris, i: number, tol: number, flipX = false) => `${(flipX ? -1 : 1) * cell(t[i], tol) || 0},${cell(t[i + 1], tol)},${cell(t[i + 2], tol)}`;

/** Closed-mesh report after welding vertices within `tol`. boundary = directed edges without a partner (a hole); duplicated = directed edges used twice (overlap or mixed winding). */
export function edgeReport(t: Tris, tol = DEFAULTS.weld) {
  const ids = new Map<string, number>(), id = (i: number) => { const k = vkey(t, i, tol); let v = ids.get(k); if (v === undefined) ids.set(k, (v = ids.size)); return v; };
  const dir = new Map<string, number>();
  for (let q = 0; q < triCount(t); q++) {
    const a = id(q * 9), b = id(q * 9 + 3), c = id(q * 9 + 6);
    if (a === b || b === c || a === c) continue;                       // collapsed by welding: Q2 reports these
    for (const [p, r] of [[a, b], [b, c], [c, a]]) dir.set(`${p}>${r}`, (dir.get(`${p}>${r}`) ?? 0) + 1);
  }
  let boundary = 0, duplicated = 0;
  for (const [k, n] of dir) { const [p, r] = k.split('>'); if (!dir.has(`${r}>${p}`)) boundary++; if (n > 1) duplicated++; }
  return { boundary, duplicated, edges: dir.size };
}

/** Share (0..1) of welded vertices whose mirror image through x = 0 is not a vertex of the asset.
 *  Vertices, not triangles: a box splits every quad along a diagonal that is not mirror-symmetric, so a symmetric shape would fail a triangle comparison. */
export function symmetryGap(t: Tris, tol = DEFAULTS.weld) {
  const have = new Set<string>(), keys: [string, string][] = [];
  for (let i = 0; i + 2 < t.length; i += 3) { const k = vkey(t, i, tol, false); if (!have.has(k)) { have.add(k); keys.push([k, vkey(t, i, tol, true)]); } }
  let missing = 0; for (const [, m] of keys) if (!have.has(m)) missing++;
  return keys.length ? missing / keys.length : 0;
}

/** Rounded 32-bit hash of coordinates (1e-6 grid) and length. For comparing two builds, not for security. */
export function hashTris(t: Tris): number {
  let h = t.length | 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + Math.round(t[i] * 1e6)) | 0;
  return h;
}

const fmt = (v: number, d = 3) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
const list = (names: string[], max = 4) => names.slice(0, max).join(', ') + (names.length > max ? `, +${names.length - max} more` : '');

/** Q1..Q7 over a built asset. `skipped` names the unchecked gates and why they were skipped. */
export function qaGates(parts: Parts, o: QAOptions = {}): { gates: Gate[]; skipped: string[]; stats: Record<string, unknown> } {
  const gates: Gate[] = [], skipped: string[] = [], all = flatten(parts), names = Object.keys(parts);
  const tris = triCount(all), bad = all.findIndex((v) => !Number.isFinite(v));
  const stats: Record<string, unknown> = { triangles: tris, parts: Object.fromEntries(names.map((n) => [n, triCount(parts[n])])), hash: hashTris(all) };
  const badPart = names.find((n) => parts[n].length % 9 !== 0);
  gates.push({
    gate: 'Q1 finite',
    value: tris === 0 ? 'no triangles' : badPart ? `part "${badPart}" has ${parts[badPart].length} numbers (not a multiple of 9)` : bad >= 0 ? `NaN or Infinity at number ${bad} (triangle ${Math.floor(bad / 9)})` : `${tris} triangles, all coordinates finite`,
    pass: tris > 0 && !badPart && bad < 0,
    hint: 'a division by zero or a zero-length normalize upstream; a part must hold whole triangles (9 numbers each)',
  });
  if (!gates[0].pass) return { gates, skipped: ['Q2 to Q7 (Q1 failed, the numbers would be meaningless)'], stats };

  const b = boundsOf(all);
  stats.size = b.size.map((v) => +v.toFixed(3)); stats.min = b.min.map((v) => +v.toFixed(3)); stats.max = b.max.map((v) => +v.toFixed(3));
  const degen = degenerateTris(all), maxDeg = o.maxDegenerate ?? 0;
  gates.push({ gate: 'Q2 degenerate', value: `${degen.length} zero-area triangles${degen.length ? ` (first: ${list(degen.slice(0, 4).map(String), 4)})` : ''}`, pass: degen.length <= maxDeg, hint: 'a collapsed ring or a ring of radius 0 (tube end, loft stage with scale 0) emits zero-area triangles; cap with a fan or drop the ring' });

  const openAll = (o.open ?? []).includes('all'), isOpen = (n: string) => openAll || (o.open ?? []).includes(n);
  const closed = names.filter((n) => !isOpen(n) && parts[n].length >= 9);
  if (openAll) { skipped.push('Q3 winding', 'Q4 closed (--open all)'); gates.push({ gate: 'Q3 winding', value: 'skipped (--open all)', pass: true, hint: '' }, { gate: 'Q4 closed', value: 'skipped (--open all)', pass: true, hint: '' }); }
  else {
    const vols = closed.map((n) => [n, signedVolume(parts[n])] as const), neg = vols.filter(([, v]) => !(v > 1e-9));
    gates.push({ gate: 'Q3 winding', value: neg.length ? neg.map(([n, v]) => `${n} volume ${fmt(v, 4)}`).join(', ') : `${closed.length} closed part(s), all volumes > 0${names.length > closed.length ? ` (open: ${list(names.filter((n) => !closed.includes(n)))})` : ''}`, pass: neg.length === 0, hint: 'volume < 0 while Q4 passes: the part is inside-out, swap two vertices per triangle (mirrorTris does this). If Q4 lists open edges for the same part, it is a sheet (fan, flag, wing; its "volume" is meaningless and can be negative): list it in --open' });
    const reps = closed.map((n) => [n, edgeReport(parts[n], o.weld)] as const), leaky = reps.filter(([, r]) => r.boundary || r.duplicated);
    gates.push({ gate: 'Q4 closed', value: leaky.length ? leaky.map(([n, r]) => `${n}: ${r.boundary} open edges, ${r.duplicated} duplicated`).join('; ') : `${closed.length} closed part(s), every edge has a partner`, pass: leaky.length === 0, hint: 'open edges: a missing cap or a seam that is not welded (jitter before add(), then weld). duplicated edges: overlapping faces or one triangle with flipped winding' });
  }

  if (o.budget === undefined) skipped.push('Q5 budget (set --profile or --budget)');
  else gates.push({ gate: 'Q5 budget', value: `${tris} of ${o.budget} triangles`, pass: tris <= o.budget, hint: 'reduce segments or sides, merge parts, or drop small details to fit the selected limit' });

  if (o.grounding === false) skipped.push('Q6 grounding (raw kernel: groundAsset does this; check the final asset with --tris, or pass --grounded if this builder grounds itself)');
  else {
  const gy = o.groundY ?? 0, off = b.min[1] - gy, size = Math.max(b.size[0], b.size[2]) || 1;
  const cx = b.center[0] / size, cz = b.center[2] / size, centred = Math.abs(cx) <= DEFAULTS.footprintTol && Math.abs(cz) <= DEFAULTS.footprintTol;
  gates.push({
    gate: 'Q6 grounding',
    value: `lowest Y ${fmt(b.min[1])} (expected ${fmt(gy)})${o.footprint ? `, footprint centre ${fmt(b.center[0])}, ${fmt(b.center[2])}` : ''}`,
    pass: Math.abs(off) <= DEFAULTS.groundTol && (!o.footprint || centred),
    hint: Math.abs(off) > DEFAULTS.groundTol ? `asset floats or sinks by ${fmt(off)} m: wrap it with groundAsset (src/lifecycle.ts) and test the wrapped result` : 'footprint is off-centre: groundAsset(content, true) centres x and z',
  });
  if (!o.footprint) skipped.push('Q6 footprint centring (pass --footprint on the final grounded asset)');
  }

  if (o.symmetric) {
    const gap = symmetryGap(all, o.weld);
    gates.push({ gate: 'Q7 symmetry', value: `${(gap * 100).toFixed(1)}% of vertices have no mirror partner`, pass: gap <= DEFAULTS.symmetryTol, hint: 'one side was built twice with different streams, or a bare negative-scale applyMatrix4 was used: build one side and mirror through add()/mirrorTris. Also: a tube or loft with an ODD side count has a vertex on one side and a flat on the other when its ring starts on the X axis, use an even count' });
  } else skipped.push('Q7 symmetry (opt-in: --symmetric)');
  return { gates, skipped, stats };
}

type Build = (params: Record<string, unknown>) => unknown | Promise<unknown>;
const SEEDS = [1, 2, 42, 101, 12345];
/** Q8 and Q9: needs the builder itself, so it only runs in module mode. */
export async function determinismGates(build: Build, params: Record<string, unknown> = {}, seedKey = 'seed'): Promise<Gate[]> {
  const run = async (p: Record<string, unknown>) => flatten(normalizeParts(await build({ ...p })));
  const a = await run(params), c = await run(params);
  let at = -1; const n = Math.max(a.length, c.length); for (let i = 0; i < n; i++) if (!Object.is(a[i], c[i])) { at = i; break; }
  const gates: Gate[] = [{ gate: 'Q8 determinism', value: at < 0 ? `two builds identical (${triCount(a)} triangles)` : `builds differ at number ${at} (triangle ${Math.floor(at / 9)})`, pass: at < 0, hint: 'no Math.random, Date.now, DOM or module-level mutable state; give each feature its own forked stream (SKILL.md §2)' }];
  const zero = await run({ ...params, [seedKey]: 0 }), others = await Promise.all(SEEDS.map((s) => run({ ...params, [seedKey]: s }))), hs = others.map(hashTris), h0 = hashTris(zero);
  const seeded = new Set(hs).size > 1, alias = seeded ? SEEDS[hs.indexOf(h0)] : undefined, finite = zero.length > 0 && zero.every(Number.isFinite);
  gates.push({
    gate: 'Q9 seed 0',
    value: !finite ? 'seed 0 gives no or non-finite triangles' : !seeded ? `asset does not depend on "${seedKey}"` : alias !== undefined ? `seed 0 gives the same asset as seed ${alias}` : 'seed 0 builds its own asset',
    pass: finite && alias === undefined,
    hint: 'seed 0 is being replaced: look for `seed || fallback` (use ??) or a schema `min` above 0',
  });
  return gates;
}
