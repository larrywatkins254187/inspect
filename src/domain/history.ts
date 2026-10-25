import type { DB } from '@/db/client';
import { displayValue, FIELDS, type FieldKey } from './fields';
import type { SnapshotFact } from './fact-checks';
import { describeScope } from './scope';

export interface HistoryEntry {
  revisionNo: number;
  publishedAt: string;
  kind: 'FIRST_PUBLICATION' | 'CHANGED' | 'REVERIFIED' | 'ROLLBACK';
  added: string[];
  removed: string[];
  changed: string[];
}

const label = (f: SnapshotFact) => {
  const scope = describeScope(f.scope).filter(
    (s) => !(f.field === 'account_type' && s.startsWith('Account:')),
  );
  return `${FIELDS[f.field as FieldKey]?.label ?? f.field}: ${displayValue({ field_key: f.field, value_text: f.valueText, unit: f.unit, currency: f.currency })}${scope.length ? ` (${scope.join('; ')})` : ''}`;
};

/**
 * Eligible published lineage, newest first, up to 20 (PRD §5.6). Date-only
 * renewals are re-verification, not changed trading conditions. No reasons
 * for a change are invented.
 */
export function pageHistory(db: DB, pageId: number, limit = 20): { entries: HistoryEntry[]; total: number } {
  const revs = db
    .prepare(
      `SELECT revision_no, published_at, content_json, substantive_hash, rollback_of FROM content_revisions
       WHERE page_id = ? AND published_at IS NOT NULL AND status IN ('PUBLISHED','SUPERSEDED') ORDER BY published_at ASC, revision_no ASC`,
    )
    .all(pageId) as {
    revision_no: number;
    published_at: string;
    content_json: string;
    substantive_hash: string;
    rollback_of: number | null;
  }[];
  const entries: HistoryEntry[] = [];
  let prev: { facts: SnapshotFact[]; hash: string } | null = null;
  for (const r of revs) {
    const facts = (JSON.parse(r.content_json) as { facts: SnapshotFact[] }).facts;
    if (!prev) {
      entries.push({
        revisionNo: r.revision_no,
        publishedAt: r.published_at,
        kind: 'FIRST_PUBLICATION',
        added: facts.map(label),
        removed: [],
        changed: [],
      });
    } else if (prev.hash === r.substantive_hash) {
      entries.push({
        revisionNo: r.revision_no,
        publishedAt: r.published_at,
        kind: r.rollback_of ? 'ROLLBACK' : 'REVERIFIED',
        added: [],
        removed: [],
        changed: [],
      });
    } else {
      const key = (f: SnapshotFact) => `${f.field}|${f.scopeKey}`;
      const before = new Map(prev.facts.map((f) => [key(f), f]));
      const after = new Map(facts.map((f) => [key(f), f]));
      const added: string[] = [];
      const removed: string[] = [];
      const changed: string[] = [];
      for (const [k, f] of after) {
        const b = before.get(k);
        if (!b) added.push(label(f));
        else if (b.normalizedValue !== f.normalizedValue || b.unit !== f.unit || b.currency !== f.currency)
          changed.push(`${label(b)} → ${label(f)}`);
      }
      for (const [k, f] of before) if (!after.has(k)) removed.push(label(f));
      entries.push({
        revisionNo: r.revision_no,
        publishedAt: r.published_at,
        kind: r.rollback_of ? 'ROLLBACK' : 'CHANGED',
        added,
        removed,
        changed,
      });
    }
    prev = { facts, hash: r.substantive_hash };
  }
  return { entries: entries.reverse().slice(0, limit), total: entries.length };
}
