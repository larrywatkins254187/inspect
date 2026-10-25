import { config } from '@/config/env';
import { SESSION_COOKIE, cookieSecure, createSession, safeEqual } from '@/server/auth';

let failures = 0;
let lockedUntil = 0;

/** Admin login (POST only). Same-origin check (CSRF), constant-time compare, failure back-off. */
export async function POST(req: Request) {
  const token = config().adminToken;
  const nf = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  if (!token) return nf();
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) return nf();
  if (Date.now() < lockedUntil) return Response.redirect(new URL('/admin/login?e=locked', req.url), 303);
  const form = await req.formData().catch(() => null);
  const given = form?.get('token');
  if (typeof given !== 'string' || given.length > 512 || !safeEqual(given, token)) {
    failures++;
    if (failures >= 5) {
      lockedUntil = Date.now() + 15 * 60_000;
      failures = 0;
    }
    return new Response(null, { status: 303, headers: { location: '/admin/login?e=1', 'cache-control': 'no-store' } });
  }
  failures = 0;
  const session = createSession()!;
  const secure = cookieSecure() ? '; Secure' : '';
  return new Response(null, {
    status: 303,
    headers: { location: '/admin', 'cache-control': 'no-store', 'set-cookie': `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}` },
  });
}
