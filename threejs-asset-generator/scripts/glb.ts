// scripts/glb.ts: pure GLB (binary glTF 2.0) writer and checker over triangle arrays. No THREE, no DOM, no fs. Node-testable.
// Input: named parts { name: Tris } (9 numbers per triangle, CCW seen from outside). Output: one scene, one node and one mesh per part,
// POSITION + flat NORMAL (non-indexed, so flat shading survives), unit = metre, Y up, +Z forward: the skill's conventions equal glTF's (references/glb-export.md).
// Gate ids: E1 container (magic, version, length, chunks) · E2 JSON (schema subset we write) · E3 accessors (bounds, alignment, min/max)
//           · E4 round-trip (positions equal the input at float32) · E5 normals (unit length, agree with winding) · E6 counts (triangles in = triangles out)
import type { Gate } from './result';
export type { Gate };
export type Tris = number[];
export type Parts = Record<string, Tris>;

const MAGIC = 0x46546c67, VERSION = 2, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;   // 'glTF', 2, 'JSON', 'BIN\0'
const FLOAT = 5126, ARRAY_BUFFER = 34962;
const pad4 = (n: number) => (n + 3) & ~3;

export type GlbOptions = { generator?: string; materialColor?: [number, number, number, number]; metallic?: number; roughness?: number };

/** Flat normal of triangle at offset i (9 numbers). Zero vector for a degenerate triangle. */
export function faceNormal(t: Tris, i: number): [number, number, number] {
  const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
  return l > 0 ? [nx / l, ny / l, nz / l] : [0, 0, 0];
}

/** Writes parts to a GLB. Throws on empty or non-finite input: run qa-asset first (Q1). */
export function partsToGlb(parts: Parts, opt: GlbOptions = {}): Uint8Array {
  const names = Object.keys(parts);
  if (!names.length) throw new Error('no parts to export');
  const chunks: Float32Array[] = [], bufferViews: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: object[] = [];
  let offset = 0;
  for (const name of names) {
    const t = parts[name];
    if (t.length === 0 || t.length % 9 !== 0) throw new Error(`part "${name}": ${t.length} numbers is not a whole number of triangles (9 each)`);
    if (!t.every(Number.isFinite)) throw new Error(`part "${name}": contains NaN or Infinity`);
    const n = t.length / 3, pos = new Float32Array(t), nor = new Float32Array(t.length), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < t.length; i += 9) {
      const f = faceNormal(t, i);
      for (let v = 0; v < 3; v++) for (let k = 0; k < 3; k++) nor[i + v * 3 + k] = f[k];
    }
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }   // min/max of the float32 values, as the spec requires
    const base = accessors.length;
    for (const [arr, withBounds] of [[pos, true], [nor, false]] as const) {
      bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength, target: ARRAY_BUFFER });
      accessors.push({ bufferView: bufferViews.length - 1, componentType: FLOAT, count: n, type: 'VEC3', ...(withBounds ? { min, max } : {}) });
      chunks.push(arr); offset += arr.byteLength;                                    // float32 vec3 data stays 4-byte aligned by construction
    }
    meshes.push({ name, primitives: [{ attributes: { POSITION: base, NORMAL: base + 1 }, material: 0, mode: 4 }] });
    nodes.push({ name, mesh: meshes.length - 1 });
  }
  const json = {
    asset: { version: '2.0', generator: opt.generator ?? 'threejs-asset-generator scripts/glb.ts' },
    scene: 0, scenes: [{ name: 'asset', nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews, buffers: [{ byteLength: offset }],
    materials: [{ name: 'default', pbrMetallicRoughness: { baseColorFactor: opt.materialColor ?? [0.8, 0.8, 0.8, 1], metallicFactor: opt.metallic ?? 0, roughnessFactor: opt.roughness ?? 0.9 } }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json)), jsonLen = pad4(jsonBytes.length), binLen = pad4(offset);
  const total = 12 + 8 + jsonLen + 8 + binLen, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, VERSION, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, JSON_CHUNK, true); out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen);   // JSON pads with spaces
  const b0 = 20 + jsonLen; dv.setUint32(b0, binLen, true); dv.setUint32(b0 + 4, BIN_CHUNK, true);
  let p = b0 + 8; for (const c of chunks) { out.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), p); p += c.byteLength; }   // BIN pads with zeros (already zero)
  return out;
}

export type GlbInfo = { json: any; bin: Uint8Array; parts: Parts; normals: Parts };

/** Reads a GLB written by `partsToGlb` (or any GLB that uses non-indexed float32 POSITION/NORMAL). Throws a readable error on a malformed container. */
export function readGlb(bytes: Uint8Array): GlbInfo {
  if (bytes.length < 20) throw new Error(`E1: ${bytes.length} bytes is shorter than a GLB header and one chunk header`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('E1: magic is not "glTF"');
  if (dv.getUint32(4, true) !== VERSION) throw new Error(`E1: version ${dv.getUint32(4, true)}, expected 2`);
  if (dv.getUint32(8, true) !== bytes.length) throw new Error(`E1: header length ${dv.getUint32(8, true)} differs from file size ${bytes.length}`);
  let p = 12, json: any = null, bin = new Uint8Array(0), first = true;
  while (p < bytes.length) {
    if (p + 8 > bytes.length) throw new Error('E1: truncated chunk header');
    const len = dv.getUint32(p, true), type = dv.getUint32(p + 4, true), start = p + 8;
    if (len % 4 !== 0) throw new Error(`E1: chunk length ${len} is not a multiple of 4`);
    if (start + len > bytes.length) throw new Error('E1: chunk runs past the end of the file');
    if (first && type !== JSON_CHUNK) throw new Error('E1: first chunk must be JSON');
    if (type === JSON_CHUNK) { try { json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + len))); } catch (e) { throw new Error(`E2: JSON chunk does not parse: ${(e as Error).message}`); } }
    else if (type === BIN_CHUNK) bin = bytes.subarray(start, start + len);
    first = false; p = start + len;
  }
  if (!json) throw new Error('E1: no JSON chunk');
  const parts: Parts = {}, normals: Parts = {};
  for (const node of json.nodes ?? []) {
    const prim = json.meshes?.[node.mesh]?.primitives?.[0];
    if (!prim) throw new Error(`E2: node "${node.name}" has no mesh primitive`);
    for (const [attr, into] of [['POSITION', parts], ['NORMAL', normals]] as const) {
      const acc = json.accessors?.[prim.attributes?.[attr]], bv = json.bufferViews?.[acc?.bufferView];
      if (!acc || !bv) throw new Error(`E2: node "${node.name}" lacks accessor or bufferView for ${attr}`);
      const from = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0), len = acc.count * 12;
      if (from % 4 !== 0 || from + len > bin.length || from + len > (bv.byteOffset ?? 0) + bv.byteLength) throw new Error(`E3: ${attr} of "${node.name}" is misaligned or runs past its bufferView/BIN chunk`);
      into[node.name] = Array.from(new Float32Array(bin.slice(from, from + len).buffer));   // slice copies, so alignment of the source does not matter
    }
  }
  return { json, bin, parts, normals };
}

const f32 = (x: number) => Math.fround(x);
/** Checks a GLB against the parts it was written from. */
export function glbGates(bytes: Uint8Array, source: Parts): Gate[] {
  const gates: Gate[] = [];
  let info: GlbInfo;
  try { info = readGlb(bytes); } catch (e) {
    const m = (e as Error).message, id = /^E(\d)/.exec(m)?.[1] ?? '1';
    return [{ gate: id === '2' ? 'E2 json' : id === '3' ? 'E3 accessors' : 'E1 container', value: m, pass: false, hint: 'the file is malformed: rewrite it with partsToGlb, do not patch bytes' }];
  }
  gates.push({ gate: 'E1 container', value: `${bytes.length} bytes, glTF 2, JSON + BIN chunks, length matches`, pass: true, hint: '' });
  const j = info.json, names = Object.keys(source);
  const jerr: string[] = [];
  if (j.asset?.version !== '2.0') jerr.push('asset.version is not "2.0"');
  if (!Array.isArray(j.scenes) || j.scene !== 0) jerr.push('scene 0 missing');
  if (JSON.stringify((j.nodes ?? []).map((n: any) => n.name)) !== JSON.stringify(names)) jerr.push(`node names ${JSON.stringify((j.nodes ?? []).map((n: any) => n.name))} differ from the parts ${JSON.stringify(names)}`);
  if (j.buffers?.[0]?.byteLength > info.bin.length) jerr.push('buffers[0].byteLength exceeds the BIN chunk');
  gates.push({ gate: 'E2 json', value: jerr.length ? jerr.join('; ') : `${names.length} node(s) named after the parts, one mesh each`, pass: !jerr.length, hint: 'node names carry the part names the QA gates report: keep them identical' });
  const aerr: string[] = [];
  for (const [i, a] of (j.accessors ?? []).entries()) {
    if (a.componentType !== FLOAT || a.type !== 'VEC3') { aerr.push(`accessor ${i} is not float32 VEC3`); continue; }
    if (a.min) {                                   // POSITION only: min/max must be the exact bounds of the data
      const v = new Float32Array(info.bin.slice((j.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0), (j.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0) + a.count * 12).buffer);
      for (let k = 0; k < 3; k++) { let lo = Infinity, hi = -Infinity; for (let q = k; q < v.length; q += 3) { lo = Math.min(lo, v[q]); hi = Math.max(hi, v[q]); } if (lo !== a.min[k] || hi !== a.max[k]) aerr.push(`accessor ${i} min/max[${k}] is not the data bounds`); }
    }
  }
  gates.push({ gate: 'E3 accessors', value: aerr.length ? aerr.join('; ') : `${(j.accessors ?? []).length} accessors in bounds, 4-byte aligned, POSITION min/max exact`, pass: !aerr.length, hint: 'viewers reject a POSITION accessor whose min/max do not match' });
  let worst = 0, bad = '';
  for (const n of names) { const a = source[n], b = info.parts[n] ?? []; if (a.length !== b.length) { worst = Infinity; bad = n; break; } for (let i = 0; i < a.length; i++) { const d = Math.abs(f32(a[i]) - b[i]); if (d > worst) { worst = d; bad = n; } } }
  gates.push({ gate: 'E4 round-trip', value: worst === 0 ? 'positions equal the input at float32' : `part "${bad}" differs by ${worst}`, pass: worst === 0, hint: 'the writer must not reorder or transform vertices' });
  let nbad = 0, nWhere = '';
  for (const n of names) { const t = info.parts[n] ?? [], nr = info.normals[n] ?? []; for (let i = 0; i + 8 < t.length; i += 9) { const f = faceNormal(t, i), len = Math.hypot(nr[i], nr[i + 1], nr[i + 2]); const dot = f[0] * nr[i] + f[1] * nr[i + 1] + f[2] * nr[i + 2]; if (len > 0 && (Math.abs(len - 1) > 1e-5 || dot < 0.999)) { nbad++; nWhere ||= `${n} triangle ${i / 9}`; } } }
  gates.push({ gate: 'E5 normals', value: nbad ? `${nbad} normal(s) off, first at ${nWhere}` : 'unit length and equal to the face normal (winding agrees)', pass: nbad === 0, hint: 'a normal opposite to its winding means the part is inside-out: run qa-asset Q3' });
  const cin = names.reduce((s, n) => s + source[n].length / 9, 0), cout = names.reduce((s, n) => s + (info.parts[n]?.length ?? 0) / 9, 0);
  gates.push({ gate: 'E6 counts', value: `${cin} triangles in, ${cout} out`, pass: cin === cout, hint: 'triangles lost or duplicated in the writer' });
  return gates;
}
