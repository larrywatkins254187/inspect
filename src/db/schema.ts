import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle table definitions for typed operational reads (admin/ops summaries). The SQL files in
 * `migrations/` remain the source of truth (CHECKs, partial indexes, immutability triggers);
 * `tests/schema.test.ts` fails if these definitions drift from the migrated schema.
 */
export const brokers = sqliteTable('brokers', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  officialDomain: text('official_domain'),
  officialDomainConfirmedAt: text('official_domain_confirmed_at'),
  officialDomainConfirmedBy: text('official_domain_confirmed_by'),
  wave: text('wave'),
  provenance: text('provenance').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const brokerSources = sqliteTable('broker_sources', {
  id: integer('id').primaryKey(),
  brokerId: integer('broker_id').notNull(),
  url: text('url').notNull(),
  kind: text('kind').notNull(),
  provenance: text('provenance').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sourceRegistry = sqliteTable('source_registry', {
  id: integer('id').primaryKey(),
  brokerId: integer('broker_id').notNull(),
  url: text('url').notNull(),
  host: text('host').notNull(),
  method: text('method').notNull(),
  useClass: text('use_class').notNull(),
  state: text('state').notNull(),
  stateReason: text('state_reason'),
  ownerStopNoticeAt: text('owner_stop_notice_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const verifiedFacts = sqliteTable('verified_facts', {
  id: integer('id').primaryKey(),
  brokerId: integer('broker_id').notNull(),
  fieldKey: text('field_key').notNull(),
  scopeKey: text('scope_key').notNull(),
  observationId: integer('observation_id').notNull(),
  confirmingObservationId: integer('confirming_observation_id').notNull(),
  policyId: integer('policy_id').notNull(),
  valueText: text('value_text').notNull(),
  normalizedValue: text('normalized_value').notNull(),
  unit: text('unit'),
  currency: text('currency'),
  acceptedAt: text('accepted_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  supersededBy: integer('superseded_by'),
  supersededAt: text('superseded_at'),
  withdrawnAt: text('withdrawn_at'),
  withdrawnReason: text('withdrawn_reason'),
});

export const factConflicts = sqliteTable('fact_conflicts', {
  id: integer('id').primaryKey(),
  brokerId: integer('broker_id').notNull(),
  fieldKey: text('field_key').notNull(),
  scopeKey: text('scope_key').notNull(),
  observationA: integer('observation_a').notNull(),
  observationB: integer('observation_b').notNull(),
  openedAt: text('opened_at').notNull(),
  resolvedAt: text('resolved_at'),
  resolution: text('resolution'),
  resolutionNote: text('resolution_note'),
  resolvedBy: text('resolved_by'),
});

export const contentPages = sqliteTable('content_pages', {
  id: integer('id').primaryKey(),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
  brokerId: integer('broker_id'),
  comparisonKey: text('comparison_key'),
  state: text('state').notNull(),
  currentRevisionId: integer('current_revision_id'),
  firstPublishedAt: text('first_published_at'),
  materialUpdatedAt: text('material_updated_at'),
  synthetic: integer('synthetic').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const jobs = sqliteTable('jobs', {
  id: integer('id').primaryKey(),
  kind: text('kind').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  priority: integer('priority').notNull(),
  dueAt: text('due_at').notNull(),
  state: text('state').notNull(),
  attempts: integer('attempts').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: text('lease_expires_at'),
  fence: integer('fence').notNull(),
  payloadJson: text('payload_json').notNull(),
  resultJson: text('result_json'),
  errorClass: text('error_class'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  finishedAt: text('finished_at'),
});

export const operationalAlerts = sqliteTable('operational_alerts', {
  id: integer('id').primaryKey(),
  fingerprint: text('fingerprint').notNull(),
  severity: text('severity').notNull(),
  code: text('code').notNull(),
  message: text('message').notNull(),
  firstSeen: text('first_seen').notNull(),
  lastSeen: text('last_seen').notNull(),
  count: integer('count').notNull(),
  resolvedAt: text('resolved_at'),
  notifiedAt: text('notified_at'),
});

export const publicationRuns = sqliteTable('publication_runs', {
  id: integer('id').primaryKey(),
  mode: text('mode').notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  outcome: text('outcome'),
  pagesConsidered: integer('pages_considered').notNull(),
  pagesPublished: integer('pages_published').notNull(),
  pagesRetracted: integer('pages_retracted').notNull(),
  abortedReason: text('aborted_reason'),
  detailJson: text('detail_json').notNull(),
});

export const chatDaily = sqliteTable('chat_daily', {
  day: text('day').primaryKey(),
  reserved: integer('reserved').notNull(),
  completed: integer('completed').notNull(),
});

export const marketPrices = sqliteTable('market_prices', {
  id: integer('id').primaryKey(),
  symbol: text('symbol').notNull(),
  provider: text('provider').notNull(),
  rate: text('rate').notNull(),
  derived: integer('derived').notNull(),
  effectiveDate: text('effective_date').notNull(),
  fetchedAt: text('fetched_at').notNull(),
});

export const drizzleTables = {
  brokers,
  brokerSources,
  sourceRegistry,
  verifiedFacts,
  factConflicts,
  contentPages,
  jobs,
  operationalAlerts,
  publicationRuns,
  chatDaily,
  marketPrices,
};
