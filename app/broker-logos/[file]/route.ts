import { connection } from 'next/server';
import { databaseReady, getDb } from '@/db/client';
import { deliverableAsset } from '@/domain/assets';

/** Legacy /broker-logos/<file> paths: checked permanent redirect to the gated asset route, else 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  await connection();
  const { file } = await params;
  const db = getDb();
  if (!databaseReady(db) || !deliverableAsset(db, file))
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(null, { status: 308, headers: { location: `/asset-file/${file}` } });
}
