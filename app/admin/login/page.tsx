import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { config } from '@/config/env';

export const metadata = { title: 'Operator sign-in', robots: { index: false, follow: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await connection();
  if (!config().adminToken) notFound();
  const { e } = await searchParams;
  return (
    <div className="container section">
      <form
        method="post"
        action="/admin/session"
        className="card"
        style={{ maxWidth: 440, marginInline: 'auto' }}
      >
        <h1 style={{ fontSize: '1.5rem' }}>Operator sign-in</h1>
        <div className="field">
          <label htmlFor="token">Admin token</label>
          <input
            id="token"
            name="token"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            aria-describedby={e ? 'login-err' : undefined}
            aria-invalid={e ? true : undefined}
          />
          {e ? (
            <p id="login-err" className="field-error" role="alert">
              {e === 'locked' ? 'Too many attempts. Try again later.' : 'Sign-in failed.'}
            </p>
          ) : null}
        </div>
        <button className="btn btn-primary" type="submit" style={{ marginTop: 16 }}>
          Sign in
        </button>
      </form>
    </div>
  );
}
