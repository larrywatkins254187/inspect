import type { DB } from '@/db/client';
import { recordObservations } from './extract';
import { validateReading, type Reading, type ValidatedReading } from './fields';
import { applyRobotsOutcome, recordOwnerPolicy } from './policy';
import { promoteDocument } from './promote';
import { publishBroker } from './publication';
import { htmlToText, PARSER_VERSION, textHash } from './text';

/**
 * Synthetic, clearly fictional fixtures for tests and authenticated noindex
 * previews ONLY. They run through the real pipeline but live in a separate
 * database file and are flagged SYNTHETIC_FIXTURE / synthetic=1.
 */
export const FIXTURE_HTML = `<main><h1>Account types</h1>
<h2>Standard account</h2><p>Minimum deposit: USD 100. Maximum leverage up to 1:30 for retail clients.</p>
<p>EUR/USD spreads from 1.0 pips on the Standard account.</p>
<h2>Raw account</h2><p>Minimum deposit: USD 100. EUR/USD spreads from 0.0 pips on the Raw account.</p>
<p>Commission USD 3.00 per side per lot on the Raw account.</p>
<p>Platforms: MetaTrader 5 and TradingView.</p>
<p>This website is operated by Example Markets Fixture Ltd.</p></main>`;

const sc = (o: Record<string, string | null> = {}) => ({
  account: null,
  platform: null,
  entity: null,
  jurisdiction: null,
  instrument: null,
  qualifier: null,
  clientClass: null,
  spreadBasis: null,
  commissionSide: null,
  commissionVolume: null,
  ...o,
});
const R = (
  field: string,
  value: string,
  quote: string,
  extra: Partial<Reading> & { scope?: Record<string, string | null> } = {},
): Reading => ({
  field,
  value,
  unit: null,
  currency: null,
  quote,
  locator: 'Account types',
  effectiveDate: null,
  ...extra,
  scope: sc(extra.scope ?? {}) as Reading['scope'],
});

export const FIXTURE_READINGS: Reading[] = [
  R('account_type', 'Standard', 'Standard account', { scope: { account: 'Standard' } }),
  R('account_type', 'Raw', 'Raw account', { scope: { account: 'Raw' } }),
  R('minimum_deposit', '100', 'Minimum deposit: USD 100. Maximum leverage up to 1:30 for retail clients.', {
    currency: 'USD',
    scope: { account: 'Standard' },
  }),
  R('maximum_leverage', '1:30', 'Maximum leverage up to 1:30 for retail clients.', {
    scope: { account: 'Standard', clientClass: 'retail' },
  }),
  R('eurusd_spread', '1.0', 'EUR/USD spreads from 1.0 pips on the Standard account.', {
    unit: 'pips',
    scope: { account: 'Standard', instrument: 'EUR/USD', spreadBasis: 'from' },
  }),
  R('eurusd_spread', '0.0', 'EUR/USD spreads from 0.0 pips on the Raw account.', {
    unit: 'pips',
    scope: { account: 'Raw', instrument: 'EUR/USD', spreadBasis: 'from' },
  }),
  R('trading_commission', '3.00', 'Commission USD 3.00 per side per lot on the Raw account.', {
    currency: 'USD',
    scope: { account: 'Raw', commissionSide: 'PER_SIDE', commissionVolume: 'per lot' },
  }),
  R('mt5_supported', 'true', 'Platforms: MetaTrader 5 and TradingView.'),
  R('tradingview_supported', 'true', 'Platforms: MetaTrader 5 and TradingView.'),
  R(
    'legal_entity_name',
    'Example Markets Fixture Ltd',
    'This website is operated by Example Markets Fixture Ltd.',
  ),
];

export function seedPreviewFixtures(db: DB, now: Date): { brokerId: number; published: string[] } {
  const iso = now.toISOString();
  const slug = 'example-markets-fixture';
  db.prepare(
    "INSERT OR IGNORE INTO brokers (slug, name, status, official_domain, official_domain_confirmed_at, official_domain_confirmed_by, provenance, created_at, updated_at) VALUES (?, 'Example Markets (fixture)', 'SELECTED', 'example-markets.invalid', ?, 'owner:fixture', 'SYNTHETIC_FIXTURE', ?, ?)",
  ).run(slug, iso, iso, iso);
  const brokerId = (db.prepare('SELECT id FROM brokers WHERE slug = ?').get(slug) as { id: number }).id;
  const url = 'https://www.example-markets.invalid/accounts';
  db.prepare(
    'INSERT OR IGNORE INTO source_registry (broker_id, url, host, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(brokerId, url, 'www.example-markets.invalid', iso, iso);
  const sourceId = (db.prepare('SELECT id FROM source_registry WHERE url = ?').get(url) as { id: number }).id;
  recordOwnerPolicy(
    db,
    sourceId,
    {
      use_class: 'FACT_REFERENCE',
      owner: 'Fictional fixture',
      official_host: 'www.example-markets.invalid',
      source_type: 'SYNTHETIC_FIXTURE',
      terms_url: null,
      licence_url: null,
      robots_agent: 'ForexInspectBot',
      robots_path: '/accounts',
      access_decision: 'ALLOWED',
      reuse_decision: 'UNKNOWN',
      commercial_decision: 'UNKNOWN',
      derivative_decision: 'UNKNOWN',
      attribution: 'Synthetic fixture — not a real broker',
      retention: 'LOCATOR_HASH_ONLY',
      redistribution: 'NONE',
      credentials_required: false,
      terms_risk_accepted: true,
      adverse_findings: [],
      basis: 'Synthetic preview fixture; never fetched.',
    },
    'owner:fixture',
    now,
  );
  applyRobotsOutcome(db, sourceId, { kind: 'OK', allowed: true }, now);
  const text = htmlToText(FIXTURE_HTML);
  const policyId = (
    db
      .prepare('SELECT id FROM source_policies WHERE source_id = ? ORDER BY revision DESC LIMIT 1')
      .get(sourceId) as { id: number }
  ).id;
  const docId = Number(
    db
      .prepare(
        'INSERT INTO source_documents (source_id, policy_id, final_url, http_status, content_type, fetched_at, normalized_hash, parser, byte_length) VALUES (?, ?, ?, 200, ?, ?, ?, ?, ?)',
      )
      .run(sourceId, policyId, url, 'text/html', iso, textHash(text), PARSER_VERSION, text.length)
      .lastInsertRowid,
  );
  const valid = FIXTURE_READINGS.map((r) => validateReading(r, text))
    .filter((v): v is { ok: true; reading: ValidatedReading } => v.ok)
    .map((v) => v.reading);
  for (const pass of ['A', 'B'] as const)
    recordObservations(db, {
      brokerId,
      documentId: docId,
      policyId,
      observedAt: iso,
      pass,
      promptVersion: 'fixture-v1',
      receiptId: null,
      readings: valid,
      now,
    });
  promoteDocument(db, docId, now, 'owner:fixture');
  const rep = publishBroker(db, brokerId, now, 'owner:fixture', { synthetic: true });
  return {
    brokerId,
    published: rep.pages
      .filter((p) => p.result === 'PUBLISHED' || p.result === 'UNCHANGED')
      .map((p) => p.path),
  };
}
