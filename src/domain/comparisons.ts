import { z } from 'zod';
import type { DB } from '@/db/client';
import { runStructured } from '@/ai/receipts';
import { untrustedBlock, type AiProvider } from '@/ai/provider';
import { hashJson } from '@/lib/hash';
import { addMs } from '@/lib/time';
import { approvedLogo } from './assets';
import { audit } from './audit';
import { coverage, shownFacts, sourcesOf, type BrokerSnapshot, type ShownFact } from './broker-view';
import { checkFacts, type SnapshotFact } from './fact-checks';
import { FIELDS, TOPIC_LABELS, type FieldKey, type Topic } from './fields';
import { complete, enqueue, fail, leaseNext } from './jobs';
import {
  createDraft,
  getRevision,
  publishRevision,
  qaRevision,
  type CitingContent,
  type PageRow,
} from './publication';
import { memo, readProfile, type ReadOptions } from './read';

export const COMPARE_PROMPT_VERSION = 'compare-plan-v2';
export const COMPARE_LEASE_MS = 45 * 60_000;
export const COMPARE_TIMEOUT_MS = 120_000;
export const MIN_FACTS = 4;
export const MIN_CORE = 2;
export const MIN_SHARED = 2;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parse "/compare/a-vs-b[-vs-c]" into slugs; returns canonical (sorted) form. */
export function parseComparisonSlug(
  slug: string,
): { slugs: string[]; canonical: string; isCanonical: boolean } | null {
  const parts = slug.split('-vs-');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !SLUG.test(p))) return null;
  if (new Set(parts).size !== parts.length) return null;
  const sorted = [...parts].sort();
  return { slugs: parts, canonical: sorted.join('-vs-'), isCanonical: sorted.join('-vs-') === slug };
}

export interface Participant {
  id: number;
  slug: string;
  name: string;
  officialDomain: string;
  facts: ShownFact[];
  logo: { src: string; width: number; height: number; attribution: string | null };
}

/** Eligibility of one broker for comparison (PRD §6 rule 1). */
export function participantFor(db: DB, slug: string, opts: ReadOptions): Participant | null {
  return memo(opts, `participant:${slug}`, () => participantUncached(db, slug, opts));
}
function participantUncached(db: DB, slug: string, opts: ReadOptions): Participant | null {
  const prof = readProfile(db, slug, opts);
  if (!prof) return null;
  const facts = prof.view.facts;
  if (facts.length < MIN_FACTS) return null;
  if (prof.view.coverage.filter((c) => c.covered).length < MIN_CORE) return null;
  const logo = approvedLogo(db, prof.view.broker.id);
  if (!logo) return null;
  return { ...prof.view.broker, facts, logo };
}

export const sharedFields = (ps: { facts: { field: FieldKey }[] }[]): FieldKey[] =>
  (Object.keys(FIELDS) as FieldKey[]).filter((k) => ps.every((p) => p.facts.some((f) => f.field === k)));

function combos<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (xs.length < k) return [];
  const [h, ...t] = xs;
  return [...combos(t, k - 1).map((c) => [h!, ...c]), ...combos(t, k)];
}

export interface Selection {
  slugs: string[];
  pool: 'UNSEEN' | 'EXISTING';
  size: 2 | 3;
}

/**
 * Selection rule for the scheduled worker (PRD §6 rules 2–4): candidates share
 * ≥2 field keys; choose unseen 75% / existing 25% when both pools exist; pairs
 * and triples equally when triples qualify. `rng` is injectable for tests.
 */
export function selectCombination(
  eligible: Participant[],
  existing: Set<string>,
  rng: () => number,
): Selection | null {
  const sorted = [...eligible].sort((a, b) => a.slug.localeCompare(b.slug));
  const build = (k: 2 | 3) =>
    combos(sorted, k)
      .filter((c) => sharedFields(c).length >= MIN_SHARED)
      .map((c) => c.map((p) => p.slug));
  const pairs = build(2);
  const triples = sorted.length >= 3 ? build(3) : [];
  if (!pairs.length && !triples.length) return null;
  const size: 2 | 3 = triples.length && pairs.length ? (rng() < 0.5 ? 2 : 3) : triples.length ? 3 : 2;
  const all = size === 2 ? pairs : triples;
  const unseen = all.filter((c) => !existing.has(c.join('-vs-')));
  const seen = all.filter((c) => existing.has(c.join('-vs-')));
  const pool: Selection['pool'] =
    unseen.length && seen.length
      ? rng() < 0.75
        ? 'UNSEEN'
        : 'EXISTING'
      : unseen.length
        ? 'UNSEEN'
        : 'EXISTING';
  const from = pool === 'UNSEEN' ? unseen : seen;
  const pick = from[Math.min(from.length - 1, Math.floor(rng() * from.length))]!;
  return { slugs: pick, pool, size };
}

// ── Constrained plan ───────────────────────────────────────────────────
const TOPICS = ['accounts', 'costs', 'leverage', 'platforms', 'entity'] as const;
export const planSchema = z
  .object({
    topicOrder: z.array(z.enum(TOPICS)).min(1).max(5),
    highlights: z.array(z.number().int().positive()).max(6),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export const planJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topicOrder', 'highlights'],
  properties: {
    topicOrder: { type: 'array', items: { type: 'string', enum: [...TOPICS] }, minItems: 1, maxItems: 5 },
    highlights: { type: 'array', items: { type: 'integer' }, maxItems: 6 },
  },
};

/** The plan may only reorder available topics and point at accepted fact IDs of this article. */
export function validatePlan(
  plan: Plan,
  facts: SnapshotFact[],
): { ok: true; plan: Plan } | { ok: false; reason: string } {
  const available = new Set(facts.map((f) => FIELDS[f.field].topic));
  if (new Set(plan.topicOrder).size !== plan.topicOrder.length)
    return { ok: false, reason: 'DUPLICATE_TOPIC' };
  if (plan.topicOrder.some((t) => !available.has(t))) return { ok: false, reason: 'UNAVAILABLE_TOPIC' };
  if ([...available].some((t) => !plan.topicOrder.includes(t))) return { ok: false, reason: 'MISSING_TOPIC' };
  const ids = new Set(facts.map((f) => f.factId));
  if (plan.highlights.some((h) => !ids.has(h))) return { ok: false, reason: 'UNKNOWN_FACT_ID' };
  if (new Set(plan.highlights).size !== plan.highlights.length)
    return { ok: false, reason: 'DUPLICATE_HIGHLIGHT' };
  return { ok: true, plan };
}

export function planPrompt(ps: Participant[], shared: FieldKey[]): string {
  const data = ps.map((p) => ({
    broker: p.name,
    facts: p.facts.map((f) => ({ id: f.factId, field: f.field, value: f.display, scope: f.scopeNotes })),
  }));
  return [
    'Plan the section order of a factual comparison of forex brokers. You do not write prose.',
    `Return topicOrder: every topic present among the facts, ordered by how informative the shared evidence is. Shared fields: ${shared.join(', ')}.`,
    'Return highlights: up to 6 fact ids (only ids listed in the data) that show recorded differences on shared fields. Never pick a winner; never imply quality, safety or suitability.',
    untrustedBlock('accepted-facts', JSON.stringify(data)),
  ].join('\n\n');
}

export interface ComparisonSnapshot extends CitingContent {
  kind: 'COMPARISON';
  schema: 1;
  brokers: { id: number; slug: string; name: string; officialDomain: string; logo: Participant['logo'] }[];
  facts: SnapshotFact[];
  plan: Plan;
  shared: FieldKey[];
}

const toSnapshotFact = (f: ShownFact): SnapshotFact => ({
  factId: f.factId,
  field: f.field,
  valueText: f.valueText,
  normalizedValue: f.normalizedValue,
  unit: f.unit,
  currency: f.currency,
  scope: f.scope,
  scopeKey: f.scopeKey,
  observationId: f.observationId,
  sourceId: f.sourceId,
  sourceUrl: f.sourceUrl,
  sourceHost: f.sourceHost,
  locator: f.locator,
  observedAt: f.observedAt,
  effectiveAt: f.effectiveAt,
  acceptedAt: f.acceptedAt,
  expiresAt: f.expiresAt,
});

/** Inputs hash: accepted IDs, values, scopes and effective dates (not verification dates). */
export const comparisonInputHash = (ps: Participant[]) =>
  hashJson(
    ps.map((p) => [
      p.slug,
      p.facts.map((f) => [f.field, f.scopeKey, f.normalizedValue, f.unit, f.currency, f.effectiveAt]).sort(),
    ]),
  );

export async function buildComparison(
  db: DB,
  provider: AiProvider,
  slugs: string[],
  opts: ReadOptions,
): Promise<
  | { ok: true; snapshot: ComparisonSnapshot; receiptId: number; reused: boolean }
  | { ok: false; reason: string }
> {
  const ps = slugs.map((s) => participantFor(db, s, opts));
  if (ps.some((p) => !p)) return { ok: false, reason: 'PARTICIPANT_NOT_ELIGIBLE' };
  const parts = ps as Participant[];
  const shared = sharedFields(parts);
  if (shared.length < MIN_SHARED) return { ok: false, reason: 'TOO_FEW_SHARED_FIELDS' };
  const facts = parts.flatMap((p) => p.facts.map(toSnapshotFact));
  const res = await runStructured(
    db,
    provider,
    {
      purpose: 'compare:plan',
      promptVersion: COMPARE_PROMPT_VERSION,
      inputHash: comparisonInputHash(parts),
      policyHash: hashJson([...new Set(facts.map((f) => f.sourceId))].sort()),
      prompt: planPrompt(parts, shared),
      jsonSchema: planJsonSchema,
      schema: planSchema,
      timeoutMs: COMPARE_TIMEOUT_MS,
    },
    opts.now ? () => opts.now : () => new Date(),
  );
  if (!res.ok) return { ok: false, reason: `PROVIDER_${res.errorClass}` };
  // Highlights may cite an earlier renewal's ID when the plan was reused; map by field/scope/value.
  const plan = remapHighlights(res.output, facts, db);
  const v = validatePlan(plan, facts);
  if (!v.ok) return { ok: false, reason: `PLAN_${v.reason}` };
  const snapshot: ComparisonSnapshot = {
    kind: 'COMPARISON',
    schema: 1,
    brokers: parts.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      officialDomain: p.officialDomain,
      logo: p.logo,
    })),
    facts,
    plan: v.plan,
    shared,
  };
  return { ok: true, snapshot, receiptId: res.receiptId, reused: res.reused };
}

function remapHighlights(plan: Plan, facts: SnapshotFact[], db: DB): Plan {
  const ids = new Set(facts.map((f) => f.factId));
  const stmt = db.prepare(
    'SELECT field_key, scope_key, normalized_value, broker_id FROM verified_facts WHERE id = ?',
  );
  const highlights = plan.highlights.map((h) => {
    if (ids.has(h)) return h;
    const old = stmt.get(h) as { field_key: string; scope_key: string; normalized_value: string } | undefined;
    const match =
      old &&
      facts.find(
        (f) =>
          f.field === old.field_key &&
          f.scopeKey === old.scope_key &&
          f.normalizedValue === old.normalized_value,
      );
    return match ? match.factId : h;
  });
  return { ...plan, highlights };
}

export interface ComparisonView {
  slug: string;
  brokers: ComparisonSnapshot['brokers'];
  shared: { field: FieldKey; label: string; cells: ShownFact[][] }[];
  topics: { topic: Topic; label: string; perBroker: { name: string; slug: string; facts: ShownFact[] }[] }[];
  highlights: { broker: string; slug: string; fact: ShownFact }[];
  summary: string[];
  sources: ReturnType<typeof sourcesOf>;
}

/** Read-time eligibility and deterministic rendering of a published comparison. */
export function readComparison(
  db: DB,
  slug: string,
  opts: ReadOptions,
): {
  page: PageRow;
  view: ComparisonView;
  dates: { firstPublished: string | null; materialUpdated: string | null };
} | null {
  if (!opts.publicationEnabled && !opts.includeSynthetic) return null;
  const page = db
    .prepare("SELECT * FROM content_pages WHERE path = ? AND kind = 'COMPARISON' AND state = 'PUBLISHED'")
    .get(`/compare/${slug}`) as PageRow | undefined;
  if (!page || (page.synthetic && !opts.includeSynthetic)) return null;
  const rev = getRevision(db, page.current_revision_id!);
  if (!rev || rev.status !== 'PUBLISHED') return null;
  const snap = JSON.parse(rev.content_json) as ComparisonSnapshot;
  const checks = checkFacts(db, snap.facts, opts.now);
  const owner = db.prepare('SELECT broker_id FROM verified_facts WHERE id = ?');
  const brokerOf = new Map(
    snap.facts.map((f) => [f.factId, (owner.get(f.factId) as { broker_id: number } | undefined)?.broker_id]),
  );
  const perBroker: { b: ComparisonSnapshot['brokers'][number]; facts: ShownFact[] }[] = [];
  for (const b of snap.brokers) {
    // Each participant must still be eligible now (published profile, approved logo, floors).
    if (!participantFor(db, b.slug, opts)) return null;
    const bs: BrokerSnapshot = {
      kind: 'BROKER_PROFILE',
      schema: 1,
      broker: { id: b.id, slug: b.slug, name: b.name, officialDomain: b.officialDomain },
      facts: snap.facts.filter((f) => brokerOf.get(f.factId) === b.id),
      licences: [],
    };
    const facts = shownFacts(bs, checks);
    if (facts.length < MIN_FACTS || coverage(facts).filter((c) => c.covered).length < MIN_CORE) return null;
    perBroker.push({ b, facts });
  }
  const shared = sharedFields(perBroker.map((x) => ({ facts: x.facts })));
  if (shared.length < MIN_SHARED) return null;
  const names = perBroker.map((x) => x.b.name);
  const view: ComparisonView = {
    slug,
    brokers: snap.brokers,
    shared: shared.map((field) => ({
      field,
      label: FIELDS[field].label,
      cells: perBroker.map((x) => x.facts.filter((f) => f.field === field)),
    })),
    topics: snap.plan.topicOrder
      .map((t) => ({
        topic: t,
        label: TOPIC_LABELS[t],
        perBroker: perBroker.map((x) => ({
          name: x.b.name,
          slug: x.b.slug,
          facts: x.facts.filter((f) => FIELDS[f.field].topic === t),
        })),
      }))
      .filter((t) => t.perBroker.some((p) => p.facts.length)),
    highlights: snap.plan.highlights.flatMap((id) => {
      for (const x of perBroker) {
        const f = x.facts.find((ff) => ff.factId === id);
        if (f) return [{ broker: x.b.name, slug: x.b.slug, fact: f }];
      }
      return [];
    }),
    summary: [
      `This comparison sets out facts ForexInspect has verified from the official websites of ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`,
      `They share verified evidence on ${shared.length} field${shared.length === 1 ? '' : 's'}: ${shared.map((f) => FIELDS[f].label.toLowerCase()).join(', ')}.`,
      'Values are shown with their own account, entity and platform scope. Equal-looking values may apply to different accounts or companies, so the page names no winner and adds no costs together.',
    ],
    sources: sourcesOf(perBroker.flatMap((x) => x.facts)),
  };
  return {
    page,
    view,
    dates: { firstPublished: page.first_published_at, materialUpdated: page.material_updated_at },
  };
}

export function listComparisons(
  db: DB,
  opts: ReadOptions,
): { slug: string; names: string[]; materialUpdated: string | null }[] {
  if (!opts.publicationEnabled && !opts.includeSynthetic) return [];
  const rows = db
    .prepare(
      `SELECT comparison_key FROM content_pages WHERE kind = 'COMPARISON' AND state = 'PUBLISHED' ${opts.includeSynthetic ? '' : 'AND synthetic = 0'} ORDER BY comparison_key`,
    )
    .all() as { comparison_key: string }[];
  return rows.flatMap((r) => {
    const c = readComparison(db, r.comparison_key, opts);
    return c
      ? [
          {
            slug: r.comparison_key,
            names: c.view.brokers.map((b) => b.name),
            materialUpdated: c.dates.materialUpdated,
          },
        ]
      : [];
  });
}

// ── Scheduled worker ──────────────────────────────────────────────────
/** Four-hour UTC slots at hh:25 for hh ∈ {0,4,8,12,16,20}. */
export function slotFor(now: Date): { key: string; due: Date } {
  const d = new Date(now);
  const h = Math.floor(d.getUTCHours() / 4) * 4;
  const due = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, 25));
  const effective = due > now ? addMs(due, -4 * 3_600_000) : due;
  return { key: `compare:${effective.toISOString().slice(0, 13)}`, due: effective };
}

export interface CycleResult {
  outcome: 'NO_DUE_JOB' | 'NOOP_NO_COMBINATION' | 'PUBLISHED' | 'UNCHANGED' | 'FAILED' | 'DISABLED';
  slot: string;
  detail?: string;
}

/** Reserve the slot job and process at most one due job per invocation. */
export async function runCompareCycle(
  db: DB,
  provider: AiProvider,
  opts: ReadOptions & { rng?: () => number; enabled: boolean },
): Promise<CycleResult> {
  const slot = slotFor(opts.now);
  if (!opts.enabled) return { outcome: 'DISABLED', slot: slot.key };
  enqueue(db, { kind: 'compare', key: slot.key, dueAt: slot.due, maxAttempts: 3 }, opts.now);
  const lease = leaseNext(db, 'compare', opts.now, COMPARE_LEASE_MS);
  if (!lease) return { outcome: 'NO_DUE_JOB', slot: slot.key };
  const brokers = db
    .prepare(
      "SELECT b.slug FROM brokers b JOIN content_pages p ON p.broker_id = b.id AND p.kind = 'BROKER_PROFILE' AND p.state = 'PUBLISHED' AND p.synthetic = 0",
    )
    .all() as { slug: string }[];
  const eligible = brokers.map((b) => participantFor(db, b.slug, opts)).filter(Boolean) as Participant[];
  const existing = new Set(
    (
      db
        .prepare("SELECT comparison_key FROM content_pages WHERE kind = 'COMPARISON' AND state = 'PUBLISHED'")
        .all() as { comparison_key: string }[]
    ).map((r) => r.comparison_key),
  );
  const sel = selectCombination(eligible, existing, opts.rng ?? Math.random);
  if (!sel) {
    complete(db, lease, { outcome: 'NOOP_NO_COMBINATION', eligible: eligible.length }, opts.now);
    audit(db, {
      actor: 'system:compare',
      action: 'compare.noop',
      subject: lease.job.idempotency_key,
      at: opts.now,
      detail: { eligible: eligible.length },
    });
    return { outcome: 'NOOP_NO_COMBINATION', slot: slot.key };
  }
  const built = await buildComparison(db, provider, sel.slugs, opts);
  if (!built.ok) {
    const retryable = built.reason.startsWith('PROVIDER_');
    fail(db, lease, built.reason, opts.now, { retryable });
    return { outcome: 'FAILED', slot: slot.key, detail: built.reason };
  }
  const slug = sel.slugs.join('-vs-');
  const { revisionId, noop } = createDraft(
    db,
    {
      kind: 'COMPARISON',
      path: `/compare/${slug}`,
      brokerId: null,
      comparisonKey: slug,
      content: built.snapshot,
      promptVersion: COMPARE_PROMPT_VERSION,
      model: provider.model,
      adapterVersion: provider.adapterVersion,
      receiptId: built.receiptId,
    },
    opts.now,
  );
  if (noop && getRevision(db, revisionId)?.status === 'PUBLISHED') {
    complete(db, lease, { outcome: 'UNCHANGED', slug, reusedPlan: built.reused }, opts.now);
    return { outcome: 'UNCHANGED', slot: slot.key, detail: slug };
  }
  const qa = qaRevision(db, revisionId, opts.now);
  const pub = qa.passed
    ? publishRevision(db, revisionId, opts.now, 'system:compare')
    : { outcome: 'ABORTED' as const, reasons: qa.problems };
  if (pub.outcome === 'ABORTED') {
    fail(db, lease, `QA_${pub.reasons[0] ?? 'FAILED'}`, opts.now, { retryable: false });
    return { outcome: 'FAILED', slot: slot.key, detail: pub.reasons.join(',') };
  }
  complete(db, lease, { outcome: 'PUBLISHED', slug, pool: sel.pool, reusedPlan: built.reused }, opts.now);
  return { outcome: 'PUBLISHED', slot: slot.key, detail: slug };
}
