# Status — 25 October 2026

## Summary

A fresh, working rebuild of ForexInspect (no prior checkout, database, protected configuration or
licensed assets were supplied). The safe base is running on the authorized local target
**http://127.0.0.1:3417** (loopback inside this cloud container; not publicly reachable) with
publication, automatic publication and every integration **off**. All 15 calculators, four guides and all
trust/legal pages are live there; broker research truthfully shows its preparation state. The full
evidence → page pipeline is implemented and verified end to end with fictional fixtures (tests and an
isolated `data/e2e.sqlite` instance on :3418); **no real broker fact has been accepted**, because that
needs owner policy decisions and a Codex login (see Blockers).

Environment: 4 vCPU / 15 GiB, Linux 6.18, Node 24.21.0 (installed at `/opt/node24`; the image's default
Node 22 is not used), pnpm 11.25.0.

## Verified (commands actually run, results in `reports/`)

| Area | Result |
| --- | --- |
| `pnpm install` / `pnpm migrate` / `pnpm seed` | ✅ lockfile install; migrations 0001–0002 applied; seed imported 30 unverified candidates + 5 leads, re-run reports `ALREADY_IMPORTED`; 0 facts |
| `pnpm check` | ✅ Prettier, ESLint (0 problems), `tsc --noEmit` strict, **77 Vitest tests / 7 files**, security scan OK |
| `pnpm build` / `pnpm start` / `pnpm dev` | ✅ production build (46 prerendered pages, evidence routes dynamic); start via secure launcher on 127.0.0.1:3417; dev server start verified |
| `/health` | ✅ `{"status":"ok","db":"ok","schema":2,"publication":"off","autoPublication":"off"}`, `no-store` |
| HTTP smoke (`scripts/smoke.ts`) | ✅ **555/555**: real 200/308/404, noindex 404s, canonical HTTPS self-links, one h1, main before footer, JSON-LD parses (no rating schema), security headers, private routes 404/noindex/no-store, bearer + cookie admin auth, CSRF rejection, fixture isolation, sitemap/robots/llms |
| Browser (`scripts/browser-check.ts`) | ✅ **155/155**: no horizontal overflow at 320/375/768/1024/1440 px and 200 % zoom on 14 templates; axe-core: no serious/critical violations; skip link, menu Escape + focus restore, calculator errors/no stale result/reset/explicit ECB rate, finder, mocked Ask dialog flow, consent (no Google request before consent), reduced motion, no-JS rendering |
| Lighthouse mobile, median of 3 | ✅ 11 templates: performance **97–99**, accessibility **100**, SEO **100**, best practices **100**; LCP 1.74–2.48 s (lab), CLS 0.000, TBT ≤131 ms |
| Origin latency, concurrency 10 | ✅ p95 **≤252 ms** on all templates (profile 252, sitemap 209, static pages ≤32); before the memoization fix profile p95 was 374 ms and sitemap 445 ms |
| Bundles (gzip, initial) | ✅ research templates 137.8–143.3 KiB (budget 150), interactive home/tools 141.5–159.9 KiB (budget 200), CSS 4.8 KiB, initial transfer 220–265 KiB |
| SEO crawl (`scripts/crawl-report.ts`) | ✅ 74 sitemap URLs across both instances, **0 errors, 0 broken internal links** (4 title-length heuristics on long fictional fixture names) |
| Contrast | ✅ 22/22 token pairs pass (lowest text 5.34:1) |
| Reference rates | ✅ one operator-authorized live refresh from `api.frankfurter.dev` (ECB date 2026-10-23, 14 rows); default remains off |
| Backup | ✅ `backup-keygen` → `backup` (8.2 MB FIPB1, 1 483 files, verified) → isolated `restore` verified; **local only, not off-host** |
| Docs checked | Next.js 16.4.2 bundled docs (route config, `connection()`, `notFound`/streaming status, `permanentRedirect`, proxy, metadata); Cloudflare Turnstile siteverify; Frankfurter v2; Codex `exec` flags; Search Console `searchAnalytics.query`; IndexNow; Google AI-features (“no additional requirements… no AI text files”), Core Web Vitals, FAQ rich-result limits |

## Externally blocked (precise prerequisites)

| Capability | Missing configuration names | Owner/account actions |
| --- | --- | --- |
| Protected configuration | file `/etc/forexinspect/production.env` (or `FOREXINSPECT_SECRETS_FILE`) is absent | supply it; `pnpm setup:secrets --import <file>` installs it without printing values |
| First real evidence page | `PUBLICATION_ENABLED`, `SOURCE_USER_AGENT`, `CODEX_ENABLED`, `CODEX_MODEL` | confirm official domains; owner-review terms/robots for the 5 pilot sources (`config/policy-template.json`); install Codex CLI and `codex login` as the app user (no `codex` binary in this container) |
| Scheduled publication + comparisons | `AUTO_PUBLICATION_ENABLED` | approve original logos (rights + current-brand review) for ≥2 eligible brokers |
| Ask | `CHAT_ENABLED`, `TURNSTILE_ENABLED`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAME`, `SECRETS_ROTATION_CONFIRMED` (+ Codex) | register a Turnstile widget for the hostname with action `ask` |
| Admin UI | `ADMIN_TOKEN` (≥32 chars) | — |
| Analytics (build-time) | `ANALYTICS_ENABLED`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` | GA4 property; GA loading after consent is only possible on the production HTTPS host (not verifiable here) |
| Telegram summaries / backup upload | `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `BACKUP_ENCRYPTION_KEY_FILE`, `BACKUP_TRANSPORT_APPROVED` | local Bot API server at 127.0.0.1:8081 and group rights; offline copy of the recovery key |
| Search Console / IndexNow / Cloudflare / GoatCounter | `GSC_ENABLED`, `GSC_PROPERTY_ID`, `GOOGLE_SEARCH_CONSOLE_CLIENT_ID`, `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET`, `GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN`; `INDEXNOW_ENABLED`, `INDEXNOW_KEY`; `CLOUDFLARE_ENABLED`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`; `GOATCOUNTER_ENABLED`, `GOATCOUNTER_SITE`, `GOATCOUNTER_API_TOKEN` | verified property/OAuth, zone access |
| Contact Email Worker | Worker bindings `DEST`, `TG_TOKEN`, `TG_CHAT` | Cloudflare Email Routing for the aliases, verified destination mailbox, `wrangler deploy` |
| Reference-rate timer | `MARKET_RATES_ENABLED` | enable `forexinspect-prices.timer` |
| FCA register | `FCA_API_KEY` | authorized API terms; adapter not implemented (conditional) |
| Kie.ai | `KIE_ENABLED`, `KIE_API_KEY` | verified official endpoint/model/terms — adapter intentionally not implemented |
| VPS deployment | `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY_PATH`, `VPS_SSH_HOST_FINGERPRINT` | no SSH access from this session; install `deploy/` templates and run the runbook |
| Original data | — | original 119-row candidate import, 103-field workbook, remaining 13 starter leads, accepted-fact DB export, source permissions, licensed logo files, historical revisions (none fabricated) |

## Known limitations / deviations

- Field Core Web Vitals (p75) cannot be claimed: only lab Lighthouse and loopback latency were measured,
  on this sandbox rather than the production VPS behind Nginx/TLS.
- Manual screen-reader testing was not performed (automated axe + keyboard checks only).
- Analytics enablement is build-time (static shell); changing it needs a rebuild.
- `seo-fix` code mutation stays disabled: no `SEO_FIX_ENABLED` and the target may lack a clean Git
  worktree/rollback path; read-only crawl/check/report works.
- The comparison worker, Ask and extraction use the Codex adapter, which was exercised only through
  injected test providers (no account login here).
- Drizzle is used for typed operational reads; evidence write paths use hand-written parameterized SQL by
  design (transactions, fencing, triggers).
