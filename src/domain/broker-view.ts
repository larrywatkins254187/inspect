import { CORE_TOPICS, FIELDS, TOPIC_LABELS, displayValue, type CoreTopic, type FieldKey, type Topic } from './fields';
import type { FactCheck, SnapshotFact } from './fact-checks';
import { describeScope, normalizeAccountLabel, normalizeLabel, sameKnownEntityJurisdiction } from './scope';

export interface LicenceRecord {
  regulatorCode: string;
  regulatorName: string;
  registerUrl: string;
  licenceNumber: string;
  status: string;
  statusAsOf: string;
  legalName: string;
  entityFactId: number;
}

export interface BrokerSnapshot {
  kind: 'BROKER_PROFILE' | 'BROKER_FEES' | 'BROKER_ACCOUNTS';
  schema: 1;
  broker: { id: number; slug: string; name: string; officialDomain: string };
  facts: SnapshotFact[];
  licences: LicenceRecord[];
}

export interface ShownFact extends SnapshotFact {
  display: string;
  scopeNotes: string[];
  verifiedAt: string;
  lastObservedAt: string;
  validUntil: string;
  anchor: string;
}

export interface Sentence {
  text: string;
  factIds: number[];
}

export const PROFILE_FACT_FLOOR = 3;
export const INDEX_CORE_FLOOR = 2;
export const FEES_FACT_FLOOR = 2;
export const ACCOUNTS_FLOOR = 2;

const CONDITION_FIELDS: FieldKey[] = ['minimum_deposit', 'maximum_leverage', 'eurusd_spread', 'trading_commission', 'minimum_lot_size'];
const PLATFORM_FIELDS: FieldKey[] = ['mt4_supported', 'mt5_supported', 'ctrader_supported', 'tradingview_supported'];

export const factAnchor = (observationId: number) => `fact-${observationId}`;

/** Facts that pass read-time checks, enriched for display. Order is deterministic. */
export function shownFacts(snapshot: BrokerSnapshot, checks: Map<number, FactCheck>): ShownFact[] {
  return snapshot.facts
    .filter((f) => checks.get(f.factId)?.valid)
    .map((f) => {
      const head = checks.get(f.factId)!.head!;
      return {
        ...f,
        display: displayValue({ field_key: f.field, value_text: f.valueText, unit: f.unit, currency: f.currency }),
        scopeNotes: describeScope(f.scope).filter((n) => !(f.field === 'account_type' && n.startsWith('Account:'))),
        verifiedAt: head.acceptedAt,
        lastObservedAt: head.observedAt,
        validUntil: head.expiresAt,
        anchor: factAnchor(f.observationId),
      };
    })
    .sort((a, b) => a.field.localeCompare(b.field) || a.scopeKey.localeCompare(b.scopeKey) || a.factId - b.factId);
}

export interface Coverage {
  topic: CoreTopic;
  label: string;
  covered: boolean;
  factIds: number[];
}

export function coverage(facts: ShownFact[], licences: LicenceRecord[] = []): Coverage[] {
  return CORE_TOPICS.map((t) => {
    const hits = facts.filter((f) => FIELDS[f.field].core === t.key && !(FIELDS[f.field].kind === 'boolean' && f.valueText === 'false'));
    let ids = hits.map((f) => f.factId);
    if (t.key === 'legal_entity' && !ids.length) ids = licences.map((l) => l.entityFactId).filter((id) => facts.some((f) => f.factId === id));
    return { topic: t.key, label: t.label, covered: ids.length > 0, factIds: ids };
  });
}

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function summarySentences(name: string, facts: ShownFact[], cov: Coverage[]): Sentence[] {
  const covered = cov.filter((c) => c.covered);
  const missing = cov.filter((c) => !c.covered);
  const out: Sentence[] = [];
  out.push({
    text: covered.length
      ? `ForexInspect has accepted official-source evidence for ${covered.length} of ${cov.length} core research topics for ${name}: ${listJoin(covered.map((c) => c.label.toLowerCase()))}.`
      : `ForexInspect has not yet accepted official-source evidence for any core research topic for ${name}.`,
    factIds: covered.flatMap((c) => c.factIds),
  });
  if (missing.length) out.push({ text: `Not verified: ${listJoin(missing.map((c) => c.label.toLowerCase()))}.`, factIds: [] });
  const ops = facts.filter((f) => f.field === 'operating_entity');
  const named = facts.filter((f) => f.field === 'legal_entity_name');
  if (ops.length) {
    out.push({
      text: `The official website states that it is operated by ${listJoin(ops.map((o) => o.valueText))}. This operator statement is not a regulatory licence.`,
      factIds: ops.map((o) => o.factId),
    });
  } else if (named.length) {
    out.push({
      text: `The official website names ${listJoin(named.map((o) => o.valueText))}; ForexInspect has not verified which company operates the website.`,
      factIds: named.map((o) => o.factId),
    });
  } else {
    out.push({ text: 'The company operating the website has not been verified.', factIds: [] });
  }
  return out;
}

export interface GlanceCell {
  facts: { display: string; factId: number; anchor: string; notes: string[] }[];
}
export interface GlanceRow {
  account: string;
  entity: string | null;
  jurisdiction: string | null;
  cells: Record<'minimum_deposit' | 'maximum_leverage' | 'eurusd_spread' | 'trading_commission' | 'platforms', GlanceCell>;
}

/** Account rows merge only within compatible recorded account/entity/jurisdiction scope. */
export function accountGlance(facts: ShownFact[]): GlanceRow[] {
  const rows = new Map<string, GlanceRow>();
  const keyOf = (f: ShownFact) => `${normalizeAccountLabel(f.scope.account)}|${normalizeLabel(f.scope.entity) ?? ''}|${normalizeLabel(f.scope.jurisdiction) ?? ''}`;
  const empty = (): GlanceRow['cells'] => ({
    minimum_deposit: { facts: [] },
    maximum_leverage: { facts: [] },
    eurusd_spread: { facts: [] },
    trading_commission: { facts: [] },
    platforms: { facts: [] },
  });
  for (const f of facts) {
    if (!f.scope.account) continue;
    const k = keyOf(f);
    if (!rows.has(k)) rows.set(k, { account: f.scope.account, entity: f.scope.entity, jurisdiction: f.scope.jurisdiction, cells: empty() });
    const row = rows.get(k)!;
    const notes = f.scopeNotes.filter((n) => !n.startsWith('Account:') && !n.startsWith('Entity:') && !n.startsWith('Jurisdiction:'));
    const entry = { display: f.display, factId: f.factId, anchor: f.anchor, notes };
    if (f.field in row.cells) row.cells[f.field as keyof GlanceRow['cells']].facts.push(entry);
    else if (PLATFORM_FIELDS.includes(f.field) && f.valueText === 'true') row.cells.platforms.facts.push({ ...entry, display: FIELDS[f.field].label });
  }
  return [...rows.values()]
    .filter((r) => Object.values(r.cells).some((c) => c.facts.length))
    .sort((a, b) => a.account.localeCompare(b.account) || (a.entity ?? '').localeCompare(b.entity ?? ''));
}

export interface TopicGroup {
  topic: Topic;
  label: string;
  fields: { field: FieldKey; label: string; facts: ShownFact[] }[];
}

export function topicGroups(facts: ShownFact[]): TopicGroup[] {
  const order: Topic[] = ['accounts', 'costs', 'leverage', 'platforms', 'entity'];
  return order
    .map((topic) => {
      const fields = (Object.keys(FIELDS) as FieldKey[])
        .filter((k) => FIELDS[k].topic === topic)
        .map((k) => ({ field: k, label: FIELDS[k].label, facts: facts.filter((f) => f.field === k) }))
        .filter((g) => g.facts.length);
      return { topic, label: TOPIC_LABELS[topic], fields };
    })
    .filter((t) => t.fields.length);
}

export function unknownFields(facts: ShownFact[]): { field: FieldKey; label: string }[] {
  const have = new Set(facts.map((f) => f.field));
  return (Object.keys(FIELDS) as FieldKey[]).filter((k) => !have.has(k)).map((k) => ({ field: k, label: FIELDS[k].label }));
}

export interface Faq {
  question: string;
  answer: Sentence[];
}

const scoped = (f: ShownFact) => (f.scopeNotes.length ? ` (${f.scopeNotes.join('; ')})` : '');

/** Deterministic FAQs built only from shown facts; unknowns are said plainly. */
export function profileFaqs(name: string, facts: ShownFact[]): Faq[] {
  const qa = (question: string, field: FieldKey, none: string): Faq => {
    const hits = facts.filter((f) => f.field === field);
    return {
      question,
      answer: hits.length
        ? hits.map((f) => ({ text: `${f.display}${scoped(f)}, according to the official source last checked ${f.lastObservedAt.slice(0, 10)}.`, factIds: [f.factId] }))
        : [{ text: none, factIds: [] }],
    };
  };
  return [
    qa(`What is the minimum deposit at ${name}?`, 'minimum_deposit', `ForexInspect has not verified a minimum deposit for ${name}.`),
    qa(`What EUR/USD spread does ${name} state?`, 'eurusd_spread', `ForexInspect has not verified an EUR/USD spread for ${name}. Advertised spreads are not live execution prices.`),
    qa(`What commission does ${name} charge?`, 'trading_commission', `ForexInspect has not verified a trading commission for ${name}.`),
    qa(`What is the maximum leverage at ${name}?`, 'maximum_leverage', `ForexInspect has not verified a maximum leverage for ${name}. Available leverage usually depends on entity, jurisdiction and client classification.`),
    {
      question: `Is ${name} regulated?`,
      answer: [
        {
          text: `This page lists companies named on ${name}'s official website and any licence matched in an official register snapshot. A company name alone is not a licence, and ForexInspect does not state that any entity can serve you.`,
          factIds: [],
        },
      ],
    },
  ];
}

export interface ProfileView {
  broker: BrokerSnapshot['broker'];
  facts: ShownFact[];
  coverage: Coverage[];
  summary: Sentence[];
  glance: GlanceRow[];
  topics: TopicGroup[];
  unknowns: { field: FieldKey; label: string }[];
  namedCompanies: ShownFact[];
  operators: ShownFact[];
  licences: LicenceRecord[];
  faqs: Faq[];
  sources: { url: string; host: string; lastObservedAt: string; factCount: number }[];
  indexable: boolean;
  publishable: boolean;
}

export function sourcesOf(facts: ShownFact[]): ProfileView['sources'] {
  const m = new Map<string, ProfileView['sources'][number]>();
  for (const f of facts) {
    const s = m.get(f.sourceUrl) ?? { url: f.sourceUrl, host: f.sourceHost, lastObservedAt: f.lastObservedAt, factCount: 0 };
    s.factCount++;
    if (f.lastObservedAt > s.lastObservedAt) s.lastObservedAt = f.lastObservedAt;
    m.set(f.sourceUrl, s);
  }
  return [...m.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export function buildProfileView(snapshot: BrokerSnapshot, checks: Map<number, FactCheck>): ProfileView {
  const facts = shownFacts(snapshot, checks);
  const officialFacts = facts.filter((f) => f.sourceHost === snapshot.broker.officialDomain || f.sourceHost.endsWith(`.${snapshot.broker.officialDomain}`));
  const validEntityIds = new Set(facts.filter((f) => f.field === 'legal_entity_name' || f.field === 'operating_entity').map((f) => f.factId));
  const licences = snapshot.licences.filter((l) => validEntityIds.has(l.entityFactId));
  const cov = coverage(facts, licences);
  const coveredCore = cov.filter((c) => c.covered).length;
  return {
    broker: snapshot.broker,
    facts,
    coverage: cov,
    summary: summarySentences(snapshot.broker.name, facts, cov),
    glance: accountGlance(facts),
    topics: topicGroups(facts),
    unknowns: unknownFields(facts),
    namedCompanies: facts.filter((f) => f.field === 'legal_entity_name'),
    operators: facts.filter((f) => f.field === 'operating_entity'),
    licences,
    faqs: profileFaqs(snapshot.broker.name, facts),
    sources: sourcesOf(facts),
    indexable: coveredCore >= INDEX_CORE_FLOOR,
    publishable: officialFacts.length >= PROFILE_FACT_FLOOR,
  };
}

// ── Fees ────────────────────────────────────────────────────────────────
export interface FeesView {
  broker: BrokerSnapshot['broker'];
  spreads: ShownFact[];
  commissions: (ShownFact & { usableForCost: boolean; exclusion: string | null })[];
  unknownFees: string[];
  sources: ProfileView['sources'];
  publishable: boolean;
}

export const UNKNOWN_FEE_TOPICS = ['Deposit fees', 'Withdrawal fees', 'Inactivity fees', 'Currency conversion fees', 'Swap / overnight financing', 'Other account fees'];

export function buildFeesView(snapshot: BrokerSnapshot, checks: Map<number, FactCheck>): FeesView {
  const facts = shownFacts(snapshot, checks);
  const spreads = facts.filter((f) => f.field === 'eurusd_spread' && (f.unit === 'pips' || f.unit === 'points') && f.scope.instrument === 'EUR/USD');
  const commissions = facts
    .filter((f) => f.field === 'trading_commission')
    .map((f) => {
      const missing: string[] = [];
      if (!f.currency) missing.push('currency');
      if (!f.scope.commissionSide) missing.push('per-side or round-turn basis');
      if (!f.scope.commissionVolume) missing.push('volume basis');
      return { ...f, usableForCost: missing.length === 0, exclusion: missing.length ? `Not usable as a cost input: ${missing.join(', ')} not stated.` : null };
    });
  const costFacts = spreads.length + commissions.length;
  return { broker: snapshot.broker, spreads, commissions, unknownFees: UNKNOWN_FEE_TOPICS, sources: sourcesOf([...spreads, ...commissions]), publishable: costFacts >= FEES_FACT_FLOOR };
}

// ── Accounts ────────────────────────────────────────────────────────────
export interface AccountsView {
  broker: BrokerSnapshot['broker'];
  accounts: { label: string; entity: string | null; jurisdiction: string | null; typeFact: ShownFact | null; conditions: Record<string, ShownFact[]> }[];
  conditionFields: { field: FieldKey; label: string }[];
  standardVsRaw: { available: true; standard: string; raw: string; differing: { field: FieldKey; label: string; standard: ShownFact[]; raw: ShownFact[] }[] } | { available: false; reason: string };
  sources: ProfileView['sources'];
  publishable: boolean;
}

export function buildAccountsView(snapshot: BrokerSnapshot, checks: Map<number, FactCheck>): AccountsView {
  const facts = shownFacts(snapshot, checks);
  const fieldsShown = [...CONDITION_FIELDS, ...PLATFORM_FIELDS];
  const accounts = new Map<string, AccountsView['accounts'][number]>();
  const key = (f: ShownFact) => `${normalizeAccountLabel(f.scope.account)}|${normalizeLabel(f.scope.entity) ?? ''}|${normalizeLabel(f.scope.jurisdiction) ?? ''}`;
  for (const f of facts) {
    if (!f.scope.account) continue;
    if (f.field !== 'account_type' && !fieldsShown.includes(f.field)) continue;
    const k = key(f);
    const a = accounts.get(k) ?? { label: f.scope.account, entity: f.scope.entity, jurisdiction: f.scope.jurisdiction, typeFact: null, conditions: {} };
    if (f.field === 'account_type') a.typeFact = f;
    else (a.conditions[f.field] ??= []).push(f);
    accounts.set(k, a);
  }
  const list = [...accounts.values()].sort((a, b) => a.label.localeCompare(b.label));
  const conditionCount = list.reduce((n, a) => n + Object.keys(a.conditions).length, 0);
  const conditionFields = fieldsShown.filter((fk) => list.some((a) => a.conditions[fk]?.length)).map((fk) => ({ field: fk, label: FIELDS[fk].label }));
  const std = list.filter((a) => /\bstandard\b/i.test(a.label));
  const raw = list.filter((a) => /\b(raw|razor)\b/i.test(a.label));
  let standardVsRaw: AccountsView['standardVsRaw'];
  if (std.length !== 1 || raw.length !== 1) standardVsRaw = { available: false, reason: 'A Standard versus Raw comparison needs exactly one Standard and one Raw/Razor account.' };
  else {
    const [s, r] = [std[0]!, raw[0]!];
    const sScope = { ...emptyish(), entity: s.entity, jurisdiction: s.jurisdiction };
    const rScope = { ...emptyish(), entity: r.entity, jurisdiction: r.jurisdiction };
    if (!sameKnownEntityJurisdiction(sScope, rScope)) standardVsRaw = { available: false, reason: 'Both accounts must be recorded for the same known entity and jurisdiction.' };
    else {
      const differing = CONDITION_FIELDS.filter((fk) => {
        const a = s.conditions[fk];
        const b = r.conditions[fk];
        if (!a?.length || !b?.length) return false;
        const av = new Set(a.map((x) => `${x.normalizedValue}|${x.unit}|${x.currency}`));
        const bv = new Set(b.map((x) => `${x.normalizedValue}|${x.unit}|${x.currency}`));
        return [...av].some((v) => !bv.has(v)) || [...bv].some((v) => !av.has(v));
      }).map((fk) => ({ field: fk, label: FIELDS[fk].label, standard: s.conditions[fk]!, raw: r.conditions[fk]! }));
      standardVsRaw = differing.length
        ? { available: true, standard: s.label, raw: r.label, differing }
        : { available: false, reason: 'No comparable condition differs between the two recorded accounts.' };
    }
  }
  return {
    broker: snapshot.broker,
    accounts: list,
    conditionFields,
    standardVsRaw,
    sources: sourcesOf(list.flatMap((a) => [...(a.typeFact ? [a.typeFact] : []), ...Object.values(a.conditions).flat()])),
    publishable: list.length >= ACCOUNTS_FLOOR && conditionCount >= 1,
  };
}

function emptyish() {
  return { account: null, platform: null, entity: null, jurisdiction: null, instrument: null, qualifier: null, clientClass: null, spreadBasis: null, commissionSide: null, commissionVolume: null };
}
