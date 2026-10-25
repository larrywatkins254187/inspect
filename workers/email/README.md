# ForexInspect contact Email Worker

Forwards every message (with attachments) to the verified owner mailbox (`DEST`) and posts a bounded
plain-text notification (sender, subject, short excerpt, attachment metadata) to the authorized Telegram
group (`TG_TOKEN`, `TG_CHAT`). Forwarding failures are reported and rethrown. Email content is untrusted:
it is never executed, published or treated as a correction. Not deployed by this repository; see
`wrangler.toml.example` for the external prerequisites. Parsing logic (`src/mime.ts`) is unit-tested from
the main project (`tests/email-worker.test.ts`).
