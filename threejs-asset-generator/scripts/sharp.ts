// scripts/sharp.ts: loads `sharp` from the project, or from NODE_PATH / global installs (ESM import ignores NODE_PATH, require does not).
import { createRequire } from 'node:module';
export async function loadSharp(): Promise<any | null> {
  try { return (await import('sharp')).default; } catch { /* fall through */ }
  try { return createRequire(import.meta.url)('sharp'); } catch { return null; }
}
