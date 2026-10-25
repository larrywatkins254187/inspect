import { connection } from 'next/server';
import { runtimeProvider } from '@/ai';
import { askAvailability, config } from '@/config/env';
import { getDb } from '@/db/client';
import { ASK_LIMITS, ASK_STATUS, handleAsk, siteverify } from '@/domain/ask';

const HEADERS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

async function readLimited(req: Request, max: number): Promise<string | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function POST(req: Request) {
  await connection();
  const cfg = config();
  if (!askAvailability(cfg).available) return new Response('Not found', { status: 404, headers: HEADERS });
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json'))
    return Response.json({ ok: false, code: 'INVALID' }, { status: 400, headers: HEADERS });
  const raw = await readLimited(req, ASK_LIMITS.bodyBytes);
  if (raw === null) return Response.json({ ok: false, code: 'INVALID' }, { status: 400, headers: HEADERS });
  // X-Real-IP is set by our Nginx from the trusted proxy chain; raw IPs are never stored.
  const ip = req.headers.get('x-real-ip');
  const result = await handleAsk(raw, ip, {
    db: getDb(),
    provider: runtimeProvider(),
    verify: siteverify(cfg.turnstile.secret!),
    now: () => new Date(),
    hostname: cfg.turnstile.hostname!,
    dailyCap: cfg.chat.dailyCap,
    read: { now: new Date(), publicationEnabled: cfg.publicationEnabled },
  });
  if (result.ok) return Response.json(result, { headers: HEADERS });
  return Response.json(
    { ok: false, code: result.code },
    { status: ASK_STATUS[result.code], headers: HEADERS },
  );
}

export async function GET() {
  return new Response('Not found', { status: 404, headers: HEADERS });
}
