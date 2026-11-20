import type * as THREE from 'three';
// src/types.ts
export type ParamType = 'number' | 'boolean' | 'color' | 'select';
export interface ParamDef {
  id: string; label: string; type: ParamType;
  default: number | boolean | string;
  min?: number; max?: number; step?: number;   // number
  options?: string[];                          // select
  group?: string;                              // UI section
  visibleIf?: { id: string; equals: unknown }; // UI only, never affects geometry
}
export interface AssetGeneratorSchema {
  id: string; name: string; category: string; description: string;
  parameters: ParamDef[];
  presetConfigs?: Record<string, Record<string, unknown>>; // partial overrides, validated by resolveParams
  generate: (params: Record<string, unknown>) => THREE.Group;
  generateCode: (params: Record<string, unknown>) => string | Promise<string>;
}
