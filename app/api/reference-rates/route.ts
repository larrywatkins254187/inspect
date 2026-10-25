import { connection } from 'next/server';
import { databaseReady, getDb } from '@/db/client';
import { ATTRIBUTION, latestRates } from '@/domain/rates';

/** Latest stored ECB reference rates (dated). Never a live or tradable quote. */
export async function GET() {
  await connection();
  const db = getDb();
  const r = databaseReady(db) ? latestRates(db) : null;
  const headers = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
  if (!r) return Response.json({ date: null }, { status: 404, headers });
  return Response.json({ date: r.date, fetchedAt: r.fetchedAt, eurRates: r.eurRates, attribution: ATTRIBUTION, notice: 'Daily ECB reference rates for information only; not tradable quotes. Cross rates are derived via EUR.' }, { headers });
}
