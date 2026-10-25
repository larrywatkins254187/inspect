import type { DB } from '@/db/client';
import { currentPolicy, evaluateUse, getSource, type PolicyRow, type SourceRow } from './policy';
import type { FieldKey } from './fields';
import type { Scope } from './scope';

/** Frozen fact data inside a revision snapshot. Values are exact strings. */
export interface SnapshotFact {
  factId: number;
  field: FieldKey;
  valueText: string;
  normalizedValue: string;
  unit: string | null;
  currency: string | null;
  scope: Scope;
  scopeKey: string;
  observationId: number;
  sourceId: number;
  sourceUrl: string;
  sourceHost: string;
  locator: string;
  observedAt: string;
  effectiveAt: string | null;
  acceptedAt: string;
  expiresAt: string;
}

export interface FactCheck {
  valid: boolean;
  reasons: string[];
  /** Current head of the renewal chain, used for verification dates. */
  head: { id: number; observationId: number; observedAt: string; acceptedAt: string; expiresAt: string } | null;
}

interface FactRow {
  id: number;
  broker_id: number;
  field_key: string;
  scope_key: string;
  observation_id: number;
  normalized_value: string;
  unit: string | null;
  currency: string | null;
  accepted_at: string;
  expires_at: string;
  superseded_by: number | null;
  withdrawn_at: string | null;
  observed_at: string;
  source_id: number;
  broker_status: string;
  official_domain_confirmed_at: string | null;
  open_conflict: number;
}

const FACT_SQL = `
  SELECT f.id, f.broker_id, f.field_key, f.scope_key, f.observation_id, f.normalized_value, f.unit, f.currency,
         f.accepted_at, f.expires_at, f.superseded_by, f.withdrawn_at, o.observed_at, d.source_id,
         b.status AS broker_status, b.official_domain_confirmed_at,
         EXISTS (SELECT 1 FROM fact_conflicts c WHERE c.broker_id = f.broker_id AND c.field_key = f.field_key
                 AND c.scope_key = f.scope_key AND c.resolved_at IS NULL) AS open_conflict
  FROM verified_facts f
  JOIN fact_observations o ON o.id = f.observation_id
  JOIN source_documents d ON d.id = o.document_id
  JOIN brokers b ON b.id = f.broker_id
  WHERE f.id = ?`;

/**
 * Read-time checks for cited facts (PRD §3.12, §13): expiry without a write,
 * withdrawal, open conflicts, current source policy, dropped broker and
 * renewal chains whose value changed. Policy evaluation is memoized per call.
 */
export function checkFacts(db: DB, facts: Pick<SnapshotFact, 'factId' | 'normalizedValue' | 'unit' | 'currency' | 'scopeKey'>[], now: Date): Map<number, FactCheck> {
  const stmt = db.prepare(FACT_SQL);
  const policyMemo = new Map<number, { source: SourceRow | null; policy: PolicyRow | null }>();
  const out = new Map<number, FactCheck>();
  for (const sf of facts) {
    const reasons: string[] = [];
    let row = stmt.get(sf.factId) as FactRow | undefined;
    if (!row) {
      out.set(sf.factId, { valid: false, reasons: ['FACT_MISSING'], head: null });
      continue;
    }
    for (let hops = 0; row.superseded_by && hops < 50; hops++) {
      const next = stmt.get(row.superseded_by) as FactRow | undefined;
      if (!next) break;
      row = next;
    }
    if (row.superseded_by) reasons.push('SUPERSEDED_CHAIN_TOO_LONG');
    if (row.normalized_value !== sf.normalizedValue || row.unit !== sf.unit || row.currency !== sf.currency || row.scope_key !== sf.scopeKey)
      reasons.push('VALUE_CHANGED');
    if (row.withdrawn_at) reasons.push('WITHDRAWN');
    if (new Date(row.expires_at) <= now) reasons.push('EXPIRED');
    if (row.open_conflict) reasons.push('CONFLICTED');
    if (row.broker_status === 'DROPPED') reasons.push('BROKER_DROPPED');
    if (!row.official_domain_confirmed_at) reasons.push('DOMAIN_UNCONFIRMED');
    let p = policyMemo.get(row.source_id);
    if (!p) {
      p = { source: getSource(db, row.source_id), policy: currentPolicy(db, row.source_id) };
      policyMemo.set(row.source_id, p);
    }
    const use = evaluateUse(p.source, p.policy, 'FACT_REFERENCE', now, 'PUBLISH');
    if (!use.allowed) reasons.push(...use.reasons.map((r) => `POLICY_${r}`));
    out.set(sf.factId, {
      valid: reasons.length === 0,
      reasons,
      head: { id: row.id, observationId: row.observation_id, observedAt: row.observed_at, acceptedAt: row.accepted_at, expiresAt: row.expires_at },
    });
  }
  return out;
}

/** Load current accepted facts of a broker as snapshot facts (draft input). */
export function loadCurrentFacts(db: DB, brokerId: number): SnapshotFact[] {
  const rows = db
    .prepare(
      `SELECT f.id AS factId, f.field_key AS field, f.value_text AS valueText, f.normalized_value AS normalizedValue,
              f.unit, f.currency, o.scope_json AS scopeJson, f.scope_key AS scopeKey, f.observation_id AS observationId,
              d.source_id AS sourceId, s.url AS sourceUrl, s.host AS sourceHost, o.locator, o.observed_at AS observedAt,
              o.effective_at AS effectiveAt, f.accepted_at AS acceptedAt, f.expires_at AS expiresAt
       FROM verified_facts f
       JOIN fact_observations o ON o.id = f.observation_id
       JOIN source_documents d ON d.id = o.document_id
       JOIN source_registry s ON s.id = d.source_id
       WHERE f.broker_id = ? AND f.superseded_at IS NULL AND f.withdrawn_at IS NULL
       ORDER BY f.field_key, f.scope_key, f.id`,
    )
    .all(brokerId) as (Omit<SnapshotFact, 'scope'> & { scopeJson: string })[];
  return rows.map(({ scopeJson, ...r }) => ({ ...r, scope: JSON.parse(scopeJson) as Scope }));
}
