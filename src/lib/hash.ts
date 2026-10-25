import crypto from 'node:crypto';

export const sha256 = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');

/** Stable JSON: object keys sorted recursively, so hashes do not depend on insertion order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = sortKeys(val);
    }
    return out;
  }
  return v;
}
export const hashJson = (v: unknown): string => sha256(stableJson(v));
