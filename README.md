# ForexInspect

Evidence-first forex-broker research: dated, scoped facts from approved official broker pages, plus 15
calculators and four guides. Not a broker, no ratings/rankings/recommendations, no affiliate links.
Specification: PRD v2.0 (25 October 2026). Status and blockers: [STATUS.md](STATUS.md). Feature checklist:
[PARITY.md](PARITY.md). Design system: [DESIGN.md](DESIGN.md). Operations: [RUNBOOK.md](RUNBOOK.md),
[docs/BACKUP.md](docs/BACKUP.md). Reports: [reports/](reports/README.md).

## Stack (pinned in `pnpm-lock.yaml`)

Node.js 24 LTS (tested 24.21.0) · pnpm 11.25.0 · Next.js 16.4.2 (App Router, Turbopack) · React 19.3.1 ·
TypeScript 5.9.3 (strict) · SQLite (better-sqlite3 13.0.3, WAL, foreign keys, versioned SQL migrations) ·
Drizzle ORM 0.45.4 for typed operational reads (definitions drift-tested against the SQL migrations; evidence write paths use parameterized SQL) · Zod 4.6.6 ·
decimal.js 10.6.0 · sharp 0.35.5 · Vitest 4.1.11 · ESLint 9 + eslint-config-next 16.4.2 · Prettier 3.9.
Production: Nginx reverse proxy → `next start` on 127.0.0.1:3417 under systemd (`deploy/`). No Docker,
PostgreSQL or microservices.

## Commands

```bash
pnpm install                 # installs exact lockfile versions (native builds allowed in pnpm-workspace.yaml)
pnpm migrate                 # apply versioned migrations (pre-migration snapshot when upgrading an existing DB)
pnpm seed                    # import the UNVERIFIED 30-candidate scaffold + 5 pilot leads (idempotent)
pnpm dev                     # secure launcher → next dev on 127.0.0.1:3417
pnpm check                   # prettier --check, eslint, tsc, vitest, security scan (scan needs a prior build)
pnpm build                   # secure launcher → next build
pnpm start                   # secure launcher → next start on 127.0.0.1:3417 (PORT/HOSTNAME_BIND override)
pnpm cli help                # operator CLI (sources, policy, extract, promote, publish, rollback, backup, …)
pnpm secrets:check           # protected-config presence/format/permission diagnostics (never prints values)
pnpm setup:secrets --import /path/to/existing.env   # validate + install an existing protected file
```

The secure launcher (`scripts/secure.ts`) parses the protected file named by `FOREXINSPECT_SECRETS_FILE`
(default `/etc/forexinspect/production.env`) as `NAME="JSON string"` lines — never shell-sourced — loads
only allowlisted names into the child process and prints names/counts only. Without the file the app runs
in **safe base mode**: publication, automatic publication and every integration off; tools and guides work
with user-entered assumptions; broker research shows its preparation state. Placeholder configuration:
[`config/production.env.example`](config/production.env.example).

## Layout

```
app/                 Next.js routes (public research, tools, guides, trust/legal, SEO routes, API, admin, preview)
src/config/          allowlisted config names, protected-file parser, runtime switches (all default off)
src/db/              SQLite client (WAL, FK, busy timeout, statement cache) and migration runner
src/domain/          evidence pipeline: policy, robots, safe fetcher, extraction, promotion, conflicts,
                     publication (draft → QA → atomic publish → read checks → rollback/retract), views,
                     comparisons, jobs, Ask, rates, SEO audit, assets/logos, regulators, backup, ops
src/ai/              versioned provider boundary, Codex CLI adapter, Kie stub (unavailable), receipts/reuse
src/calculators/     15 calculators (exact decimals) + server-only educational content
src/markets/         20 instruments, 8 currencies (typical, editable assumptions)
src/ui/              typed components and small client islands
migrations/          versioned SQL (schema + immutability triggers + reference data)
scripts/             CLI, secure launcher, secrets setup, verification (smoke, browser, Lighthouse, perf, crawl,
                     bundle, contrast, security), e2e fixture DB builder
workers/email/       Cloudflare Email Worker (separately deployed)
deploy/              Nginx and systemd service/timer templates
tests/               Vitest suites (temporary databases, injected providers/transports, no live calls)
reports/             measured verification results
```

## Verification scripts

```bash
pnpm tsx scripts/e2e-db.ts               # isolated fictional fixture DB for HTTP checks (never production)
pnpm tsx scripts/smoke.ts                # HTTP status/metadata/SSR/redirect/privacy checks → reports/smoke-report.md
pnpm tsx scripts/browser-check.ts        # Playwright + axe → reports/browser-report.md
CHROME_PATH=… pnpm tsx scripts/lighthouse-report.ts 3
pnpm tsx scripts/perf-report.ts 300 10   # concurrency-10 origin latency → reports/performance-report.md
pnpm tsx scripts/crawl-report.ts         # SEO audit rules over each sitemap → reports/crawl-report.md
pnpm tsx scripts/bundle-report.ts        # initial JS/CSS per route → reports/bundle-report.md
pnpm tsx scripts/contrast-check.ts       # design-token contrast → reports/contrast-report.md
```
