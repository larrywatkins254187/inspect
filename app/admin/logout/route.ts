import { SESSION_COOKIE } from '@/server/auth';

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin || new URL(origin).host !== req.headers.get('host'))
    return new Response('Not found', { status: 404 });
  return new Response(null, {
    status: 303,
    headers: {
      location: '/',
      'cache-control': 'no-store',
      'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    },
  });
}
