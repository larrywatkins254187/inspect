import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import type { DB } from '@/db/client';
import { addHours, addMs, utcDay } from '@/lib/time';

/**
 * Safe source fetcher (PRD §11): approved-host allowlist, honest user agent,
 * per-host spacing/budget/circuit breaker, DNS pinning with private-address
 * rejection on every hop, MIME/size/time/redirect caps. No stealth browser,
 * CAPTCHA solving, identity rotation or rate-limit evasion exists here.
 */
export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (host: string) => Promise<ResolvedAddress[]>;
export interface TransportRequest {
  url: URL;
  address: ResolvedAddress;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export type FetchOutcome =
  | {
      kind: 'OK';
      finalUrl: string;
      status: number;
      contentType: string;
      body: Buffer;
      etag: string | null;
      lastModified: string | null;
    }
  | { kind: 'NOT_MODIFIED'; finalUrl: string }
  | { kind: 'REFUSED'; status: number }
  | { kind: 'CHALLENGE' }
  | { kind: 'UNAVAILABLE'; status: number }
  | { kind: 'THROTTLED'; retryAfterSeconds: number | null }
  | { kind: 'TRANSIENT'; reason: 'TIMEOUT' | 'SERVER_ERROR' | 'NETWORK' }
  | { kind: 'BLOCKED_URL'; reason: string }
  | { kind: 'HOST_LIMIT'; reason: 'SPACING' | 'DAILY_BUDGET' | 'CIRCUIT_OPEN' | 'RETRY_AFTER' | 'STOPPED' }
  | { kind: 'TOO_LARGE' }
  | { kind: 'BAD_TYPE'; contentType: string };

export const FETCH_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  timeoutMs: 15_000,
  maxRedirects: 3,
  minSpacingMs: 10_000,
  dailyBudget: 40,
  circuitFailures: 3,
  circuitHours: 6,
  maxRetryAfterSeconds: 86_400,
};
const ALLOWED_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
function v4Public(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return !V4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  if (s.includes('%')) return null;
  let tail: number[] = [];
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) {
    if (net.isIP(m[2]!) !== 4) return null;
    const n = ipv4ToInt(m[2]!);
    tail = [(n >>> 16) & 0xffff, n & 0xffff];
    s = m[1]!;
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const parse = (x: string | undefined) =>
    x ? x.split(':').map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN)) : [];
  const h = parse(parts[0]);
  const r = parts.length === 2 ? parse(parts[1]) : [];
  const total = 8 - tail.length;
  let out: number[];
  if (parts.length === 1) {
    if (h.length !== total) return null;
    out = [...h, ...tail];
  } else {
    const fill = total - h.length - r.length;
    if (fill < 0) return null;
    out = [...h, ...Array<number>(fill).fill(0), ...r, ...tail];
  }
  return out.length === 8 && out.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? out : null;
}
export function isPublicAddress(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return v4Public(ip);
  if (fam !== 6) return false;
  const p = expandV6(ip);
  if (!p) return false;
  const [a, b] = [p[0]!, p[1]!];
  if (p.every((x) => x === 0)) return false; // ::
  if (p.slice(0, 7).every((x) => x === 0) && p[7] === 1) return false; // ::1
  if ((a & 0xfe00) === 0xfc00) return false; // fc00::/7 ULA (incl. fd00:ec2::254)
  if ((a & 0xffc0) === 0xfe80) return false; // link-local
  if ((a & 0xff00) === 0xff00) return false; // multicast
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x0100 && p[1] === 0 && p[2] === 0 && p[3] === 0) return false; // discard
  const embedded = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
  if (p.slice(0, 5).every((x) => x === 0) && p[5] === 0xffff) return v4Public(embedded(p[6]!, p[7]!)); // mapped
  if (a === 0x0064 && b === 0xff9b) return v4Public(embedded(p[6]!, p[7]!)); // NAT64
  if (a === 0x2002) return v4Public(embedded(p[1]!, p[2]!)); // 6to4
  return true;
}

/** URL safety independent of DNS: https only, no credentials, default port, no IP literals. */
export function checkUrl(
  raw: string,
  allowedHosts: ReadonlySet<string>,
): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL_INVALID' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'SCHEME_NOT_HTTPS' };
  if (url.username || url.password) return { ok: false, reason: 'EMBEDDED_CREDENTIALS' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'PORT_NOT_ALLOWED' };
  const host = url.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, ''))) return { ok: false, reason: 'IP_LITERAL' };
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
    return { ok: false, reason: 'LOCAL_HOSTNAME' };
  if (!allowedHosts.has(host)) return { ok: false, reason: 'HOST_NOT_APPROVED' };
  url.hash = '';
  return { ok: true, url };
}

export const systemResolver: Resolver = async (host) => {
  const res = await dns.lookup(host, { all: true, verbatim: true });
  return res.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/** Node https transport pinned to a pre-validated address (defeats DNS rebinding). */
export const httpsTransport: Transport = (req) =>
  new Promise((resolve, reject) => {
    const r = https.request(
      {
        protocol: 'https:',
        hostname: req.url.hostname,
        servername: req.url.hostname,
        path: req.url.pathname + req.url.search,
        method: 'GET',
        headers: req.headers,
        timeout: req.timeoutMs,
        lookup: (_h, _o, cb) => cb(null, req.address.address, req.address.family),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > req.maxBytes) {
            truncated = true;
            res.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers))
            if (typeof v === 'string') headers[k.toLowerCase()] = v;
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks), truncated });
        };
        res.on('end', done);
        res.on('close', done);
        res.on('error', (e) => (truncated ? done() : reject(e)));
      },
    );
    const timer = setTimeout(() => r.destroy(new Error('TIMEOUT')), req.timeoutMs);
    r.on('timeout', () => r.destroy(new Error('TIMEOUT')));
    r.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    r.on('close', () => clearTimeout(timer));
    r.end();
  });

interface HostRow {
  host: string;
  day: string;
  request_count: number;
  last_request_at: string | null;
  consecutive_failures: number;
  circuit_open_until: string | null;
  retry_after_until: string | null;
  stopped_reason: string | null;
}

/** Short transaction reserving one request slot for a host. */
export function reserveHostSlot(
  db: DB,
  host: string,
  now: Date,
):
  | { ok: true }
  | { ok: false; reason: 'SPACING' | 'DAILY_BUDGET' | 'CIRCUIT_OPEN' | 'RETRY_AFTER' | 'STOPPED' } {
  return db.transaction(() => {
    const day = utcDay(now);
    let row = db.prepare('SELECT * FROM host_traffic WHERE host = ?').get(host) as HostRow | undefined;
    if (!row) {
      db.prepare('INSERT INTO host_traffic (host, day) VALUES (?, ?)').run(host, day);
      row = db.prepare('SELECT * FROM host_traffic WHERE host = ?').get(host) as HostRow;
    }
    if (row.stopped_reason) return { ok: false as const, reason: 'STOPPED' as const };
    if (row.circuit_open_until && new Date(row.circuit_open_until) > now)
      return { ok: false as const, reason: 'CIRCUIT_OPEN' as const };
    if (row.retry_after_until && new Date(row.retry_after_until) > now)
      return { ok: false as const, reason: 'RETRY_AFTER' as const };
    if (
      row.last_request_at &&
      now.getTime() - new Date(row.last_request_at).getTime() < FETCH_LIMITS.minSpacingMs
    )
      return { ok: false as const, reason: 'SPACING' as const };
    const count = row.day === day ? row.request_count : 0;
    if (count >= FETCH_LIMITS.dailyBudget) return { ok: false as const, reason: 'DAILY_BUDGET' as const };
    db.prepare('UPDATE host_traffic SET day = ?, request_count = ?, last_request_at = ? WHERE host = ?').run(
      day,
      count + 1,
      now.toISOString(),
      host,
    );
    return { ok: true as const };
  })();
}

function recordHostResult(db: DB, host: string, outcome: FetchOutcome, now: Date): void {
  const row = db.prepare('SELECT consecutive_failures FROM host_traffic WHERE host = ?').get(host) as
    { consecutive_failures: number } | undefined;
  if (!row) return;
  if (outcome.kind === 'TRANSIENT') {
    const n = row.consecutive_failures + 1;
    const open =
      n >= FETCH_LIMITS.circuitFailures ? addHours(now, FETCH_LIMITS.circuitHours).toISOString() : null;
    db.prepare(
      'UPDATE host_traffic SET consecutive_failures = ?, circuit_open_until = coalesce(?, circuit_open_until) WHERE host = ?',
    ).run(n, open, host);
  } else if (outcome.kind === 'THROTTLED') {
    const secs = Math.min(outcome.retryAfterSeconds ?? 3600, FETCH_LIMITS.maxRetryAfterSeconds);
    const n = row.consecutive_failures + 1;
    db.prepare(
      'UPDATE host_traffic SET retry_after_until = ?, consecutive_failures = ?, stopped_reason = ? WHERE host = ?',
    ).run(
      addMs(now, secs * 1000).toISOString(),
      n,
      n >= FETCH_LIMITS.circuitFailures ? 'persistent throttling' : null,
      host,
    );
  } else if (outcome.kind === 'REFUSED' || outcome.kind === 'CHALLENGE') {
    db.prepare('UPDATE host_traffic SET stopped_reason = ? WHERE host = ?').run(
      outcome.kind === 'CHALLENGE' ? 'challenge' : 'access refused',
      host,
    );
  } else {
    db.prepare('UPDATE host_traffic SET consecutive_failures = 0 WHERE host = ?').run(host);
  }
}

const CHALLENGE_MARKERS = [
  /cf-chl-/i,
  /<title>\s*just a moment/i,
  /attention required!? \| cloudflare/i,
  /g-recaptcha|h-captcha|captcha-delivery/i,
  /enable javascript and cookies to continue/i,
];

function parseRetryAfter(v: string | undefined, now: Date): number | null {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : Math.max(0, Math.round((d.getTime() - now.getTime()) / 1000));
}

export interface FetchDeps {
  resolver: Resolver;
  transport: Transport;
  now: () => Date;
  userAgent: string | null;
  allowedHosts: ReadonlySet<string>;
}

/**
 * Fetch one URL. Must be called outside any write transaction. Redirects are
 * followed manually; every hop rechecks URL policy and resolved addresses.
 */
export async function safeFetch(
  db: DB,
  rawUrl: string,
  deps: FetchDeps,
  conditional: { etag?: string | null; lastModified?: string | null } = {},
): Promise<FetchOutcome> {
  if (!deps.userAgent || !/\+?https?:\/\/|@/.test(deps.userAgent))
    return { kind: 'BLOCKED_URL', reason: 'USER_AGENT_MISSING_CONTACT' };
  let current = rawUrl;
  for (let hop = 0; hop <= FETCH_LIMITS.maxRedirects; hop++) {
    const chk = checkUrl(current, deps.allowedHosts);
    if (!chk.ok) return { kind: 'BLOCKED_URL', reason: chk.reason };
    const url = chk.url;
    let addrs: ResolvedAddress[];
    try {
      addrs = await deps.resolver(url.hostname);
    } catch {
      return { kind: 'TRANSIENT', reason: 'NETWORK' };
    }
    if (!addrs.length || addrs.some((a) => !isPublicAddress(a.address)))
      return { kind: 'BLOCKED_URL', reason: 'NON_PUBLIC_ADDRESS' };
    const slot = reserveHostSlot(db, url.hostname, deps.now());
    if (!slot.ok) return { kind: 'HOST_LIMIT', reason: slot.reason };
    const headers: Record<string, string> = {
      'user-agent': deps.userAgent,
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
      'accept-language': 'en',
    };
    if (hop === 0 && conditional.etag) headers['if-none-match'] = conditional.etag;
    if (hop === 0 && conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;
    let res: TransportResponse;
    try {
      res = await deps.transport({
        url,
        address: addrs[0]!,
        headers,
        timeoutMs: FETCH_LIMITS.timeoutMs,
        maxBytes: FETCH_LIMITS.maxBytes,
      });
    } catch (e) {
      const outcome: FetchOutcome = {
        kind: 'TRANSIENT',
        reason: (e as Error).message === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK',
      };
      recordHostResult(db, url.hostname, outcome, deps.now());
      return outcome;
    }
    const outcome = classify(res, url, deps.now());
    if (outcome === 'REDIRECT') {
      const loc = res.headers['location'];
      if (!loc) return { kind: 'TRANSIENT', reason: 'SERVER_ERROR' };
      current = new URL(loc, url).toString();
      continue;
    }
    recordHostResult(db, url.hostname, outcome, deps.now());
    return outcome;
  }
  return { kind: 'BLOCKED_URL', reason: 'TOO_MANY_REDIRECTS' };
}

function classify(res: TransportResponse, url: URL, now: Date): FetchOutcome | 'REDIRECT' {
  const ct = (res.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  const bodyHead = res.body.subarray(0, 64 * 1024).toString('utf8');
  if (
    res.headers['cf-mitigated'] === 'challenge' ||
    ((res.status === 403 || res.status === 503 || res.status === 429) &&
      CHALLENGE_MARKERS.some((m) => m.test(bodyHead)))
  )
    return { kind: 'CHALLENGE' };
  if ([301, 302, 303, 307, 308].includes(res.status)) return 'REDIRECT';
  if (res.status === 304) return { kind: 'NOT_MODIFIED', finalUrl: url.toString() };
  if (res.status === 401 || res.status === 403 || res.status === 451)
    return { kind: 'REFUSED', status: res.status };
  if (res.status === 404 || res.status === 410) return { kind: 'UNAVAILABLE', status: res.status };
  if (res.status === 429)
    return { kind: 'THROTTLED', retryAfterSeconds: parseRetryAfter(res.headers['retry-after'], now) };
  if (res.status >= 500) return { kind: 'TRANSIENT', reason: 'SERVER_ERROR' };
  if (res.status !== 200) return { kind: 'UNAVAILABLE', status: res.status };
  if (res.truncated) return { kind: 'TOO_LARGE' };
  if (!ALLOWED_TYPES.includes(ct)) return { kind: 'BAD_TYPE', contentType: ct };
  if (CHALLENGE_MARKERS.some((m) => m.test(bodyHead)) && /captcha|just a moment|cf-chl-/i.test(bodyHead))
    return { kind: 'CHALLENGE' };
  return {
    kind: 'OK',
    finalUrl: url.toString(),
    status: 200,
    contentType: ct,
    body: res.body,
    etag: res.headers['etag'] ?? null,
    lastModified: res.headers['last-modified'] ?? null,
  };
}
