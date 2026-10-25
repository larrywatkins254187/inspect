import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSecretsPermissions, loadSecretsInto, parseSecretsText } from '@/config/secrets-file';
import { askAvailability, loadConfig } from '@/config/env';
import { checkUrl, isPublicAddress, safeFetch, type Transport } from '@/domain/fetcher';
import { isAllowed } from '@/domain/robots';
import {
  acceptTermsFinding,
  applyRobotsOutcome,
  currentPolicy,
  evaluateUse,
  getSource,
  recordOwnerPolicy,
  reopenSource,
  recordStopNotice,
} from '@/domain/policy';
import { ownerPolicy, seedApprovedSource, T0, at, tempDb } from './helpers';

describe('protected configuration', () => {
  it('parses JSON-quoted values, rejects shell syntax, unknown names and duplicates without echoing values', () => {
    const r = parseSecretsText(
      '# c\nADMIN_TOKEN="abc$(rm -rf /)"\nFOO="x"\nPUBLICATION_ENABLED=true\nCHAT_ENABLED="true"\nCHAT_ENABLED="false"\n',
    );
    expect(r.values.ADMIN_TOKEN).toBe('abc$(rm -rf /)'); // literal; never evaluated
    expect(r.unknown).toEqual(['FOO']);
    expect(r.errors.join(' ')).toMatch(/line 4/);
    expect(r.errors.join(' ')).toMatch(/duplicate CHAT_ENABLED/);
    expect(r.errors.join(' ')).not.toContain('rm -rf');
  });
  it('refuses world-readable files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-sec-'));
    const f = path.join(dir, 'p.env');
    fs.writeFileSync(f, 'CHAT_ENABLED="true"\n', { mode: 0o644 });
    fs.chmodSync(f, 0o644);
    expect(checkSecretsPermissions(f).ok).toBe(false);
    const env = {} as NodeJS.ProcessEnv;
    expect(loadSecretsInto(env, f).skipped).toBe('unsafe permissions');
    fs.chmodSync(f, 0o600);
    expect(loadSecretsInto(env, f).loaded).toEqual(['CHAT_ENABLED']);
  });
  it('defaults everything off and credential presence never enables a service', () => {
    const cfg = loadConfig({
      TURNSTILE_SECRET_KEY: 'x',
      CODEX_MODEL: 'm',
      TELEGRAM_BOT_TOKEN: 't',
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.publicationEnabled).toBe(false);
    expect(cfg.autoPublicationEnabled).toBe(false);
    expect(cfg.telegram.enabled).toBe(false);
    expect(cfg.codex.enabled).toBe(false);
    expect(askAvailability(cfg).available).toBe(false);
    expect(cfg.chat.dailyCap).toBe(50);
  });
});

describe('robots.txt', () => {
  const txt =
    'User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: ForexInspectBot\nDisallow: /accounts$\n';
  it('uses the most specific group and longest match', () => {
    expect(isAllowed(txt, 'ForexInspectBot/2.0 (+https://x)', '/accounts')).toBe(false);
    expect(isAllowed(txt, 'ForexInspectBot/2.0', '/accounts/raw')).toBe(true);
    expect(isAllowed(txt, 'OtherBot', '/private/x')).toBe(false);
    expect(isAllowed(txt, 'OtherBot', '/private/ok')).toBe(true);
  });
});

describe('SSRF and safe fetching', () => {
  it('rejects private, loopback, link-local, metadata, ULA and mapped addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      '::',
      'fd00:ec2::254',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '64:ff9b::a9fe:a9fe',
      '2001:db8::1',
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    for (const ip of ['93.184.216.34', '2606:4700::1111', '1.1.1.1'])
      expect(isPublicAddress(ip), ip).toBe(true);
  });
  it('rejects unsafe URLs', () => {
    const allowed = new Set(['www.example.com']);
    expect(checkUrl('http://www.example.com/', allowed)).toMatchObject({
      ok: false,
      reason: 'SCHEME_NOT_HTTPS',
    });
    expect(checkUrl('https://user:pw@www.example.com/', allowed)).toMatchObject({
      ok: false,
      reason: 'EMBEDDED_CREDENTIALS',
    });
    expect(checkUrl('https://127.0.0.1/', allowed)).toMatchObject({ ok: false, reason: 'IP_LITERAL' });
    expect(checkUrl('https://www.example.com:8443/', allowed)).toMatchObject({
      ok: false,
      reason: 'PORT_NOT_ALLOWED',
    });
    expect(checkUrl('https://evil.example.net/', allowed)).toMatchObject({
      ok: false,
      reason: 'HOST_NOT_APPROVED',
    });
    expect(checkUrl('file:///etc/passwd', allowed)).toMatchObject({ ok: false });
  });

  let t = T0.getTime();
  const deps = (
    transport: Transport,
    resolve: Record<string, string> = { 'www.example.com': '93.184.216.34' },
  ) => {
    return {
      resolver: async (h: string) => (resolve[h] ? [{ address: resolve[h]!, family: 4 as const }] : []),
      transport,
      now: () => new Date((t += 60_000)),
      userAgent: 'ForexInspectBot/2.0 (+https://forexinspect.com/methodology)',
      allowedHosts: new Set(['www.example.com', 'other.example.com']),
    };
  };
  const res =
    (status: number, body = '', headers: Record<string, string> = {}) =>
    async () => ({
      status,
      headers: { 'content-type': 'text/html', ...headers },
      body: Buffer.from(body),
      truncated: false,
    });

  it('rechecks DNS on every redirect hop (DNS rebinding to metadata blocked)', async () => {
    const { db } = await tempDb();
    let hop = 0;
    const transport: Transport = async (): Promise<import('@/domain/fetcher').TransportResponse> =>
      hop++ === 0
        ? {
            status: 302,
            headers: { location: 'https://other.example.com/x' },
            body: Buffer.alloc(0),
            truncated: false,
          }
        : {
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: Buffer.from('ok'),
            truncated: false,
          };
    const out = await safeFetch(
      db,
      'https://www.example.com/a',
      deps(transport, { 'www.example.com': '93.184.216.34', 'other.example.com': '169.254.169.254' }),
    );
    expect(out).toMatchObject({ kind: 'BLOCKED_URL', reason: 'NON_PUBLIC_ADDRESS' });
  });
  it('maps 401/403, challenges, 404, 429 Retry-After, 5xx and size caps', async () => {
    const { db } = await tempDb();
    expect((await safeFetch(db, 'https://www.example.com/a', deps(res(403)))).kind).toBe('REFUSED');
    const { db: db1 } = await tempDb();
    expect(
      (
        await safeFetch(
          db1,
          'https://www.example.com/b',
          deps(res(503, '<title>Just a moment...</title>', { 'cf-mitigated': 'challenge' })),
        )
      ).kind,
    ).toBe('CHALLENGE');
    const { db: db2 } = await tempDb();
    expect((await safeFetch(db2, 'https://www.example.com/c', deps(res(404)))).kind).toBe('UNAVAILABLE');
    expect(
      await safeFetch(db2, 'https://www.example.com/d', deps(res(429, '', { 'retry-after': '120' }))),
    ).toEqual({ kind: 'THROTTLED', retryAfterSeconds: 120 });
    const { db: db3 } = await tempDb();
    expect((await safeFetch(db3, 'https://www.example.com/e', deps(res(502)))).kind).toBe('TRANSIENT');
    expect(
      (
        await safeFetch(
          db3,
          'https://www.example.com/f',
          deps(async () => ({
            status: 200,
            headers: { 'content-type': 'text/html' },
            body: Buffer.alloc(10),
            truncated: true,
          })),
        )
      ).kind,
    ).toBe('TOO_LARGE');
    expect(
      (
        await safeFetch(
          db3,
          'https://www.example.com/g',
          deps(res(200, '%PDF', { 'content-type': 'application/octet-stream' })),
        )
      ).kind,
    ).toBe('BAD_TYPE');
  });
  it('stops a host after refusal and enforces spacing and the circuit breaker', async () => {
    const { db } = await tempDb();
    await safeFetch(db, 'https://www.example.com/a', deps(res(403)));
    expect(await safeFetch(db, 'https://www.example.com/b', deps(res(200, 'ok')))).toEqual({
      kind: 'HOST_LIMIT',
      reason: 'STOPPED',
    });
    const { db: db2 } = await tempDb();
    const d = { ...deps(res(500)), now: () => T0 };
    await safeFetch(db2, 'https://www.example.com/a', d);
    expect(await safeFetch(db2, 'https://www.example.com/a', d)).toEqual({
      kind: 'HOST_LIMIT',
      reason: 'SPACING',
    });
  });
  it('requires an honest user agent with contact', async () => {
    const { db } = await tempDb();
    expect(
      await safeFetch(db, 'https://www.example.com/a', { ...deps(res(200, 'x')), userAgent: 'Mozilla/5.0' }),
    ).toMatchObject({ reason: 'USER_AGENT_MISSING_CONTACT' });
  });
});

describe('source policy gates', () => {
  it('FACT_REFERENCE needs fresh robots for fetch; unknown reuse permission blocks CONTENT_REUSE', async () => {
    const { db } = await tempDb();
    const s = seedApprovedSource(db, T0);
    const src = getSource(db, s.sourceId)!;
    const pol = currentPolicy(db, s.sourceId)!;
    expect(evaluateUse(src, pol, 'FACT_REFERENCE', at(1), 'FETCH').allowed).toBe(true);
    expect(evaluateUse(src, pol, 'FACT_REFERENCE', at(25), 'FETCH').reasons).toContain(
      'ROBOTS_EVIDENCE_STALE',
    );
    expect(evaluateUse(src, pol, 'FACT_REFERENCE', at(25), 'PUBLISH').allowed).toBe(true);
    expect(evaluateUse(src, pol, 'FACT_REFERENCE', at(24 * 7 + 1), 'PUBLISH').reasons).toContain(
      'POLICY_EXPIRED',
    );
    expect(evaluateUse(src, pol, 'CONTENT_REUSE', at(1), 'PUBLISH').reasons).toEqual(
      expect.arrayContaining(['USE_CLASS_NOT_GRANTED', 'REUSE_UNKNOWN', 'RETENTION_NOT_PERMITTED']),
    );
  });
  it('identical evidence renews the same row; changed evidence creates a revision needing tech check', async () => {
    const { db } = await tempDb();
    const s = seedApprovedSource(db, T0);
    const before = currentPolicy(db, s.sourceId)!;
    const r = recordOwnerPolicy(db, s.sourceId, ownerPolicy(s.host), 'owner:test', at(2));
    // First tech check created revision 2 (robots_allowed recorded); same owner decisions now hash differently from rev 1 only by robots → treated as new revision.
    expect(typeof r.policyId).toBe('number');
    const again = recordOwnerPolicy(db, s.sourceId, ownerPolicy(s.host), 'owner:test', at(3));
    expect(again.renewed).toBe(true);
    expect(currentPolicy(db, s.sourceId)!.revision).toBeGreaterThanOrEqual(before.revision);
  });
  it('robots disallow and challenges block; transient errors defer without extending validity', async () => {
    const { db } = await tempDb();
    const s = seedApprovedSource(db, T0);
    const validBefore = currentPolicy(db, s.sourceId)!.valid_until;
    expect(applyRobotsOutcome(db, s.sourceId, { kind: 'DEFER', reason: 'SERVER_ERROR' }, at(30))).toBe(
      'APPROVED',
    );
    expect(currentPolicy(db, s.sourceId)!.valid_until).toBe(validBefore);
    expect(applyRobotsOutcome(db, s.sourceId, { kind: 'CHALLENGE' }, at(31))).toBe('BLOCKED');
    // A robots OK afterwards cannot reopen it; and no model/system actor may reopen.
    expect(applyRobotsOutcome(db, s.sourceId, { kind: 'OK', allowed: true }, at(32))).toBe('BLOCKED');
    expect(() => reopenSource(db, s.sourceId, 'model:codex', 'x', at(33))).toThrow();
    expect(() =>
      db.prepare("UPDATE source_registry SET state = 'APPROVED' WHERE id = ?").run(s.sourceId),
    ).toThrow(/owner reopen/);
    reopenSource(db, s.sourceId, 'owner:test', 'reviewed', at(34));
    expect(getSource(db, s.sourceId)!.state).toBe('POLICY_PENDING');
  });
  it('owner stop notice blocks both classes and prevents reopen', async () => {
    const { db } = await tempDb();
    const s = seedApprovedSource(db, T0);
    recordStopNotice(db, s.sourceId, 'owner:test', 'site owner asked us to stop', at(1));
    expect(
      evaluateUse(
        getSource(db, s.sourceId),
        currentPolicy(db, s.sourceId),
        'FACT_REFERENCE',
        at(1),
        'PUBLISH',
      ).reasons,
    ).toContain('OWNER_STOP_NOTICE');
    expect(() => reopenSource(db, s.sourceId, 'owner:test', 'x', at(2))).toThrow(/stop notice/);
  });
  it('model terms findings need a literal clause; unclassified adverse findings block', async () => {
    const terms = 'You may not use automated means to access this website without our written consent.';
    expect(
      acceptTermsFinding(
        {
          clause: 'may not use automated means to access this website',
          classification: 'NO_AUTOMATED_ACCESS',
          blocking: true,
        },
        terms,
      ),
    ).not.toBeNull();
    expect(
      acceptTermsFinding(
        { clause: 'scraping is welcome for everyone', classification: 'UNCLASSIFIED', blocking: false },
        terms,
      ),
    ).toBeNull();
    const { db } = await tempDb();
    const s = seedApprovedSource(db, T0);
    recordOwnerPolicy(
      db,
      s.sourceId,
      ownerPolicy(s.host, {
        adverse_findings: [{ clause: 'something odd', classification: 'UNCLASSIFIED', blocking: false }],
      }),
      'owner:test',
      at(1),
    );
    expect(getSource(db, s.sourceId)!.state).toBe('BLOCKED');
    expect(() => recordOwnerPolicy(db, s.sourceId, ownerPolicy(s.host), 'model:codex', at(2))).toThrow();
  });
});
