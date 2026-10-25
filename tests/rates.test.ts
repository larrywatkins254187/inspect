import { describe, expect, it } from 'vitest';
import { derivedPairs, latestRates, parseRatesBody, refreshRates, type RatesFetch } from '@/domain/rates';
import { tempDb } from './helpers';

const BODY =
  '[{"date":"2026-10-23","base":"EUR","quote":"AUD","rate":1.5939},{"date":"2026-10-23","base":"EUR","quote":"CAD","rate":1.5665},{"date":"2026-10-23","base":"EUR","quote":"CHF","rate":0.9227},{"date":"2026-10-23","base":"EUR","quote":"GBP","rate":0.83728},{"date":"2026-10-23","base":"EUR","quote":"JPY","rate":175.51},{"date":"2026-10-23","base":"EUR","quote":"NZD","rate":1.9682},{"date":"2026-10-23","base":"EUR","quote":"USD","rate":1.1190}]';
const fetchOf = (status: number, body: string) => {
  const state = { calls: 0 };
  const fn: RatesFetch = async () => {
    state.calls++;
    return { status, text: async () => body };
  };
  return Object.assign(fn, {
    get calls() {
      return state.calls;
    },
  });
};

describe('ECB-via-Frankfurter adapter', () => {
  it('keeps exact decimal text (1.1190 stays 1.1190)', () => {
    expect(parseRatesBody(BODY).rates.USD).toBe('1.1190');
  });
  it('rejects mixed dates, missing quotes and schema drift', () => {
    expect(() =>
      parseRatesBody(
        BODY.replace('"2026-10-23","base":"EUR","quote":"AUD"', '"2026-10-22","base":"EUR","quote":"AUD"'),
      ),
    ).toThrow();
    expect(() => parseRatesBody('[]')).toThrow();
    expect(() =>
      parseRatesBody(BODY.replace('"base":"EUR","quote":"USD"', '"base":"USD","quote":"USD"')),
    ).toThrow();
  });
  it('derives crosses through EUR and marks them derived', () => {
    const d = derivedPairs(parseRatesBody(BODY).rates);
    expect(d['EUR/USD']).toEqual({ rate: '1.1190', derived: false });
    expect(d['USD/JPY']!.derived).toBe(true);
    expect(d['USD/JPY']!.rate).toBe('156.8453976765');
  });
  it('disabled → no network; dedupes by date; failure preserves old values', async () => {
    const { db } = await tempDb();
    const f = fetchOf(200, BODY);
    expect(
      (
        await refreshRates(db, {
          enabled: false,
          fetch: f,
          now: () => new Date('2026-10-25T10:00:00Z'),
          userAgent: 'x',
        })
      ).outcome,
    ).toBe('DISABLED');
    expect(f.calls).toBe(0);
    const r1 = await refreshRates(db, {
      enabled: true,
      fetch: f,
      now: () => new Date('2026-10-25T10:00:00Z'),
      userAgent: 'x',
    });
    expect(r1).toMatchObject({ outcome: 'NEW_DATA', effectiveDate: '2026-10-23' });
    const r2 = await refreshRates(db, {
      enabled: true,
      fetch: f,
      now: () => new Date('2026-10-25T10:10:00Z'),
      userAgent: 'x',
    });
    expect(r2.outcome).toBe('NO_CHANGE');
    const bad = await refreshRates(db, {
      enabled: true,
      fetch: fetchOf(503, ''),
      now: () => new Date('2026-10-25T10:20:00Z'),
      userAgent: 'x',
    });
    expect(bad).toMatchObject({ outcome: 'FAILED', errorClass: 'HTTP_503', effectiveDate: '2026-10-23' });
    expect(latestRates(db)!.eurRates.GBP).toBe('0.83728');
  });
});
