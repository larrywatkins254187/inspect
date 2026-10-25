import fs from 'node:fs';
import { connection } from 'next/server';
import { databaseReady, getDb } from '@/db/client';
import { deliverableAsset } from '@/domain/assets';

/** Permission-gated asset delivery: approval, removal, brand review and file hash are rechecked per request. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  await connection();
  const { file } = await params;
  const db = getDb();
  const d = databaseReady(db) ? deliverableAsset(db, file) : null;
  if (!d) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  const headers: Record<string, string> = {
    'content-type': d.row.mime,
    'cache-control': 'public, max-age=3600, must-revalidate',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex',
  };
  if (d.row.mime === 'image/svg+xml') headers['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new Response(fs.readFileSync(d.file), { headers });
}
