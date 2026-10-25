import type { DB } from '@/db/client';
import { databaseReady } from '@/db/client';
import { buildAccountsView, buildFeesView, buildProfileView, type AccountsView, type BrokerSnapshot, type FeesView, type ProfileView } from './broker-view';
import { checkFacts } from './fact-checks';
import { pageHistory, type HistoryEntry } from './history';
import { getRevision, type PageRow, type RevisionRow } from './publication';

export interface ReadOptions {
  now: Date;
  publicationEnabled: boolean;
  /** Authenticated previews only: allow synthetic fixture pages. */
  includeSynthetic?: boolean;
}

export interface PageDates {
  firstPublished: string | null;
  materialUpdated: string | null;
  lastVerified: string | null;
}

export interface Published<V> {
  page: PageRow;
  revision: RevisionRow;
  view: V;
  dates: PageDates;
  indexable: boolean;
}

function loadPage(db: DB, path: string, opts: ReadOptions): { page: PageRow; revision: RevisionRow; snapshot: BrokerSnapshot } | null {
  if (!databaseReady(db)) return null;
  if (!opts.publicationEnabled && !opts.includeSynthetic) return null;
  const page = db.prepare("SELECT * FROM content_pages WHERE path = ? AND state = 'PUBLISHED'").get(path) as PageRow | undefined;
  if (!page || !page.current_revision_id) return null;
  if (page.synthetic && !opts.includeSynthetic) return null;
  if (!page.synthetic && !opts.publicationEnabled) return null;
  const revision = getRevision(db, page.current_revision_id);
  if (!revision || revision.status !== 'PUBLISHED') return null;
  if (page.broker_id) {
    const b = db.prepare('SELECT status FROM brokers WHERE id = ?').get(page.broker_id) as { status: string } | undefined;
    if (!b || b.status === 'DROPPED') return null;
  }
  return { page, revision, snapshot: JSON.parse(revision.content_json) as BrokerSnapshot };
}

const lastVerified = (facts: { verifiedAt: string }[]) => facts.reduce<string | null>((m, f) => (!m || f.verifiedAt > m ? f.verifiedAt : m), null);

export function readProfile(db: DB, slug: string, opts: ReadOptions): (Published<ProfileView> & { history: { entries: HistoryEntry[]; total: number } }) | null {
  const p = loadPage(db, `/brokers/${slug}`, opts);
  if (!p || p.snapshot.kind !== 'BROKER_PROFILE') return null;
  const view = buildProfileView(p.snapshot, checkFacts(db, p.snapshot.facts, opts.now));
  if (!view.publishable) return null;
  return {
    page: p.page,
    revision: p.revision,
    view,
    dates: { firstPublished: p.page.first_published_at, materialUpdated: p.page.material_updated_at, lastVerified: lastVerified(view.facts) },
    indexable: view.indexable && !p.page.synthetic,
    history: pageHistory(db, p.page.id),
  };
}

export function readFees(db: DB, slug: string, opts: ReadOptions): Published<FeesView> | null {
  if (!readProfile(db, slug, opts)) return null;
  const p = loadPage(db, `/brokers/${slug}/fees`, opts);
  if (!p || p.snapshot.kind !== 'BROKER_FEES') return null;
  const view = buildFeesView(p.snapshot, checkFacts(db, p.snapshot.facts, opts.now));
  if (!view.publishable) return null;
  return {
    page: p.page,
    revision: p.revision,
    view,
    dates: { firstPublished: p.page.first_published_at, materialUpdated: p.page.material_updated_at, lastVerified: lastVerified([...view.spreads, ...view.commissions]) },
    indexable: !p.page.synthetic,
  };
}

export function readAccounts(db: DB, slug: string, opts: ReadOptions): Published<AccountsView> | null {
  if (!readProfile(db, slug, opts)) return null;
  const p = loadPage(db, `/brokers/${slug}/accounts`, opts);
  if (!p || p.snapshot.kind !== 'BROKER_ACCOUNTS') return null;
  const view = buildAccountsView(p.snapshot, checkFacts(db, p.snapshot.facts, opts.now));
  if (!view.publishable) return null;
  const all = view.accounts.flatMap((a) => [...(a.typeFact ? [a.typeFact] : []), ...Object.values(a.conditions).flat()]);
  return {
    page: p.page,
    revision: p.revision,
    view,
    dates: { firstPublished: p.page.first_published_at, materialUpdated: p.page.material_updated_at, lastVerified: lastVerified(all) },
    indexable: !p.page.synthetic,
  };
}

export interface DirectoryEntry {
  slug: string;
  name: string;
  coverage: ProfileView['coverage'];
  platforms: string[];
  regulatorCodes: string[];
  deposit: 'VERIFIED' | 'NOT_VERIFIED';
  leverage: 'VERIFIED' | 'NOT_VERIFIED';
  hasFees: boolean;
  hasAccounts: boolean;
  indexable: boolean;
  factCount: number;
  sourceCount: number;
  materialUpdated: string | null;
  lastVerified: string | null;
}

/** Alphabetical directory of currently readable profiles. */
export function readDirectory(db: DB, opts: ReadOptions): DirectoryEntry[] {
  if (!databaseReady(db) || (!opts.publicationEnabled && !opts.includeSynthetic)) return [];
  const rows = db
    .prepare(
      `SELECT b.slug FROM content_pages p JOIN brokers b ON b.id = p.broker_id
       WHERE p.kind = 'BROKER_PROFILE' AND p.state = 'PUBLISHED' AND b.status <> 'DROPPED' ${opts.includeSynthetic ? '' : 'AND p.synthetic = 0'}`,
    )
    .all() as { slug: string }[];
  const out: DirectoryEntry[] = [];
  for (const { slug } of rows) {
    const prof = readProfile(db, slug, opts);
    if (!prof) continue;
    const v = prof.view;
    const platforms = v.facts.filter((f) => f.field.endsWith('_supported') && f.valueText === 'true').map((f) => f.field.replace('_supported', '').toUpperCase().replace('CTRADER', 'cTrader').replace('TRADINGVIEW', 'TradingView'));
    out.push({
      slug,
      name: v.broker.name,
      coverage: v.coverage,
      platforms: [...new Set(platforms)].sort(),
      regulatorCodes: [...new Set(v.licences.map((l) => l.regulatorCode))].sort(),
      deposit: v.facts.some((f) => f.field === 'minimum_deposit') ? 'VERIFIED' : 'NOT_VERIFIED',
      leverage: v.facts.some((f) => f.field === 'maximum_leverage') ? 'VERIFIED' : 'NOT_VERIFIED',
      hasFees: !!readFees(db, slug, opts),
      hasAccounts: !!readAccounts(db, slug, opts),
      indexable: prof.indexable,
      factCount: v.facts.length,
      sourceCount: v.sources.length,
      materialUpdated: prof.dates.materialUpdated,
      lastVerified: prof.dates.lastVerified,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

export interface EvidenceStats {
  brokers: number;
  facts: number;
  sources: number;
}

/** Counts derive from eligible snapshots only — never marketing numbers. */
export function evidenceStats(entries: DirectoryEntry[]): EvidenceStats {
  return {
    brokers: entries.length,
    facts: entries.reduce((n, e) => n + e.factCount, 0),
    sources: entries.reduce((n, e) => n + e.sourceCount, 0),
  };
}

/** Published sources with attribution for /sources. */
export function readSources(db: DB, opts: ReadOptions): { broker: string; slug: string; url: string; host: string; lastObservedAt: string; factCount: number; attribution: string | null }[] {
  const out: { broker: string; slug: string; url: string; host: string; lastObservedAt: string; factCount: number; attribution: string | null }[] = [];
  for (const e of readDirectory(db, opts)) {
    const prof = readProfile(db, e.slug, opts)!;
    for (const s of prof.view.sources) {
      const attr = db
        .prepare('SELECT p.attribution FROM source_registry r JOIN source_policies p ON p.source_id = r.id WHERE r.url = ? ORDER BY p.revision DESC LIMIT 1')
        .get(s.url) as { attribution: string | null } | undefined;
      out.push({ broker: e.name, slug: e.slug, ...s, attribution: attr?.attribution ?? null });
    }
  }
  return out;
}
