import type { DB } from '@/db/client';
import type { AppConfig } from '@/config/env';
import { audit } from '@/domain/audit';

export type Fetch = typeof fetch;

export interface IntegrationStatus {
  name: string;
  enabled: boolean;
  ready: boolean;
  missing: string[];
  note: string;
}

/** Presence/enablement only — credential presence never enables a service. */
export function integrationStatus(cfg: AppConfig): IntegrationStatus[] {
  const s = (name: string, enabled: boolean, req: [string, unknown][], note: string): IntegrationStatus => {
    const missing = req.filter(([, v]) => !v).map(([k]) => k);
    return { name, enabled, ready: enabled && missing.length === 0, missing, note };
  };
  return [
    s(
      'Codex CLI (AI)',
      cfg.codex.enabled,
      [['CODEX_MODEL', cfg.codex.model]],
      'Also needs `codex login` as the app user (external).',
    ),
    s(
      'Kie.ai (historical)',
      false,
      [['adapter', null]],
      'No adapter implemented; requires verified endpoint/model/terms.',
    ),
    s(
      'Ask',
      cfg.chat.enabled,
      [
        ['TURNSTILE_ENABLED', cfg.turnstile.enabled],
        ['CODEX_ENABLED', cfg.codex.enabled],
        ['SECRETS_ROTATION_CONFIRMED', cfg.secretsRotationConfirmed],
        ['PUBLICATION_ENABLED', cfg.publicationEnabled],
        ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', cfg.turnstile.siteKey],
        ['TURNSTILE_SECRET_KEY', cfg.turnstile.secret],
        ['TURNSTILE_HOSTNAME', cfg.turnstile.hostname],
      ],
      'All gates must pass or the UI hides and /api/ask returns 404.',
    ),
    s(
      'Telegram',
      cfg.telegram.enabled,
      [
        ['TELEGRAM_BOT_TOKEN', cfg.telegram.token],
        ['TELEGRAM_CHAT_ID', cfg.telegram.chatId],
        ['SECRETS_ROTATION_CONFIRMED', cfg.secretsRotationConfirmed],
      ],
      `Bot API at ${cfg.telegram.apiUrl}; group rights required.`,
    ),
    s(
      'Backup transport',
      cfg.backup.transportApproved,
      [
        ['BACKUP_ENCRYPTION_KEY_FILE', cfg.backup.keyFile],
        ['TELEGRAM_ENABLED', cfg.telegram.enabled],
      ],
      'Off-host upload uses the local Telegram Bot API.',
    ),
    s(
      'Search Console',
      cfg.gsc.enabled,
      [
        ['GSC_PROPERTY_ID', cfg.gsc.property],
        ['GOOGLE_SEARCH_CONSOLE_CLIENT_ID', cfg.gsc.clientId],
        ['GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET', cfg.gsc.clientSecret],
        ['GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN', cfg.gsc.refreshToken],
      ],
      'Verified property and OAuth consent are external.',
    ),
    s(
      'IndexNow',
      cfg.indexNow.enabled,
      [['INDEXNOW_KEY', cfg.indexNow.key]],
      'Key proof served at /indexnow-key.txt only when enabled.',
    ),
    s(
      'Cloudflare zone',
      cfg.cloudflare.enabled,
      [
        ['CLOUDFLARE_API_TOKEN', cfg.cloudflare.token],
        ['CLOUDFLARE_ZONE_ID', cfg.cloudflare.zoneId],
      ],
      'Read-only zone status.',
    ),
    s(
      'GoatCounter',
      cfg.goatCounter.enabled,
      [
        ['GOATCOUNTER_SITE', cfg.goatCounter.site],
        ['GOATCOUNTER_API_TOKEN', cfg.goatCounter.token],
      ],
      'Helper only; not loaded on public pages.',
    ),
    s(
      'GA4 analytics',
      cfg.analytics.enabled,
      [['NEXT_PUBLIC_GA_MEASUREMENT_ID', cfg.analytics.measurementId]],
      'Consent-gated; rebuild after changing.',
    ),
    s('ECB reference rates', cfg.marketRatesEnabled, [], 'No key; Frankfurter.'),
    s('FCA register', false, [['FCA_API_KEY + authorized terms', null]], 'Conditional; no adapter enabled.'),
  ];
}

const TG_MAX = 3500;

/** Bounded plain-text Telegram message. Never called by tests or merely because credentials exist. */
export async function telegramSend(
  cfg: AppConfig,
  text: string,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: boolean; status: number }> {
  if (!cfg.telegram.enabled || !cfg.telegram.token || !cfg.telegram.chatId || !cfg.secretsRotationConfirmed)
    return { ok: false, status: 0 };
  const res = await fetchImpl(`${cfg.telegram.apiUrl}/bot${cfg.telegram.token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: cfg.telegram.chatId,
      text: text.slice(0, TG_MAX),
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  return { ok: res.ok, status: res.status };
}

export async function telegramSendDocument(
  cfg: AppConfig,
  fileName: string,
  data: Buffer,
  caption: string,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: boolean; status: number; messageId: number | null }> {
  if (!cfg.telegram.enabled || !cfg.telegram.token || !cfg.telegram.chatId || !cfg.backup.transportApproved)
    return { ok: false, status: 0, messageId: null };
  const form = new FormData();
  form.set('chat_id', cfg.telegram.chatId);
  form.set('caption', caption.slice(0, 900));
  form.set('document', new Blob([new Uint8Array(data)]), fileName);
  const res = await fetchImpl(`${cfg.telegram.apiUrl}/bot${cfg.telegram.token}/sendDocument`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(600_000),
  });
  const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number } } | null;
  return { ok: res.ok && !!j?.ok, status: res.status, messageId: j?.result?.message_id ?? null };
}

/** Search Console: final aggregate daily metrics (clicks, impressions, CTR, position) by date only. */
export async function gscAggregate(
  db: DB,
  cfg: AppConfig,
  range: { start: string; end: string },
  now: Date,
  fetchImpl: Fetch = fetch,
): Promise<{ rows: number }> {
  const g = cfg.gsc;
  if (!g.enabled || !g.property || !g.clientId || !g.clientSecret || !g.refreshToken)
    throw new Error('Search Console not configured');
  const tok = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: g.clientId,
      client_secret: g.clientSecret,
      refresh_token: g.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tok.ok) throw new Error(`OAUTH_${tok.status}`);
  const access = ((await tok.json()) as { access_token?: string }).access_token;
  if (!access) throw new Error('OAUTH_NO_TOKEN');
  const res = await fetchImpl(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(g.property)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: range.start,
        endDate: range.end,
        dimensions: ['date'],
        dataState: 'final',
        rowLimit: 1000,
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) throw new Error(`GSC_${res.status}`);
  const rows =
    (
      (await res.json()) as {
        rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
      }
    ).rows ?? [];
  const up = db.prepare(
    `INSERT INTO seo_metrics (property, date, clicks, impressions, ctr, position, data_state, fetched_at) VALUES (?, ?, ?, ?, ?, ?, 'final', ?)
     ON CONFLICT(property, date) DO UPDATE SET clicks = excluded.clicks, impressions = excluded.impressions, ctr = excluded.ctr, position = excluded.position, fetched_at = excluded.fetched_at`,
  );
  db.transaction(() =>
    rows.forEach((r) =>
      up.run(
        g.property,
        r.keys[0],
        r.clicks,
        r.impressions,
        String(r.ctr),
        String(r.position),
        now.toISOString(),
      ),
    ),
  )();
  audit(db, {
    actor: 'cli:gsc',
    action: 'gsc.aggregate',
    subject: 'search-console',
    at: now,
    detail: { rows: rows.length },
  });
  return { rows: rows.length };
}

/** IndexNow submission for eligible changed URLs; requires the public key proof to match. */
export async function indexNowSubmit(
  cfg: AppConfig,
  urls: string[],
  fetchImpl: Fetch = fetch,
): Promise<{ status: number; submitted: number }> {
  if (!cfg.indexNow.enabled || !cfg.indexNow.key) throw new Error('IndexNow not configured');
  const keyLocation = `${cfg.siteUrl}/indexnow-key.txt`;
  const proof = await fetchImpl(keyLocation, { signal: AbortSignal.timeout(10_000) });
  if (!proof.ok || (await proof.text()).trim() !== cfg.indexNow.key)
    throw new Error('INDEXNOW_PROOF_MISMATCH');
  const host = new URL(cfg.siteUrl).host;
  const list = urls.filter((u) => new URL(u).host === host).slice(0, 10_000);
  const res = await fetchImpl('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: cfg.indexNow.key, keyLocation, urlList: list }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, submitted: list.length };
}

export async function cloudflareZoneStatus(
  cfg: AppConfig,
  fetchImpl: Fetch = fetch,
): Promise<{ status: string; name: string }> {
  if (!cfg.cloudflare.enabled || !cfg.cloudflare.token || !cfg.cloudflare.zoneId)
    throw new Error('Cloudflare not configured');
  const res = await fetchImpl(
    `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cfg.cloudflare.zoneId)}`,
    { headers: { authorization: `Bearer ${cfg.cloudflare.token}` }, signal: AbortSignal.timeout(15_000) },
  );
  const j = (await res.json()) as { success?: boolean; result?: { status: string; name: string } };
  if (!j.success || !j.result) throw new Error(`CLOUDFLARE_${res.status}`);
  return { status: j.result.status, name: j.result.name };
}

export async function goatCounterTotal(
  cfg: AppConfig,
  range: { start: string; end: string },
  fetchImpl: Fetch = fetch,
): Promise<{ total: number }> {
  const g = cfg.goatCounter;
  if (!g.enabled || !g.site || !g.token) throw new Error('GoatCounter not configured');
  const res = await fetchImpl(
    `https://${encodeURIComponent(g.site)}.goatcounter.com/api/v0/stats/total?start=${range.start}&end=${range.end}`,
    { headers: { authorization: `Bearer ${g.token}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`GOATCOUNTER_${res.status}`);
  return { total: ((await res.json()) as { total?: number }).total ?? 0 };
}
