import { connection } from 'next/server';
import { config } from '@/config/env';

/** IndexNow key proof, served only when IndexNow is explicitly enabled. */
export async function GET() {
  await connection();
  const cfg = config();
  if (!cfg.indexNow.enabled || !cfg.indexNow.key) return new Response('Not found', { status: 404 });
  return new Response(cfg.indexNow.key, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
