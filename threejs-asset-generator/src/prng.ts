// src/prng.ts
export function hashString(str: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function createPRNG(seed = 1) {
  let s = seed >>> 0;                              // 0 is a valid seed and must differ from 1
  const next: any = () => {                       // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.seed = seed >>> 0;
  // fork(label) depends only on (seed, label), never on how much the parent has consumed
  next.fork = (label: string) =>
    createPRNG((hashString(String(label)) ^ Math.imul(next.seed, 0x9e3779b1)) >>> 0);
  return next as (() => number) & { seed: number; fork: (label: string) => any };
}

export type Rng = ReturnType<typeof createPRNG>;
