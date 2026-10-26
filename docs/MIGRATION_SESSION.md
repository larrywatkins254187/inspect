# Running the migration in a new Claude Code session

Goal: put the **existing ForexInspect project** (code + SQLite data + images) and **this rebuild** side by
side, and let an agent build and rehearse the data migration — without touching the live site.

## Where to run it

**Recommended: Claude Code on the VPS (or your own computer), not a cloud session.** The old database and
images are usually not in Git and may be large or private; a local session can read them directly and
nothing leaves your machine. Use a cloud session only if the old project *and* its data are in a GitHub
repository you are happy to clone into a cloud container.

### Option A — VPS or local machine (recommended)

```bash
# 1. Workspace with both projects side by side
mkdir -p ~/fi-migration && cd ~/fi-migration
git clone -b claude/forexinspect-implementation-xftik7 https://github.com/larrywatkins254187/inspect.git new

# 2. Read-only COPY of the old project (adjust paths; exclude dependencies, builds and secrets)
rsync -a --exclude node_modules --exclude .next --exclude '*.env' --exclude '.env*' \
  /opt/forexinspect/current/ old/

# 3. Consistent snapshot of the old database (works while the site runs; never copy the live file directly)
mkdir -p old-data
sqlite3 /opt/forexinspect/current/data/forexinspect.sqlite ".backup 'old-data/legacy.sqlite'"
#   (use the real path of the old DB; if it is PostgreSQL/MySQL, put a dump file in old-data/ instead)

# 4. Images/logos (wherever the old project keeps them)
rsync -a /opt/forexinspect/current/public/broker-logos/ old-data/images/   # adjust

# 5. Make the old side read-only so nothing can modify it
chmod -R a-w old old-data

# 6. Toolchain for the new project: Node 24 LTS + pnpm 11.25.0
cd new && corepack enable && corepack prepare pnpm@11.25.0 --activate && pnpm install && cd ..

# 7. Start Claude Code in the PARENT folder so it sees both
cd ~/fi-migration && claude
```

Do **not** copy `/etc/forexinspect/production.env` or any `.env` into the workspace. The migration does
not need credentials.

### Option B — cloud session (claude.ai/code)

1. Make sure the GitHub app has access to both repositories (https://claude.ai/connect-github).
2. Start a new session with **both** repositories selected (`inspect` and the old project).
3. Put the database snapshot and images where the session can reach them: commit them to a private
   branch of the old repository (Git LFS for large files) or upload them in the chat. Remove them
   afterwards if they are sensitive.
4. Paste the prompt below, replacing the paths with `/home/user/<old-repo>` etc.

## Prompt to paste

```text
You are migrating ForexInspect data from an existing project into the rebuild. Work in this workspace:
- new/       the rebuild (Next.js 16, SQLite, versioned migrations). Read new/AGENTS.md, STATUS.md,
             PARITY.md, PLAN.md, RUNBOOK.md, docs/PRODUCTION_READINESS.md and migrations/*.sql first.
- old/       READ-ONLY copy of the existing project's code (schema, routes, import scripts).
- old-data/  READ-ONLY database snapshot (legacy.sqlite or a dump) and images/.

Hard rules
- Never modify old/ or old-data/. Never connect to or write the live production database or server.
- Never print, copy or commit secret values. Ignore any credentials you find in the old code.
- Do not publish, enable integrations, call AI providers, send Telegram messages or fetch broker sites.
- Do not invent data. Anything that cannot be mapped exactly is reported, not guessed.
- The new evidence rules stay in force: brand/entity/registration/licence separate; missing = Not
  verified; exact decimal strings with scope; observations immutable; read-time expiry/policy checks.
- Fixtures must never enter the migrated database.

Tasks
1. Inventory: list old tables, columns, row counts, foreign keys, fact/observation/revision IDs, public
   URL patterns and `#fact-<id>` anchors, source policies, assets (files, hashes, provenance, approval
   state). Write reports/legacy-inventory.md in new/.
2. Mapping: write docs/MIGRATION_MAPPING.md (old table/column → new table/column, transformations,
   what is dropped and why). Mark every ambiguous mapping as OWNER DECISION and stop to ask me before
   implementing those parts.
3. Adapter: implement new/scripts/migrate-legacy.ts that reads the old snapshot read-only and writes a
   NEW database file (default new/data/migrated.sqlite) created by `pnpm migrate`. It must be idempotent,
   transactional per entity group, and preserve original IDs wherever the new schema allows so fact
   anchors and URLs stay stable. Keep provenance (old IDs, import hash, time) for every row. If the new
   schema needs extra columns or tables, add a new versioned migration (0003_...) — never edit 0001/0002.
4. Assets: copy images into new/data/assets with SHA-256, size, source and the old approval/rights state.
   Do not approve anything the old project had not approved with recorded rights.
5. Verification: write new/tests/migration.test.ts plus reports/migration-report.md comparing old vs new:
   counts per table, relationship integrity, fact IDs, anchors, scope keys, decimal values (string-exact),
   policy states, revision/history order, publication/material dates, asset hashes. Every check shows the
   numbers; failures are listed, not hidden.
6. URL parity: extract every public URL from the old sitemap/routes; for each, the rebuild must serve the
   same path or a permanent 308 to the equivalent. Add tested redirects where needed. Report in
   reports/url-parity.md.
7. Rehearsal: start the rebuild on 127.0.0.1:3418 with DATABASE_PATH=data/migrated.sqlite and
   PUBLICATION_ENABLED=true (local only), run scripts/smoke.ts adapted to real slugs, crawl-report,
   browser-check and perf-report against it, and record results. Explain any page that 404s (expired
   evidence, lapsed policy, conflicts) — do not weaken the checks to make it pass.
8. Write docs/CUTOVER.md: exact steps, backup of old site and DB, freeze, final re-run, switch, rollback.
9. Run `pnpm check` and `pnpm build`, commit on a new branch `migration/legacy-data` in new/, push, and
   finish with: what migrated, what failed, what needs my decision, and the remaining items from
   docs/PRODUCTION_READINESS.md.
```

## After the session

- Review `reports/migration-report.md`, `docs/MIGRATION_MAPPING.md` and every OWNER DECISION.
- Copy `data/migrated.sqlite` and `data/assets/` to the server only after approval, then continue with
  `docs/PRODUCTION_READINESS.md` §4–§7.
