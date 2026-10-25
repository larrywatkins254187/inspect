import { z } from 'zod';
import type { DB } from '@/db/client';
import { D } from '@/calculators/core';
import { isDecimalString } from '@/lib/decimal';
import { utcDay } from '@/lib/time';

/**
 * Approved reference-rate source (PRD §7.2): ECB euro reference rates via
 * Frankfurter, no key. Daily reference rates — never presented as tradable or
 * live quotes. Verified response shape 2026-10-25: [{date, base, quote, rate}].
 */
export const FRANKFURTER_URL =
  'https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD,GBP,JPY,CHF,AUD,CAD,NZD&providers=ECB';
export const RATE_PROVIDER = 'ECB_FRANKFURTER';
export const QUOTES = ['USD', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'] as const;
export const ATTRIBUTION =
  'Euro foreign exchange reference rates © European Central Bank, retrieved via Frankfurter (frankfurter.dev).';
const DERIVED_DP = 10;

const rowSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    base: z.literal('EUR'),
    quote: z.enum(QUOTES),
    rate: z.string(),
  })
  .strict();

export type RatesFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ status: number; text: () => Promise<string> }>;

/** Parse keeping the exact decimal text of each JSON number. */
export function parseRatesBody(text: string): { date: string; rates: Record<string, string> } {
  const raw = JSON.parse(text, function (
    this: unknown,
    _k: string,
    value: unknown,
    ctx?: { source?: string },
  ) {
    return typeof value === 'number' ? (ctx?.source ?? String(value)) : value;
  } as (k: string, v: unknown) => unknown) as unknown;
  const rows = z.array(rowSchema).min(QUOTES.length).max(20).parse(raw);
  const dates = new Set(rows.map((r) => r.date));
  if (dates.size !== 1) throw new Error('MIXED_DATES');
  const rates: Record<string, string> = {};
  for (const r of rows) {
    if (!isDecimalString(r.rate) || !new D(r.rate).gt(0)) throw new Error('RATE_INVALID');
    rates[r.quote] = r.rate;
  }
  for (const q of QUOTES) if (!rates[q]) throw new Error('QUOTE_MISSING');
  return { date: [...dates][0]!, rates };
}

/** Derived FX pairs (through EUR) for the registered instruments. */
export function derivedPairs(
  eur: Record<string, string>,
): Record<string, { rate: string; derived: boolean }> {
  const e = (c: string) => (c === 'EUR' ? new D(1) : new D(eur[c]!));
  const pairs = [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'USD/CHF',
    'AUD/USD',
    'USD/CAD',
    'NZD/USD',
    'EUR/GBP',
    'EUR/JPY',
    'GBP/JPY',
  ];
  const out: Record<string, { rate: string; derived: boolean }> = {};
  for (const p of pairs) {
    const [b, q] = p.split('/') as [string, string];
    if (b === 'EUR') out[p] = { rate: eur[q]!, derived: false };
    else out[p] = { rate: e(q).div(e(b)).toDecimalPlaces(DERIVED_DP).toFixed(), derived: true };
  }
  return out;
}

export interface RefreshResult {
  outcome: 'NEW_DATA' | 'NO_CHANGE' | 'FAILED' | 'DISABLED';
  effectiveDate: string | null;
  newRows: number;
  errorClass?: string;
}

export async function refreshRates(
  db: DB,
  deps: { enabled: boolean; fetch: RatesFetch; now: () => Date; userAgent: string },
): Promise<RefreshResult> {
  const started = deps.now();
  const run = (
    outcome: RefreshResult['outcome'],
    extra: { http?: number | null; rows?: number; date?: string | null; err?: string | null },
  ) =>
    db
      .prepare(
        'INSERT INTO market_fetch_runs (provider, started_at, finished_at, outcome, http_status, new_rows, effective_date, error_class) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        RATE_PROVIDER,
        started.toISOString(),
        deps.now().toISOString(),
        outcome,
        extra.http ?? null,
        extra.rows ?? 0,
        extra.date ?? null,
        extra.err ?? null,
      );
  db.prepare('DELETE FROM market_fetch_runs WHERE started_at < ?').run(
    new Date(started.getTime() - 30 * 86_400_000).toISOString(),
  );
  if (!deps.enabled) {
    run('DISABLED', {});
    return { outcome: 'DISABLED', effectiveDate: null, newRows: 0 };
  }
  const latest = latestRates(db);
  // Date-aware: once today's reference date is stored there is nothing new to fetch.
  if (latest && latest.date === utcDay(started)) {
    run('NO_CHANGE', { date: latest.date });
    return { outcome: 'NO_CHANGE', effectiveDate: latest.date, newRows: 0 };
  }
  let status = 0;
  let parsed: ReturnType<typeof parseRatesBody>;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10_000);
    const res = await deps.fetch(FRANKFURTER_URL, {
      signal: ctl.signal,
      headers: { accept: 'application/json', 'user-agent': deps.userAgent },
    });
    status = res.status;
    const text = (await res.text()).slice(0, 65_536);
    clearTimeout(t);
    if (status !== 200) throw new Error(`HTTP_${status}`);
    parsed = parseRatesBody(text);
  } catch (e) {
    const err =
      (e as Error).name === 'AbortError'
        ? 'TIMEOUT'
        : /^HTTP_/.test((e as Error).message)
          ? (e as Error).message
          : 'INVALID_RESPONSE';
    run('FAILED', { http: status || null, err });
    return { outcome: 'FAILED', effectiveDate: latest?.date ?? null, newRows: 0, errorClass: err };
  }
  const fetchedAt = deps.now().toISOString();
  const ins = db.prepare(
    'INSERT OR IGNORE INTO market_prices (symbol, provider, rate, derived, effective_date, fetched_at) VALUES (?,?,?,?,?,?)',
  );
  const rows = db.transaction(() => {
    let n = 0;
    for (const [sym, r] of Object.entries(derivedPairs(parsed.rates)))
      n += ins.run(sym, RATE_PROVIDER, r.rate, r.derived ? 1 : 0, parsed.date, fetchedAt).changes;
    for (const q of QUOTES)
      if (q !== 'USD' && q !== 'GBP' && q !== 'JPY')
        n += ins.run(`EUR/${q}`, RATE_PROVIDER, parsed.rates[q]!, 0, parsed.date, fetchedAt).changes;
    return n;
  })();
  run(rows ? 'NEW_DATA' : 'NO_CHANGE', { http: status, rows, date: parsed.date });
  return { outcome: rows ? 'NEW_DATA' : 'NO_CHANGE', effectiveDate: parsed.date, newRows: rows };
}

export interface StoredRates {
  date: string;
  fetchedAt: string;
  eurRates: Record<string, string>;
  pairs: Record<string, { rate: string; derived: boolean }>;
}

export function latestRates(db: DB): StoredRates | null {
  const d = db
    .prepare('SELECT max(effective_date) AS d FROM market_prices WHERE provider = ?')
    .get(RATE_PROVIDER) as { d: string | null };
  if (!d.d) return null;
  const rows = db
    .prepare(
      'SELECT symbol, rate, derived, fetched_at FROM market_prices WHERE provider = ? AND effective_date = ?',
    )
    .all(RATE_PROVIDER, d.d) as {
    symbol: string;
    rate: string;
    derived: number;
    fetched_at: string;
  }[];
  const eurRates: Record<string, string> = {};
  const pairs: StoredRates['pairs'] = {};
  for (const r of rows) {
    if (r.symbol.startsWith('EUR/') && !r.derived) eurRates[r.symbol.slice(4)] = r.rate;
    pairs[r.symbol] = { rate: r.rate, derived: r.derived === 1 };
  }
  return { date: d.d, fetchedAt: rows[0]?.fetched_at ?? '', eurRates, pairs };
}
