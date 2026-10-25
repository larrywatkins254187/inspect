import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { drizzleTables } from '@/db/schema';
import { FIELDS } from '@/domain/fields';
import { opsSummary } from '@/domain/ops';
import { T0, tempDb } from './helpers';

describe('schema consistency', () => {
  it('Drizzle definitions match the migrated SQLite schema exactly', async () => {
    const { db } = await tempDb();
    for (const table of Object.values(drizzleTables)) {
      const cfg = getTableConfig(table);
      const cols = (
        db.prepare(`PRAGMA table_info(${cfg.name})`).all() as { name: string; notnull: number; pk: number }[]
      )
        .map((c) => `${c.name}:${c.notnull || c.pk ? 'nn' : 'null'}`)
        .sort();
      const defined = cfg.columns.map((c) => `${c.name}:${c.notNull || c.primary ? 'nn' : 'null'}`).sort();
      expect(defined, cfg.name).toEqual(cols);
    }
  });
  it('field contract in code matches migrations/0002 reference data', async () => {
    const { db } = await tempDb();
    const rows = db
      .prepare('SELECT field_key, topic, ttl_hours, core_topic FROM fact_definitions ORDER BY field_key')
      .all() as { field_key: string; topic: string; ttl_hours: number; core_topic: string | null }[];
    expect(rows.map((r) => [r.field_key, r.topic, r.ttl_hours, r.core_topic])).toEqual(
      Object.values(FIELDS)
        .map((f) => [f.key, f.topic, f.ttlHours, f.core])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });
  it('ops summary (Drizzle) runs on an empty database', async () => {
    const { db } = await tempDb();
    const s = opsSummary(db, T0);
    expect(s).toMatchObject({
      candidates: 0,
      verifiedFacts: 0,
      publishedPages: 0,
      deadLetters: 0,
      ratesLatest: null,
    });
    expect(s.pilot).toHaveLength(5);
  });
});
