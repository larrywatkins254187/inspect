import { and, count, desc, eq, gt, isNull, lte, max } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { DB } from '@/db/client';
import * as t from '@/db/schema';
import { addHours, utcDay } from '@/lib/time';

export const PILOT_SLUGS = ['admirals', 'fp-markets', 'pepperstone', 'go-markets', 'fxpro'];

export interface PilotRow {
  slug: string;
  name: string;
  status: string;
  domainConfirmed: boolean;
  sources: { url: string; state: string; reason: string | null }[];
  leads: number;
  verifiedFacts: number;
  blockers: string[];
}

export interface OpsSummary {
  candidates: number;
  selected: number;
  dropped: number;
  leads: number;
  sourcesByState: Record<string, number>;
  verifiedFacts: number;
  expiringIn24h: number;
  openConflicts: number;
  publishedPages: number;
  deadLetters: number;
  alerts: { severity: string; code: string; message: string; count: number; lastSeen: string }[];
  pilot: PilotRow[];
  lastRuns: { mode: string; outcome: string | null; startedAt: string; reason: string | null }[];
  askToday: { reserved: number; completed: number };
  ratesLatest: string | null;
}

const n = (db: DB, sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number }).n;

/** Safe operational summary: counts and codes only — no secrets, bodies or personal data. */
export function opsSummary(db: DB, now: Date): OpsSummary {
  const sourcesByState: Record<string, number> = {};
  for (const r of db.prepare('SELECT state, count(*) AS n FROM source_registry GROUP BY state').all() as {
    state: string;
    n: number;
  }[])
    sourcesByState[r.state] = r.n;
  const pilot = PILOT_SLUGS.map((slug): PilotRow => {
    const b = db
      .prepare('SELECT id, name, status, official_domain_confirmed_at FROM brokers WHERE slug = ?')
      .get(slug) as
      { id: number; name: string; status: string; official_domain_confirmed_at: string | null } | undefined;
    if (!b)
      return {
        slug,
        name: slug,
        status: 'NOT_IMPORTED',
        domainConfirmed: false,
        sources: [],
        leads: 0,
        verifiedFacts: 0,
        blockers: ['candidate seed not imported'],
      };
    const sources = db
      .prepare(
        'SELECT url, state, state_reason AS reason FROM source_registry WHERE broker_id = ? ORDER BY url',
      )
      .all(b.id) as PilotRow['sources'];
    const leads = n(
      db,
      "SELECT count(*) AS n FROM broker_sources WHERE broker_id = ? AND kind = 'LEAD'",
      b.id,
    );
    const verifiedFacts = n(
      db,
      'SELECT count(*) AS n FROM verified_facts WHERE broker_id = ? AND superseded_at IS NULL AND withdrawn_at IS NULL AND expires_at > ?',
      b.id,
      now.toISOString(),
    );
    const blockers: string[] = [];
    if (!b.official_domain_confirmed_at) blockers.push('official domain not owner-confirmed');
    if (!sources.length) blockers.push('no source registered from lead');
    if (sources.length && !sources.some((s) => s.state === 'APPROVED'))
      blockers.push('no source with approved policy and fresh robots evidence');
    if (verifiedFacts < 3) blockers.push(`only ${verifiedFacts} accepted facts (profile floor is 3)`);
    return {
      slug,
      name: b.name,
      status: b.status,
      domainConfirmed: !!b.official_domain_confirmed_at,
      sources,
      leads,
      verifiedFacts,
      blockers,
    };
  });
  // Typed operational counts via Drizzle (read-only); evidence write paths use hand-written SQL.
  const d = drizzle(db);
  const nowIso = now.toISOString();
  const cnt = (q: { n: number } | undefined) => q?.n ?? 0;
  const current = and(
    isNull(t.verifiedFacts.supersededAt),
    isNull(t.verifiedFacts.withdrawnAt),
    gt(t.verifiedFacts.expiresAt, nowIso),
  );
  const daily = d
    .select({ reserved: t.chatDaily.reserved, completed: t.chatDaily.completed })
    .from(t.chatDaily)
    .where(eq(t.chatDaily.day, utcDay(now)))
    .get();
  return {
    candidates: cnt(d.select({ n: count() }).from(t.brokers).get()),
    selected: cnt(d.select({ n: count() }).from(t.brokers).where(eq(t.brokers.status, 'SELECTED')).get()),
    dropped: cnt(d.select({ n: count() }).from(t.brokers).where(eq(t.brokers.status, 'DROPPED')).get()),
    leads: cnt(d.select({ n: count() }).from(t.brokerSources).where(eq(t.brokerSources.kind, 'LEAD')).get()),
    sourcesByState,
    verifiedFacts: cnt(d.select({ n: count() }).from(t.verifiedFacts).where(current).get()),
    expiringIn24h: cnt(
      d
        .select({ n: count() })
        .from(t.verifiedFacts)
        .where(and(current, lte(t.verifiedFacts.expiresAt, addHours(now, 24).toISOString())))
        .get(),
    ),
    openConflicts: cnt(
      d.select({ n: count() }).from(t.factConflicts).where(isNull(t.factConflicts.resolvedAt)).get(),
    ),
    publishedPages: cnt(
      d
        .select({ n: count() })
        .from(t.contentPages)
        .where(and(eq(t.contentPages.state, 'PUBLISHED'), eq(t.contentPages.synthetic, 0)))
        .get(),
    ),
    deadLetters: cnt(d.select({ n: count() }).from(t.jobs).where(eq(t.jobs.state, 'DEAD_LETTER')).get()),
    alerts: d
      .select({
        severity: t.operationalAlerts.severity,
        code: t.operationalAlerts.code,
        message: t.operationalAlerts.message,
        count: t.operationalAlerts.count,
        lastSeen: t.operationalAlerts.lastSeen,
      })
      .from(t.operationalAlerts)
      .where(isNull(t.operationalAlerts.resolvedAt))
      .orderBy(desc(t.operationalAlerts.lastSeen))
      .limit(20)
      .all(),
    pilot,
    lastRuns: d
      .select({
        mode: t.publicationRuns.mode,
        outcome: t.publicationRuns.outcome,
        startedAt: t.publicationRuns.startedAt,
        reason: t.publicationRuns.abortedReason,
      })
      .from(t.publicationRuns)
      .orderBy(desc(t.publicationRuns.id))
      .limit(10)
      .all(),
    askToday: { reserved: daily?.reserved ?? 0, completed: daily?.completed ?? 0 },
    ratesLatest:
      d
        .select({ d: max(t.marketPrices.effectiveDate) })
        .from(t.marketPrices)
        .get()?.d ?? null,
  };
}
