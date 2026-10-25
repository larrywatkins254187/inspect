# Feature-parity checklist

Columns are deliberately separate: **Implemented** (code exists and is tested), **Enabled here** (switched
on in this environment's safe base), **Live-verified** (exercised against real external services/data).
“Synthetic” means verified over HTTP against the isolated fictional fixture database (`data/e2e.sqlite`,
port 3418), never the main database. Evidence reports: `reports/`.

Legend: ✅ yes · ⛔ no (reason given) · — not applicable

## A. Required feature coverage (task list 1–17)

| # | Capability | Key files | Config prerequisites | Tests / verification | Implemented | Enabled here | Live-verified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Semantic responsive shell, skip link, nav + mobile menu + current state, pending feedback, footer with every calculator, risk/commercial notices | `app/layout.tsx`, `src/ui/SiteHeader.tsx`, `src/ui/client/HeaderNav.tsx`, `src/ui/SiteFooter.tsx`, `app/globals.css` | — | browser-report (keyboard, Escape, aria-current, overflow at 5 widths + 200 % zoom), smoke-report | ✅ | ✅ | ✅ (local HTTP + Chromium) |
| 2 | Homepage: positioning, snapshot-derived counts, methodology/trust links, lightweight SVG, finder, conditional Ask | `app/page.tsx`, `src/ui/EvidenceArt.tsx`, `src/domain/read.ts#evidenceStats` | publication for counts; Ask gates | smoke (preparation copy, no stats when off; stats = 2 on synthetic), Lighthouse 97 | ✅ | ✅ preparation state | Synthetic |
| 3 | Directory + finder: alphabetical, name/platform/regulator word match, evidence-presence filters, counts/reset, core-topic coverage; no indexable filter URLs | `app/brokers/page.tsx`, `src/ui/client/BrokerFinder.tsx`, `src/server/finder.ts` | publication + published profiles | browser (search, no-results, clear, URL unchanged), smoke (ItemList order = visible order) | ✅ | ✅ (empty, noindex) | Synthetic |
| 4 | Profiles: deterministic summary, scoped account table, topic sections, named company / operator / register match distinctions, `#fact-<observationId>` anchors, sources/dates, unknowns, FAQs, related, history | `app/brokers/[slug]/page.tsx`, `src/ui/ProfileBody.tsx`, `src/ui/broker.tsx`, `src/domain/broker-view.ts`, `src/domain/history.ts` | publication; accepted facts | pipeline.test (13+1), smoke (SSR facts, anchors, dates, sources), browser, no-JS render | ✅ | ⛔ no accepted real facts | Synthetic |
| 5 | Fees/accounts: independent revisions/floors, cost-basis exclusions, Standard/Raw only for one-each same known entity+jurisdiction, real 404 | `app/brokers/[slug]/fees`, `…/accounts`, `src/domain/broker-view.ts` | as 4 | pipeline.test (fees floor → null, Standard/Raw unavailable with unknown entity), smoke (200/404) | ✅ | ⛔ | Synthetic |
| 6 | Comparisons: search, canonical 2/3-broker articles, deterministic prose, original-logo VS PNG, 4-hour durable slot jobs, 75/25 & pair/triple selection, plan reuse, no winner | `app/compare/**`, `src/domain/comparisons.ts`, `src/domain/jobs.ts` | publication + auto-publication, Codex, approved logos | ask-compare.test (canonical, selection, plan validation, slot, NOOP, reuse w/o model call, logo withdrawal hides), smoke (308, PNG) | ✅ | ⛔ (switches off; no logos) | Synthetic (fixture plan provider) |
| 7 | 15 calculator routes with hub search/categories, reset, field errors, formulas/examples/assumptions/FAQs, SSR content | `src/calculators/defs.ts`, `src/calculators/content.ts`, `app/tools/**`, `src/ui/client/CalculatorWorkspace.tsx`, `src/ui/client/ToolsHub.tsx` | none | calculators.test (16: independent worked examples, malformed/non-finite rejection), browser (errors, no stale result, reset, instrument defaults) | ✅ | ✅ | ✅ |
| 8 | 20 instruments, 8 currencies, editable typical assumptions, exact decimals, deliberate rounding | `src/markets/instruments.ts`, `src/calculators/core.ts` | none | calculators.test (registry counts, JPY pip, round-down sizing) | ✅ | ✅ | ✅ |
| 9 | ECB-via-Frankfurter adapter, date-aware 10-min refresh, dated attribution, derived-pair notice, manual fallback | `src/domain/rates.ts`, `app/api/reference-rates/route.ts`, `deploy/systemd/forexinspect-prices.*` | `MARKET_RATES_ENABLED="true"` | rates.test (exact decimal text, schema/date checks, dedupe, failure keeps old values); browser (explicit apply) | ✅ | ⛔ off by default | ✅ one operator-authorized refresh (ECB date 2026-10-23, 14 rows) |
| 10 | Four guides + hub; methodology, sources, corrections, about, contact, AI policy, privacy, affiliate, risk, disclaimer, warnings | `src/guides/registry.ts`, `app/guides/**`, `app/<page>/page.tsx` | — | smoke (all 200, one h1, canonical, Article JSON-LD), crawl (0 errors) | ✅ | ✅ | ✅ |
| 11 | Ask: on-demand Turnstile modal, 3-pair history, cited answer kinds, retention notice, strict body/token checks, salted hourly limit, concurrency-safe daily cap, scoped claim validation, 50 s timeout, 30-day purge | `src/domain/ask.ts`, `app/api/ask/route.ts`, `src/ui/client/Ask.tsx` | `CHAT_ENABLED`, `TURNSTILE_*`, `CODEX_*`, `SECRETS_ROTATION_CONFIRMED`, publication | ask-compare.test (limits, token host/action/age, no reservation before token, deterministic verified text removes numeric drift, downgrades, 10/h incl. failures, cap with pending reservations, purge); browser (mocked Turnstile/API, focus, Escape, errors) | ✅ | ⛔ (gates off → UI hidden, API 404 verified) | ⛔ needs Turnstile keys + Codex login |
| 12 | Safe import, unverified provenance, candidate selection/drop, confirmed domains, source registry/review/fetch, extraction/acceptance/conflicts, entity matching, immutable observations | `src/domain/import.ts`, `src/lib/tabular.ts`, `src/domain/policy.ts`, `src/domain/robots.ts`, `src/domain/fetcher.ts`, `src/domain/extract.ts`, `src/domain/promote.ts`, `src/domain/regulators.ts`, `migrations/0001` triggers | owner policy decisions, `SOURCE_USER_AGENT`, Codex | operations.test (seed idempotent/count-asserted, CSV+XLSX, ASIC name+identifier, sandbox never licences), source-security.test (15), pipeline.test | ✅ | ✅ seed imported (30 candidates, 5 leads, 0 facts) | ⛔ no owner-approved source policy yet |
| 13 | Leased idempotent jobs, AI receipts/no-op reuse, atomic revisions + fact dependencies, gated publication, mass-retraction guard, read-time checks, history, rollback/retract | `src/domain/jobs.ts`, `src/ai/receipts.ts`, `src/domain/publication.ts`, `src/domain/fact-checks.ts`, `src/domain/read.ts` | publication switches | operations.test (fencing, crash reclaim, dead letter, locks), pipeline.test (abort after QA change, idempotent publish, rollback/retract, guard >2 pages) | ✅ | ✅ (switches off) | Synthetic |
| 14 | Authenticated noindex admin/source/asset audit, isolated synthetic previews, approved asset delivery, logo provenance + text fallback, licence notices, safe image optimization | `app/admin/**`, `src/server/auth.ts`, `app/preview/[[...path]]`, `app/asset-file/[file]`, `app/broker-logos/[file]`, `src/domain/assets.ts`, `src/domain/logos.ts`, `next.config.ts images` | `ADMIN_TOKEN` (≥32 chars) | smoke (unauth 404/noindex/no-store, bearer + cookie session, CSRF rejected, preview renders, asset audit, optimizer rejects remote URL), operations.test (asset CHECK + tamper) | ✅ | ⛔ no `ADMIN_TOKEN` in base (verified with a temporary token) | ✅ local |
| 15 | robots/sitemap/llms, metadata/JSON-LD/share images, consent analytics, Search Console aggregate helper, optional connector gates, SEO audit lifecycle, constrained fixes gated | `app/robots.ts`, `app/sitemap.ts`, `app/llms.txt`, `src/server/seo.ts`, `src/server/discovery.ts`, `src/ui/client/Consent.tsx`, `src/integrations/index.ts`, `src/domain/seo-audit.ts` | GA4 id + `ANALYTICS_ENABLED` (build-time); GSC OAuth; IndexNow key | smoke, crawl-report (74 URLs, 0 errors, 0 broken links), operations.test (rules, fingerprints, allowlist/diff cap), browser consent (no Google before consent, decline persists, settings reopen) | ✅ | ⛔ analytics/GSC/IndexNow off | ⛔ needs GA4/GSC/IndexNow accounts |
| 16 | Health, bounded maintenance, safe summaries, encrypted consistent recovery + restore | `app/health/route.ts`, `src/domain/ops.ts`, `src/domain/backup.ts`, `scripts/cli.ts` (`monitor`, `health-summary`, `maintenance`, `backup`, `restore`) | `BACKUP_ENCRYPTION_KEY_FILE`, `BACKUP_TRANSPORT_APPROVED`, Telegram | operations.test (round trip, tamper, wrong key, WAL-consistent DB, split parts); CLI backup→verify→isolated restore run | ✅ | ⛔ no key/transport | Local archive only (not off-host) |
| 17 | Cloudflare Email Worker: full forwarding, bounded plain-text Telegram notice, separate bindings, privacy disclosure, no auto-acceptance | `workers/email/**`, `app/privacy`, `app/contact` | Email Routing, verified mailbox, `DEST`/`TG_TOKEN`/`TG_CHAT` | operations.test (MIME summary, QP UTF-8, attachment metadata, 3 500-char cap) | ✅ | ⛔ | ⛔ needs Cloudflare account |

## B. Acceptance matrix (PRD §23)

| ID | Minimum proof | Where | Status |
| --- | --- | --- | --- |
| FR-01 Import | idempotent counts/hashes, unverified, missing files explicit | `tests/operations.test.ts`, `seeds/README.md` | ✅ (original 119-row file absent → documented) |
| FR-02 Source policy | use class, unknown reuse, expiry/block, retention | `tests/source-security.test.ts` | ✅ |
| FR-03 Safe fetch | DNS/redirect SSRF, bounds, robots/refusal/challenge/429 | `tests/source-security.test.ts` | ✅ (injected transport; no live broker fetch) |
| FR-04 Extraction | currency/units/scope/leverage/legal names/commission side-volume | `tests/pipeline.test.ts` | ✅ |
| FR-05 Acceptance | agreement cannot authorize licence; conflict/rejection/expiry/history | `tests/pipeline.test.ts` | ✅ |
| FR-06 Entities | brand/company/registration/licence mismatches rejected; disclosure distinct | `tests/operations.test.ts`, `tests/pipeline.test.ts` | ✅ |
| FR-07 Jobs | duplicate/crash/lease/fencing/dead letter | `tests/operations.test.ts` | ✅ |
| FR-08 AI | invalid/injected/unsupported/timeout output safe; unchanged → no model call | `tests/pipeline.test.ts`, `tests/ask-compare.test.ts` | ✅ (fake provider; Codex not logged in) |
| FR-09 Publication | post-QA change abort, atomic switch, idempotency | `tests/pipeline.test.ts` | ✅ |
| FR-10 Public reads | off/expiry/conflict/revocation/drop | `tests/pipeline.test.ts` | ✅ |
| FR-11 History/rollback | lineage, publication/material/renewal dates | `tests/pipeline.test.ts` | ✅ |
| FR-12 Finder/profile | SSR links/facts/sources, coverage, unknowns, responsive tables | smoke, browser | ✅ synthetic |
| FR-13 Child pages | independent floors, basis exclusion, Standard/Raw, real 404 | pipeline.test, smoke | ✅ synthetic |
| FR-14 Comparisons | canonicalization, gates, deterministic claims, worker/image eligibility | ask-compare.test, smoke | ✅ synthetic |
| FR-15 Calculators | all 15; independent formula/boundary/rounding; reset/errors | calculators.test, browser | ✅ |
| FR-16 Rates | provider, schema/date dedupe/attribution/manual fallback | rates.test, one live refresh | ✅ |
| FR-17 Guides/trust | four guides + policy routes with truthful copy | smoke, crawl | ✅ |
| FR-18 Ask | token/hostname/action, concurrent limits, purge, drift, errors, modal keyboard | ask-compare.test, browser (mocked) | ✅ implemented / ⛔ live |
| FR-19 SEO | HTTP/canonical/robots/sitemap/metadata/schema | smoke, crawl, Lighthouse SEO 100 | ✅ |
| FR-20 Audit | fingerprint/no-op/bounded review/allowlisted fix/live verify | operations.test, crawl-report, `cli seo-fix` preflight | ✅ read-only; fixes gated off (no clean Git/rollback on target) |
| FR-21 Private/assets | unauthorized 404/no-store/noindex, fixture isolation, logos/fallbacks | smoke, operations.test | ✅ |
| FR-22 Analytics | no pre-consent/private/input leakage; base runnable without integrations | browser consent build, Consent.tsx | ✅ (GA load on production host not verifiable here) |
| FR-23 Recovery | consistent capture, encryption/tamper, upload receipts, isolated restore | operations.test, CLI run | ✅ local; ⛔ off-host upload (no approved transport) |
| FR-24 UI | tokens, states, widths/zoom, keyboard/contrast/reduced motion | browser-report, contrast-report, DESIGN.md | ✅ (manual screen reader not done) |
| FR-25 Performance | reproducible results + evidence-safety | lighthouse-report, performance-report, bundle-report, memo safety test | ✅ lab/local; ⛔ field CWV, VPS figures |

## C. Deliberately not implemented (deferred/removed in the PRD)

Dedicated regulation pages, cross-broker change radar, Best/rankings/alternatives/country pages, combined
all-in cost calculator, real-time quotes or non-FX feeds, user accounts, broad CMS, automated correction
intake, Kie.ai adapter (stub returns *unavailable*), FCA register adapter (conditional; not enabled), custom
public RAM HTML cache (removed; not restored).
