import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '@/db/client';
import { sha256 } from '@/lib/hash';
import { audit } from './audit';
import { normalizeLegalName } from './fields';

const REQUIRED = ['AFS_LIC_NUM', 'AFS_LIC_NAME'];

/**
 * ASIC approved dataset/file intake: tab-delimited detection and schema checks.
 * Rows are register data; they become licences only through exact matching to
 * an owner-registered identifier AND the same normalized legal name.
 */
export function asicFileIntake(
  db: DB,
  file: string,
  now: Date,
  opts: { sandbox: boolean },
): { snapshot: number | null; rows: number; schemaOk: boolean; problems: string[] } {
  const buf = fs.readFileSync(file);
  if (buf.length > 200 * 1024 * 1024) throw new Error('file too large');
  const hash = sha256(buf);
  const prior = db
    .prepare('SELECT id, row_count FROM regulator_snapshots WHERE file_sha256 = ?')
    .get(hash) as { id: number; row_count: number } | undefined;
  if (prior)
    return { snapshot: prior.id, rows: prior.row_count, schemaOk: true, problems: ['already imported'] };
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const problems: string[] = [];
  if (!lines[0]?.includes('\t')) problems.push('not tab-delimited');
  const header = (lines[0] ?? '').split('\t').map((h) => h.trim().toUpperCase());
  for (const r of REQUIRED) if (!header.includes(r)) problems.push(`missing column ${r}`);
  const schemaOk = problems.length === 0;
  if (!schemaOk) return { snapshot: null, rows: 0, schemaOk, problems };
  const idx = (n: string) => header.indexOf(n);
  return db.transaction(() => {
    const snap = Number(
      db
        .prepare(
          "INSERT INTO regulator_snapshots (regulator_code, file_name, file_sha256, row_count, schema_ok, sandbox, imported_at) VALUES ('ASIC', ?, ?, ?, 1, ?, ?)",
        )
        .run(path.basename(file), hash, lines.length - 1, opts.sandbox ? 1 : 0, now.toISOString())
        .lastInsertRowid,
    );
    const ins = db.prepare(
      'INSERT INTO regulator_snapshot_rows (snapshot_id, licence_number, entity_name, normalized_name, status, raw_json) VALUES (?,?,?,?,?,?)',
    );
    for (const line of lines.slice(1)) {
      const c = line.split('\t');
      const lic = (c[idx('AFS_LIC_NUM')] ?? '').trim();
      const name = (c[idx('AFS_LIC_NAME')] ?? '').trim();
      if (!lic || !name) continue;
      const status =
        idx('AFS_LIC_STATUS') >= 0
          ? (c[idx('AFS_LIC_STATUS')] ?? '').trim() || 'Listed'
          : 'Listed in register snapshot';
      ins.run(
        snap,
        lic,
        name,
        normalizeLegalName(name),
        status,
        JSON.stringify(Object.fromEntries(header.map((h, i) => [h, c[i] ?? '']))),
      );
    }
    audit(db, {
      actor: 'cli:asic',
      action: 'regulator.snapshot',
      subject: `ASIC:${snap}`,
      at: now,
      detail: { rows: lines.length - 1, sandbox: opts.sandbox },
    });
    return { snapshot: snap, rows: lines.length - 1, schemaOk, problems };
  })();
}

export function registerIdentifier(
  db: DB,
  legalEntityId: number,
  scheme: 'ASIC_AFSL' | 'ACN' | 'ABN' | 'FCA_FRN' | 'COMPANY_NUMBER',
  value: string,
  actor: string,
  now: Date,
) {
  if (!actor.startsWith('owner:')) throw new Error('identifier registration requires an owner');
  if (!/^[A-Za-z0-9 -]{3,30}$/.test(value)) throw new Error('invalid identifier');
  db.prepare(
    'INSERT INTO entity_identifiers (legal_entity_id, scheme, value, source, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(legalEntityId, scheme, value.replace(/\s+/g, ''), actor, now.toISOString());
  audit(db, {
    actor,
    action: 'entity.identifier',
    subject: `entity:${legalEntityId}`,
    at: now,
    detail: { scheme },
  });
  return { legalEntityId, scheme, value };
}

/** Deterministic match: identifier equals licence number AND normalized names agree. Sandbox rows never create licences. */
export function asicMatch(
  db: DB,
  now: Date,
): { matched: number; rejected: { entity: number; reason: string }[] } {
  const snap = db
    .prepare(
      "SELECT id, imported_at FROM regulator_snapshots WHERE regulator_code = 'ASIC' AND sandbox = 0 AND schema_ok = 1 ORDER BY id DESC LIMIT 1",
    )
    .get() as { id: number; imported_at: string } | undefined;
  if (!snap)
    return { matched: 0, rejected: [{ entity: 0, reason: 'no approved non-sandbox ASIC snapshot' }] };
  const reg = db.prepare("SELECT id FROM regulators WHERE code = 'ASIC'").get() as { id: number };
  const ids = db
    .prepare(
      "SELECT i.legal_entity_id, i.value, e.normalized_name FROM entity_identifiers i JOIN legal_entities e ON e.id = i.legal_entity_id WHERE i.scheme = 'ASIC_AFSL'",
    )
    .all() as { legal_entity_id: number; value: string; normalized_name: string }[];
  let matched = 0;
  const rejected: { entity: number; reason: string }[] = [];
  db.transaction(() => {
    for (const i of ids) {
      const row = db
        .prepare('SELECT * FROM regulator_snapshot_rows WHERE snapshot_id = ? AND licence_number = ?')
        .get(snap.id, i.value) as
        { id: number; normalized_name: string; status: string; licence_number: string } | undefined;
      if (!row) {
        rejected.push({ entity: i.legal_entity_id, reason: 'licence number not in snapshot' });
        continue;
      }
      if (row.normalized_name !== i.normalized_name) {
        rejected.push({
          entity: i.legal_entity_id,
          reason: 'register name differs from the company named by the broker',
        });
        continue;
      }
      const m = Number(
        db
          .prepare(
            "INSERT INTO regulatory_matches (legal_entity_id, snapshot_row_id, regulator_code, licence_number, method, matched_at) VALUES (?, ?, 'ASIC', ?, 'EXACT_NORMALIZED_NAME_AND_IDENTIFIER', ?)",
          )
          .run(i.legal_entity_id, row.id, row.licence_number, now.toISOString()).lastInsertRowid,
      );
      db.prepare(
        'INSERT OR REPLACE INTO regulatory_licenses (regulator_id, legal_entity_id, licence_number, status, status_as_of, match_id, created_at) VALUES (?,?,?,?,?,?,?)',
      ).run(
        reg.id,
        i.legal_entity_id,
        row.licence_number,
        row.status,
        snap.imported_at,
        m,
        now.toISOString(),
      );
      matched++;
    }
  })();
  return { matched, rejected };
}
