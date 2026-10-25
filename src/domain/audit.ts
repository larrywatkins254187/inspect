import type { DB } from '@/db/client';
import { stableJson } from '@/lib/hash';

/** Append-only audit event. detail must not carry secrets, raw provider bodies or PII. */
export function audit(
  db: DB,
  e: { actor: string; action: string; subject: string; detail?: Record<string, unknown>; at: Date; correlationId?: string },
): void {
  db.prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json, correlation_id) VALUES (?, ?, ?, ?, ?, ?)').run(
    e.at.toISOString(),
    e.actor,
    e.action,
    e.subject,
    stableJson(e.detail ?? {}),
    e.correlationId ?? null,
  );
}

/** Deduplicated operational alert keyed by fingerprint. */
export function raiseAlert(
  db: DB,
  a: { fingerprint: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; code: string; message: string; at: Date },
): void {
  const at = a.at.toISOString();
  db.prepare(
    `INSERT INTO operational_alerts (fingerprint, severity, code, message, first_seen, last_seen)
     VALUES (@fingerprint, @severity, @code, @message, @at, @at)
     ON CONFLICT(fingerprint) DO UPDATE SET last_seen = @at, count = count + 1, resolved_at = NULL, message = @message`,
  ).run({ ...a, at });
}

export function resolveAlert(db: DB, fingerprint: string, at: Date): void {
  db.prepare('UPDATE operational_alerts SET resolved_at = ? WHERE fingerprint = ? AND resolved_at IS NULL').run(at.toISOString(), fingerprint);
}
