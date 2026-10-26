# Production readiness checklist

Everything that must happen before real users see this rebuild at https://forexinspect.com. Items are
in dependency order. ✅ = already done in this repository; everything else is open. Owner = you;
Agent = can be done by a Claude Code session once the prerequisites exist.

## 1. Data migration from the existing ForexInspect project (blocks most of the rest)

- [ ] Owner: give a session a **read-only copy** of the existing project, its SQLite database snapshot and
      its image/logo files (see `docs/MIGRATION_SESSION.md`). Never the live files.
- [ ] Agent: inventory the old schema, row counts, fact IDs/anchors, revisions, policies, assets.
- [ ] Agent: write an explicit adapter (`scripts/migrate-legacy.ts`) old → new schema, run it into a
      **new** database file, and produce `reports/migration-report.md` with count / relationship /
      fact-ID / `#fact-<id>` anchor / scope / policy / history / decimal checks.
- [ ] Agent: URL parity — every public URL of the old site returns the same page or a tested 308.
- [ ] Owner: review and approve the migration report and every mapping the agent flagged as ambiguous.
- [ ] Owner: decide what happens to facts whose evidence/policy has expired since export (they will not
      show until re-verified — this is correct behaviour, not a migration bug).

## 2. Owner decisions and records (cannot be delegated)

- [ ] Confirm the official domain of every broker to be published (`cli confirm-domain`).
- [ ] Review terms + robots and record a source policy for every source (`config/policy-template.json`,
      `cli policy`). Decide `terms_risk_accepted` per source.
- [ ] Approve or reject each logo: rights basis + current-brand review (`cli logo-review`).
- [ ] Confirm the operator wording on About/Contact/Privacy matches reality (who operates the site, which
      mailboxes exist). Optional: legal review of Privacy, Risk disclosure, Disclaimer.
- [ ] Decide the go-live switches: `PUBLICATION_ENABLED` now; `AUTO_PUBLICATION_ENABLED` later.

## 3. Accounts and credentials (owner creates; values go only into the protected file)

- [ ] Protected file `/etc/forexinspect/production.env` (root:forexinspect, 0640) built from
      `config/production.env.example`; install with `pnpm setup:secrets --import`.
- [ ] `ADMIN_TOKEN` (≥32 random chars), `SOURCE_USER_AGENT` with a real contact, `SITE_URL`.
- [ ] Codex CLI installed on the VPS and `codex login` as the `forexinspect` user; `CODEX_ENABLED`, `CODEX_MODEL`.
- [ ] Cloudflare Turnstile widget (hostname forexinspect.com, action `ask`) → `TURNSTILE_*`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
      (only if Ask is launched; also needs `CHAT_ENABLED`, `SECRETS_ROTATION_CONFIRMED`).
- [ ] Backup: `pnpm cli backup-keygen /root/.forexinspect/backup.key`, **offline copy of the key**,
      `BACKUP_DIRECTORY`; Telegram local Bot API + group (`TELEGRAM_*`) and `BACKUP_TRANSPORT_APPROVED`.
- [ ] Cloudflare Email Routing for support/corrections/privacy/security/abuse/postmaster + DMARC/TLS-RPT,
      verified owner mailbox, deploy `workers/email` with `DEST`, `TG_TOKEN`, `TG_CHAT`.
- [ ] Optional: GA4 (`ANALYTICS_ENABLED`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` — rebuild needed),
      Search Console OAuth (`GSC_*`), IndexNow (`INDEXNOW_*`), Cloudflare zone token, GoatCounter.
- [ ] Rotate any credential that was ever pasted into chat, a prompt or a log, then set
      `SECRETS_ROTATION_CONFIRMED="true"`.

## 4. Server (VPS)

- [ ] Node 24 LTS + pnpm 11.25.0; `forexinspect` system user; `/opt/forexinspect/{current,data,backups}`.
- [ ] Deploy the code **beside** the old one (e.g. `/opt/forexinspect/rebuild`), not over it.
- [ ] `pnpm install --frozen-lockfile && pnpm migrate && pnpm build` as the app user.
- [ ] Copy the **migrated** database (from step 1) to `DATABASE_PATH`; never the fixture DBs.
- [ ] Copy approved asset files to `ASSET_DIRECTORY` (default `data/assets`).
- [ ] Install `deploy/systemd/forexinspect-web.service` on a spare port first (e.g. 3418) for a staging check.
- [ ] Nginx: TLS certificates, Cloudflare real-IP include, `deploy/nginx/forexinspect.conf`; `nginx -t`.
- [ ] Disk ≥ 3 GiB free for backups; log rotation for Nginx/journal.

## 5. First real evidence (if migration did not bring valid current facts)

- [ ] For each pilot broker: `source` → `policy-discovery` → `policy` → `policy-review --live` →
      `extract --live` → `promote` → resolve `conflicts` → `public-report` → `publish` (RUNBOOK.md §2).
- [ ] At least the five pilot profiles pass their floors; check `/brokers/<slug>` and `/sources`.
- [ ] Logos approved for ≥2 eligible brokers before enabling comparisons.

## 6. Verification on the VPS (agent can run these)

- [ ] `pnpm check` and `pnpm build` green on the server.
- [ ] `pnpm tsx scripts/smoke.ts https://<staging-host> …` adapted to real slugs; `scripts/crawl-report.ts`.
- [ ] `scripts/perf-report.ts` on the VPS **behind Nginx** (target p95 ≤ 300 ms at concurrency 10) with real data volume.
- [ ] `scripts/lighthouse-report.ts` against real profile/fees/accounts/comparison pages.
- [ ] `scripts/browser-check.ts` against real pages; one **manual screen-reader pass** (VoiceOver or NVDA)
      on home, a profile, a calculator and the Ask dialog.
- [ ] Backup drill: `cli backup` → `cli restore` into an empty directory on the VPS → start a throwaway
      instance on that restored DB and open a profile. Then one approved `backup --upload`.
- [ ] Old-URL check: every URL from the old sitemap returns 200 or 308 to the right page.

## 7. Cut-over

- [ ] Backup old project and old database (and keep them unchanged for rollback).
- [ ] Freeze writes on the old site (stop its timers).
- [ ] Final incremental migration run if data changed since the rehearsal.
- [ ] Point Nginx upstream to the new service; `PUBLICATION_ENABLED="true"`; restart; check `/health`.
- [ ] Enable timers one at a time: monitor, maintenance, prices (`MARKET_RATES_ENABLED`), policy-review,
      backup, seo; later publish + compare after `AUTO_PUBLICATION_ENABLED`.
- [ ] Submit the sitemap in Search Console; watch 404s and Core Web Vitals (field data needs weeks).
- [ ] Rollback plan written and tested: switch Nginx upstream back to the old service (old DB untouched).

## 8. After launch

- [ ] Daily: `cli report` / `/admin` (expiring facts, conflicts, dead letters, blocked sources).
- [ ] Weekly: re-verification keeps facts inside their 7/30-day TTL; check `seo-report`.
- [ ] Monthly: restore drill; rotate `ADMIN_TOKEN` if shared; review alerts.
- [ ] Field Core Web Vitals (p75) once Search Console/CrUX has enough data.
