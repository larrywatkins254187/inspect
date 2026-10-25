import type { DB } from '@/db/client';
import { addHours } from '@/lib/time';
import { audit } from './audit';
import { FIELDS, normalizeLegalName, type FieldKey } from './fields';
import { currentPolicy, evaluateUse, getSource } from './policy';
import { normalizeAccountLabel, type Scope } from './scope';

export interface ObservationRow {
  id: number;
  broker_id: number;
  field_key: FieldKey;
  value_text: string;
  normalized_value: string;
  unit: string | null;
  currency: string | null;
  scope_key: string;
  scope_json: string;
  document_id: number;
  policy_id: number;
  locator: string;
  literal_check: number;
  observed_at: string;
  effective_at: string | null;
  pass_label: 'A' | 'B' | 'OPERATOR' | 'FIXTURE';
  prompt_version: string;
  validation_json: string;
}

export interface VerifiedFactRow {
  id: number;
  broker_id: number;
  field_key: FieldKey;
  scope_key: string;
  observation_id: number;
  confirming_observation_id: number;
  policy_id: number;
  value_text: string;
  normalized_value: string;
  unit: string | null;
  currency: string | null;
  accepted_at: string;
  expires_at: string;
  superseded_by: number | null;
  withdrawn_at: string | null;
}

export type PromotionOutcome =
  | 'ACCEPTED'
  | 'RENEWED'
  | 'UPDATED_SAME_SOURCE'
  | 'CONFLICT_OPENED'
  | 'CONFLICT_PENDING'
  | 'PASS_DISAGREEMENT'
  | 'OWNER_REJECTED'
  | 'POLICY_INVALID'
  | 'DOMAIN_UNCONFIRMED'
  | 'NOT_OFFICIAL_HOST'
  | 'STALE_ON_ARRIVAL'
  | 'SINGLE_READING'
  | 'BROKER_DROPPED';

export interface PromotionResult {
  field: string;
  scopeKey: string;
  outcome: PromotionOutcome;
  factId?: number;
}

const sameValue = (
  a: { normalized_value: string; unit: string | null; currency: string | null },
  b: typeof a,
) => a.normalized_value === b.normalized_value && a.unit === b.unit && a.currency === b.currency;

export const hostWithinDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

function currentFact(db: DB, brokerId: number, field: string, scopeKey: string): VerifiedFactRow | null {
  return (
    (db
      .prepare(
        'SELECT * FROM verified_facts WHERE broker_id = ? AND field_key = ? AND scope_key = ? AND superseded_at IS NULL AND withdrawn_at IS NULL',
      )
      .get(brokerId, field, scopeKey) as VerifiedFactRow | undefined) ?? null
  );
}

function insertFact(db: DB, a: ObservationRow, b: ObservationRow, now: Date): number {
  const ttl = FIELDS[a.field_key].ttlHours;
  const expires = addHours(new Date(a.observed_at), ttl);
  const id = Number(
    db
      .prepare(
        `INSERT INTO verified_facts (broker_id, field_key, scope_key, observation_id, confirming_observation_id, policy_id,
          value_text, normalized_value, unit, currency, accepted_at, expires_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        a.broker_id,
        a.field_key,
        a.scope_key,
        a.id,
        b.id,
        a.policy_id,
        a.value_text,
        a.normalized_value,
        a.unit,
        a.currency,
        now.toISOString(),
        expires.toISOString(),
      ).lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO fact_confirmations (verified_fact_id, observation_id, kind, confirmed_at) VALUES (?, ?, 'SECOND_PASS', ?)",
  ).run(id, b.id, now.toISOString());
  return id;
}

function linkIdentity(db: DB, fact: number, a: ObservationRow, now: Date): void {
  const scope = JSON.parse(a.scope_json) as Scope;
  if (a.field_key === 'legal_entity_name' || a.field_key === 'operating_entity') {
    const norm = normalizeLegalName(a.value_text);
    db.prepare(
      'INSERT OR IGNORE INTO legal_entities (legal_name, normalized_name, jurisdiction, created_at) VALUES (?, ?, ?, ?)',
    ).run(a.value_text, norm, scope.jurisdiction, now.toISOString());
    const ent = db
      .prepare(
        "SELECT id FROM legal_entities WHERE normalized_name = ? AND ifnull(jurisdiction,'') = ifnull(?, '')",
      )
      .get(norm, scope.jurisdiction) as { id: number };
    const rel = a.field_key === 'operating_entity' ? 'VERIFIED_OPERATOR' : 'BROKER_DISCLOSURE';
    db.prepare(
      'INSERT INTO broker_entities (broker_id, legal_entity_id, relationship, verified_fact_id, created_at) VALUES (?,?,?,?,?)',
    ).run(a.broker_id, ent.id, rel, fact, now.toISOString());
    if (rel === 'VERIFIED_OPERATOR') {
      const doc = db.prepare('SELECT source_id FROM source_documents WHERE id = ?').get(a.document_id) as {
        source_id: number;
      };
      const wording =
        (JSON.parse(a.validation_json) as { operatorWording?: string }[])[0]?.operatorWording ??
        'OPERATED_BY';
      db.prepare(
        'INSERT INTO source_operating_entities (source_id, document_id, observation_id, legal_entity_id, wording, created_at) VALUES (?,?,?,?,?,?)',
      ).run(doc.source_id, a.document_id, a.id, ent.id, wording, now.toISOString());
    }
  }
  if (a.field_key === 'account_type') {
    db.prepare(
      'INSERT OR IGNORE INTO trading_accounts (broker_id, label, normalized_label, entity_scope, jurisdiction_scope, created_at) VALUES (?,?,?,?,?,?)',
    ).run(
      a.broker_id,
      a.value_text,
      normalizeAccountLabel(a.value_text),
      scope.entity,
      scope.jurisdiction,
      now.toISOString(),
    );
  }
}

/**
 * Deterministic promotion of one document's readings (PRD §12.1, §12.3). Two
 * agreeing passes are required; they remain one source. The model never
 * chooses a side of a conflict and never writes entities or licences.
 */
export function promoteDocument(
  db: DB,
  documentId: number,
  now: Date,
  actor = 'system:promote',
): PromotionResult[] {
  const doc = db
    .prepare('SELECT d.id, d.source_id, d.final_url FROM source_documents d WHERE d.id = ?')
    .get(documentId) as { id: number; source_id: number; final_url: string } | undefined;
  if (!doc) throw new Error('unknown document');
  const source = getSource(db, doc.source_id)!;
  const broker = db
    .prepare('SELECT id, status, official_domain, official_domain_confirmed_at FROM brokers WHERE id = ?')
    .get(source.broker_id) as {
    id: number;
    status: string;
    official_domain: string | null;
    official_domain_confirmed_at: string | null;
  };
  const obs = db
    .prepare('SELECT * FROM fact_observations WHERE document_id = ? ORDER BY id')
    .all(documentId) as ObservationRow[];
  const groups = new Map<string, { A: ObservationRow[]; B: ObservationRow[]; OP: ObservationRow[] }>();
  for (const o of obs) {
    const key = `${o.field_key}|${o.scope_key}`;
    const g = groups.get(key) ?? { A: [], B: [], OP: [] };
    if (o.pass_label === 'A') g.A.push(o);
    else if (o.pass_label === 'B') g.B.push(o);
    else if (o.pass_label === 'OPERATOR') g.OP.push(o);
    groups.set(key, g);
  }
  const results: PromotionResult[] = [];
  const gate = evaluateUse(source, currentPolicy(db, source.id), 'FACT_REFERENCE', now, 'PUBLISH');
  const host = new URL(doc.final_url).hostname;

  // Operator readings are confirmed by a general-pass named-company reading of the same legal name.
  const namedCompanies = obs.filter(
    (o) => o.field_key === 'legal_entity_name' && (o.pass_label === 'A' || o.pass_label === 'B'),
  );

  return db.transaction(() => {
    for (const [key, g] of groups) {
      const [field, scopeKey] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
      const push = (outcome: PromotionOutcome, factId?: number) =>
        results.push({ field, scopeKey, outcome, ...(factId ? { factId } : {}) });
      if (broker.status === 'DROPPED') {
        push('BROKER_DROPPED');
        continue;
      }
      if (!broker.official_domain || !broker.official_domain_confirmed_at) {
        push('DOMAIN_UNCONFIRMED');
        continue;
      }
      if (!hostWithinDomain(host, broker.official_domain)) {
        push('NOT_OFFICIAL_HOST');
        continue;
      }
      if (!gate.allowed) {
        push('POLICY_INVALID');
        continue;
      }
      let a: ObservationRow | undefined;
      let b: ObservationRow | undefined;
      if (field === 'operating_entity') {
        a = g.OP[g.OP.length - 1];
        b = a && namedCompanies.find((n) => n.normalized_value === a!.normalized_value);
        if (!a || !b) {
          push('SINGLE_READING');
          continue;
        }
      } else {
        a = g.A[g.A.length - 1];
        b = g.B[g.B.length - 1];
        if (!a || !b) {
          push('SINGLE_READING');
          continue;
        }
        if (!sameValue(a, b)) {
          push('PASS_DISAGREEMENT');
          continue;
        }
      }
      if (!a.literal_check || !b.literal_check) {
        push('PASS_DISAGREEMENT');
        continue;
      }
      if (addHours(new Date(a.observed_at), FIELDS[a.field_key].ttlHours) <= now) {
        push('STALE_ON_ARRIVAL');
        continue;
      }
      const rejected = db
        .prepare(
          'SELECT 1 FROM rejected_values WHERE broker_id = ? AND field_key = ? AND normalized_value = ? AND scope_key = ?',
        )
        .get(a.broker_id, a.field_key, a.normalized_value, a.scope_key);
      if (rejected) {
        push('OWNER_REJECTED');
        continue;
      }
      const openConflict = db
        .prepare(
          'SELECT 1 FROM fact_conflicts WHERE broker_id = ? AND field_key = ? AND scope_key = ? AND resolved_at IS NULL',
        )
        .get(a.broker_id, a.field_key, a.scope_key);
      if (openConflict) {
        push('CONFLICT_PENDING');
        continue;
      }
      const existing = currentFact(db, a.broker_id, a.field_key, a.scope_key);
      if (existing && existing.observation_id === a.id) {
        push('RENEWED', existing.id);
        continue;
      }
      if (existing && sameValue(existing, a)) {
        const id = supersede(db, existing.id, () => insertFact(db, a, b, now), now);
        db.prepare(
          "INSERT INTO fact_confirmations (verified_fact_id, observation_id, kind, confirmed_at) VALUES (?, ?, 'REVERIFY', ?)",
        ).run(id, a.id, now.toISOString());
        reattachIdentity(db, existing.id, id);
        push('RENEWED', id);
        continue;
      }
      if (existing) {
        const prevObs = db
          .prepare(
            'SELECT o.*, d.source_id FROM fact_observations o JOIN source_documents d ON d.id = o.document_id WHERE o.id = ?',
          )
          .get(existing.observation_id) as ObservationRow & { source_id: number };
        if (prevObs.source_id === source.id && new Date(a.observed_at) > new Date(prevObs.observed_at)) {
          // Same official resource now states a different value: deterministic obsolete-scope resolution, audited.
          const conflictId = Number(
            db
              .prepare(
                "INSERT INTO fact_conflicts (broker_id, field_key, scope_key, observation_a, observation_b, opened_at, resolved_at, resolution, resolution_note, resolved_by) VALUES (?,?,?,?,?,?,?,'OBSOLETE_SCOPE',?,?)",
              )
              .run(
                a.broker_id,
                a.field_key,
                a.scope_key,
                existing.observation_id,
                a.id,
                now.toISOString(),
                now.toISOString(),
                'same source restated a newer value',
                actor,
              ).lastInsertRowid,
          );
          const id = supersede(db, existing.id, () => insertFact(db, a, b, now), now);
          endIdentity(db, existing.id, now);
          linkIdentity(db, id, a, now);
          audit(db, {
            actor,
            action: 'fact.updated_same_source',
            subject: `fact:${existing.id}`,
            at: now,
            detail: { newFact: id, conflictId },
          });
          db.prepare(
            "INSERT INTO change_events (broker_id, kind, detail_json, at) VALUES (?, 'FACT_CHANGED', ?, ?)",
          ).run(
            a.broker_id,
            JSON.stringify({ field: a.field_key, from: existing.id, to: id }),
            now.toISOString(),
          );
          push('UPDATED_SAME_SOURCE', id);
          continue;
        }
        db.prepare(
          'INSERT INTO fact_conflicts (broker_id, field_key, scope_key, observation_a, observation_b, opened_at) VALUES (?,?,?,?,?,?)',
        ).run(a.broker_id, a.field_key, a.scope_key, existing.observation_id, a.id, now.toISOString());
        audit(db, {
          actor,
          action: 'fact.conflict_opened',
          subject: `fact:${existing.id}`,
          at: now,
          detail: { observation: a.id },
        });
        push('CONFLICT_OPENED');
        continue;
      }
      const id = insertFact(db, a, b, now);
      linkIdentity(db, id, a, now);
      db.prepare(
        "INSERT INTO change_events (broker_id, kind, detail_json, at) VALUES (?, 'FACT_ACCEPTED', ?, ?)",
      ).run(a.broker_id, JSON.stringify({ field: a.field_key, fact: id }), now.toISOString());
      audit(db, {
        actor,
        action: 'fact.accept',
        subject: `fact:${id}`,
        at: now,
        detail: { observation: a.id, confirming: b.id },
      });
      push('ACCEPTED', id);
    }
    return results;
  })();
}

/** Close the current pointer first (frees the partial unique index), then link the successor. */
function supersede(db: DB, oldId: number, create: () => number, now: Date): number {
  db.prepare('UPDATE verified_facts SET superseded_at = ? WHERE id = ?').run(now.toISOString(), oldId);
  const id = create();
  db.prepare('UPDATE verified_facts SET superseded_by = ? WHERE id = ?').run(id, oldId);
  return id;
}

function endIdentity(db: DB, factId: number, now: Date): void {
  db.prepare('UPDATE broker_entities SET ended_at = ? WHERE verified_fact_id = ? AND ended_at IS NULL').run(
    now.toISOString(),
    factId,
  );
}
function reattachIdentity(db: DB, fromFact: number, toFact: number): void {
  const rows = db
    .prepare(
      'SELECT broker_id, legal_entity_id, relationship, created_at FROM broker_entities WHERE verified_fact_id = ? AND ended_at IS NULL',
    )
    .all(fromFact) as {
    broker_id: number;
    legal_entity_id: number;
    relationship: string;
    created_at: string;
  }[];
  for (const r of rows) {
    db.prepare(
      'INSERT INTO broker_entities (broker_id, legal_entity_id, relationship, verified_fact_id, created_at) VALUES (?,?,?,?,?)',
    ).run(r.broker_id, r.legal_entity_id, r.relationship, toFact, r.created_at);
  }
  db.prepare(
    'UPDATE broker_entities SET ended_at = created_at WHERE verified_fact_id = ? AND ended_at IS NULL',
  ).run(fromFact);
}

/** Owner rejection: retains history and blocks silent re-acceptance of the same normalized claim. */
export function rejectFact(db: DB, factId: number, reason: string, actor: string, now: Date): void {
  if (!actor.startsWith('owner:')) throw new Error('rejection requires an owner actor');
  const f = db.prepare('SELECT * FROM verified_facts WHERE id = ?').get(factId) as
    VerifiedFactRow | undefined;
  if (!f) throw new Error('unknown fact');
  db.transaction(() => {
    if (!f.withdrawn_at)
      db.prepare('UPDATE verified_facts SET withdrawn_at = ?, withdrawn_reason = ? WHERE id = ?').run(
        now.toISOString(),
        `rejected: ${reason}`.slice(0, 300),
        factId,
      );
    db.prepare(
      'INSERT INTO rejected_values (broker_id, field_key, normalized_value, scope_key, reason, verified_fact_id, rejected_at, rejected_by) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      f.broker_id,
      f.field_key,
      f.normalized_value,
      f.scope_key,
      reason.slice(0, 300),
      factId,
      now.toISOString(),
      actor,
    );
    endIdentity(db, factId, now);
    audit(db, {
      actor,
      action: 'fact.reject',
      subject: `fact:${factId}`,
      at: now,
      detail: { reason: reason.slice(0, 200) },
    });
  })();
}

export function rejectObservation(
  db: DB,
  observationId: number,
  reason: string,
  actor: string,
  now: Date,
): void {
  if (!actor.startsWith('owner:')) throw new Error('rejection requires an owner actor');
  const o = db.prepare('SELECT * FROM fact_observations WHERE id = ?').get(observationId) as
    ObservationRow | undefined;
  if (!o) throw new Error('unknown observation');
  db.prepare(
    'INSERT INTO rejected_values (broker_id, field_key, normalized_value, scope_key, reason, observation_id, rejected_at, rejected_by) VALUES (?,?,?,?,?,?,?,?)',
  ).run(
    o.broker_id,
    o.field_key,
    o.normalized_value,
    o.scope_key,
    reason.slice(0, 300),
    observationId,
    now.toISOString(),
    actor,
  );
  audit(db, { actor, action: 'observation.reject', subject: `observation:${observationId}`, at: now });
}

/** Withdrawal ends a fact without declaring its value universally false. */
export function withdrawFact(db: DB, factId: number, reason: string, actor: string, now: Date): void {
  db.transaction(() => {
    const r = db
      .prepare(
        'UPDATE verified_facts SET withdrawn_at = ?, withdrawn_reason = ? WHERE id = ? AND withdrawn_at IS NULL',
      )
      .run(now.toISOString(), reason.slice(0, 300), factId);
    if (r.changes) {
      endIdentity(db, factId, now);
      audit(db, {
        actor,
        action: 'fact.withdraw',
        subject: `fact:${factId}`,
        at: now,
        detail: { reason: reason.slice(0, 200) },
      });
    }
  })();
}

/** Owner resolution of a conflict; selecting a side promotes only through the normal gates. */
export function resolveConflict(
  db: DB,
  conflictId: number,
  resolution: 'OWNER_SELECTED_A' | 'OWNER_SELECTED_B' | 'EQUIVALENT' | 'BOTH_REJECTED',
  note: string,
  actor: string,
  now: Date,
): void {
  if (!actor.startsWith('owner:')) throw new Error('conflict resolution requires an owner actor');
  db.transaction(() => {
    const c = db
      .prepare('SELECT * FROM fact_conflicts WHERE id = ? AND resolved_at IS NULL')
      .get(conflictId) as
      | {
          id: number;
          broker_id: number;
          field_key: string;
          scope_key: string;
          observation_a: number;
          observation_b: number;
        }
      | undefined;
    if (!c) throw new Error('no open conflict');
    db.prepare(
      'UPDATE fact_conflicts SET resolved_at = ?, resolution = ?, resolution_note = ?, resolved_by = ? WHERE id = ?',
    ).run(now.toISOString(), resolution, note.slice(0, 300), actor, conflictId);
    const loser =
      resolution === 'OWNER_SELECTED_A'
        ? [c.observation_b]
        : resolution === 'OWNER_SELECTED_B'
          ? [c.observation_a]
          : resolution === 'BOTH_REJECTED'
            ? [c.observation_a, c.observation_b]
            : [];
    for (const o of loser) rejectObservation(db, o, `conflict ${conflictId}: ${note}`, actor, now);
    if (resolution !== 'OWNER_SELECTED_A' && resolution !== 'EQUIVALENT') {
      const cur = currentFact(db, c.broker_id, c.field_key, c.scope_key);
      if (cur) withdrawFact(db, cur.id, `conflict ${conflictId} resolved ${resolution}`, actor, now);
    }
    audit(db, {
      actor,
      action: 'conflict.resolve',
      subject: `conflict:${conflictId}`,
      at: now,
      detail: { resolution },
    });
  })();
}
