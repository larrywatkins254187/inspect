import { stableJson } from '@/lib/hash';

/**
 * Literal optional scope labels (PRD §12.1). null means "unstated" — it is never
 * inferred from another page, a locale path or a brand.
 */
export interface Scope {
  account: string | null;
  platform: string | null;
  entity: string | null;
  jurisdiction: string | null;
  instrument: string | null;
  qualifier: string | null;
  clientClass: string | null;
  spreadBasis: string | null;
  commissionSide: 'PER_SIDE' | 'ROUND_TURN' | null;
  commissionVolume: string | null;
}

export const SCOPE_KEYS: readonly (keyof Scope)[] = [
  'account',
  'platform',
  'entity',
  'jurisdiction',
  'instrument',
  'qualifier',
  'clientClass',
  'spreadBasis',
  'commissionSide',
  'commissionVolume',
];

export const emptyScope = (): Scope => ({
  account: null,
  platform: null,
  entity: null,
  jurisdiction: null,
  instrument: null,
  qualifier: null,
  clientClass: null,
  spreadBasis: null,
  commissionSide: null,
  commissionVolume: null,
});

/** Whitespace-collapsed literal label; display spelling is retained separately. */
export const cleanLabel = (s: string | null | undefined): string | null => {
  if (s === null || s === undefined) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
};

/** Normalization used only for keys/counting; never for display. */
export const normalizeLabel = (s: string | null): string | null =>
  s === null ? null : s.toLowerCase().replace(/[\s_]+/g, ' ').trim();

/** Account labels: "Standard account" and "Standard" count as one account name. */
export const normalizeAccountLabel = (s: string | null): string | null => {
  const n = normalizeLabel(s);
  if (n === null) return null;
  const stripped = n.replace(/\baccounts?\b/g, '').replace(/[\s-]+/g, ' ').trim();
  return stripped === '' ? n : stripped;
};

export function toScope(partial: Partial<Scope>): Scope {
  const s = emptyScope();
  for (const k of SCOPE_KEYS) {
    const v = partial[k];
    (s as unknown as Record<string, string | null>)[k] = typeof v === 'string' ? cleanLabel(v) : null;
  }
  return s;
}

/** Canonical scope key: normalized labels, all keys present, nulls preserved. */
export function scopeKey(scope: Scope): string {
  const out: Record<string, string | null> = {};
  for (const k of SCOPE_KEYS) {
    const v = scope[k];
    out[k] = k === 'commissionSide' ? v : k === 'account' ? normalizeAccountLabel(v) : normalizeLabel(v);
  }
  return stableJson(out);
}

/**
 * Two scopes are comparable only when every *known* entity/jurisdiction
 * matches. Two unknown entities do not establish comparable scope (PRD §5.4).
 */
export function sameKnownEntityJurisdiction(a: Scope, b: Scope): boolean {
  if (a.entity === null || b.entity === null) return false;
  if (a.jurisdiction === null || b.jurisdiction === null) return false;
  return normalizeLabel(a.entity) === normalizeLabel(b.entity) && normalizeLabel(a.jurisdiction) === normalizeLabel(b.jurisdiction);
}

/** Short human description of a scope for display near values. */
export function describeScope(scope: Scope): string[] {
  const parts: string[] = [];
  if (scope.account) parts.push(`Account: ${scope.account}`);
  if (scope.platform) parts.push(`Platform: ${scope.platform}`);
  if (scope.entity) parts.push(`Entity: ${scope.entity}`);
  if (scope.jurisdiction) parts.push(`Jurisdiction: ${scope.jurisdiction}`);
  if (scope.instrument) parts.push(`Instrument: ${scope.instrument}`);
  if (scope.clientClass) parts.push(`Client class: ${scope.clientClass}`);
  if (scope.spreadBasis) parts.push(`Spread basis: ${scope.spreadBasis}`);
  if (scope.commissionSide) parts.push(scope.commissionSide === 'PER_SIDE' ? 'Charged per side' : 'Charged round turn');
  if (scope.commissionVolume) parts.push(`Volume basis: ${scope.commissionVolume}`);
  if (scope.qualifier) parts.push(`Qualifier: ${scope.qualifier}`);
  return parts;
}
