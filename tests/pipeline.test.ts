import { describe, expect, it } from 'vitest';
import { runExtractionPass } from '@/domain/extract';
import { promoteDocument, rejectFact, resolveConflict, withdrawFact } from '@/domain/promote';
import {
  publishBroker,
  publishRevision,
  qaRevision,
  createDraft,
  brokerSnapshot,
  retractPage,
  rollbackPage,
  runAutoPublication,
  type CitingContent,
} from '@/domain/publication';
import { readAccounts, readDirectory, readFees, readProfile } from '@/domain/read';
import { recordStopNotice } from '@/domain/policy';
import {
  at,
  EXAMPLE_TEXT,
  fakeProvider,
  GOOD_READINGS,
  insertDocument,
  r,
  seedApprovedSource,
  T0,
  tempDb,
} from './helpers';

const out = (readings: unknown[]) => JSON.stringify({ readings });
const opts = (now: Date) => ({ now, publicationEnabled: true });

async function acceptedBroker(readingsA = GOOD_READINGS, readingsB = GOOD_READINGS) {
  const { db } = await tempDb();
  const src = seedApprovedSource(db, T0);
  const docId = insertDocument(db, src.sourceId, src.url, T0);
  const provider = fakeProvider([out(readingsA), out(readingsB), out([])]);
  const a = await runExtractionPass(db, provider, docId, EXAMPLE_TEXT, 'A', () => T0);
  const b = await runExtractionPass(db, provider, docId, EXAMPLE_TEXT, 'B', () => T0);
  return { db, src, docId, provider, a, b };
}

describe('evidence → page vertical slice', () => {
  it('requires two agreeing passes and promotes scoped facts deterministically', async () => {
    const { db, docId, a, b, provider } = await acceptedBroker();
    expect(a.status).toBe('RECORDED');
    expect(b.observations).toBe(GOOD_READINGS.length);
    // Untrusted page instructions are wrapped as data in the prompt.
    expect(provider.calls[0]).toContain('untrusted');
    const res = promoteDocument(db, docId, T0);
    expect(res.filter((x) => x.outcome === 'ACCEPTED')).toHaveLength(GOOD_READINGS.length);
    // Two readings of one source: facts cite one document.
    const docs = db
      .prepare(
        'SELECT count(DISTINCT o.document_id) AS n FROM verified_facts f JOIN fact_observations o ON o.id = f.observation_id',
      )
      .get() as { n: number };
    expect(docs.n).toBe(1);
    // Named company on a page is BROKER_DISCLOSURE, not a verified operator or licence.
    const rel = db.prepare('SELECT relationship FROM broker_entities').all() as { relationship: string }[];
    expect(rel.map((x) => x.relationship)).toEqual(['BROKER_DISCLOSURE']);
    expect((db.prepare('SELECT count(*) AS n FROM regulatory_licenses').get() as { n: number }).n).toBe(0);
  });

  it('does not promote when passes disagree or a single pass exists', async () => {
    const altered = GOOD_READINGS.map((x) =>
      x.field === 'minimum_deposit' && x.scope.account === 'Standard' ? { ...x, value: '250' } : x,
    );
    const { db, docId } = await acceptedBroker(GOOD_READINGS, altered);
    const res = promoteDocument(db, docId, T0);
    expect(
      res.find((x) => x.field === 'minimum_deposit' && x.scopeKey.includes('"standard"'))?.outcome,
    ).toMatch(/PASS_DISAGREEMENT|SINGLE_READING/);
  });

  it('rejects invalid readings: ambiguous $, missing instrument, unsupported licence claims', async () => {
    const bad = [
      r('minimum_deposit', '200', 'Minimum deposit: USD 200.', { currency: null }),
      r('eurusd_spread', '1.2', 'EUR/USD spreads from 1.2 pips on the Standard account.', { unit: 'pips' }),
      r('regulatory_licence', 'AFSL 123', 'licensed everywhere'),
      r('maximum_leverage', '1:1000', 'Maximum leverage up to 1:500.'),
    ];
    const { a } = await acceptedBroker(bad, bad);
    expect(a.observations).toBe(0);
    expect(a.rejected.map((x) => x.problems[0])).toEqual([
      'CURRENCY_MISSING',
      'INSTRUMENT_NOT_EURUSD',
      'FIELD_NOT_EXTRACTABLE',
      'LEVERAGE_NOT_IN_QUOTE',
    ]);
  });

  it('reuses receipts: unchanged input causes no second model call', async () => {
    const { db, docId, provider } = await acceptedBroker();
    const before = provider.calls.length;
    const again = await runExtractionPass(db, provider, docId, EXAMPLE_TEXT, 'A', () => T0);
    expect(again.status).toBe('REUSED_NO_CHANGE');
    expect(provider.calls.length).toBe(before);
  });

  it('publishes atomically and serves SSR-able views with real read checks', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    const report = publishBroker(db, src.brokerId, at(1), 'owner:test');
    expect(report.pages.map((p) => p.result)).toEqual(['PUBLISHED', 'PUBLISHED', 'PUBLISHED']);
    const prof = readProfile(db, 'example-markets', opts(at(2)))!;
    expect(prof.view.facts.length).toBe(GOOD_READINGS.length);
    expect(prof.indexable).toBe(true);
    expect(prof.view.coverage.find((c) => c.topic === 'trading_commission')?.covered).toBe(true);
    expect(prof.view.glance.map((g) => g.account)).toEqual(['Raw', 'Standard']);
    const fees = readFees(db, 'example-markets', opts(at(2)))!;
    expect(fees.view.commissions[0]!.usableForCost).toBe(true);
    const acc = readAccounts(db, 'example-markets', opts(at(2)))!;
    expect(acc.view.standardVsRaw.available).toBe(false); // entity/jurisdiction unknown → not comparable
    // Publication off → nothing public.
    expect(readProfile(db, 'example-markets', { now: at(2), publicationEnabled: false })).toBeNull();
    // Idempotent publish.
    expect(publishBroker(db, src.brokerId, at(3), 'owner:test').pages.map((p) => p.result)).toEqual([
      'UNCHANGED',
      'UNCHANGED',
      'UNCHANGED',
    ]);
  });

  it('expires at read time without any write, and hides conflicted/withdrawn facts', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    publishBroker(db, src.brokerId, at(1), 'owner:test');
    expect(readProfile(db, 'example-markets', opts(at(167)))).not.toBeNull();
    expect(readProfile(db, 'example-markets', opts(at(169)))).toBeNull(); // 168h TTL; profile floor fails once numeric facts expire
    const f = db.prepare("SELECT id FROM verified_facts WHERE field_key = 'trading_commission'").get() as {
      id: number;
    };
    withdrawFact(db, f.id, 'source page removed', 'owner:test', at(2));
    const sp = db
      .prepare("SELECT id FROM verified_facts WHERE field_key = 'eurusd_spread' LIMIT 1")
      .get() as { id: number };
    withdrawFact(db, sp.id, 'source page removed', 'owner:test', at(2));
    const prof = readProfile(db, 'example-markets', opts(at(3)))!;
    expect(prof.view.facts.some((x) => x.field === 'trading_commission')).toBe(false);
    expect(readFees(db, 'example-markets', opts(at(3)))).toBeNull(); // fees floor (2 cost facts) now fails → 404
  });

  it('stop notice on the source hides every dependent page immediately', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    publishBroker(db, src.brokerId, at(1), 'owner:test');
    recordStopNotice(db, src.sourceId, 'owner:test', 'source owner asked us to stop', at(2));
    expect(readProfile(db, 'example-markets', opts(at(3)))).toBeNull();
    expect(readDirectory(db, opts(at(3)))).toEqual([]);
  });

  it('aborts publication when evidence changes after QA', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    const snap = brokerSnapshot(db, src.brokerId, 'BROKER_PROFILE', at(1))!;
    const { revisionId } = createDraft(
      db,
      {
        kind: 'BROKER_PROFILE',
        path: '/brokers/example-markets',
        brokerId: src.brokerId,
        comparisonKey: null,
        content: snap as unknown as CitingContent,
      },
      at(1),
    );
    expect(qaRevision(db, revisionId, at(1)).passed).toBe(true);
    const f = db
      .prepare("SELECT id FROM verified_facts WHERE field_key = 'minimum_deposit' LIMIT 1")
      .get() as { id: number };
    rejectFact(db, f.id, 'owner found wrong scope', 'owner:test', at(1));
    const pub = publishRevision(db, revisionId, at(1), 'owner:test');
    expect(pub.outcome).toBe('ABORTED');
    expect(pub.reasons).toContain('FACTS_CHANGED_AFTER_QA');
    const page = db
      .prepare("SELECT state, current_revision_id FROM content_pages WHERE path = '/brokers/example-markets'")
      .get() as { state: string; current_revision_id: number | null };
    expect(page).toEqual({ state: 'DRAFT', current_revision_id: null });
  });

  it('owner rejection blocks silent re-acceptance; different value in same scope opens a conflict', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    const dep = db.prepare("SELECT id FROM verified_facts WHERE field_key = 'maximum_leverage'").get() as {
      id: number;
    };
    rejectFact(db, dep.id, 'wrong', 'owner:test', at(1));
    const doc2 = insertDocument(db, src.sourceId, src.url, at(2));
    const p2 = fakeProvider([out(GOOD_READINGS), out(GOOD_READINGS)]);
    await runExtractionPass(db, p2, doc2, EXAMPLE_TEXT + '\n', 'A', () => at(2));
    await runExtractionPass(db, p2, doc2, EXAMPLE_TEXT + '\n', 'B', () => at(2));
    const res = promoteDocument(db, doc2, at(2));
    expect(res.find((x) => x.field === 'maximum_leverage')?.outcome).toBe('OWNER_REJECTED');
    expect(res.find((x) => x.field === 'minimum_deposit')?.outcome).toBe('RENEWED');
  });

  it('different value from a different source opens a conflict that only an owner resolves', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    db.prepare(
      "INSERT INTO source_registry (broker_id, url, host, created_at, updated_at) VALUES (?, 'https://www.example-markets.com/pricing', 'www.example-markets.com', ?, ?)",
    ).run(src.brokerId, T0.toISOString(), T0.toISOString());
    const s2 = (
      db.prepare("SELECT id FROM source_registry WHERE url LIKE '%pricing'").get() as { id: number }
    ).id;
    const { recordOwnerPolicy, applyRobotsOutcome } = await import('@/domain/policy');
    const { ownerPolicy } = await import('./helpers');
    recordOwnerPolicy(
      db,
      s2,
      ownerPolicy('www.example-markets.com', { robots_path: '/pricing' }),
      'owner:test',
      T0,
    );
    applyRobotsOutcome(db, s2, { kind: 'OK', allowed: true }, T0);
    const text = 'Standard account\nMinimum deposit: USD 100. Maximum leverage up to 1:500.';
    const doc2 = insertDocument(db, s2, 'https://www.example-markets.com/pricing', at(1), text);
    const reading = [
      r('minimum_deposit', '100', 'Minimum deposit: USD 100.', {
        currency: 'USD',
        scope: { account: 'Standard' },
      }),
    ];
    const p2 = fakeProvider([out(reading), out(reading)]);
    await runExtractionPass(db, p2, doc2, text, 'A', () => at(1));
    await runExtractionPass(db, p2, doc2, text, 'B', () => at(1));
    expect(promoteDocument(db, doc2, at(1))[0]!.outcome).toBe('CONFLICT_OPENED');
    publishBroker(db, src.brokerId, at(1), 'owner:test');
    const prof = readProfile(db, 'example-markets', opts(at(2)))!;
    expect(
      prof.view.facts.filter((f) => f.field === 'minimum_deposit' && f.scope.account === 'Standard'),
    ).toHaveLength(0);
    const c = db.prepare('SELECT id FROM fact_conflicts WHERE resolved_at IS NULL').get() as { id: number };
    expect(() => resolveConflict(db, c.id, 'OWNER_SELECTED_A', 'x', 'model:codex', at(2))).toThrow();
    resolveConflict(db, c.id, 'OWNER_SELECTED_A', 'pricing page is outdated', 'owner:test', at(2));
    // The earlier snapshot excluded the disputed fact; a new revision restores it.
    expect(publishBroker(db, src.brokerId, at(2), 'owner:test').pages[0]!.result).toBe('PUBLISHED');
    expect(
      readProfile(db, 'example-markets', opts(at(3)))!.view.facts.some(
        (f) => f.field === 'minimum_deposit' && f.scope.account === 'Standard',
      ),
    ).toBe(true);
  });

  it('retract and rollback are idempotent and auditable; renewals are not material changes', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    publishBroker(db, src.brokerId, at(1), 'owner:test');
    // Renewal: same values re-read later → new fact ids, same substantive content.
    const doc2 = insertDocument(db, src.sourceId, src.url, at(24), EXAMPLE_TEXT + ' ');
    const p2 = fakeProvider([out(GOOD_READINGS), out(GOOD_READINGS)]);
    await runExtractionPass(db, p2, doc2, EXAMPLE_TEXT, 'A', () => at(24));
    await runExtractionPass(db, p2, doc2, EXAMPLE_TEXT, 'B', () => at(24));
    promoteDocument(db, doc2, at(24));
    // Old snapshot still readable via identical renewal chain.
    expect(readProfile(db, 'example-markets', opts(at(25)))).not.toBeNull();
    publishBroker(db, src.brokerId, at(25), 'owner:test');
    const page = db.prepare("SELECT * FROM content_pages WHERE path = '/brokers/example-markets'").get() as {
      id: number;
      material_updated_at: string;
      first_published_at: string;
    };
    expect(page.material_updated_at).toBe(at(1).toISOString());
    const prof = readProfile(db, 'example-markets', opts(at(26)))!;
    expect(prof.history.entries.map((e) => e.kind)).toEqual(['REVERIFIED', 'FIRST_PUBLICATION']);
    const firstRev = db
      .prepare("SELECT id FROM content_revisions WHERE page_id = ? AND status = 'SUPERSEDED'")
      .get(page.id) as { id: number };
    expect(rollbackPage(db, page.id, firstRev.id, 'owner:test', at(26)).outcome).toBe('PUBLISHED');
    expect(rollbackPage(db, page.id, firstRev.id, 'owner:test', at(26)).outcome).toBe('NOOP');
    expect(retractPage(db, page.id, 'test', 'owner:test', at(27))).toBe('RETRACTED');
    expect(retractPage(db, page.id, 'test', 'owner:test', at(27))).toBe('NOOP');
    expect(readProfile(db, 'example-markets', opts(at(27)))).toBeNull();
  });

  it('auto publication requires both switches and aborts on mass retraction', async () => {
    const { db, src, docId } = await acceptedBroker();
    promoteDocument(db, docId, T0);
    expect(
      runAutoPublication(db, at(1), { publicationEnabled: true, autoPublicationEnabled: false }).outcome,
    ).toBe('DISABLED');
    const ok = runAutoPublication(db, at(1), { publicationEnabled: true, autoPublicationEnabled: true });
    expect(ok.published).toBe(3);
    // After expiry all 3 pages fail: 3 > 2 → guard aborts (and read checks still hide them).
    const guarded = runAutoPublication(db, at(200), {
      publicationEnabled: true,
      autoPublicationEnabled: true,
    });
    expect(guarded.outcome).toBe('ABORTED');
    expect(readProfile(db, 'example-markets', opts(at(200)))).toBeNull();
    expect(
      (db.prepare("SELECT count(*) AS n FROM content_pages WHERE state = 'PUBLISHED'").get() as { n: number })
        .n,
    ).toBe(3);
    void src;
  });

  it('observations and accepted values are immutable at the database level', async () => {
    const { db } = await acceptedBroker();
    expect(() => db.prepare("UPDATE fact_observations SET value_text = '1'").run()).toThrow(/immutable/);
    expect(() => db.prepare('DELETE FROM fact_observations').run()).toThrow(/immutable/);
  });
});
