# Plan

Short implementation plan for the ForexInspect rebuild (fresh repository; no production checkout or
protected configuration was supplied, so this is a separate rebuild on loopback port 3417).

## Decisions

1. **Stack** — Node 24 LTS, pnpm 11.25.0, Next 16.4.2 App Router, React 19.3, strict TypeScript 5.9, SQLite
   WAL via better-sqlite3, Zod, decimal.js. Versions were checked against the npm registry and the
   version-matched docs bundled in `node_modules/next/dist/docs`; all pinned by `pnpm-lock.yaml`.
2. **Schema** — hand-written versioned SQL migrations are the source of truth (CHECK constraints, partial
   unique indexes, immutability triggers for observations/confirmations/revisions/page facts, an audited
   owner-reopen guard for blocked sources). Drizzle is used for typed operational reads with a drift test.
3. **Evidence model** — observations are immutable; `verified_facts` is the accepted pointer whose id is
   the public fact ID; renewals create successor facts linked by `superseded_by`, so date-only
   re-verification never becomes a material change. Pages are immutable snapshots that cite fact IDs and
   are re-filtered at every read (expiry, withdrawal, conflict, policy, drop, publication switch).
4. **AI boundary** — `AiProvider` interface; Codex CLI adapter (`codex exec --ephemeral --sandbox
   read-only --output-schema`); Kie stub permanently unavailable; receipts give no-op reuse. Models never
   write facts, entities or licences, and never author broker prose (comparison plans pick topic order and
   accepted fact IDs only; Ask verified text is rendered deterministically from cited facts).
5. **Rendering** — evidence pages render per request with `connection()` + request-scoped memoization
   (`React.cache` + a WeakMap keyed by the per-request read options). Tools, guides and trust pages are
   prerendered. No shared HTML cache (the removed RAM cache stays removed).
6. **Tools/guides independence** — calculators and guides are available regardless of broker
   publication; broker surfaces show a truthful preparation state while publication is off.
7. **Verification without real data** — the vertical slice runs through the real pipeline with fictional
   fixtures in tests and in an isolated `data/e2e.sqlite` instance; fixtures never enter the main DB.

## Slices (all done; see STATUS.md for evidence)

- [x] Foundation: config allowlist/secure loader, migrations, light-blue shell, commands
- [x] Vertical slice: approved source → two-pass extraction → promotion → QA → atomic publish → read checks → rollback
- [x] Parity: directory/finder, profiles, fees/accounts, comparisons + image, 15 tools, 20 instruments, guides, trust pages, Ask, rates
- [x] Operations: jobs/locks, CLI, imports, register matching, assets/logos, SEO audit, integrations (gated), backup/restore, Email Worker, deploy templates
- [x] Optimization: measured memoization/statement/hash caches; bundle, Lighthouse, latency, a11y, contrast
- [x] Handoff: README, PARITY, DESIGN, RUNBOOK, BACKUP, STATUS, reports

## Next (blocked on owner inputs — see STATUS.md)

Owner policy review for the five pilot sources → `codex login` → first live extraction/promotion → manual
publish with `PUBLICATION_ENABLED` → logo approvals → enable timers one by one.
