import { connection } from 'next/server';
import { config } from '@/config/env';
import { databaseReady, getDb } from '@/db/client';

/** Small no-store status. Not an exhaustive dependency check and never exposes secrets. */
export async function GET() {
  await connection();
  const cfg = config();
  let db: 'ok' | 'unmigrated' | 'error' = 'error';
  let schema: number | null = null;
  try {
    const d = getDb();
    if (databaseReady(d)) {
      db = 'ok';
      schema = (d.prepare('SELECT max(version) AS v FROM schema_migrations').get() as { v: number }).v;
    } else db = 'unmigrated';
  } catch {
    db = 'error';
  }
  const body = {
    status: db === 'ok' ? 'ok' : 'degraded',
    db,
    schema,
    publication: cfg.publicationEnabled ? 'on' : 'off',
    autoPublication: cfg.autoPublicationEnabled ? 'on' : 'off',
    time: new Date().toISOString(),
  };
  return Response.json(body, {
    status: db === 'ok' ? 200 : 503,
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
