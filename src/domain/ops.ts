import type { DB } from '@/db/client';
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
  const daily = db.prepare('SELECT reserved, completed FROM chat_daily WHERE day = ?').get(utcDay(now)) as
    { reserved: number; completed: number } | undefined;
  return {
    candidates: n(db, 'SELECT count(*) AS n FROM brokers'),
    selected: n(db, "SELECT count(*) AS n FROM brokers WHERE status = 'SELECTED'"),
    dropped: n(db, "SELECT count(*) AS n FROM brokers WHERE status = 'DROPPED'"),
    leads: n(db, "SELECT count(*) AS n FROM broker_sources WHERE kind = 'LEAD'"),
    sourcesByState,
    verifiedFacts: n(
      db,
      'SELECT count(*) AS n FROM verified_facts WHERE superseded_at IS NULL AND withdrawn_at IS NULL AND expires_at > ?',
      now.toISOString(),
    ),
    expiringIn24h: n(
      db,
      'SELECT count(*) AS n FROM verified_facts WHERE superseded_at IS NULL AND withdrawn_at IS NULL AND expires_at > ? AND expires_at <= ?',
      now.toISOString(),
      addHours(now, 24).toISOString(),
    ),
    openConflicts: n(db, 'SELECT count(*) AS n FROM fact_conflicts WHERE resolved_at IS NULL'),
    publishedPages: n(
      db,
      "SELECT count(*) AS n FROM content_pages WHERE state = 'PUBLISHED' AND synthetic = 0",
    ),
    deadLetters: n(db, "SELECT count(*) AS n FROM jobs WHERE state = 'DEAD_LETTER'"),
    alerts: db
      .prepare(
        'SELECT severity, code, message, count, last_seen AS lastSeen FROM operational_alerts WHERE resolved_at IS NULL ORDER BY last_seen DESC LIMIT 20',
      )
      .all() as OpsSummary['alerts'],
    pilot,
    lastRuns: db
      .prepare(
        'SELECT mode, outcome, started_at AS startedAt, aborted_reason AS reason FROM publication_runs ORDER BY id DESC LIMIT 10',
      )
      .all() as OpsSummary['lastRuns'],
    askToday: { reserved: daily?.reserved ?? 0, completed: daily?.completed ?? 0 },
    ratesLatest: (
      db.prepare('SELECT max(effective_date) AS d FROM market_prices').get() as { d: string | null }
    ).d,
  };
}
