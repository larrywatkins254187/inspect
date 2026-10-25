import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { DB } from '@/db/client';
import { sha256 } from '@/lib/hash';
import { parseCsv, parseXlsx } from '@/lib/tabular';
import { audit } from './audit';

const seedSchema = z
  .object({
    schema: z.literal(1),
    source: z.string(),
    declared: z.object({ candidates: z.number().int(), leads: z.number().int() }).strict(),
    candidates: z.array(
      z
        .object({
          name: z.string().min(1).max(120),
          slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          wave: z.enum(['A', 'B', 'C']).nullable(),
        })
        .strict(),
    ),
    leads: z.array(z.object({ slug: z.string(), url: z.string().url().startsWith('https://') }).strict()),
  })
  .strict();

export interface ImportReport {
  status: 'IMPORTED' | 'ALREADY_IMPORTED';
  file: string;
  sha256: string;
  rows: number;
  created: number;
  diagnostics: string[];
}

/**
 * Idempotent import of the unverified candidate scaffold. Counts declared in the
 * file must match its contents; every record is UNVERIFIED and creates no facts.
 */
export function importCandidateSeed(db: DB, file: string, now: Date): ImportReport {
  const buf = fs.readFileSync(file);
  const hash = sha256(buf);
  const prior = db.prepare('SELECT row_count FROM legacy_imports WHERE file_sha256 = ?').get(hash) as
    { row_count: number } | undefined;
  if (prior)
    return {
      status: 'ALREADY_IMPORTED',
      file: path.basename(file),
      sha256: hash,
      rows: prior.row_count,
      created: 0,
      diagnostics: [],
    };
  const seed = seedSchema.parse(JSON.parse(buf.toString('utf8')));
  if (seed.candidates.length !== seed.declared.candidates)
    throw new Error(`declared ${seed.declared.candidates} candidates, file has ${seed.candidates.length}`);
  if (seed.leads.length !== seed.declared.leads)
    throw new Error(`declared ${seed.declared.leads} leads, file has ${seed.leads.length}`);
  if (new Set(seed.candidates.map((c) => c.slug)).size !== seed.candidates.length)
    throw new Error('duplicate slugs');
  const iso = now.toISOString();
  const diagnostics: string[] = [];
  let created = 0;
  db.transaction(() => {
    const imp = Number(
      db
        .prepare(
          "INSERT INTO legacy_imports (kind, file_name, file_sha256, byte_length, row_count, imported_at) VALUES ('CANDIDATE_SEED', ?, ?, ?, ?, ?)",
        )
        .run(path.basename(file), hash, buf.length, seed.candidates.length + seed.leads.length, iso)
        .lastInsertRowid,
    );
    seed.candidates.forEach((c, i) => {
      db.prepare(
        'INSERT INTO legacy_rows (import_id, row_number, raw_json, mapped_json) VALUES (?, ?, ?, ?)',
      ).run(imp, i + 1, JSON.stringify(c), JSON.stringify({ broker: c.slug, wave: c.wave }));
      const r = db
        .prepare(
          "INSERT OR IGNORE INTO brokers (slug, name, status, wave, provenance, created_at, updated_at) VALUES (?, ?, 'SELECTED', ?, 'UNVERIFIED_SEED', ?, ?)",
        )
        .run(c.slug, c.name, c.wave, iso, iso);
      if (r.changes) {
        created++;
        const id = (db.prepare('SELECT id FROM brokers WHERE slug = ?').get(c.slug) as { id: number }).id;
        db.prepare(
          "INSERT INTO candidate_selection (broker_id, state, wave, reason, decided_at, decided_by) VALUES (?, 'SELECTED', ?, ?, ?, 'import')",
        ).run(
          id,
          c.wave,
          `original wave ${c.wave} selection (${seed.source}); not yet qualified by source eligibility`,
          iso,
        );
      } else diagnostics.push(`broker ${c.slug} already existed; left unchanged`);
    });
    seed.leads.forEach((l, i) => {
      const b = db.prepare('SELECT id FROM brokers WHERE slug = ?').get(l.slug) as { id: number } | undefined;
      db.prepare(
        'INSERT INTO legacy_rows (import_id, row_number, raw_json, mapped_json) VALUES (?, ?, ?, ?)',
      ).run(imp, seed.candidates.length + i + 1, JSON.stringify(l), JSON.stringify({ lead: l.url }));
      if (!b) {
        diagnostics.push(`lead for unknown broker ${l.slug}`);
        return;
      }
      db.prepare(
        "INSERT OR IGNORE INTO broker_sources (broker_id, url, kind, provenance, created_at) VALUES (?, ?, 'LEAD', 'UNVERIFIED_SEED', ?)",
      ).run(b.id, l.url, iso);
    });
    db.prepare('UPDATE legacy_imports SET diagnostics_json = ? WHERE id = ?').run(
      JSON.stringify(diagnostics),
      imp,
    );
    audit(db, {
      actor: 'cli:seed',
      action: 'import.seed',
      subject: path.basename(file),
      at: now,
      detail: { sha256: hash, created },
    });
  })();
  return {
    status: 'IMPORTED',
    file: path.basename(file),
    sha256: hash,
    rows: seed.candidates.length + seed.leads.length,
    created,
    diagnostics,
  };
}

/**
 * Original workbook import (CSV or XLSX). Header row maps to field keys; every
 * value is stored as UNVERIFIED discovery data. Third-party scores are kept only
 * as quarantined raw values and never become evidence.
 */
export function importWorkbook(
  db: DB,
  file: string,
  now: Date,
  opts: { expectRows?: number; nameColumn?: string } = {},
): ImportReport {
  const buf = fs.readFileSync(file);
  const hash = sha256(buf);
  const prior = db.prepare('SELECT row_count FROM legacy_imports WHERE file_sha256 = ?').get(hash) as
    { row_count: number } | undefined;
  if (prior)
    return {
      status: 'ALREADY_IMPORTED',
      file: path.basename(file),
      sha256: hash,
      rows: prior.row_count,
      created: 0,
      diagnostics: [],
    };
  const rows = /\.xlsx$/i.test(file) ? parseXlsx(buf) : parseCsv(buf.toString('utf8'));
  if (rows.length < 2) throw new Error('workbook has no data rows');
  const header = rows[0]!.map((h) => h.trim());
  const data = rows.slice(1);
  if (opts.expectRows !== undefined && data.length !== opts.expectRows)
    throw new Error(`expected ${opts.expectRows} rows, found ${data.length}`);
  const nameIdx = header.findIndex(
    (h) =>
      h.toLowerCase() === (opts.nameColumn ?? 'broker').toLowerCase() || /^(broker|brand|name)$/i.test(h),
  );
  if (nameIdx < 0) throw new Error('no broker name column');
  const diagnostics: string[] = [];
  const iso = now.toISOString();
  db.transaction(() => {
    const imp = Number(
      db
        .prepare(
          "INSERT INTO legacy_imports (kind, file_name, file_sha256, byte_length, row_count, imported_at) VALUES ('WORKBOOK', ?, ?, ?, ?, ?)",
        )
        .run(path.basename(file), hash, buf.length, data.length, iso).lastInsertRowid,
    );
    data.forEach((r, i) => {
      const name = (r[nameIdx] ?? '').trim();
      const raw = Object.fromEntries(header.map((h, j) => [h || `column_${j + 1}`, r[j] ?? '']));
      const diag: string[] = [];
      if (!name) diag.push('missing broker name');
      db.prepare(
        'INSERT INTO legacy_rows (import_id, row_number, raw_json, mapped_json, diagnostics_json) VALUES (?, ?, ?, ?, ?)',
      ).run(imp, i + 2, JSON.stringify(raw), JSON.stringify({ broker: name }), JSON.stringify(diag));
      header.forEach((h, j) => {
        if (j === nameIdx || !(r[j] ?? '').trim()) return;
        db.prepare(
          'INSERT INTO workbook_rows (import_id, row_number, broker_name, field_key, raw_value) VALUES (?, ?, ?, ?, ?)',
        ).run(imp, i + 2, name, h || `column_${j + 1}`, r[j]!.slice(0, 2000));
      });
      if (diag.length) diagnostics.push(`row ${i + 2}: ${diag.join(', ')}`);
    });
    db.prepare('UPDATE legacy_imports SET diagnostics_json = ? WHERE id = ?').run(
      JSON.stringify(diagnostics.slice(0, 500)),
      imp,
    );
    audit(db, {
      actor: 'cli:workbook',
      action: 'import.workbook',
      subject: path.basename(file),
      at: now,
      detail: { sha256: hash, rows: data.length, fields: header.length },
    });
  })();
  return {
    status: 'IMPORTED',
    file: path.basename(file),
    sha256: hash,
    rows: data.length,
    created: 0,
    diagnostics,
  };
}
