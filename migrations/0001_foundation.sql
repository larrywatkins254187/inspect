-- ForexInspect foundation schema (PRD §17). Timestamps are ISO-8601 UTC text.
-- Monetary and numeric fact values are exact decimal strings, never REAL.

-- ── Identity / products ────────────────────────────────────────────────
CREATE TABLE brokers (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*' AND length(slug) BETWEEN 2 AND 64),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','SELECTED','BACKLOG','DROPPED')),
  official_domain TEXT CHECK (official_domain IS NULL OR official_domain NOT GLOB '*[^a-z0-9.-]*'),
  official_domain_confirmed_at TEXT,
  official_domain_confirmed_by TEXT,
  wave TEXT CHECK (wave IS NULL OR wave IN ('A','B','C')),
  provenance TEXT NOT NULL DEFAULT 'UNVERIFIED_SEED' CHECK (provenance IN ('UNVERIFIED_SEED','UNVERIFIED_IMPORT','OWNER_ADDED','SYNTHETIC_FIXTURE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((official_domain_confirmed_at IS NULL) OR (official_domain IS NOT NULL))
);
CREATE INDEX brokers_status ON brokers(status);

CREATE TABLE legal_entities (
  id INTEGER PRIMARY KEY,
  legal_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  jurisdiction TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX legal_entities_norm ON legal_entities(normalized_name, ifnull(jurisdiction, ''));

-- Relationship kinds are visibly distinct: a named company on a broker page
-- (BROKER_DISCLOSURE) is not a verified operator and not a register match.
CREATE TABLE broker_entities (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  relationship TEXT NOT NULL CHECK (relationship IN ('BROKER_DISCLOSURE','VERIFIED_OPERATOR')),
  verified_fact_id INTEGER NOT NULL REFERENCES verified_facts(id),
  created_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX broker_entities_broker ON broker_entities(broker_id, relationship);

CREATE TABLE regulators (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  register_url TEXT NOT NULL,
  intake TEXT NOT NULL CHECK (intake IN ('APPROVED_FILE','CONDITIONAL_API','DIRECTORY_ONLY'))
);

-- Licences only come from an official register snapshot match, never from a model.
CREATE TABLE regulatory_licenses (
  id INTEGER PRIMARY KEY,
  regulator_id INTEGER NOT NULL REFERENCES regulators(id),
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  licence_number TEXT NOT NULL,
  status TEXT NOT NULL,
  status_as_of TEXT NOT NULL,
  match_id INTEGER NOT NULL REFERENCES regulatory_matches(id),
  created_at TEXT NOT NULL,
  UNIQUE (regulator_id, licence_number, legal_entity_id)
);

CREATE TABLE trading_accounts (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  entity_scope TEXT,
  jurisdiction_scope TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX trading_accounts_scope ON trading_accounts(broker_id, normalized_label, ifnull(entity_scope,''), ifnull(jurisdiction_scope,''));

CREATE TABLE platforms (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE account_platforms (
  account_id INTEGER NOT NULL REFERENCES trading_accounts(id),
  platform_id INTEGER NOT NULL REFERENCES platforms(id),
  verified_fact_id INTEGER NOT NULL REFERENCES verified_facts(id),
  PRIMARY KEY (account_id, platform_id, verified_fact_id)
);

-- ── Intake / selection ────────────────────────────────────────────────
CREATE TABLE legacy_imports (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('CANDIDATE_SEED','WORKBOOK','LEADS')),
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL UNIQUE,
  byte_length INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  imported_at TEXT NOT NULL,
  diagnostics_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE legacy_rows (
  id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES legacy_imports(id),
  row_number INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  mapped_json TEXT NOT NULL,
  diagnostics_json TEXT NOT NULL DEFAULT '[]',
  provenance TEXT NOT NULL DEFAULT 'UNVERIFIED_IMPORT' CHECK (provenance = 'UNVERIFIED_IMPORT'),
  UNIQUE (import_id, row_number)
);

CREATE TABLE workbook_rows (
  id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES legacy_imports(id),
  row_number INTEGER NOT NULL,
  broker_name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  raw_value TEXT,
  provenance TEXT NOT NULL DEFAULT 'UNVERIFIED_IMPORT' CHECK (provenance = 'UNVERIFIED_IMPORT')
);
CREATE INDEX workbook_rows_import ON workbook_rows(import_id, row_number);

CREATE TABLE candidate_selection (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  state TEXT NOT NULL CHECK (state IN ('CANDIDATE','SELECTED','BACKLOG','DROPPED','REPLACEMENT')),
  wave TEXT,
  reason TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  decided_by TEXT NOT NULL
);
CREATE INDEX candidate_selection_broker ON candidate_selection(broker_id, decided_at);

CREATE TABLE broker_sources (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('LEAD','REGISTERED')),
  provenance TEXT NOT NULL CHECK (provenance IN ('UNVERIFIED_SEED','UNVERIFIED_IMPORT','OWNER_ADDED')),
  created_at TEXT NOT NULL,
  UNIQUE (broker_id, url)
);

CREATE TABLE dropped_brokers (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  reason_code TEXT NOT NULL CHECK (reason_code IN ('ACCESS_REFUSED','OWNER_DECISION','NOT_QUALIFIED','STOP_NOTICE')),
  reason TEXT NOT NULL,
  dropped_at TEXT NOT NULL,
  dropped_by TEXT NOT NULL,
  restored_at TEXT
);

-- ── Source access ─────────────────────────────────────────────────────
CREATE TABLE source_registry (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  url TEXT NOT NULL UNIQUE CHECK (url GLOB 'https://*'),
  host TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET' CHECK (method = 'GET'),
  use_class TEXT NOT NULL DEFAULT 'CONTENT_REUSE' CHECK (use_class IN ('FACT_REFERENCE','CONTENT_REUSE')),
  state TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (state IN ('DISCOVERED','POLICY_PENDING','POLICY_APPROVED','TECH_PENDING','APPROVED','DEGRADED','BLOCKED','RETIRED')),
  state_reason TEXT,
  owner_stop_notice_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX source_registry_broker ON source_registry(broker_id, state);

CREATE TABLE source_policies (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES source_registry(id),
  revision INTEGER NOT NULL,
  use_class TEXT NOT NULL CHECK (use_class IN ('FACT_REFERENCE','CONTENT_REUSE')),
  owner TEXT NOT NULL,
  official_host TEXT NOT NULL,
  source_type TEXT NOT NULL,
  terms_url TEXT,
  licence_url TEXT,
  robots_agent TEXT NOT NULL,
  robots_path TEXT NOT NULL,
  robots_allowed INTEGER CHECK (robots_allowed IN (0,1)),
  robots_checked_at TEXT,
  access_decision TEXT NOT NULL CHECK (access_decision IN ('ALLOWED','REFUSED','UNKNOWN')),
  reuse_decision TEXT NOT NULL CHECK (reuse_decision IN ('GRANTED','NOT_GRANTED','UNKNOWN')),
  commercial_decision TEXT NOT NULL CHECK (commercial_decision IN ('PERMITTED','RESTRICTED','UNKNOWN')),
  derivative_decision TEXT NOT NULL CHECK (derivative_decision IN ('PERMITTED','RESTRICTED','UNKNOWN')),
  attribution TEXT,
  retention TEXT NOT NULL CHECK (retention IN ('LOCATOR_HASH_ONLY','BODY_PERMITTED')),
  redistribution TEXT NOT NULL CHECK (redistribution IN ('NONE','PERMITTED')),
  limits_json TEXT NOT NULL DEFAULT '{}',
  credentials_required INTEGER NOT NULL DEFAULT 0 CHECK (credentials_required IN (0,1)),
  terms_risk_accepted INTEGER NOT NULL DEFAULT 0 CHECK (terms_risk_accepted IN (0,1)),
  adverse_findings_json TEXT NOT NULL DEFAULT '[]',
  basis TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  due_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_id, revision)
);

CREATE TABLE source_documents (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES source_registry(id),
  policy_id INTEGER NOT NULL REFERENCES source_policies(id),
  final_url TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  content_type TEXT,
  fetched_at TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  normalized_hash TEXT NOT NULL,
  parser TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  body_retained INTEGER NOT NULL DEFAULT 0 CHECK (body_retained IN (0,1)),
  body_text TEXT,
  CHECK (body_retained = 1 OR body_text IS NULL)
);
CREATE INDEX source_documents_source ON source_documents(source_id, fetched_at);

CREATE TABLE source_audits (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES source_registry(id),
  event TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX source_audits_source ON source_audits(source_id, at);

CREATE TABLE host_traffic (
  host TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  circuit_open_until TEXT,
  retry_after_until TEXT,
  stopped_reason TEXT
);

-- ── Registry matching ─────────────────────────────────────────────────
CREATE TABLE regulator_sandbox (
  id INTEGER PRIMARY KEY,
  regulator_code TEXT NOT NULL,
  row_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE regulator_snapshots (
  id INTEGER PRIMARY KEY,
  regulator_code TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL UNIQUE,
  row_count INTEGER NOT NULL,
  schema_ok INTEGER NOT NULL CHECK (schema_ok IN (0,1)),
  sandbox INTEGER NOT NULL DEFAULT 0 CHECK (sandbox IN (0,1)),
  imported_at TEXT NOT NULL
);

CREATE TABLE regulator_snapshot_rows (
  id INTEGER PRIMARY KEY,
  snapshot_id INTEGER NOT NULL REFERENCES regulator_snapshots(id),
  licence_number TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE INDEX regulator_snapshot_rows_lookup ON regulator_snapshot_rows(snapshot_id, normalized_name);

CREATE TABLE entity_identifiers (
  id INTEGER PRIMARY KEY,
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  scheme TEXT NOT NULL CHECK (scheme IN ('ASIC_AFSL','ACN','ABN','FCA_FRN','COMPANY_NUMBER')),
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (scheme, value)
);

CREATE TABLE regulatory_matches (
  id INTEGER PRIMARY KEY,
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  snapshot_row_id INTEGER NOT NULL REFERENCES regulator_snapshot_rows(id),
  regulator_code TEXT NOT NULL,
  licence_number TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('EXACT_IDENTIFIER','EXACT_NORMALIZED_NAME_AND_IDENTIFIER')),
  matched_at TEXT NOT NULL
);

-- ── Evidence ──────────────────────────────────────────────────────────
CREATE TABLE fact_definitions (
  field_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  topic TEXT NOT NULL CHECK (topic IN ('accounts','costs','leverage','platforms','entity')),
  value_type TEXT NOT NULL CHECK (value_type IN ('decimal','boolean','text','ratio','entity')),
  ttl_hours INTEGER NOT NULL CHECK (ttl_hours BETWEEN 1 AND 2160),
  core_topic TEXT,
  contract_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

-- Observations are immutable readings (trigger below).
CREATE TABLE fact_observations (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  field_key TEXT NOT NULL REFERENCES fact_definitions(field_key),
  value_text TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  unit TEXT,
  currency TEXT CHECK (currency IS NULL OR (length(currency) = 3 AND currency NOT GLOB '*[^A-Z]*')),
  scope_key TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  document_id INTEGER NOT NULL REFERENCES source_documents(id),
  policy_id INTEGER NOT NULL REFERENCES source_policies(id),
  locator TEXT NOT NULL,
  quote_hash TEXT NOT NULL,
  literal_check INTEGER NOT NULL CHECK (literal_check IN (0,1)),
  observed_at TEXT NOT NULL,
  effective_at TEXT,
  parser TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  pass_label TEXT NOT NULL CHECK (pass_label IN ('A','B','OPERATOR','FIXTURE')),
  ai_receipt_id INTEGER REFERENCES ai_jobs(id),
  validation_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX fact_observations_scope ON fact_observations(broker_id, field_key, scope_key);
CREATE INDEX fact_observations_document ON fact_observations(document_id, pass_label);

CREATE TABLE fact_evidence (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER NOT NULL REFERENCES fact_observations(id),
  document_id INTEGER NOT NULL REFERENCES source_documents(id),
  locator TEXT NOT NULL,
  quote_hash TEXT NOT NULL,
  retained_excerpt TEXT,
  created_at TEXT NOT NULL
);

-- Current accepted pointer. id is the public fact ID cited by pages.
CREATE TABLE verified_facts (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  field_key TEXT NOT NULL REFERENCES fact_definitions(field_key),
  scope_key TEXT NOT NULL,
  observation_id INTEGER NOT NULL REFERENCES fact_observations(id),
  confirming_observation_id INTEGER NOT NULL REFERENCES fact_observations(id),
  policy_id INTEGER NOT NULL REFERENCES source_policies(id),
  value_text TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  unit TEXT,
  currency TEXT,
  accepted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  superseded_by INTEGER REFERENCES verified_facts(id),
  superseded_at TEXT,
  withdrawn_at TEXT,
  withdrawn_reason TEXT,
  CHECK (observation_id <> confirming_observation_id),
  CHECK (expires_at > accepted_at)
);
CREATE UNIQUE INDEX verified_facts_current ON verified_facts(broker_id, field_key, scope_key)
  WHERE superseded_at IS NULL AND withdrawn_at IS NULL;
CREATE INDEX verified_facts_broker ON verified_facts(broker_id, withdrawn_at, superseded_by);

CREATE TABLE fact_confirmations (
  id INTEGER PRIMARY KEY,
  verified_fact_id INTEGER NOT NULL REFERENCES verified_facts(id),
  observation_id INTEGER NOT NULL REFERENCES fact_observations(id),
  kind TEXT NOT NULL CHECK (kind IN ('SECOND_PASS','REVERIFY')),
  confirmed_at TEXT NOT NULL
);

CREATE TABLE fact_conflicts (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  field_key TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  observation_a INTEGER NOT NULL REFERENCES fact_observations(id),
  observation_b INTEGER NOT NULL REFERENCES fact_observations(id),
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('OWNER_SELECTED_A','OWNER_SELECTED_B','EQUIVALENT','OBSOLETE_SCOPE','BOTH_REJECTED')),
  resolution_note TEXT,
  resolved_by TEXT
);
CREATE INDEX fact_conflicts_open ON fact_conflicts(broker_id, field_key, scope_key) WHERE resolved_at IS NULL;

CREATE TABLE rejected_values (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  field_key TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  observation_id INTEGER REFERENCES fact_observations(id),
  verified_fact_id INTEGER REFERENCES verified_facts(id),
  rejected_at TEXT NOT NULL,
  rejected_by TEXT NOT NULL
);
CREATE INDEX rejected_values_lookup ON rejected_values(broker_id, field_key, normalized_value);

CREATE TABLE source_operating_entities (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES source_registry(id),
  document_id INTEGER NOT NULL REFERENCES source_documents(id),
  observation_id INTEGER NOT NULL REFERENCES fact_observations(id),
  legal_entity_id INTEGER NOT NULL REFERENCES legal_entities(id),
  wording TEXT NOT NULL CHECK (wording IN ('OPERATED_BY','SERVICES_PROVIDED_BY','TRADING_NAME_OF')),
  created_at TEXT NOT NULL
);

CREATE TABLE change_events (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER REFERENCES brokers(id),
  kind TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);

-- ── Publishing ────────────────────────────────────────────────────────
CREATE TABLE content_pages (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('BROKER_PROFILE','BROKER_FEES','BROKER_ACCOUNTS','COMPARISON')),
  path TEXT NOT NULL UNIQUE CHECK (path GLOB '/*'),
  broker_id INTEGER REFERENCES brokers(id),
  comparison_key TEXT,
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','PUBLISHED','RETRACTED','HIDDEN')),
  current_revision_id INTEGER REFERENCES content_revisions(id),
  first_published_at TEXT,
  material_updated_at TEXT,
  synthetic INTEGER NOT NULL DEFAULT 0 CHECK (synthetic IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state <> 'PUBLISHED' OR current_revision_id IS NOT NULL)
);
CREATE INDEX content_pages_state ON content_pages(kind, state);

CREATE TABLE content_revisions (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES content_pages(id),
  revision_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','QA_PASSED','QA_FAILED','PUBLISHED','SUPERSEDED','WITHDRAWN','ABORTED')),
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  fact_hash TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  substantive_hash TEXT NOT NULL,
  qa_json TEXT,
  prompt_version TEXT,
  model TEXT,
  adapter_version TEXT,
  ai_receipt_id INTEGER REFERENCES ai_jobs(id),
  parent_revision_id INTEGER REFERENCES content_revisions(id),
  rollback_of INTEGER REFERENCES content_revisions(id),
  material_change INTEGER,
  created_at TEXT NOT NULL,
  qa_at TEXT,
  published_at TEXT,
  withdrawn_at TEXT,
  UNIQUE (page_id, revision_no)
);
CREATE INDEX content_revisions_page ON content_revisions(page_id, status, published_at);

CREATE TABLE page_facts (
  revision_id INTEGER NOT NULL REFERENCES content_revisions(id),
  verified_fact_id INTEGER NOT NULL REFERENCES verified_facts(id),
  claim_key TEXT NOT NULL,
  PRIMARY KEY (revision_id, verified_fact_id, claim_key)
);
CREATE INDEX page_facts_fact ON page_facts(verified_fact_id);

CREATE TABLE publication_runs (
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('MANUAL','AUTO','ROLLBACK','RETRACT')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('PUBLISHED','NOOP','ABORTED','FAILED','RETRACTED','ROLLED_BACK')),
  pages_considered INTEGER NOT NULL DEFAULT 0,
  pages_published INTEGER NOT NULL DEFAULT 0,
  pages_retracted INTEGER NOT NULL DEFAULT 0,
  aborted_reason TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE correction_requests (
  id INTEGER PRIMARY KEY,
  page_path TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED','TRIAGED','RESOLVED_CORRECTED','RESOLVED_NO_CHANGE','REJECTED')),
  public_summary TEXT,
  resolved_at TEXT,
  private_reference TEXT,
  CHECK (status <> 'RESOLVED_CORRECTED' OR (public_summary IS NOT NULL AND resolved_at IS NOT NULL))
);

-- ── Jobs / monitoring ─────────────────────────────────────────────────
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  priority INTEGER NOT NULL DEFAULT 100,
  due_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED','LEASED','SUCCEEDED','RETRY_WAIT','DEAD_LETTER','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  lease_owner TEXT,
  lease_expires_at TEXT,
  fence INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  error_class TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX jobs_due ON jobs(state, due_at, priority);

CREATE TABLE ai_jobs (
  id INTEGER PRIMARY KEY,
  purpose TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTED','SUCCEEDED','FAILED','INVALID_OUTPUT')),
  output_json TEXT,
  usage_json TEXT NOT NULL DEFAULT '{}',
  error_class TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE UNIQUE INDEX ai_jobs_reuse ON ai_jobs(purpose, input_hash, policy_hash, prompt_version, provider, model, adapter_version)
  WHERE status = 'SUCCEEDED';

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT
);
CREATE INDEX audit_events_at ON audit_events(at);

CREATE TABLE operational_alerts (
  id INTEGER PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  resolved_at TEXT,
  notified_at TEXT
);

CREATE TABLE locks (
  name TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- ── Assets ────────────────────────────────────────────────────────────
CREATE TABLE broker_assets (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  kind TEXT NOT NULL DEFAULT 'LOGO' CHECK (kind IN ('LOGO')),
  file_name TEXT NOT NULL UNIQUE CHECK (file_name NOT GLOB '*[^a-z0-9._-]*' AND file_name NOT LIKE '%..%'),
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/webp','image/png','image/svg+xml')),
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('NOMINATIVE_OFFICIAL_MARK','LICENSED','NONE')),
  attribution TEXT,
  current_brand_reviewed_at TEXT,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  approved_at TEXT,
  removal_requested_at TEXT,
  unresolved_reason TEXT,
  created_at TEXT NOT NULL,
  CHECK (approved = 0 OR (current_brand_reviewed_at IS NOT NULL AND rights_basis <> 'NONE' AND approved_at IS NOT NULL))
);

CREATE TABLE broker_asset_reviews (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES broker_assets(id),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVE','REJECT','REMOVE')),
  reviewer TEXT NOT NULL,
  notes TEXT NOT NULL,
  review_file_sha256 TEXT,
  at TEXT NOT NULL
);

CREATE TABLE logo_sources (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  url TEXT NOT NULL UNIQUE CHECK (url GLOB 'https://*'),
  host TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  robots_checked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE logo_host_traffic (
  host TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  last_request_at TEXT
);

CREATE TABLE logo_discoveries (
  id INTEGER PRIMARY KEY,
  broker_id INTEGER NOT NULL REFERENCES brokers(id),
  url TEXT NOT NULL,
  found_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('FOUND','IMPORTED','REJECTED')),
  detail TEXT
);

-- ── Search ────────────────────────────────────────────────────────────
CREATE TABLE seo_metrics (
  property TEXT NOT NULL,
  date TEXT NOT NULL,
  clicks INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  ctr TEXT NOT NULL,
  position TEXT NOT NULL,
  data_state TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (property, date)
);

CREATE TABLE seo_runs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('CRAWL','CHECK','REVIEW','FIX','VERIFY')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  pages INTEGER NOT NULL DEFAULT 0,
  issues INTEGER NOT NULL DEFAULT 0,
  prompt_version TEXT,
  model TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE seo_pages (
  url TEXT PRIMARY KEY,
  status INTEGER,
  final_url TEXT,
  robots TEXT,
  content_hash TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  fetched_at TEXT,
  reviewed_hash TEXT,
  removed_at TEXT
);

CREATE TABLE seo_issues (
  id INTEGER PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','ERROR')),
  message TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('OPEN','IN_PROGRESS','FIXED','FAILED','WONTFIX','STALE')),
  source TEXT NOT NULL CHECK (source IN ('RULE','MODEL')),
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  run_id INTEGER REFERENCES seo_runs(id),
  verified_at TEXT,
  transitions_json TEXT NOT NULL DEFAULT '[]'
);

-- ── Ask ───────────────────────────────────────────────────────────────
CREATE TABLE chat_salt (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE chat_attempts (
  id INTEGER PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX chat_attempts_hash ON chat_attempts(ip_hash, at);

CREATE TABLE chat_daily (
  day TEXT PRIMARY KEY,
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed >= 0)
);

CREATE TABLE chat_logs (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  question TEXT NOT NULL,
  history_json TEXT NOT NULL,
  answer_json TEXT,
  outcome TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  model TEXT,
  duration_ms INTEGER
);
CREATE INDEX chat_logs_at ON chat_logs(at);

-- ── Reference prices ──────────────────────────────────────────────────
CREATE TABLE market_prices (
  id INTEGER PRIMARY KEY,
  symbol TEXT NOT NULL,
  provider TEXT NOT NULL,
  rate TEXT NOT NULL,
  derived INTEGER NOT NULL CHECK (derived IN (0,1)),
  effective_date TEXT NOT NULL CHECK (effective_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  fetched_at TEXT NOT NULL,
  UNIQUE (symbol, provider, effective_date)
);

CREATE TABLE market_fetch_runs (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('RUNNING','NEW_DATA','NO_CHANGE','FAILED','DISABLED')),
  http_status INTEGER,
  new_rows INTEGER NOT NULL DEFAULT 0,
  effective_date TEXT,
  error_class TEXT
);
CREATE INDEX market_fetch_runs_at ON market_fetch_runs(started_at);

-- ── Immutability guards ───────────────────────────────────────────────
CREATE TRIGGER fact_observations_immutable_u BEFORE UPDATE ON fact_observations
BEGIN SELECT RAISE(ABORT, 'fact_observations are immutable'); END;
CREATE TRIGGER fact_observations_immutable_d BEFORE DELETE ON fact_observations
BEGIN SELECT RAISE(ABORT, 'fact_observations are immutable'); END;
CREATE TRIGGER fact_confirmations_immutable_u BEFORE UPDATE ON fact_confirmations
BEGIN SELECT RAISE(ABORT, 'fact_confirmations are immutable'); END;
CREATE TRIGGER fact_confirmations_immutable_d BEFORE DELETE ON fact_confirmations
BEGIN SELECT RAISE(ABORT, 'fact_confirmations are immutable'); END;
CREATE TRIGGER page_facts_immutable_u BEFORE UPDATE ON page_facts
BEGIN SELECT RAISE(ABORT, 'page_facts are immutable'); END;
CREATE TRIGGER rejected_values_immutable_d BEFORE DELETE ON rejected_values
BEGIN SELECT RAISE(ABORT, 'rejection history is retained'); END;
-- Accepted value/scope of a verified fact never changes; only lifecycle columns may.
CREATE TRIGGER verified_facts_value_immutable BEFORE UPDATE OF broker_id, field_key, scope_key, observation_id, confirming_observation_id, value_text, normalized_value, unit, currency, accepted_at, expires_at, policy_id ON verified_facts
BEGIN SELECT RAISE(ABORT, 'verified fact value/scope is immutable'); END;
CREATE TRIGGER verified_facts_no_delete BEFORE DELETE ON verified_facts
BEGIN SELECT RAISE(ABORT, 'verified facts are retained'); END;
CREATE TRIGGER content_revisions_content_immutable BEFORE UPDATE OF content_json, content_hash, fact_hash, policy_hash, substantive_hash, page_id, revision_no ON content_revisions
BEGIN SELECT RAISE(ABORT, 'revision content is immutable'); END;
CREATE TRIGGER content_revisions_no_delete BEFORE DELETE ON content_revisions
BEGIN SELECT RAISE(ABORT, 'revisions are retained'); END;
CREATE TRIGGER source_policies_evidence_immutable BEFORE UPDATE OF source_id, revision, use_class, evidence_hash, access_decision, reuse_decision, robots_allowed, retention, adverse_findings_json, basis ON source_policies
BEGIN SELECT RAISE(ABORT, 'changed policy evidence requires a new revision'); END;
-- A model cannot reopen a blocked source: only an owner reopen (with audit) may leave BLOCKED.
CREATE TRIGGER source_registry_blocked_guard BEFORE UPDATE OF state ON source_registry
WHEN OLD.state = 'BLOCKED' AND NEW.state <> 'BLOCKED' AND NEW.state <> 'RETIRED'
  AND NOT EXISTS (SELECT 1 FROM audit_events WHERE action = 'source.reopen' AND subject = 'source:' || OLD.id AND actor LIKE 'owner:%' AND at >= OLD.updated_at)
BEGIN SELECT RAISE(ABORT, 'blocked source requires an audited owner reopen'); END;
CREATE TRIGGER source_registry_retired_final BEFORE UPDATE OF state ON source_registry
WHEN OLD.state = 'RETIRED' AND NEW.state <> 'RETIRED'
BEGIN SELECT RAISE(ABORT, 'retired sources stay retired'); END;
