import path from 'node:path';

/**
 * Runtime configuration. Booleans are only true for the literal string "true";
 * credential presence never enables a service (PRD §18.2).
 */
export interface AppConfig {
  appEnv: 'development' | 'test' | 'production';
  siteUrl: string;
  databasePath: string;
  adminToken: string | null;
  sourceUserAgent: string | null;
  publicationEnabled: boolean;
  autoPublicationEnabled: boolean;
  secretsRotationConfirmed: boolean;
  codex: { enabled: boolean; model: string | null; bin: string };
  kie: { enabled: boolean };
  chat: { enabled: boolean; dailyCap: number };
  turnstile: { enabled: boolean; siteKey: string | null; secret: string | null; hostname: string | null };
  cloudflare: { enabled: boolean; token: string | null; zoneId: string | null };
  telegram: { enabled: boolean; token: string | null; chatId: string | null; apiUrl: string };
  backup: { keyFile: string | null; directory: string; transportApproved: boolean };
  gsc: {
    enabled: boolean;
    property: string | null;
    clientId: string | null;
    clientSecret: string | null;
    refreshToken: string | null;
  };
  indexNow: { enabled: boolean; key: string | null };
  goatCounter: { enabled: boolean; site: string | null; token: string | null };
  analytics: { enabled: boolean; measurementId: string | null };
  marketRatesEnabled: boolean;
  contactDomain: string;
  seoFixEnabled: boolean;
  deployment: { region: string | null; vpsId: string | null };
}

const read = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const v = env[name];
  return v === undefined || v.trim() === '' ? null : v;
};
const flag = (env: NodeJS.ProcessEnv, name: string): boolean => env[name] === 'true';
const int = (env: NodeJS.ProcessEnv, name: string, dflt: number, min: number, max: number): number => {
  const v = read(env, name);
  if (v === null || !/^\d+$/.test(v)) return dflt;
  const n = Number(v);
  return n < min || n > max ? dflt : n;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appEnvRaw = read(env, 'APP_ENV');
  const appEnv = appEnvRaw === 'production' || appEnvRaw === 'test' ? appEnvRaw : 'development';
  const siteUrl = (read(env, 'SITE_URL') ?? 'https://forexinspect.com').replace(/\/+$/, '');
  const ga = read(env, 'NEXT_PUBLIC_GA_MEASUREMENT_ID');
  const site = read(env, 'NEXT_PUBLIC_TURNSTILE_SITE_KEY');
  const admin = read(env, 'ADMIN_TOKEN');
  return {
    appEnv,
    siteUrl,
    databasePath: path.resolve(read(env, 'DATABASE_PATH') ?? 'data/forexinspect.sqlite'),
    adminToken: admin && admin.length >= 32 ? admin : null,
    sourceUserAgent: read(env, 'SOURCE_USER_AGENT'),
    publicationEnabled: flag(env, 'PUBLICATION_ENABLED'),
    autoPublicationEnabled: flag(env, 'AUTO_PUBLICATION_ENABLED'),
    secretsRotationConfirmed: flag(env, 'SECRETS_ROTATION_CONFIRMED'),
    codex: {
      enabled: flag(env, 'CODEX_ENABLED'),
      model: read(env, 'CODEX_MODEL'),
      bin: read(env, 'CODEX_BIN') ?? 'codex',
    },
    kie: { enabled: flag(env, 'KIE_ENABLED') },
    chat: { enabled: flag(env, 'CHAT_ENABLED'), dailyCap: int(env, 'CHAT_DAILY_CREDIT_CAP', 50, 0, 10000) },
    turnstile: {
      enabled: flag(env, 'TURNSTILE_ENABLED'),
      siteKey: site && /^[0-9A-Za-z_-]{8,128}$/.test(site) ? site : null,
      secret: read(env, 'TURNSTILE_SECRET_KEY'),
      hostname: read(env, 'TURNSTILE_HOSTNAME'),
    },
    cloudflare: {
      enabled: flag(env, 'CLOUDFLARE_ENABLED'),
      token: read(env, 'CLOUDFLARE_API_TOKEN'),
      zoneId: read(env, 'CLOUDFLARE_ZONE_ID'),
    },
    telegram: {
      enabled: flag(env, 'TELEGRAM_ENABLED'),
      token: read(env, 'TELEGRAM_BOT_TOKEN'),
      chatId: read(env, 'TELEGRAM_CHAT_ID'),
      apiUrl: (read(env, 'TELEGRAM_BOT_API_URL') ?? 'http://127.0.0.1:8081').replace(/\/+$/, ''),
    },
    backup: {
      keyFile: read(env, 'BACKUP_ENCRYPTION_KEY_FILE'),
      directory: path.resolve(read(env, 'BACKUP_DIRECTORY') ?? 'backups'),
      transportApproved: flag(env, 'BACKUP_TRANSPORT_APPROVED'),
    },
    gsc: {
      enabled: flag(env, 'GSC_ENABLED'),
      property: read(env, 'GSC_PROPERTY_ID'),
      clientId: read(env, 'GOOGLE_SEARCH_CONSOLE_CLIENT_ID'),
      clientSecret: read(env, 'GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET'),
      refreshToken: read(env, 'GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN'),
    },
    indexNow: { enabled: flag(env, 'INDEXNOW_ENABLED'), key: read(env, 'INDEXNOW_KEY') },
    goatCounter: {
      enabled: flag(env, 'GOATCOUNTER_ENABLED'),
      site: read(env, 'GOATCOUNTER_SITE'),
      token: read(env, 'GOATCOUNTER_API_TOKEN'),
    },
    analytics: {
      enabled: flag(env, 'ANALYTICS_ENABLED'),
      measurementId: ga && /^G-[A-Z0-9]{4,16}$/.test(ga) ? ga : null,
    },
    marketRatesEnabled: flag(env, 'MARKET_RATES_ENABLED'),
    contactDomain: read(env, 'CONTACT_EMAIL_DOMAIN') ?? 'forexinspect.com',
    seoFixEnabled: flag(env, 'SEO_FIX_ENABLED'),
    deployment: { region: read(env, 'DEPLOYMENT_REGION'), vpsId: read(env, 'DEPLOYMENT_VPS_ID') },
  };
}

let cached: { key: string; cfg: AppConfig } | null = null;

/** Process config; recomputed if the relevant environment changes (tests). */
export function config(): AppConfig {
  const key = JSON.stringify([
    process.env.APP_ENV,
    process.env.DATABASE_PATH,
    process.env.PUBLICATION_ENABLED,
    process.env.AUTO_PUBLICATION_ENABLED,
    process.env.CHAT_ENABLED,
    process.env.TURNSTILE_ENABLED,
    process.env.CODEX_ENABLED,
    process.env.SECRETS_ROTATION_CONFIRMED,
    process.env.ADMIN_TOKEN?.length,
    process.env.ANALYTICS_ENABLED,
    process.env.SITE_URL,
  ]);
  if (!cached || cached.key !== key) cached = { key, cfg: loadConfig(process.env) };
  return cached.cfg;
}

/** Ask availability gate (PRD §9.2): every prerequisite must pass. */
export function askAvailability(cfg: AppConfig = config()): { available: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!cfg.chat.enabled) missing.push('CHAT_ENABLED');
  if (!cfg.turnstile.enabled) missing.push('TURNSTILE_ENABLED');
  if (!cfg.codex.enabled) missing.push('CODEX_ENABLED');
  if (!cfg.codex.model) missing.push('CODEX_MODEL');
  if (!cfg.secretsRotationConfirmed) missing.push('SECRETS_ROTATION_CONFIRMED');
  if (!cfg.publicationEnabled) missing.push('PUBLICATION_ENABLED');
  if (!cfg.turnstile.siteKey) missing.push('NEXT_PUBLIC_TURNSTILE_SITE_KEY');
  if (!cfg.turnstile.secret) missing.push('TURNSTILE_SECRET_KEY');
  if (!cfg.turnstile.hostname) missing.push('TURNSTILE_HOSTNAME');
  return { available: missing.length === 0, missing };
}
