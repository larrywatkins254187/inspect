import type { DB } from '@/db/client';
import { hashJson, stableJson } from '@/lib/hash';
import { audit, raiseAlert } from './audit';
import { checkFacts, loadCurrentFacts, type SnapshotFact } from './fact-checks';
import { buildAccountsView, buildFeesView, buildProfileView, type BrokerSnapshot, type LicenceRecord } from './broker-view';
import { currentPolicy } from './policy';

export type PageKind = 'BROKER_PROFILE' | 'BROKER_FEES' | 'BROKER_ACCOUNTS' | 'COMPARISON';

export interface RevisionRow {
  id: number;
  page_id: number;
  revision_no: number;
  status: 'DRAFT' | 'QA_PASSED' | 'QA_FAILED' | 'PUBLISHED' | 'SUPERSEDED' | 'WITHDRAWN' | 'ABORTED';
  content_json: string;
  content_hash: string;
  fact_hash: string;
  policy_hash: string;
  substantive_hash: string;
  qa_json: string | null;
  parent_revision_id: number | null;
  rollback_of: number | null;
  material_change: number | null;
  created_at: string;
  published_at: string | null;
  withdrawn_at: string | null;
  prompt_version: string | null;
  model: string | null;
  adapter_version: string | null;
}

export interface PageRow {
  id: number;
  kind: PageKind;
  path: string;
  broker_id: number | null;
  comparison_key: string | null;
  state: 'DRAFT' | 'PUBLISHED' | 'RETRACTED' | 'HIDDEN';
  current_revision_id: number | null;
  first_published_at: string | null;
  material_updated_at: string | null;
  synthetic: number;
}

/** Snapshot content shape shared by every page kind: it must expose its cited facts. */
export interface CitingContent {
  kind: PageKind;
  facts: SnapshotFact[];
  [k: string]: unknown;
}

export const factHash = (facts: SnapshotFact[]) =>
  hashJson(facts.map((f) => [f.factId, f.normalizedValue, f.unit, f.currency, f.scopeKey]).sort((a, b) => Number(a[0]) - Number(b[0])));

/** Substantive identity ignores fact IDs and verification dates: renewals are not material changes. */
export const substantiveHash = (content: CitingContent) =>
  hashJson({
    facts: content.facts.map((f) => [f.field, f.scopeKey, f.normalizedValue, f.unit, f.currency, f.effectiveAt]).sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
    extra: content.kind === 'COMPARISON' ? (content as { plan?: unknown }).plan ?? null : null,
    licences: (content as { licences?: LicenceRecord[] }).licences?.map((l) => [l.regulatorCode, l.licenceNumber, l.status]) ?? [],
  });

export function policyHash(db: DB, facts: SnapshotFact[]): string {
  const ids = [...new Set(facts.map((f) => f.sourceId))].sort((a, b) => a - b);
  return hashJson(ids.map((id) => [id, currentPolicy(db, id)?.evidence_hash ?? null]));
}

export const getPage = (db: DB, path: string): PageRow | null => (db.prepare('SELECT * FROM content_pages WHERE path = ?').get(path) as PageRow | undefined) ?? null;
export const getRevision = (db: DB, id: number): RevisionRow | null => (db.prepare('SELECT * FROM content_revisions WHERE id = ?').get(id) as RevisionRow | undefined) ?? null;

/** Kind-specific publication floor evaluated against currently valid facts. */
export function meetsFloor(content: CitingContent, checks: ReturnType<typeof checkFacts>): { ok: boolean; reason: string | null } {
  switch (content.kind) {
    case 'BROKER_PROFILE':
      return buildProfileView(content as unknown as BrokerSnapshot, checks).publishable ? { ok: true, reason: null } : { ok: false, reason: 'PROFILE_FLOOR' };
    case 'BROKER_FEES':
      return buildFeesView(content as unknown as BrokerSnapshot, checks).publishable ? { ok: true, reason: null } : { ok: false, reason: 'FEES_FLOOR' };
    case 'BROKER_ACCOUNTS':
      return buildAccountsView(content as unknown as BrokerSnapshot, checks).publishable ? { ok: true, reason: null } : { ok: false, reason: 'ACCOUNTS_FLOOR' };
    case 'COMPARISON': {
      // Comparison eligibility is evaluated by its own module; here: every cited fact must be valid.
      const allValid = content.facts.every((f) => checks.get(f.factId)?.valid);
      return allValid ? { ok: true, reason: null } : { ok: false, reason: 'COMPARISON_FACT_INVALID' };
    }
  }
}

export interface DraftInput {
  kind: PageKind;
  path: string;
  brokerId: number | null;
  comparisonKey: string | null;
  content: CitingContent;
  synthetic?: boolean;
  promptVersion?: string | null;
  model?: string | null;
  adapterVersion?: string | null;
  receiptId?: number | null;
}

/** Create a draft revision unless the current published revision is byte-identical. */
export function createDraft(db: DB, input: DraftInput, now: Date): { revisionId: number; noop: boolean } {
  const contentJson = stableJson(input.content);
  const contentHash = hashJson(input.content);
  return db.transaction(() => {
    let page = getPage(db, input.path);
    if (!page) {
      db.prepare('INSERT INTO content_pages (kind, path, broker_id, comparison_key, synthetic, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(
        input.kind,
        input.path,
        input.brokerId,
        input.comparisonKey,
        input.synthetic ? 1 : 0,
        now.toISOString(),
        now.toISOString(),
      );
      page = getPage(db, input.path)!;
    }
    if (page.current_revision_id) {
      const cur = getRevision(db, page.current_revision_id)!;
      if (cur.content_hash === contentHash && page.state === 'PUBLISHED') return { revisionId: cur.id, noop: true };
    }
    const latestDraft = db
      .prepare("SELECT id FROM content_revisions WHERE page_id = ? AND content_hash = ? AND status IN ('DRAFT','QA_PASSED') ORDER BY id DESC LIMIT 1")
      .get(page.id, contentHash) as { id: number } | undefined;
    if (latestDraft) return { revisionId: latestDraft.id, noop: true };
    const no = (db.prepare('SELECT coalesce(max(revision_no), 0) + 1 AS n FROM content_revisions WHERE page_id = ?').get(page.id) as { n: number }).n;
    const id = Number(
      db
        .prepare(
          `INSERT INTO content_revisions (page_id, revision_no, status, content_json, content_hash, fact_hash, policy_hash, substantive_hash,
            prompt_version, model, adapter_version, ai_receipt_id, parent_revision_id, created_at)
           VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          page.id,
          no,
          contentJson,
          contentHash,
          factHash(input.content.facts),
          policyHash(db, input.content.facts),
          substantiveHash(input.content),
          input.promptVersion ?? null,
          input.model ?? null,
          input.adapterVersion ?? null,
          input.receiptId ?? null,
          page.current_revision_id,
          now.toISOString(),
        ).lastInsertRowid,
    );
    const ins = db.prepare('INSERT INTO page_facts (revision_id, verified_fact_id, claim_key) VALUES (?, ?, ?)');
    for (const f of input.content.facts) ins.run(id, f.factId, `${f.field}:${f.scopeKey}`);
    return { revisionId: id, noop: false };
  })();
}

const FORBIDDEN_PROSE = /\b(best|top[- ]rated|recommend(ed|s)?|rating|ranked|ranking|winner|safest|guaranteed|trustworthy|scam)\b/i;

function proseStrings(v: unknown, out: string[] = [], key = ''): string[] {
  if (typeof v === 'string' && /^(text|prose|intro|summary|heading)$/i.test(key)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => proseStrings(x, out, key));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'facts') proseStrings(x, out, k);
  return out;
}

/**
 * Independent deterministic QA: cited facts exist with identical values, the
 * page_facts set equals the snapshot, floors pass, and no ranking language.
 */
export function qaRevision(db: DB, revisionId: number, now: Date): { passed: boolean; problems: string[] } {
  const rev = getRevision(db, revisionId);
  if (!rev) throw new Error('unknown revision');
  if (rev.status !== 'DRAFT' && rev.status !== 'QA_FAILED') return { passed: rev.status === 'QA_PASSED' || rev.status === 'PUBLISHED', problems: [] };
  const content = JSON.parse(rev.content_json) as CitingContent;
  const problems: string[] = [];
  const pf = db.prepare('SELECT verified_fact_id FROM page_facts WHERE revision_id = ? ORDER BY verified_fact_id').all(revisionId) as { verified_fact_id: number }[];
  const pfIds = [...new Set(pf.map((r) => r.verified_fact_id))].sort((a, b) => a - b);
  const snapIds = [...new Set(content.facts.map((f) => f.factId))].sort((a, b) => a - b);
  if (stableJson(pfIds) !== stableJson(snapIds)) problems.push('PAGE_FACTS_MISMATCH');
  const factRow = db.prepare('SELECT normalized_value, unit, currency, scope_key, value_text, field_key, broker_id FROM verified_facts WHERE id = ?');
  for (const f of content.facts) {
    const r = factRow.get(f.factId) as { normalized_value: string; unit: string | null; currency: string | null; scope_key: string; value_text: string; field_key: string; broker_id: number } | undefined;
    if (!r) problems.push(`FACT_MISSING:${f.factId}`);
    else if (r.normalized_value !== f.normalizedValue || r.unit !== f.unit || r.currency !== f.currency || r.scope_key !== f.scopeKey || r.value_text !== f.valueText || r.field_key !== f.field)
      problems.push(`FACT_DRIFT:${f.factId}`);
  }
  const checks = checkFacts(db, content.facts, now);
  const invalid = content.facts.filter((f) => !checks.get(f.factId)?.valid);
  if (invalid.length && content.kind !== 'COMPARISON') problems.push(`INVALID_FACTS:${invalid.map((f) => f.factId).join(',')}`);
  const floor = meetsFloor(content, checks);
  if (!floor.ok) problems.push(floor.reason!);
  for (const s of proseStrings(content)) if (FORBIDDEN_PROSE.test(s)) problems.push('RANKING_LANGUAGE');
  const passed = problems.length === 0;
  db.prepare('UPDATE content_revisions SET status = ?, qa_json = ?, qa_at = ? WHERE id = ?').run(passed ? 'QA_PASSED' : 'QA_FAILED', JSON.stringify({ problems }), now.toISOString(), revisionId);
  return { passed, problems };
}

export type PublishOutcome = { outcome: 'PUBLISHED' | 'NOOP' | 'ABORTED'; reasons: string[] };

/**
 * Atomic publication: a short IMMEDIATE transaction rechecks dependencies and
 * hashes; changed evidence after QA aborts. No partial pointer switch.
 */
export function publishRevision(db: DB, revisionId: number, now: Date, actor: string): PublishOutcome {
  const run = db.transaction((): PublishOutcome => {
    const rev = getRevision(db, revisionId);
    if (!rev) return { outcome: 'ABORTED', reasons: ['REVISION_MISSING'] };
    const page = db.prepare('SELECT * FROM content_pages WHERE id = ?').get(rev.page_id) as PageRow;
    if (rev.status === 'PUBLISHED' && page.current_revision_id === rev.id && page.state === 'PUBLISHED') return { outcome: 'NOOP', reasons: [] };
    if (rev.status !== 'QA_PASSED') return { outcome: 'ABORTED', reasons: [`STATUS_${rev.status}`] };
    const content = JSON.parse(rev.content_json) as CitingContent;
    const checks = checkFacts(db, content.facts, now);
    const reasons: string[] = [];
    if (content.facts.some((f) => !checks.get(f.factId)?.valid)) reasons.push('FACTS_CHANGED_AFTER_QA');
    const current = loadFactsByIds(db, content.facts.map((f) => f.factId));
    if (factHash(current) !== rev.fact_hash) reasons.push('FACT_HASH_CHANGED');
    if (policyHash(db, content.facts) !== rev.policy_hash) reasons.push('POLICY_CHANGED_AFTER_QA');
    const floor = meetsFloor(content, checks);
    if (!floor.ok) reasons.push(floor.reason!);
    if (reasons.length) {
      db.prepare("UPDATE content_revisions SET status = 'ABORTED' WHERE id = ?").run(rev.id);
      audit(db, { actor, action: 'publish.abort', subject: `revision:${rev.id}`, at: now, detail: { reasons } });
      return { outcome: 'ABORTED', reasons };
    }
    const prev = page.current_revision_id ? getRevision(db, page.current_revision_id) : null;
    const material = !prev || prev.substantive_hash !== rev.substantive_hash;
    if (prev && prev.status === 'PUBLISHED') db.prepare("UPDATE content_revisions SET status = 'SUPERSEDED' WHERE id = ?").run(prev.id);
    db.prepare("UPDATE content_revisions SET status = 'PUBLISHED', published_at = ?, material_change = ? WHERE id = ?").run(now.toISOString(), material ? 1 : 0, rev.id);
    db.prepare(
      `UPDATE content_pages SET state = 'PUBLISHED', current_revision_id = ?, first_published_at = coalesce(first_published_at, ?),
        material_updated_at = CASE WHEN ? THEN ? ELSE coalesce(material_updated_at, ?) END, updated_at = ? WHERE id = ?`,
    ).run(rev.id, now.toISOString(), material ? 1 : 0, now.toISOString(), now.toISOString(), now.toISOString(), page.id);
    audit(db, { actor, action: 'publish.revision', subject: `page:${page.path}`, at: now, detail: { revision: rev.id, material } });
    return { outcome: 'PUBLISHED', reasons: [] };
  });
  return run.immediate();
}

function loadFactsByIds(db: DB, ids: number[]): SnapshotFact[] {
  const stmt = db.prepare('SELECT id AS factId, normalized_value AS normalizedValue, unit, currency, scope_key AS scopeKey FROM verified_facts WHERE id = ?');
  return ids.map((id) => stmt.get(id) as SnapshotFact).filter(Boolean);
}

/** Build a broker snapshot of a given kind from current accepted facts. */
export function brokerSnapshot(db: DB, brokerId: number, kind: BrokerSnapshot['kind'], now: Date): BrokerSnapshot | null {
  const b = db.prepare('SELECT id, slug, name, official_domain, official_domain_confirmed_at, status FROM brokers WHERE id = ?').get(brokerId) as
    | { id: number; slug: string; name: string; official_domain: string | null; official_domain_confirmed_at: string | null; status: string }
    | undefined;
  if (!b || !b.official_domain || !b.official_domain_confirmed_at || b.status === 'DROPPED') return null;
  // Draft only from facts that pass current read checks (conflicted/expired/policy-invalid facts are left out).
  const all = loadCurrentFacts(db, brokerId);
  const checks = checkFacts(db, all, now);
  let facts = all.filter((f) => checks.get(f.factId)?.valid);
  if (kind === 'BROKER_FEES') facts = facts.filter((f) => f.field === 'eurusd_spread' || f.field === 'trading_commission');
  if (kind === 'BROKER_ACCOUNTS') facts = facts.filter((f) => f.scope.account !== null);
  const licences = kind === 'BROKER_PROFILE' ? loadLicences(db, facts) : [];
  return { kind, schema: 1, broker: { id: b.id, slug: b.slug, name: b.name, officialDomain: b.official_domain }, facts, licences };
}

function loadLicences(db: DB, facts: SnapshotFact[]): LicenceRecord[] {
  const out: LicenceRecord[] = [];
  const stmt = db.prepare(
    `SELECT r.code, r.name, r.register_url, l.licence_number, l.status, l.status_as_of, e.legal_name
     FROM broker_entities be JOIN legal_entities e ON e.id = be.legal_entity_id
     JOIN regulatory_licenses l ON l.legal_entity_id = e.id JOIN regulators r ON r.id = l.regulator_id
     WHERE be.verified_fact_id = ? AND be.ended_at IS NULL ORDER BY r.code, l.licence_number`,
  );
  for (const f of facts.filter((x) => x.field === 'legal_entity_name' || x.field === 'operating_entity')) {
    for (const r of stmt.all(f.factId) as { code: string; name: string; register_url: string; licence_number: string; status: string; status_as_of: string; legal_name: string }[]) {
      out.push({ regulatorCode: r.code, regulatorName: r.name, registerUrl: r.register_url, licenceNumber: r.licence_number, status: r.status, statusAsOf: r.status_as_of, legalName: r.legal_name, entityFactId: f.factId });
    }
  }
  return out;
}

export const brokerPaths = (slug: string) => ({
  BROKER_PROFILE: `/brokers/${slug}`,
  BROKER_FEES: `/brokers/${slug}/fees`,
  BROKER_ACCOUNTS: `/brokers/${slug}/accounts`,
});

export interface BrokerPublishReport {
  broker: string;
  pages: { kind: PageKind; path: string; result: string; problems: string[] }[];
}

/** Draft → QA → publish for one broker's three page kinds (manual or automatic). */
export function publishBroker(db: DB, brokerId: number, now: Date, actor: string, opts: { synthetic?: boolean } = {}): BrokerPublishReport {
  const b = db.prepare('SELECT slug FROM brokers WHERE id = ?').get(brokerId) as { slug: string };
  const paths = brokerPaths(b.slug);
  const pages: BrokerPublishReport['pages'] = [];
  for (const kind of ['BROKER_PROFILE', 'BROKER_FEES', 'BROKER_ACCOUNTS'] as const) {
    const snap = brokerSnapshot(db, brokerId, kind, now);
    if (!snap) {
      pages.push({ kind, path: paths[kind], result: 'NOT_ELIGIBLE', problems: ['BROKER_NOT_ELIGIBLE'] });
      continue;
    }
    const content = snap as unknown as CitingContent;
    const checks = checkFacts(db, snap.facts, now);
    const floor = meetsFloor(content, checks);
    if (!floor.ok) {
      pages.push({ kind, path: paths[kind], result: 'BELOW_FLOOR', problems: [floor.reason!] });
      continue;
    }
    const { revisionId, noop } = createDraft(db, { kind, path: paths[kind], brokerId, comparisonKey: null, content, synthetic: opts.synthetic }, now);
    if (noop) {
      const rev = getRevision(db, revisionId)!;
      if (rev.status === 'PUBLISHED') {
        pages.push({ kind, path: paths[kind], result: 'UNCHANGED', problems: [] });
        continue;
      }
    }
    const qa = qaRevision(db, revisionId, now);
    if (!qa.passed) {
      pages.push({ kind, path: paths[kind], result: 'QA_FAILED', problems: qa.problems });
      continue;
    }
    const pub = publishRevision(db, revisionId, now, actor);
    pages.push({ kind, path: paths[kind], result: pub.outcome, problems: pub.reasons });
  }
  return { broker: b.slug, pages };
}

/** Pages whose current published revision would no longer pass its floor. */
export function pagesFailingReadChecks(db: DB, now: Date, kinds: PageKind[]): PageRow[] {
  const pages = db.prepare(`SELECT * FROM content_pages WHERE state = 'PUBLISHED' AND synthetic = 0 AND kind IN (${kinds.map(() => '?').join(',')})`).all(...kinds) as PageRow[];
  return pages.filter((p) => {
    const rev = getRevision(db, p.current_revision_id!)!;
    const content = JSON.parse(rev.content_json) as CitingContent;
    return !meetsFloor(content, checkFacts(db, content.facts, now)).ok;
  });
}

export const MASS_RETRACTION = { maxPages: 2, maxFraction: 0.25 };

/**
 * Scheduled publication (PRD §13): requires both switches; identical gates;
 * aborts and alerts when retractions exceed 2 pages or 25% of the relevant set.
 * The guard never authorizes expired claims — read checks still hide them.
 */
export function runAutoPublication(
  db: DB,
  now: Date,
  cfg: { publicationEnabled: boolean; autoPublicationEnabled: boolean },
): { outcome: 'DISABLED' | 'ABORTED' | 'COMPLETED'; published: number; retracted: number; reason?: string } {
  if (!cfg.publicationEnabled || !cfg.autoPublicationEnabled) return { outcome: 'DISABLED', published: 0, retracted: 0 };
  const runId = Number(db.prepare("INSERT INTO publication_runs (mode, started_at) VALUES ('AUTO', ?)").run(now.toISOString()).lastInsertRowid);
  const kinds: PageKind[] = ['BROKER_PROFILE', 'BROKER_FEES', 'BROKER_ACCOUNTS', 'COMPARISON'];
  const existing = (db.prepare(`SELECT count(*) AS n FROM content_pages WHERE state = 'PUBLISHED' AND synthetic = 0`).get() as { n: number }).n;
  const failing = pagesFailingReadChecks(db, now, kinds);
  if (failing.length > MASS_RETRACTION.maxPages || (existing > 0 && failing.length / existing > MASS_RETRACTION.maxFraction)) {
    const reason = `mass retraction guard: ${failing.length} of ${existing} published pages would be retracted`;
    db.prepare("UPDATE publication_runs SET finished_at = ?, outcome = 'ABORTED', aborted_reason = ?, pages_considered = ? WHERE id = ?").run(now.toISOString(), reason, existing, runId);
    audit(db, { actor: 'system:auto-publish', action: 'publish.mass_retraction_guard', subject: `run:${runId}`, at: now, detail: { failing: failing.length, existing } });
    raiseAlert(db, { fingerprint: 'publish:mass-retraction', severity: 'CRITICAL', code: 'MASS_RETRACTION_GUARD', message: reason, at: now });
    return { outcome: 'ABORTED', published: 0, retracted: 0, reason };
  }
  for (const p of failing) retractPage(db, p.id, 'automatic: read checks no longer pass', 'system:auto-publish', now);
  const brokers = db.prepare("SELECT id FROM brokers WHERE status = 'SELECTED' AND official_domain_confirmed_at IS NOT NULL ORDER BY slug").all() as { id: number }[];
  let published = 0;
  for (const b of brokers) for (const p of publishBroker(db, b.id, now, 'system:auto-publish').pages) if (p.result === 'PUBLISHED') published++;
  db.prepare("UPDATE publication_runs SET finished_at = ?, outcome = ?, pages_considered = ?, pages_published = ?, pages_retracted = ? WHERE id = ?").run(
    now.toISOString(),
    published ? 'PUBLISHED' : 'NOOP',
    existing,
    published,
    failing.length,
    runId,
  );
  return { outcome: 'COMPLETED', published, retracted: failing.length };
}

/** Retract: idempotent and auditable. The revision stays in history as WITHDRAWN. */
export function retractPage(db: DB, pageId: number, reason: string, actor: string, now: Date): 'RETRACTED' | 'NOOP' {
  return db.transaction(() => {
    const page = db.prepare('SELECT * FROM content_pages WHERE id = ?').get(pageId) as PageRow | undefined;
    if (!page) throw new Error('unknown page');
    if (page.state !== 'PUBLISHED') return 'NOOP' as const;
    db.prepare("UPDATE content_pages SET state = 'RETRACTED', updated_at = ? WHERE id = ?").run(now.toISOString(), pageId);
    db.prepare("UPDATE content_revisions SET status = 'WITHDRAWN', withdrawn_at = ? WHERE id = ?").run(now.toISOString(), page.current_revision_id);
    db.prepare("INSERT INTO publication_runs (mode, started_at, finished_at, outcome, pages_retracted, detail_json) VALUES ('RETRACT', ?, ?, 'RETRACTED', 1, ?)").run(
      now.toISOString(),
      now.toISOString(),
      JSON.stringify({ path: page.path }),
    );
    audit(db, { actor, action: 'page.retract', subject: `page:${page.path}`, at: now, detail: { reason: reason.slice(0, 200) } });
    return 'RETRACTED' as const;
  })();
}

/**
 * Roll back to an earlier non-withdrawn revision: a new revision copies its
 * content and must pass QA against current evidence before publication.
 */
export function rollbackPage(db: DB, pageId: number, targetRevisionId: number, actor: string, now: Date): PublishOutcome {
  const page = db.prepare('SELECT * FROM content_pages WHERE id = ?').get(pageId) as PageRow | undefined;
  const target = getRevision(db, targetRevisionId);
  if (!page || !target || target.page_id !== pageId) return { outcome: 'ABORTED', reasons: ['REVISION_NOT_ON_PAGE'] };
  if (target.status === 'WITHDRAWN' || target.status !== 'SUPERSEDED') return { outcome: 'ABORTED', reasons: ['TARGET_NOT_ELIGIBLE'] };
  const cur = page.current_revision_id ? getRevision(db, page.current_revision_id) : null;
  if (cur?.rollback_of === targetRevisionId && page.state === 'PUBLISHED') return { outcome: 'NOOP', reasons: [] };
  const content = JSON.parse(target.content_json) as CitingContent;
  const id = db.transaction(() => {
    const no = (db.prepare('SELECT max(revision_no) + 1 AS n FROM content_revisions WHERE page_id = ?').get(pageId) as { n: number }).n;
    const newId = Number(
      db
        .prepare(
          `INSERT INTO content_revisions (page_id, revision_no, status, content_json, content_hash, fact_hash, policy_hash, substantive_hash,
            prompt_version, model, adapter_version, parent_revision_id, rollback_of, created_at)
           VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(pageId, no, target.content_json, target.content_hash, factHash(content.facts), policyHash(db, content.facts), target.substantive_hash, target.prompt_version, target.model, target.adapter_version, page.current_revision_id, targetRevisionId, now.toISOString())
        .lastInsertRowid,
    );
    const ins = db.prepare('INSERT INTO page_facts (revision_id, verified_fact_id, claim_key) VALUES (?, ?, ?)');
    for (const f of content.facts) ins.run(newId, f.factId, `${f.field}:${f.scopeKey}`);
    return newId;
  })();
  const qa = qaRevision(db, id, now);
  if (!qa.passed) return { outcome: 'ABORTED', reasons: qa.problems };
  const res = publishRevision(db, id, now, actor);
  if (res.outcome === 'PUBLISHED' && cur) {
    db.prepare("UPDATE content_revisions SET status = 'WITHDRAWN', withdrawn_at = ? WHERE id = ?").run(now.toISOString(), cur.id);
    db.prepare("INSERT INTO publication_runs (mode, started_at, finished_at, outcome, detail_json) VALUES ('ROLLBACK', ?, ?, 'ROLLED_BACK', ?)").run(
      now.toISOString(),
      now.toISOString(),
      JSON.stringify({ path: page.path, from: cur.id, to: targetRevisionId }),
    );
    audit(db, { actor, action: 'page.rollback', subject: `page:${page.path}`, at: now, detail: { from: cur.id, to: targetRevisionId, newRevision: id } });
  }
  return res;
}
