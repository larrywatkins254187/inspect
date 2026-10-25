import crypto from 'node:crypto';
import type { DB } from '@/db/client';
import { addMs } from '@/lib/time';

export type JobState = 'QUEUED' | 'LEASED' | 'SUCCEEDED' | 'RETRY_WAIT' | 'DEAD_LETTER' | 'CANCELLED';

export interface JobRow {
  id: number;
  kind: string;
  idempotency_key: string;
  priority: number;
  due_at: string;
  state: JobState;
  attempts: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  fence: number;
  payload_json: string;
  result_json: string | null;
  error_class: string | null;
}

/** Idempotent enqueue: the same key returns the existing job. */
export function enqueue(
  db: DB,
  j: { kind: string; key: string; dueAt: Date; payload?: unknown; priority?: number; maxAttempts?: number },
  now: Date,
): { id: number; created: boolean } {
  const r = db
    .prepare(
      `INSERT INTO jobs (kind, idempotency_key, priority, due_at, max_attempts, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .run(
      j.kind,
      j.key,
      j.priority ?? 100,
      j.dueAt.toISOString(),
      j.maxAttempts ?? 3,
      JSON.stringify(j.payload ?? {}),
      now.toISOString(),
      now.toISOString(),
    );
  const row = db.prepare('SELECT id FROM jobs WHERE idempotency_key = ?').get(j.key) as { id: number };
  return { id: row.id, created: r.changes === 1 };
}

export interface Lease {
  job: JobRow;
  owner: string;
  fence: number;
}

/**
 * Atomically lease one due job (QUEUED/RETRY_WAIT, or LEASED with an expired
 * lease after a crash). The fence increments on every lease so a stale worker's
 * completion is rejected.
 */
export function leaseNext(
  db: DB,
  kind: string,
  now: Date,
  leaseMs: number,
  owner = `worker:${process.pid}:${crypto.randomUUID().slice(0, 8)}`,
): Lease | null {
  const tx = db.transaction((): Lease | null => {
    const job = db
      .prepare(
        `SELECT * FROM jobs WHERE kind = ? AND due_at <= ? AND (
           state IN ('QUEUED','RETRY_WAIT') OR (state = 'LEASED' AND lease_expires_at <= ?)
         ) ORDER BY priority, due_at, id LIMIT 1`,
      )
      .get(kind, now.toISOString(), now.toISOString()) as JobRow | undefined;
    if (!job) return null;
    if (job.attempts >= job.max_attempts) {
      db.prepare(
        "UPDATE jobs SET state = 'DEAD_LETTER', error_class = coalesce(error_class, 'ATTEMPTS_EXHAUSTED'), lease_owner = NULL, updated_at = ?, finished_at = ? WHERE id = ?",
      ).run(now.toISOString(), now.toISOString(), job.id);
      return null;
    }
    const fence = job.fence + 1;
    db.prepare(
      "UPDATE jobs SET state = 'LEASED', lease_owner = ?, lease_expires_at = ?, fence = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?",
    ).run(owner, addMs(now, leaseMs).toISOString(), fence, now.toISOString(), job.id);
    return {
      job: { ...job, state: 'LEASED', attempts: job.attempts + 1, fence, lease_owner: owner },
      owner,
      fence,
    };
  });
  return tx.immediate();
}

/** Complete only if this lease still holds (fencing). */
export function complete(db: DB, lease: Lease, result: unknown, now: Date): boolean {
  const r = db
    .prepare(
      "UPDATE jobs SET state = 'SUCCEEDED', result_json = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?, finished_at = ? WHERE id = ? AND fence = ? AND state = 'LEASED' AND lease_owner = ?",
    )
    .run(
      JSON.stringify(result),
      now.toISOString(),
      now.toISOString(),
      lease.job.id,
      lease.fence,
      lease.owner,
    );
  return r.changes === 1;
}

/** Bounded retry with exponential backoff; dead letter after the attempt ceiling. */
export function fail(
  db: DB,
  lease: Lease,
  errorClass: string,
  now: Date,
  opts: { retryable: boolean; baseMs?: number } = { retryable: true },
): JobState | null {
  const terminal = !opts.retryable || lease.job.attempts >= lease.job.max_attempts;
  const delay = (opts.baseMs ?? 60_000) * 2 ** (lease.job.attempts - 1);
  const state: JobState = terminal ? 'DEAD_LETTER' : 'RETRY_WAIT';
  const r = db
    .prepare(
      'UPDATE jobs SET state = ?, error_class = ?, due_at = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?, finished_at = ? WHERE id = ? AND fence = ? AND lease_owner = ?',
    )
    .run(
      state,
      errorClass.slice(0, 60),
      addMs(now, terminal ? 0 : delay).toISOString(),
      now.toISOString(),
      terminal ? now.toISOString() : null,
      lease.job.id,
      lease.fence,
      lease.owner,
    );
  return r.changes === 1 ? state : null;
}

export function deadLetters(db: DB): JobRow[] {
  return db
    .prepare("SELECT * FROM jobs WHERE state = 'DEAD_LETTER' ORDER BY updated_at DESC LIMIT 50")
    .all() as JobRow[];
}

/** Advisory named lock for refresh/comparison/backup/code-mutation coordination. */
export function acquireLock(db: DB, name: string, owner: string, now: Date, ttlMs: number): boolean {
  return db
    .transaction(() => {
      const cur = db.prepare('SELECT owner, expires_at FROM locks WHERE name = ?').get(name) as
        { owner: string; expires_at: string } | undefined;
      if (cur && new Date(cur.expires_at) > now && cur.owner !== owner) return false;
      db.prepare(
        'INSERT INTO locks (name, owner, acquired_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, acquired_at = excluded.acquired_at, expires_at = excluded.expires_at',
      ).run(name, owner, now.toISOString(), addMs(now, ttlMs).toISOString());
      return true;
    })
    .immediate();
}

export function releaseLock(db: DB, name: string, owner: string): void {
  db.prepare('DELETE FROM locks WHERE name = ? AND owner = ?').run(name, owner);
}
