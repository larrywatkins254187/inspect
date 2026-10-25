# Runbook

Operator procedures for the ForexInspect rebuild. All decisions are recorded with `--actor owner:<name>`
and an audit event. Never paste secret values into commands, prompts or tickets.

## 1. Host setup (VPS, as root)

```bash
useradd --system --home /opt/forexinspect --shell /usr/sbin/nologin forexinspect
install -d -o forexinspect -g forexinspect /opt/forexinspect/{current,data,backups}
install -d -m 0750 -o root -g forexinspect /etc/forexinspect
# copy the repository to /opt/forexinspect/current (owner forexinspect), then as forexinspect:
pnpm install --frozen-lockfile
# protected configuration: install an existing protected file without printing values
FOREXINSPECT_SECRETS_FILE=/etc/forexinspect/production.env pnpm setup:secrets --import /root/prepared.env
chown root:forexinspect /etc/forexinspect/production.env && chmod 0640 /etc/forexinspect/production.env
pnpm secrets:check            # names present/missing, format and permission problems only
pnpm migrate && pnpm seed && pnpm build
```

Install Nginx/systemd from `deploy/` (see `deploy/README.md`) and `systemctl enable --now forexinspect-web`.
Check `curl -s https://forexinspect.com/health` → `{"status":"ok","publication":"off",…}`.

## 2. First real evidence page (pilot broker)

1. **Confirm the official domain** (owner identity check, not automatic):
   `pnpm cli confirm-domain pepperstone pepperstone.com --actor owner:<you>`
2. **Register the exact source** (leads are unverified until this):
   `pnpm cli source pepperstone https://pepperstone.com/en/trading/trading-accounts --actor owner:<you>`
3. **Record discovery**: `pnpm cli policy-discovery <source-id> --note "terms reviewed 2026-10-26"`
4. **Owner policy review** — copy `config/policy-template.json`, fill it from the site’s terms and robots,
   set `terms_risk_accepted` only if you accept the terms risk for fact-reference use, then
   `pnpm cli policy <source-id> reviewed.json --actor owner:<you>` (or `owner-file-policy … --sha256 <hash>`).
5. **Technical review** (robots < 1 day old): `pnpm cli policy-review --live` → source `APPROVED`.
   Robots disallow, 401/403 or a challenge block the source; only `reopen-source --actor owner:…` reopens.
6. **Model login** (as the `forexinspect` user): `codex login`; set `CODEX_ENABLED="true"` and
   `CODEX_MODEL` in the protected file.
7. **Extract** (fetch + passes A, B and operator): `pnpm cli extract <source-id> --live` → document id.
8. **Promote**: `pnpm cli promote <document-id>`; inspect `pnpm cli conflicts`, resolve with
   `resolve-conflict <id> OWNER_SELECTED_A|OWNER_SELECTED_B|EQUIVALENT|BOTH_REJECTED --note … --actor owner:…`.
9. **Readiness**: `pnpm cli public-report` and `pnpm cli coverage-report`.
10. **Publish**: `pnpm cli publish pepperstone --actor owner:<you>` (draft → QA → atomic publish).
11. **Serve**: set `PUBLICATION_ENABLED="true"`, `systemctl restart forexinspect-web`, verify the profile,
    `/sitemap.xml` (only indexable pages) and `/sources`.

Corrections: `reject-fact`, `reject-observation`, `withdraw-fact` (all keep history); pages update on the
next request. List a resolved correction publicly (no reporter details): `pnpm cli correction <page-path> --summary "…" --received-at <iso> --actor owner:…`.

## 3. Logos (needed for comparisons and share images)

`pnpm cli logo-policy <slug> <official-logo-url> --actor owner:…` → `pnpm cli logo-enqueue` →
`pnpm cli logo-run --live` (bounded) → `pnpm cli logo-import <slug> <file> --source-url … --retrieved-at …` →
`pnpm cli logo-review <slug>-logo.webp APPROVE --rights NOMINATIVE_OFFICIAL_MARK --brand-reviewed --notes … --actor owner:…`.
Removal requests: `logo-review <file> REMOVE`. Audit: `/admin/assets` or `pnpm cli logo-report`.

## 4. Switches and integrations (each off by default)

| Feature | Settings | Notes |
| --- | --- | --- |
| Serve published pages | `PUBLICATION_ENABLED` | does not publish by itself |
| Scheduled publication + comparisons | `AUTO_PUBLICATION_ENABLED` | mass-retraction guard: >2 pages or >25 % aborts |
| Ask | `CHAT_ENABLED`, `TURNSTILE_ENABLED`, site key, secret, `TURNSTILE_HOSTNAME`, `CODEX_*`, `SECRETS_ROTATION_CONFIRMED`, publication | runtime; restart web |
| Analytics | `ANALYTICS_ENABLED`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` | **build-time**: rebuild + restart |
| Reference rates | `MARKET_RATES_ENABLED` | then enable `forexinspect-prices.timer` |
| Telegram summaries | `TELEGRAM_*`, rotation confirmed | `pnpm cli health-summary --send` (never sent automatically or as a test) |
| Backup upload | `BACKUP_ENCRYPTION_KEY_FILE`, `BACKUP_TRANSPORT_APPROVED`, Telegram | see docs/BACKUP.md |
| Search Console | `GSC_*` | `pnpm cli gsc-aggregate` (final daily aggregates only) |
| IndexNow | `INDEXNOW_ENABLED`, `INDEXNOW_KEY` | proof at `/indexnow-key.txt` |
| Admin UI | `ADMIN_TOKEN` (≥32 chars) | `/admin/login`; unauthorized → 404 |

`pnpm cli integrations` shows enabled/ready/missing per integration without values.

## 5. Daily operations

- `pnpm cli report` / `/admin`: pilot blockers, sources by state, facts expiring in 24 h, conflicts, dead letters.
- `pnpm cli monitor` (hourly timer) raises/resolves deduplicated alerts.
- `pnpm cli maintenance` (daily): Ask 30-day purge, run-log pruning, WAL checkpoint.
- `pnpm cli seo-crawl --origin http://127.0.0.1:3417` then `pnpm cli seo-report`. `seo-fix` stays blocked
  until `SEO_FIX_ENABLED` and a clean Git worktree (rollback path) exist.

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| Page 404 that used to work | `pnpm cli public-report` — facts expired (7/30-day TTL), conflict opened, policy lapsed (7 days without renewal), source blocked, broker dropped, or `PUBLICATION_ENABLED` off |
| `extract` says `SKIPPED_POLICY` | reasons list (e.g. `ROBOTS_EVIDENCE_STALE` → run `policy-review --live`) |
| `HOST_LIMIT` | spacing (10 s), daily budget (40), circuit (3 failures → 6 h), Retry-After; `pnpm cli wait-host <host>` |
| Ask hidden | `pnpm cli integrations` lists the missing gate names |
| `/health` 503 | database not migrated (`pnpm migrate`) or unreadable path |
