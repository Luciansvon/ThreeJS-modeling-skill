// src/params.ts
import type { ParamDef } from './types';

export function resolveParams(schema: { parameters: ParamDef[] }, input: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = {};
  for (const def of schema.parameters) {
    let v: any = input[def.id] ?? def.default;
    if (def.type === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) v = def.default;
      if (def.min != null) v = Math.max(def.min, v);
      if (def.max != null) v = Math.min(def.max, v);
      if (def.step) v = Math.round((v - (def.min ?? 0)) / def.step) * def.step + (def.min ?? 0);
      v = Number(v.toFixed(6));
    } else if (def.type === 'boolean') v = Boolean(v);
    else if (def.type === 'select') { if (!def.options!.includes(v)) v = def.default; }
    else if (def.type === 'color') { if (!/^#[0-9a-f]{6}$/i.test(String(v))) v = def.default; }
    out[def.id] = v;
  }
  return out;
}
