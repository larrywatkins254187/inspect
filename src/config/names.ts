/**
 * Allowlisted configuration names, grouped as in PRD §19. Values never live in
 * this repository. `public` names may reach browser code; everything else is a
 * server secret or server-only switch.
 */
export interface ConfigName {
  name: string;
  group: string;
  secret: boolean;
  public?: boolean;
  format?: 'boolean' | 'integer' | 'path' | 'url' | 'hostname' | 'text' | 'token';
  description: string;
}

export const CONFIG_NAMES: readonly ConfigName[] = [
  // Core
  {
    name: 'DATABASE_PATH',
    group: 'Core',
    secret: false,
    format: 'path',
    description: 'SQLite database file (WAL).',
  },
  {
    name: 'APP_ENV',
    group: 'Core',
    secret: false,
    format: 'text',
    description: 'development | test | production',
  },
  {
    name: 'SITE_URL',
    group: 'Core',
    secret: false,
    format: 'url',
    description: 'Canonical HTTPS origin, default https://forexinspect.com',
  },
  {
    name: 'ADMIN_TOKEN',
    group: 'Core',
    secret: true,
    format: 'token',
    description: 'Admin login token (≥32 chars).',
  },
  {
    name: 'SOURCE_USER_AGENT',
    group: 'Core',
    secret: false,
    format: 'text',
    description: 'Honest fetcher user agent with contact.',
  },
  {
    name: 'DEPLOYMENT_REGION',
    group: 'Core',
    secret: false,
    format: 'text',
    description: 'Deployment label for safe summaries.',
  },
  {
    name: 'DEPLOYMENT_VPS_ID',
    group: 'Core',
    secret: false,
    format: 'text',
    description: 'Deployment label for safe summaries.',
  },
  {
    name: 'PUBLICATION_ENABLED',
    group: 'Core',
    secret: false,
    format: 'boolean',
    description: 'Serve eligible published snapshots. Default false.',
  },
  {
    name: 'AUTO_PUBLICATION_ENABLED',
    group: 'Core',
    secret: false,
    format: 'boolean',
    description: 'Allow scheduled publication. Default false.',
  },
  // Authorization
  {
    name: 'SECRETS_ROTATION_CONFIRMED',
    group: 'Authorization',
    secret: false,
    format: 'boolean',
    description: 'Owner confirms credentials were rotated after any exposure.',
  },
  // AI
  {
    name: 'CODEX_ENABLED',
    group: 'AI',
    secret: false,
    format: 'boolean',
    description: 'Enable local Codex CLI adapter.',
  },
  {
    name: 'CODEX_MODEL',
    group: 'AI',
    secret: false,
    format: 'text',
    description: 'Model name passed to codex exec -m.',
  },
  {
    name: 'CODEX_BIN',
    group: 'AI',
    secret: false,
    format: 'path',
    description: 'Optional codex binary override.',
  },
  {
    name: 'KIE_ENABLED',
    group: 'AI (historical)',
    secret: false,
    format: 'boolean',
    description: 'Historical; no Kie adapter is implemented.',
  },
  {
    name: 'KIE_API_KEY',
    group: 'AI (historical)',
    secret: true,
    format: 'token',
    description: 'Historical; unused until a verified adapter exists.',
  },
  {
    name: 'AI_DAILY_SPEND_CAP',
    group: 'AI (historical)',
    secret: false,
    format: 'integer',
    description: 'Historical Kie spend cap; unused.',
  },
  // Ask
  {
    name: 'CHAT_ENABLED',
    group: 'Ask',
    secret: false,
    format: 'boolean',
    description: 'Enable Ask ForexInspect.',
  },
  {
    name: 'CHAT_DAILY_CREDIT_CAP',
    group: 'Ask',
    secret: false,
    format: 'integer',
    description: 'Daily answered-question cap, default 50.',
  },
  // Turnstile
  {
    name: 'TURNSTILE_ENABLED',
    group: 'Turnstile',
    secret: false,
    format: 'boolean',
    description: 'Enable Turnstile verification.',
  },
  {
    name: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    group: 'Turnstile',
    secret: false,
    public: true,
    format: 'token',
    description: 'Public site key (read at runtime).',
  },
  {
    name: 'TURNSTILE_SECRET_KEY',
    group: 'Turnstile',
    secret: true,
    format: 'token',
    description: 'Siteverify secret.',
  },
  {
    name: 'TURNSTILE_HOSTNAME',
    group: 'Turnstile',
    secret: false,
    format: 'hostname',
    description: 'Exact hostname expected in siteverify.',
  },
  // Cloudflare
  {
    name: 'CLOUDFLARE_ENABLED',
    group: 'Cloudflare',
    secret: false,
    format: 'boolean',
    description: 'Enable zone status helper.',
  },
  {
    name: 'CLOUDFLARE_API_TOKEN',
    group: 'Cloudflare',
    secret: true,
    format: 'token',
    description: 'Scoped zone read token.',
  },
  {
    name: 'CLOUDFLARE_ZONE_ID',
    group: 'Cloudflare',
    secret: false,
    format: 'token',
    description: 'Authorized zone id.',
  },
  // Telegram
  {
    name: 'TELEGRAM_ENABLED',
    group: 'Telegram',
    secret: false,
    format: 'boolean',
    description: 'Enable safe summaries/backup upload.',
  },
  { name: 'TELEGRAM_BOT_TOKEN', group: 'Telegram', secret: true, format: 'token', description: 'Bot token.' },
  {
    name: 'TELEGRAM_CHAT_ID',
    group: 'Telegram',
    secret: false,
    format: 'text',
    description: 'Authorized group id.',
  },
  {
    name: 'TELEGRAM_API_ID',
    group: 'Telegram',
    secret: true,
    format: 'text',
    description: 'Local Bot API server infrastructure only.',
  },
  {
    name: 'TELEGRAM_API_HASH',
    group: 'Telegram',
    secret: true,
    format: 'token',
    description: 'Local Bot API server infrastructure only.',
  },
  {
    name: 'TELEGRAM_BOT_API_URL',
    group: 'Telegram',
    secret: false,
    format: 'url',
    description: 'Default http://127.0.0.1:8081',
  },
  // Backup
  {
    name: 'BACKUP_ENCRYPTION_KEY_FILE',
    group: 'Backup',
    secret: false,
    format: 'path',
    description: '32-byte key file, root-only.',
  },
  {
    name: 'BACKUP_DIRECTORY',
    group: 'Backup',
    secret: false,
    format: 'path',
    description: 'Local archive directory.',
  },
  {
    name: 'BACKUP_TRANSPORT_APPROVED',
    group: 'Backup',
    secret: false,
    format: 'boolean',
    description: 'Owner approved off-host Telegram transport.',
  },
  // Search Console
  {
    name: 'GSC_ENABLED',
    group: 'Search Console',
    secret: false,
    format: 'boolean',
    description: 'Enable aggregate metrics helper.',
  },
  {
    name: 'GSC_PROPERTY_ID',
    group: 'Search Console',
    secret: false,
    format: 'text',
    description: 'e.g. sc-domain:forexinspect.com',
  },
  {
    name: 'GOOGLE_SEARCH_CONSOLE_CLIENT_ID',
    group: 'Search Console',
    secret: true,
    format: 'token',
    description: 'OAuth client id.',
  },
  {
    name: 'GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET',
    group: 'Search Console',
    secret: true,
    format: 'token',
    description: 'OAuth client secret.',
  },
  {
    name: 'GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN',
    group: 'Search Console',
    secret: true,
    format: 'token',
    description: 'OAuth refresh token.',
  },
  // IndexNow
  {
    name: 'INDEXNOW_ENABLED',
    group: 'IndexNow',
    secret: false,
    format: 'boolean',
    description: 'Enable IndexNow submissions.',
  },
  {
    name: 'INDEXNOW_KEY',
    group: 'IndexNow',
    secret: false,
    format: 'token',
    description: 'Key; must match public proof file.',
  },
  // GoatCounter
  {
    name: 'GOATCOUNTER_ENABLED',
    group: 'GoatCounter',
    secret: false,
    format: 'boolean',
    description: 'Enable GoatCounter helper.',
  },
  {
    name: 'GOATCOUNTER_SITE',
    group: 'GoatCounter',
    secret: false,
    format: 'text',
    description: 'GoatCounter site code.',
  },
  {
    name: 'GOATCOUNTER_API_TOKEN',
    group: 'GoatCounter',
    secret: true,
    format: 'token',
    description: 'API token.',
  },
  {
    name: 'GOATCOUNTER_PASSWORD',
    group: 'GoatCounter',
    secret: true,
    format: 'token',
    description: 'Legacy, unused by runtime helper.',
  },
  // FCA
  {
    name: 'FCA_API_KEY',
    group: 'FCA',
    secret: true,
    format: 'token',
    description: 'Requires authorized API usage terms.',
  },
  {
    name: 'FCA_API_EMAIL',
    group: 'FCA',
    secret: true,
    format: 'text',
    description: 'Account email paired with FCA key.',
  },
  // Host
  { name: 'VPS_HOST', group: 'Host', secret: false, format: 'hostname', description: 'Operator SSH host.' },
  { name: 'VPS_PORT', group: 'Host', secret: false, format: 'integer', description: 'SSH port.' },
  { name: 'VPS_USER', group: 'Host', secret: false, format: 'text', description: 'SSH user.' },
  {
    name: 'VPS_SSH_PRIVATE_KEY_PATH',
    group: 'Host',
    secret: false,
    format: 'path',
    description: 'Path only; key stays in operator SSH storage.',
  },
  {
    name: 'VPS_SSH_HOST_FINGERPRINT',
    group: 'Host',
    secret: false,
    format: 'text',
    description: 'Strict host key fingerprint.',
  },
  {
    name: 'VPS_LEGACY_PASSWORD_INACTIVE',
    group: 'Host',
    secret: true,
    format: 'token',
    description: 'Must stay inactive; never used.',
  },
  // Analytics
  {
    name: 'NEXT_PUBLIC_GA_MEASUREMENT_ID',
    group: 'Analytics',
    secret: false,
    public: true,
    format: 'token',
    description: 'Public GA4 id; loads only after consent.',
  },
  {
    name: 'ANALYTICS_ENABLED',
    group: 'Analytics',
    secret: false,
    format: 'boolean',
    description: 'Offer consent-based GA4 on allowlisted routes.',
  },
  // Market
  {
    name: 'MARKET_RATES_ENABLED',
    group: 'Market',
    secret: false,
    format: 'boolean',
    description: 'Allow ECB-via-Frankfurter refresh (no key).',
  },
  // Contact
  {
    name: 'CONTACT_EMAIL_DOMAIN',
    group: 'Contact',
    secret: false,
    format: 'hostname',
    description: 'Domain for published contact aliases.',
  },
  // SEO repair
  {
    name: 'SEO_FIX_ENABLED',
    group: 'SEO',
    secret: false,
    format: 'boolean',
    description: 'Constrained code repair; requires git + rollback.',
  },
];

export const CONFIG_NAME_SET = new Set(CONFIG_NAMES.map((n) => n.name));
export const SECRET_NAMES = new Set(CONFIG_NAMES.filter((n) => n.secret).map((n) => n.name));
