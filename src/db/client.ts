import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@/config/env';

export type DB = Database.Database;

/** Open a connection with the mandatory pragmas (PRD §17). */
export function openDatabase(file: string, opts: { readonly?: boolean } = {}): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { readonly: opts.readonly ?? false, fileMustExist: opts.readonly ?? false });
  if (!opts.readonly) db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

const g = globalThis as unknown as { __fiDb?: { file: string; db: DB } };

/** Process-wide connection for the web app and CLI. */
export function getDb(): DB {
  const file = config().databasePath;
  if (!g.__fiDb || g.__fiDb.file !== file) {
    g.__fiDb?.db.close();
    g.__fiDb = { file, db: openDatabase(file) };
  }
  return g.__fiDb.db;
}

/** Whether the schema is migrated; pages degrade to preparation state otherwise. */
export function databaseReady(db: DB): boolean {
  try {
    const row = db
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .get() as { n: number };
    return row.n === 1;
  } catch {
    return false;
  }
}
