import 'server-only';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { config } from '@/config/env';

export const SESSION_COOKIE = 'fi_admin';
const SESSION_MS = 8 * 3_600_000;

const key = (token: string) => crypto.createHash('sha256').update(`fi-admin-session:${token}`).digest();
const sign = (token: string, payload: string) => crypto.createHmac('sha256', key(token)).update(payload).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

export function createSession(now = Date.now()): string | null {
  const token = config().adminToken;
  if (!token) return null;
  const exp = String(now + SESSION_MS);
  return `${exp}.${sign(token, exp)}`;
}

export function verifySession(value: string | undefined, now = Date.now()): boolean {
  const token = config().adminToken;
  if (!token || !value) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || !/^\d{13}$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, sign(token, exp));
}

/** Server-side authorization for private routes: cookie session or Bearer token. */
export async function isAdmin(): Promise<boolean> {
  const token = config().adminToken;
  if (!token) return false;
  const h = await headers();
  const auth = h.get('authorization');
  if (auth?.startsWith('Bearer ') && safeEqual(auth.slice(7), token)) return true;
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

/** Unauthorized private routes are indistinguishable from missing pages (404, noindex, no-store). */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) notFound();
}

export const cookieSecure = () => config().siteUrl.startsWith('https://') && config().appEnv === 'production';
