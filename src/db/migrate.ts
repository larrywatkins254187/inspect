import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './client';
import { sha256 } from '@/lib/hash';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(dir = path.resolve(process.cwd(), 'migrations')): Migration[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((f) => {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      return { version: Number(f.slice(0, 4)), name: f.replace(/\.sql$/, ''), sql, checksum: sha256(sql) };
    });
}

export interface MigrateResult {
  applied: string[];
  snapshot: string | null;
  current: number;
}

/**
 * Apply pending versioned migrations. Each runs in its own transaction; an
 * edited already-applied migration is a hard error. When an existing database
 * has pending migrations, a consistent pre-migration snapshot is written first.
 */
export async function migrate(
  db: DB,
  opts: { dir?: string; snapshotDir?: string | null; now?: () => Date } = {},
): Promise<MigrateResult> {
  const now = opts.now ?? (() => new Date());
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const applied = new Map(
    (
      db.prepare('SELECT version, checksum, name FROM schema_migrations').all() as {
        version: number;
        checksum: string;
        name: string;
      }[]
    ).map((r) => [r.version, r]),
  );
  const migrations = loadMigrations(opts.dir);
  for (const m of migrations) {
    const a = applied.get(m.version);
    if (a && a.checksum !== m.checksum)
      throw new Error(`migration ${m.name} was modified after being applied`);
  }
  const pending = migrations.filter((m) => !applied.has(m.version));
  let snapshot: string | null = null;
  if (pending.length && applied.size > 0 && opts.snapshotDir !== null) {
    const dir = opts.snapshotDir ?? path.resolve(process.cwd(), 'backups', 'pre-migrate');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    snapshot = path.join(dir, `pre-migrate-${now().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    await db.backup(snapshot);
  }
  const out: string[] = [];
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(m.version, m.name, m.checksum, now().toISOString());
    })();
    out.push(m.name);
  }
  const fk = db.pragma('foreign_key_check') as unknown[];
  if (fk.length) throw new Error(`foreign key check failed after migration (${fk.length} rows)`);
  const cur = db.prepare('SELECT max(version) AS v FROM schema_migrations').get() as { v: number | null };
  return { applied: out, snapshot, current: cur.v ?? 0 };
}
