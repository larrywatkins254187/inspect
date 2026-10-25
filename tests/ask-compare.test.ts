import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASK_LIMITS,
  handleAsk,
  parseAskBody,
  purgeAsk,
  tokenAcceptable,
  validateAnswer,
  type AskDeps,
  type TurnstileResult,
} from '@/domain/ask';
import {
  parseComparisonSlug,
  readComparison,
  runCompareCycle,
  selectCombination,
  slotFor,
  validatePlan,
  type Participant,
} from '@/domain/comparisons';
import { readProfile } from '@/domain/read';
import { sha256 } from '@/lib/hash';
import type { AiProvider } from '@/ai/provider';
import { at, fakeProvider, publishedBroker, T0, tempDb } from './helpers';

const okToken = (now: Date): TurnstileResult => ({
  success: true,
  hostname: 'forexinspect.com',
  action: 'ask',
  challenge_ts: now.toISOString(),
});
const body = (q = 'What is the minimum deposit at Example Markets?', extra: Record<string, unknown> = {}) =>
  JSON.stringify({ question: q, token: 'tok', history: [], ...extra });

async function askSetup(providerOut: string[] | AiProvider, cap = 50) {
  const { db } = await tempDb();
  await publishedBroker(db, T0);
  const provider = Array.isArray(providerOut) ? fakeProvider(providerOut) : providerOut;
  const deps: AskDeps = {
    db,
    provider,
    verify: async () => okToken(at(1)),
    now: () => at(1),
    hostname: 'forexinspect.com',
    dailyCap: cap,
    read: { now: at(1), publicationEnabled: true },
  };
  return { db, deps, provider };
}

describe('Ask request contract', () => {
  it('enforces strict body, token, history and size limits', () => {
    expect(parseAskBody(body())).not.toBeNull();
    expect(parseAskBody(body('x'.repeat(501)))).toBeNull();
    expect(parseAskBody(body('q', { extra: 1 }))).toBeNull();
    expect(parseAskBody(body('q', { token: 't'.repeat(2049) }))).toBeNull();
    expect(parseAskBody(body('q', { history: Array(7).fill({ role: 'user', text: 'x' }) }))).toBeNull();
    expect(parseAskBody(body('q', { history: [{ role: 'user', text: 'x'.repeat(1501) }] }))).toBeNull();
    expect(
      parseAskBody(body('q', { history: Array(5).fill({ role: 'user', text: 'x'.repeat(1300) }) })),
    ).toBeNull();
    expect(parseAskBody('x'.repeat(ASK_LIMITS.bodyBytes + 1))).toBeNull();
    expect(parseAskBody('not json')).toBeNull();
  });
  it('validates Turnstile success, exact hostname, action and freshness', () => {
    const now = at(1);
    expect(tokenAcceptable(okToken(now), 'forexinspect.com', now)).toBe(true);
    expect(tokenAcceptable({ ...okToken(now), hostname: 'evil.com' }, 'forexinspect.com', now)).toBe(false);
    expect(tokenAcceptable({ ...okToken(now), action: 'login' }, 'forexinspect.com', now)).toBe(false);
    expect(tokenAcceptable({ ...okToken(now), success: false }, 'forexinspect.com', now)).toBe(false);
    expect(tokenAcceptable(okToken(new Date(now.getTime() - 301_000)), 'forexinspect.com', now)).toBe(false);
  });
});

describe('Ask handling', () => {
  it('rejects a bad token before reserving any usage', async () => {
    const { db, deps } = await askSetup(['{}']);
    const r = await handleAsk(body(), '203.0.113.9', { ...deps, verify: async () => ({ success: false }) });
    expect(r).toEqual({ ok: false, code: 'TURNSTILE_FAILED' });
    expect((db.prepare('SELECT count(*) AS n FROM chat_attempts').get() as { n: number }).n).toBe(0);
  });
  it('answers with server-attached citations and deterministic verified text (numeric drift removed); raw IP never stored', async () => {
    const { db, deps } = await askSetup([]);
    const prof = readProfile(db, 'example-markets', { now: at(1), publicationEnabled: true })!;
    const dep = prof.view.facts.find((f) => f.field === 'minimum_deposit')!;
    const provider = fakeProvider([
      JSON.stringify({
        parts: [
          {
            kind: 'verified',
            factIds: [dep.factId],
            text: 'They require 999 EUR for every account worldwide.',
            topic: '',
          },
          {
            kind: 'general',
            factIds: [],
            text: 'A minimum deposit is the smallest first funding amount an account accepts.',
            topic: '',
          },
        ],
      }),
    ]);
    const r = await handleAsk(body(), '203.0.113.9', { ...deps, provider });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.parts[0]!;
      expect(v.kind).toBe('verified');
      if (v.kind === 'verified') {
        expect(v.text).not.toContain('999');
        expect(v.text).toContain('200 USD');
        expect(v.citations[0]!.href).toBe(`/brokers/example-markets#fact-${dep.observationId}`);
      }
      expect(r.parts[1]!.kind).toBe('general');
    }
    const logs = db.prepare('SELECT ip_hash, units FROM chat_logs').all() as {
      ip_hash: string;
      units: number;
    }[];
    expect(logs[0]!.ip_hash).not.toContain('203.0.113.9');
    expect(logs[0]!.units).toBe(1);
    expect(JSON.stringify(db.prepare('SELECT * FROM chat_attempts').all())).not.toContain('203.0.113.9');
  });
  it('downgrades unknown citations, broker-naming general text and advice to no-data', () => {
    const ev = [{ broker: 'Example Markets', slug: 'example-markets', facts: [] }];
    const v = validateAnswer(
      {
        parts: [
          { kind: 'verified', factIds: [424242], text: 'x' },
          { kind: 'general', text: 'Example Markets has tight spreads.' },
          { kind: 'general', text: 'The best broker for you is the cheapest.' },
          { kind: 'general', text: 'Spreads widen around news.' },
        ],
      },
      ev,
      ['Example Markets', 'Pepperstone'],
    );
    expect(v.parts.map((p) => p.kind)).toEqual(['no_data', 'no_data', 'no_data', 'general']);
    expect(v.downgraded).toBe(3);
  });
  it('counts failed requests toward the hourly limit and releases the daily reservation', async () => {
    const failing: AiProvider = {
      name: 'f',
      model: 'm',
      adapterVersion: 'v',
      availability: () => ({ ok: true }),
      complete: async () => ({ ok: false, errorClass: 'TIMEOUT', durationMs: 50_000 }),
    };
    const { db, deps } = await askSetup(failing);
    for (let i = 0; i < 10; i++)
      expect(await handleAsk(body(), '198.51.100.1', deps)).toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(await handleAsk(body(), '198.51.100.1', deps)).toEqual({ ok: false, code: 'RATE_LIMITED' });
    expect(db.prepare('SELECT reserved, completed FROM chat_daily').get()).toEqual({
      reserved: 0,
      completed: 0,
    });
    // A different network is not affected.
    expect((await handleAsk(body(), '198.51.100.2', deps)).ok).toBe(false);
  });
  it('daily cap is concurrency-safe: pending reservations count', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: AiProvider = {
      name: 's',
      model: 'm',
      adapterVersion: 'v',
      availability: () => ({ ok: true }),
      complete: async () => {
        await gate;
        return {
          ok: true,
          text: JSON.stringify({ parts: [{ kind: 'no_data', factIds: [], text: '', topic: 'x' }] }),
          usage: { units: 1, durationMs: 1 },
        };
      },
    };
    const { db, deps } = await askSetup(slow, 2);
    const runs = Array.from({ length: 5 }, (_, i) => handleAsk(body(), `192.0.2.${i}`, deps));
    await new Promise((r) => setTimeout(r, 20));
    release();
    const res = await Promise.all(runs);
    expect(res.filter((r) => r.ok)).toHaveLength(2);
    expect(res.filter((r) => !r.ok && r.code === 'CHAT_RESTING')).toHaveLength(3);
    expect(db.prepare('SELECT reserved, completed FROM chat_daily').get()).toEqual({
      reserved: 0,
      completed: 2,
    });
  });
  it('purges logs after 30 days', async () => {
    const { db } = await tempDb();
    db.prepare(
      "INSERT INTO chat_logs (at, ip_hash, question, history_json, outcome) VALUES (?, 'h', 'q', '[]', 'OK'), (?, 'h', 'q', '[]', 'OK')",
    ).run(T0.toISOString(), at(24 * 29).toISOString());
    expect(purgeAsk(db, at(24 * 31)).logs).toBe(1);
  });
});

describe('comparisons', () => {
  it('canonicalizes pair/triple slugs', () => {
    expect(parseComparisonSlug('b-markets-vs-a-markets')).toEqual({
      slugs: ['b-markets', 'a-markets'],
      canonical: 'a-markets-vs-b-markets',
      isCanonical: false,
    });
    expect(parseComparisonSlug('a-vs-b-vs-c')?.isCanonical).toBe(true);
    expect(parseComparisonSlug('a-vs-a')).toBeNull();
    expect(parseComparisonSlug('a')).toBeNull();
    expect(parseComparisonSlug('a-vs-b-vs-c-vs-d')).toBeNull();
    expect(parseComparisonSlug('A-vs-b')).toBeNull();
  });
  it('selects unseen 75% / existing 25% and pairs/triples equally', () => {
    const mk = (slug: string): Participant => ({
      id: 1,
      slug,
      name: slug,
      officialDomain: 'x',
      logo: { src: '', width: 1, height: 1, attribution: null },
      facts: [{ field: 'minimum_deposit' }, { field: 'eurusd_spread' }] as never,
    });
    const ps = ['a', 'b', 'c'].map(mk);
    const seq = (xs: number[]) => () => xs.shift() ?? 0;
    expect(selectCombination(ps, new Set(['a-vs-b']), seq([0.1, 0.5, 0]))).toMatchObject({
      size: 2,
      pool: 'UNSEEN',
    });
    expect(selectCombination(ps, new Set(['a-vs-b']), seq([0.1, 0.9, 0]))).toMatchObject({
      size: 2,
      pool: 'EXISTING',
      slugs: ['a', 'b'],
    });
    expect(selectCombination(ps, new Set(), seq([0.7, 0.1, 0]))).toMatchObject({
      size: 3,
      slugs: ['a', 'b', 'c'],
    });
    expect(selectCombination(ps.slice(0, 2), new Set(), seq([0.9, 0.9, 0]))).toMatchObject({ size: 2 });
    expect(
      selectCombination(
        [mk('a'), { ...mk('b'), facts: [{ field: 'minimum_deposit' }] as never }],
        new Set(),
        seq([0]),
      ),
    ).toBeNull();
  });
  it('plan may only reorder present topics and cite accepted IDs', () => {
    const facts = [
      { factId: 1, field: 'minimum_deposit' },
      { factId: 2, field: 'eurusd_spread' },
    ] as never;
    expect(validatePlan({ topicOrder: ['costs', 'accounts'], highlights: [2] }, facts).ok).toBe(true);
    expect(validatePlan({ topicOrder: ['costs'], highlights: [] }, facts)).toEqual({
      ok: false,
      reason: 'MISSING_TOPIC',
    });
    expect(validatePlan({ topicOrder: ['costs', 'accounts', 'entity'], highlights: [] }, facts)).toEqual({
      ok: false,
      reason: 'UNAVAILABLE_TOPIC',
    });
    expect(validatePlan({ topicOrder: ['costs', 'accounts'], highlights: [99] }, facts)).toEqual({
      ok: false,
      reason: 'UNKNOWN_FACT_ID',
    });
  });
  it('four-hour slots at :25', () => {
    expect(slotFor(new Date('2026-10-25T04:30:00Z'))).toMatchObject({ key: 'compare:2026-10-25T04' });
    expect(slotFor(new Date('2026-10-25T04:10:00Z'))).toMatchObject({ key: 'compare:2026-10-25T00' });
  });
  it('worker: no-op without approved logos; publishes deterministic article; reuses the plan; one job per slot', async () => {
    const { db } = await tempDb();
    await publishedBroker(db, T0, 'alpha-fx', 'Alpha FX');
    await publishedBroker(db, T0, 'beta-fx', 'Beta FX');
    const opts = { now: at(5), publicationEnabled: true, enabled: true, rng: () => 0.1 };
    const plan = JSON.stringify({
      topicOrder: ['accounts', 'costs', 'leverage', 'platforms', 'entity'],
      highlights: [],
    });
    const p = fakeProvider([plan, plan, plan]);
    expect((await runCompareCycle(db, p, opts)).outcome).toBe('NOOP_NO_COMBINATION');
    expect((await runCompareCycle(db, p, opts)).outcome).toBe('NO_DUE_JOB');
    // Approve original logos.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-logo-'));
    process.env.ASSET_DIRECTORY = dir;
    for (const [i, slug] of ['alpha-fx', 'beta-fx'].entries()) {
      const data = Buffer.from(`logo-${slug}`);
      fs.writeFileSync(path.join(dir, `${slug}-logo.webp`), data);
      db.prepare(
        "INSERT INTO broker_assets (broker_id, file_name, sha256, mime, width, height, source_url, retrieved_at, rights_basis, current_brand_reviewed_at, approved, approved_at, created_at) VALUES (?, ?, ?, 'image/webp', 200, 80, 'https://x.example/logo', ?, 'NOMINATIVE_OFFICIAL_MARK', ?, 1, ?, ?)",
      ).run(
        i + 1,
        `${slug}-logo.webp`,
        sha256(data),
        T0.toISOString(),
        T0.toISOString(),
        T0.toISOString(),
        T0.toISOString(),
      );
    }
    const opts2 = { ...opts, now: at(9) };
    const r = await runCompareCycle(db, p, opts2);
    expect(r).toMatchObject({ outcome: 'PUBLISHED', detail: 'alpha-fx-vs-beta-fx' });
    const c = readComparison(db, 'alpha-fx-vs-beta-fx', { now: at(9), publicationEnabled: true })!;
    expect(c.view.shared.length).toBeGreaterThanOrEqual(2);
    expect(c.view.summary.join(' ')).toMatch(/names no winner/);
    const calls = p.calls.length;
    const r2 = await runCompareCycle(db, p, { ...opts, now: at(13) });
    expect(r2.outcome).toBe('UNCHANGED');
    expect(p.calls.length).toBe(calls); // unchanged inputs: no model call
    // Withdrawn logo approval hides the article at read time.
    db.prepare('UPDATE broker_assets SET approved = 0 WHERE broker_id = 2').run();
    expect(readComparison(db, 'alpha-fx-vs-beta-fx', { now: at(13), publicationEnabled: true })).toBeNull();
    delete process.env.ASSET_DIRECTORY;
  });
});
