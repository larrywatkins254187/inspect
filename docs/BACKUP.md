# Backup, restore and rollback

## Recovery archive (FIPB1)

`pnpm cli backup [--upload] [--include-dependencies]` (daily timer `forexinspect-backup.timer`, 07:00 UTC,
≤10 min jitter, `Persistent=true` catch-up, CPU/IO limited):

1. Takes the **shared lock** (no overlapping refresh/publication/comparison/backup).
2. Requires ≥ 3 GiB free in `BACKUP_DIRECTORY`.
3. Captures a **consistent online SQLite backup** (better-sqlite3 backup API; includes committed WAL),
   the project tree including the build (excluding `node_modules`, `.next/cache`, verification builds,
   raw logs and synthetic DBs; `--include-dependencies` adds `node_modules`), licensed asset files,
   Nginx/systemd files if present, and the protected configuration file. AI account/session credentials
   (`~/.codex`) and the recovery key are never included.
4. Writes `manifest.json` (SHA-256 of every file and of the DB), tars, gzips and encrypts with
   **AES-256-GCM** in the `FIPB1` format: `"FIPB1" | version(1) | nonce(12) | ciphertext | tag(16)`; the
   header is authenticated (AAD).
5. **Verifies before any upload**: decrypts to a temporary directory (tag must verify), rejects absolute
   or `..` paths, checks every manifest hash, runs `PRAGMA integrity_check` and `foreign_key_check`.
6. With `--upload` **and** `BACKUP_TRANSPORT_APPROVED="true"` **and** Telegram enabled: splits above
   45 MiB into numbered parts and sends each through the local Bot API (`TELEGRAM_BOT_API_URL`, default
   `http://127.0.0.1:8081`) to the authorized group; writes `<archive>.receipt.json` (message ids, part
   SHA-256s, archive SHA-256). A failed upload writes `<archive>.upload-failed` and the archive is kept.
   Without upload the result says `LOCAL_ONLY` — that is **not** an off-host backup.
7. Retention: newest 7 local archives; archives with failed uploads are kept; nothing is deleted from Telegram.

Key handling: `pnpm cli backup-keygen /root/.forexinspect/backup.key` (refuses paths inside the project,
mode 0600, 64 hex chars). Keep an **offline root-only copy**; a lost key cannot be regenerated and archives
cannot be decrypted without it.

## Isolated restore

```bash
BACKUP_ENCRYPTION_KEY_FILE=/root/.forexinspect/backup.key pnpm cli restore <archive.fipb> /srv/restore-$(date +%F)
```

The target must be empty and must not contain the live database. The command decrypts, verifies hashes,
integrity and foreign keys, and extracts — it never touches the running service.

Controlled recovery (after a verified restore):

1. `systemctl stop forexinspect-web` and stop all `forexinspect-*.timer` units (writers stopped).
2. Back up the current database files (`forexinspect.sqlite`, `-wal`, `-shm`) to a dated directory.
3. Copy `<restore>/db/forexinspect.sqlite` to `DATABASE_PATH` (owner `forexinspect`, mode 0640); remove
   stale `-wal`/`-shm` of the replaced file.
4. If code is restored too, copy `<restore>/project/` to the release directory and run
   `pnpm install --frozen-lockfile && pnpm build` as the app user.
5. `pnpm migrate`, `systemctl start forexinspect-web`, check `/health`, a profile page and
   `pnpm cli public-report`; then re-enable timers.

Never replace a real production database with a development or fixture database to "roll back" code.

## Content rollback and retraction

- `pnpm cli rollback <page-path> <revision-id> --actor owner:<name>` creates a new revision from an earlier
  non-withdrawn published revision, re-runs QA against **current** evidence and publishes atomically; the
  revision it replaced becomes WITHDRAWN. Idempotent (repeating it is a no-op).
- `pnpm cli retract <page-path> --reason … --actor owner:<name>` hides a page immediately (404) and keeps it
  in history. Idempotent.
- `pnpm cli publication-log` lists runs and audit events.

## Code rollback

The live owner policy is direct editing with backups. Before risky edits copy the affected files (or the
whole release directory) to `/opt/forexinspect/backups/<date>/`; to roll back, restore the copy, rebuild as
the app user and `systemctl restart forexinspect-web`, then verify `/health` and affected pages. Where a
Git checkout exists, `git revert` is preferred.
