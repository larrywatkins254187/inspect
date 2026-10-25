import { stmt, type DB } from '@/db/client';
import { hashJson } from '@/lib/hash';
import { addHours } from '@/lib/time';
import { audit } from './audit';
import { normalizeForLiteral } from './fields';

export type UseClass = 'FACT_REFERENCE' | 'CONTENT_REUSE';
export type SourceState =
  | 'DISCOVERED'
  | 'POLICY_PENDING'
  | 'POLICY_APPROVED'
  | 'TECH_PENDING'
  | 'APPROVED'
  | 'DEGRADED'
  | 'BLOCKED'
  | 'RETIRED';

export const FACT_REFERENCE_VALIDITY_HOURS = 7 * 24;
export const ROBOTS_FRESH_HOURS = 24;

export interface SourceRow {
  id: number;
  broker_id: number;
  url: string;
  host: string;
  use_class: UseClass;
  state: SourceState;
  owner_stop_notice_at: string | null;
  updated_at: string;
}

export interface PolicyRow {
  id: number;
  source_id: number;
  revision: number;
  use_class: UseClass;
  owner: string;
  official_host: string;
  source_type: string;
  terms_url: string | null;
  licence_url: string | null;
  robots_agent: string;
  robots_path: string;
  robots_allowed: 0 | 1 | null;
  robots_checked_at: string | null;
  access_decision: 'ALLOWED' | 'REFUSED' | 'UNKNOWN';
  reuse_decision: 'GRANTED' | 'NOT_GRANTED' | 'UNKNOWN';
  commercial_decision: 'PERMITTED' | 'RESTRICTED' | 'UNKNOWN';
  derivative_decision: 'PERMITTED' | 'RESTRICTED' | 'UNKNOWN';
  attribution: string | null;
  retention: 'LOCATOR_HASH_ONLY' | 'BODY_PERMITTED';
  redistribution: 'NONE' | 'PERMITTED';
  credentials_required: 0 | 1;
  terms_risk_accepted: 0 | 1;
  adverse_findings_json: string;
  basis: string;
  reviewed_by: string;
  evidence_hash: string;
  checked_at: string;
  valid_until: string;
  due_at: string;
}

export interface AdverseFinding {
  clause: string;
  classification:
    'NO_AUTOMATED_ACCESS' | 'NO_COMMERCIAL_USE' | 'NO_REPRODUCTION' | 'ATTRIBUTION_REQUIRED' | 'UNCLASSIFIED';
  blocking: boolean;
}

export const getSource = (db: DB, id: number): SourceRow | null =>
  (stmt(db, 'SELECT * FROM source_registry WHERE id = ?').get(id) as SourceRow | undefined) ?? null;

export const currentPolicy = (db: DB, sourceId: number): PolicyRow | null =>
  (stmt(db, 'SELECT * FROM source_policies WHERE source_id = ? ORDER BY revision DESC LIMIT 1').get(
    sourceId,
  ) as PolicyRow | undefined) ?? null;

export interface UseDecision {
  allowed: boolean;
  reasons: string[];
}

/**
 * Gate a source for an intended use (PRD §11). HTTP 200 and robots allowance
 * alone never grant reuse; unknown permission blocks CONTENT_REUSE.
 */
export function evaluateUse(
  source: SourceRow | null,
  policy: PolicyRow | null,
  use: UseClass,
  now: Date,
  purpose: 'FETCH' | 'PUBLISH',
): UseDecision {
  const reasons: string[] = [];
  if (!source) return { allowed: false, reasons: ['SOURCE_MISSING'] };
  if (source.state === 'RETIRED') reasons.push('SOURCE_RETIRED');
  if (source.state === 'BLOCKED') reasons.push('SOURCE_BLOCKED');
  if (source.owner_stop_notice_at) reasons.push('OWNER_STOP_NOTICE');
  if (!['APPROVED', 'DEGRADED'].includes(source.state) && !reasons.length)
    reasons.push(`SOURCE_${source.state}`);
  if (!policy) return { allowed: false, reasons: [...reasons, 'POLICY_MISSING'] };
  if (policy.reviewed_by.startsWith('model:')) reasons.push('POLICY_NOT_OWNER_REVIEWED');
  if (new Date(policy.valid_until) <= now) reasons.push('POLICY_EXPIRED');
  if (policy.access_decision !== 'ALLOWED') reasons.push(`ACCESS_${policy.access_decision}`);
  if (policy.robots_allowed !== 1)
    reasons.push(policy.robots_allowed === 0 ? 'ROBOTS_DISALLOWED' : 'ROBOTS_UNKNOWN');
  if (purpose === 'FETCH') {
    const fresh =
      policy.robots_checked_at && addHours(new Date(policy.robots_checked_at), ROBOTS_FRESH_HOURS) > now;
    if (!fresh) reasons.push('ROBOTS_EVIDENCE_STALE');
  }
  if (policy.credentials_required) reasons.push('CREDENTIALS_REQUIRED');
  let findings: AdverseFinding[] = [];
  try {
    findings = JSON.parse(policy.adverse_findings_json) as AdverseFinding[];
  } catch {
    reasons.push('ADVERSE_FINDINGS_UNREADABLE');
  }
  if (
    findings.some(
      (f) => f.blocking || f.classification === 'UNCLASSIFIED' || f.classification === 'NO_AUTOMATED_ACCESS',
    )
  )
    reasons.push('ADVERSE_RESTRICTION');
  if (use === 'FACT_REFERENCE') {
    const anyUnsettled = [policy.reuse_decision, policy.commercial_decision, policy.derivative_decision].some(
      (d) => d !== 'GRANTED' && d !== 'PERMITTED',
    );
    if (anyUnsettled && !policy.terms_risk_accepted) reasons.push('TERMS_RISK_NOT_ACCEPTED');
  } else {
    if (policy.use_class !== 'CONTENT_REUSE') reasons.push('USE_CLASS_NOT_GRANTED');
    if (policy.reuse_decision !== 'GRANTED') reasons.push(`REUSE_${policy.reuse_decision}`);
    if (policy.commercial_decision !== 'PERMITTED') reasons.push(`COMMERCIAL_${policy.commercial_decision}`);
    if (policy.derivative_decision !== 'PERMITTED') reasons.push(`DERIVATIVE_${policy.derivative_decision}`);
    if (policy.retention !== 'BODY_PERMITTED') reasons.push('RETENTION_NOT_PERMITTED');
  }
  return { allowed: reasons.length === 0, reasons };
}

/** Body retention requires full CONTENT_REUSE rights; otherwise keep only URL/locator/hash. */
export function mayRetainBody(source: SourceRow, policy: PolicyRow | null, now: Date): boolean {
  return evaluateUse(source, policy, 'CONTENT_REUSE', now, 'PUBLISH').allowed;
}

export interface PolicyDecisionInput {
  use_class: UseClass;
  owner: string;
  official_host: string;
  source_type: string;
  terms_url: string | null;
  licence_url: string | null;
  robots_agent: string;
  robots_path: string;
  access_decision: PolicyRow['access_decision'];
  reuse_decision: PolicyRow['reuse_decision'];
  commercial_decision: PolicyRow['commercial_decision'];
  derivative_decision: PolicyRow['derivative_decision'];
  attribution: string | null;
  retention: PolicyRow['retention'];
  redistribution: PolicyRow['redistribution'];
  credentials_required: boolean;
  terms_risk_accepted: boolean;
  adverse_findings: AdverseFinding[];
  basis: string;
  limits?: Record<string, unknown>;
}

const evidenceHash = (d: PolicyDecisionInput, robotsAllowed: 0 | 1 | null): string =>
  hashJson({ ...d, robots_allowed: robotsAllowed, limits: d.limits ?? {} });

function setSourceState(db: DB, sourceId: number, state: SourceState, reason: string, now: Date): void {
  db.prepare('UPDATE source_registry SET state = ?, state_reason = ?, updated_at = ? WHERE id = ?').run(
    state,
    reason,
    now.toISOString(),
    sourceId,
  );
}

/**
 * Record an owner-reviewed policy decision. Identical evidence renews the same
 * active row; changed evidence creates a new revision.
 */
export function recordOwnerPolicy(
  db: DB,
  sourceId: number,
  d: PolicyDecisionInput,
  actor: string,
  now: Date,
): { policyId: number; renewed: boolean } {
  if (!actor.startsWith('owner:')) throw new Error('policy decisions require an owner actor');
  const source = getSource(db, sourceId);
  if (!source) throw new Error('unknown source');
  if (source.state === 'RETIRED') throw new Error('retired source');
  if (source.state === 'BLOCKED') throw new Error('blocked source must be reopened first');
  const cur = currentPolicy(db, sourceId);
  const robotsAllowed = cur?.robots_allowed ?? null;
  const hash = evidenceHash(d, robotsAllowed);
  return db.transaction(() => {
    const validUntil = addHours(now, FACT_REFERENCE_VALIDITY_HOURS).toISOString();
    const due = addHours(now, 24).toISOString();
    if (cur && cur.evidence_hash === hash) {
      db.prepare('UPDATE source_policies SET checked_at = ?, valid_until = ?, due_at = ? WHERE id = ?').run(
        now.toISOString(),
        validUntil,
        due,
        cur.id,
      );
      audit(db, {
        actor,
        action: 'policy.renew',
        subject: `source:${sourceId}`,
        at: now,
        detail: { revision: cur.revision },
      });
      return { policyId: cur.id, renewed: true };
    }
    const revision = (cur?.revision ?? 0) + 1;
    const info = db
      .prepare(
        `INSERT INTO source_policies (source_id, revision, use_class, owner, official_host, source_type, terms_url, licence_url,
          robots_agent, robots_path, robots_allowed, robots_checked_at, access_decision, reuse_decision, commercial_decision,
          derivative_decision, attribution, retention, redistribution, limits_json, credentials_required, terms_risk_accepted,
          adverse_findings_json, basis, reviewed_by, evidence_hash, checked_at, valid_until, due_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        sourceId,
        revision,
        d.use_class,
        d.owner,
        d.official_host,
        d.source_type,
        d.terms_url,
        d.licence_url,
        d.robots_agent,
        d.robots_path,
        robotsAllowed,
        cur?.robots_checked_at ?? null,
        d.access_decision,
        d.reuse_decision,
        d.commercial_decision,
        d.derivative_decision,
        d.attribution,
        d.retention,
        d.redistribution,
        JSON.stringify(d.limits ?? {}),
        d.credentials_required ? 1 : 0,
        d.terms_risk_accepted ? 1 : 0,
        JSON.stringify(d.adverse_findings),
        d.basis,
        actor,
        hash,
        now.toISOString(),
        validUntil,
        due,
        now.toISOString(),
      );
    db.prepare('UPDATE source_registry SET use_class = ?, updated_at = ? WHERE id = ?').run(
      d.use_class,
      now.toISOString(),
      sourceId,
    );
    const blocked =
      d.access_decision === 'REFUSED' ||
      d.adverse_findings.some((f) => f.blocking || f.classification === 'UNCLASSIFIED');
    setSourceState(
      db,
      sourceId,
      blocked ? 'BLOCKED' : 'TECH_PENDING',
      blocked ? 'owner policy refuses access' : 'awaiting robots check',
      now,
    );
    audit(db, {
      actor,
      action: 'policy.revision',
      subject: `source:${sourceId}`,
      at: now,
      detail: { revision, blocked },
    });
    return { policyId: Number(info.lastInsertRowid), renewed: false };
  })();
}

export type RobotsOutcome =
  | { kind: 'OK'; allowed: boolean }
  | { kind: 'REFUSED'; status: number }
  | { kind: 'CHALLENGE' }
  | { kind: 'DEFER'; reason: 'TIMEOUT' | 'SERVER_ERROR' | 'THROTTLED' | 'REDIRECT' | 'AMBIGUOUS' };

/**
 * Daily technical review. Disallow blocks immediately; 401/403/challenge stop
 * access until a person reopens; transient problems defer renewal without
 * extending validity, so the old policy lapses naturally.
 */
export function applyRobotsOutcome(db: DB, sourceId: number, outcome: RobotsOutcome, now: Date): SourceState {
  const source = getSource(db, sourceId);
  const policy = currentPolicy(db, sourceId);
  if (!source || !policy) throw new Error('source has no policy');
  if (source.state === 'RETIRED') return 'RETIRED';
  return db.transaction(() => {
    if (outcome.kind === 'DEFER') {
      audit(db, {
        actor: 'system:policy-review',
        action: 'policy.defer',
        subject: `source:${sourceId}`,
        at: now,
        detail: { reason: outcome.reason },
      });
      return source.state;
    }
    if (
      outcome.kind === 'REFUSED' ||
      outcome.kind === 'CHALLENGE' ||
      (outcome.kind === 'OK' && !outcome.allowed)
    ) {
      const reason =
        outcome.kind === 'OK'
          ? 'robots disallow'
          : outcome.kind === 'CHALLENGE'
            ? 'robots challenge'
            : `robots HTTP ${outcome.status}`;
      if (source.state !== 'BLOCKED') setSourceState(db, sourceId, 'BLOCKED', reason, now);
      audit(db, {
        actor: 'system:policy-review',
        action: 'source.block',
        subject: `source:${sourceId}`,
        at: now,
        detail: { reason },
      });
      return 'BLOCKED';
    }
    // Robots allowed. Same decision evidence → renew the active row; a change in
    // robots allowance is new evidence and needs a new owner-reviewed revision.
    if (policy.robots_allowed === 1 || policy.robots_allowed === null) {
      if (policy.robots_allowed === null) {
        // First technical check for this revision: record as part of the same revision is not allowed
        // (evidence columns are immutable), so create the technical revision deterministically.
        const d = policyToInput(policy);
        const hash = evidenceHash(d, 1);
        db.prepare(
          `INSERT INTO source_policies (source_id, revision, use_class, owner, official_host, source_type, terms_url, licence_url,
            robots_agent, robots_path, robots_allowed, robots_checked_at, access_decision, reuse_decision, commercial_decision,
            derivative_decision, attribution, retention, redistribution, limits_json, credentials_required, terms_risk_accepted,
            adverse_findings_json, basis, reviewed_by, evidence_hash, checked_at, valid_until, due_at, created_at)
           SELECT source_id, revision + 1, use_class, owner, official_host, source_type, terms_url, licence_url,
            robots_agent, robots_path, 1, @now, access_decision, reuse_decision, commercial_decision,
            derivative_decision, attribution, retention, redistribution, limits_json, credentials_required, terms_risk_accepted,
            adverse_findings_json, basis, reviewed_by, @hash, @now, @valid, @due, @now FROM source_policies WHERE id = @id`,
        ).run({
          now: now.toISOString(),
          hash,
          valid: addHours(now, FACT_REFERENCE_VALIDITY_HOURS).toISOString(),
          due: addHours(now, 24).toISOString(),
          id: policy.id,
        });
      } else {
        db.prepare(
          'UPDATE source_policies SET robots_checked_at = ?, checked_at = ?, valid_until = ?, due_at = ? WHERE id = ?',
        ).run(
          now.toISOString(),
          now.toISOString(),
          addHours(now, FACT_REFERENCE_VALIDITY_HOURS).toISOString(),
          addHours(now, 24).toISOString(),
          policy.id,
        );
      }
      const next: SourceState = source.state === 'BLOCKED' ? 'BLOCKED' : 'APPROVED';
      if (next !== source.state) setSourceState(db, sourceId, next, 'robots allowed', now);
      audit(db, {
        actor: 'system:policy-review',
        action: 'policy.robots_ok',
        subject: `source:${sourceId}`,
        at: now,
      });
      return next;
    }
    // Previously disallowed and now allowed: requires owner reopen; stay blocked.
    return source.state;
  })();
}

function policyToInput(p: PolicyRow): PolicyDecisionInput {
  return {
    use_class: p.use_class,
    owner: p.owner,
    official_host: p.official_host,
    source_type: p.source_type,
    terms_url: p.terms_url,
    licence_url: p.licence_url,
    robots_agent: p.robots_agent,
    robots_path: p.robots_path,
    access_decision: p.access_decision,
    reuse_decision: p.reuse_decision,
    commercial_decision: p.commercial_decision,
    derivative_decision: p.derivative_decision,
    attribution: p.attribution,
    retention: p.retention,
    redistribution: p.redistribution,
    credentials_required: p.credentials_required === 1,
    terms_risk_accepted: p.terms_risk_accepted === 1,
    adverse_findings: JSON.parse(p.adverse_findings_json) as AdverseFinding[],
    basis: p.basis,
  };
}

/** Owner stop notice stops both use classes immediately. */
export function recordStopNotice(db: DB, sourceId: number, actor: string, note: string, now: Date): void {
  db.transaction(() => {
    db.prepare('UPDATE source_registry SET owner_stop_notice_at = ?, updated_at = ? WHERE id = ?').run(
      now.toISOString(),
      now.toISOString(),
      sourceId,
    );
    setSourceState(db, sourceId, 'BLOCKED', 'source-owner stop notice', now);
    audit(db, {
      actor,
      action: 'source.stop_notice',
      subject: `source:${sourceId}`,
      at: now,
      detail: { note: note.slice(0, 200) },
    });
  })();
}

export function reopenSource(db: DB, sourceId: number, actor: string, reason: string, now: Date): void {
  if (!actor.startsWith('owner:')) throw new Error('only an owner may reopen a blocked source');
  const s = getSource(db, sourceId);
  if (!s || s.state !== 'BLOCKED') throw new Error('source is not blocked');
  if (s.owner_stop_notice_at) throw new Error('a source-owner stop notice is in force');
  db.transaction(() => {
    audit(db, {
      actor,
      action: 'source.reopen',
      subject: `source:${sourceId}`,
      at: now,
      detail: { reason: reason.slice(0, 200) },
    });
    setSourceState(db, sourceId, 'POLICY_PENDING', 'owner reopened; review required', now);
  })();
}

export function retireSource(db: DB, sourceId: number, actor: string, reason: string, now: Date): void {
  db.transaction(() => {
    setSourceState(db, sourceId, 'RETIRED', reason.slice(0, 200), now);
    audit(db, {
      actor,
      action: 'source.retire',
      subject: `source:${sourceId}`,
      at: now,
      detail: { reason: reason.slice(0, 200) },
    });
  })();
}

/**
 * A terms finding (e.g. from a model reading the terms page) is accepted only if
 * its clause occurs literally in the terms text; otherwise it is discarded and
 * the policy stays pending.
 */
export function acceptTermsFinding(finding: AdverseFinding, termsText: string): AdverseFinding | null {
  const clause = normalizeForLiteral(finding.clause);
  if (clause.length < 12) return null;
  return normalizeForLiteral(termsText).includes(clause) ? finding : null;
}
