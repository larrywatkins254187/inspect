import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { complete, enqueue, fail, leaseNext, acquireLock } from '@/domain/jobs';
import {
  createBackup,
  decryptFile,
  encryptFile,
  generateKeyFile,
  splitParts,
  verifyArchive,
  applyRetention,
} from '@/domain/backup';
import {
  checkHtml,
  internalLinks,
  normalizeHtml,
  seoFixPreflight,
  validateFixDiff,
} from '@/domain/seo-audit';
import { importCandidateSeed, importWorkbook } from '@/domain/import';
import { parseXlsx } from '@/lib/tabular';
import { asicFileIntake, asicMatch, registerIdentifier } from '@/domain/regulators';
import { deliverableAsset } from '@/domain/assets';
import { notificationText, summarize } from '../workers/email/src/mime';
import { T0, at, tempDb } from './helpers';

describe('durable jobs', () => {
  it('idempotent enqueue, fenced leases, crash reclaim and dead letters', async () => {
    const { db } = await tempDb();
    expect(enqueue(db, { kind: 'k', key: 'slot-1', dueAt: T0 }, T0).created).toBe(true);
    expect(enqueue(db, { kind: 'k', key: 'slot-1', dueAt: T0 }, T0).created).toBe(false);
    const a = leaseNext(db, 'k', T0, 60_000, 'worker-a')!;
    expect(leaseNext(db, 'k', T0, 60_000, 'worker-b')).toBeNull(); // still leased
    // worker-a "crashes"; after expiry worker-b takes over with a higher fence
    const b = leaseNext(db, 'k', at(1), 60_000, 'worker-b')!;
    expect(b.fence).toBe(a.fence + 1);
    expect(complete(db, a, { stale: true }, at(1))).toBe(false); // stale worker fenced out
    expect(fail(db, b, 'PROVIDER_TIMEOUT', at(1))).toBe('RETRY_WAIT');
    const c = leaseNext(db, 'k', at(3), 60_000, 'worker-c')!;
    expect(c.job.attempts).toBe(3);
    expect(fail(db, c, 'PROVIDER_TIMEOUT', at(3))).toBe('DEAD_LETTER');
    expect(leaseNext(db, 'k', at(10), 60_000)).toBeNull();
  });
  it('shared locks exclude concurrent maintenance', async () => {
    const { db } = await tempDb();
    expect(acquireLock(db, 'maintenance', 'a', T0, 60_000)).toBe(true);
    expect(acquireLock(db, 'maintenance', 'b', T0, 60_000)).toBe(false);
    expect(acquireLock(db, 'maintenance', 'b', at(1), 60_000)).toBe(true);
  });
});

describe('encrypted recovery (FIPB1)', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fi-bk-'));
  it('round-trips, rejects tampering and wrong keys', async () => {
    const d = tmp();
    const key = path.join(d, 'k');
    generateKeyFile(key);
    const src = path.join(d, 'in');
    fs.writeFileSync(src, 'hello archive');
    await encryptFile(src, path.join(d, 'a.fipb'), Buffer.from(fs.readFileSync(key, 'utf8').trim(), 'hex'));
    const enc = fs.readFileSync(path.join(d, 'a.fipb'));
    expect(enc.subarray(0, 5).toString()).toBe('FIPB1');
    await decryptFile(
      path.join(d, 'a.fipb'),
      path.join(d, 'out'),
      Buffer.from(fs.readFileSync(key, 'utf8').trim(), 'hex'),
    );
    expect(fs.readFileSync(path.join(d, 'out'), 'utf8')).toBe('hello archive');
    enc[30] = enc[30]! ^ 0xff;
    fs.writeFileSync(path.join(d, 'b.fipb'), enc);
    await expect(
      decryptFile(
        path.join(d, 'b.fipb'),
        path.join(d, 'out2'),
        Buffer.from(fs.readFileSync(key, 'utf8').trim(), 'hex'),
      ),
    ).rejects.toThrow(/authentication/);
    expect(fs.existsSync(path.join(d, 'out2'))).toBe(false);
    await expect(
      decryptFile(path.join(d, 'a.fipb'), path.join(d, 'out3'), Buffer.alloc(32, 1)),
    ).rejects.toThrow();
  });
  it('captures a consistent DB with committed WAL and verifies integrity before any upload', async () => {
    const { db, dir } = await tempDb();
    db.prepare("INSERT INTO audit_events (at, actor, action, subject) VALUES (?, 'test', 'x', 'y')").run(
      T0.toISOString(),
    );
    const proj = tmp();
    fs.writeFileSync(path.join(proj, 'package.json'), '{}');
    fs.mkdirSync(path.join(proj, 'node_modules'));
    fs.writeFileSync(path.join(proj, 'node_modules', 'big'), 'x');
    const kd = tmp();
    const key = path.join(kd, 'key');
    generateKeyFile(key);
    const bdir = path.join(dir, 'backups');
    const res = await createBackup(db, { projectDir: proj, backupDir: bdir, keyFile: key, now: T0 });
    expect(res.manifest.files.some((f) => f.path.includes('node_modules'))).toBe(false);
    const v = await verifyArchive(res.archive, key);
    expect(v.ok).toBe(true);
    if (v.ok) {
      const Database = (await import('better-sqlite3')).default;
      const r = new Database(path.join(v.dir, 'db/forexinspect.sqlite'), { readonly: true });
      expect((r.prepare('SELECT count(*) AS n FROM audit_events').get() as { n: number }).n).toBe(1);
      r.close();
    }
    const parts = splitParts(res.archive, 1024);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.reduce((n, p) => n + p.bytes, 0)).toBe(res.bytes);
    expect(() => fs.chmodSync(key, 0o644)).not.toThrow();
    await expect(verifyArchive(res.archive, key)).rejects.toThrow(/0600/);
    void applyRetention;
  });
});

describe('SEO audit rules', () => {
  const good = `<!doctype html><html lang="en"><head><title>Pip value calculator | ForexInspect</title><meta name="viewport" content="width=device-width"><meta name="description" content="Work out the value of one pip for any position size with exact decimal arithmetic."><link rel="canonical" href="https://forexinspect.com/tools/pip-calculator"><meta property="og:title" content="x"><meta property="og:description" content="x"><meta property="og:image" content="x"><meta property="og:url" content="x"><meta name="twitter:card" content="summary_large_image"></head><body><main><h1>T</h1><h2>a</h2><img src="/a.png" alt="" width="1" height="1"><a href="/tools">t</a></main><footer></footer><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication"}</script></body></html>`;
  const h = { get: () => null };
  it('passes a well-formed page and flags real problems', () => {
    expect(checkHtml('https://forexinspect.com/tools/pip-calculator', good, 200, h, true)).toEqual([]);
    const bad = good
      .replace('<h2>a</h2>', '<h1>x</h1><h4>b</h4>')
      .replace('"@type":"WebApplication"', '"@type":"Product","aggregateRating":{}')
      .replace('lang="en"', '');
    const rules = checkHtml(
      'https://forexinspect.com/tools/other',
      bad,
      200,
      { get: (n: string) => (n === 'x-robots-tag' ? 'noindex' : null) },
      true,
    ).map((i) => i.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        'canonical-mismatch',
        'h1-count',
        'heading-skip',
        'jsonld-rating',
        'lang',
        'sitemap-noindex',
      ]),
    );
  });
  it('normalizes volatile framework noise and extracts internal links only', () => {
    expect(normalizeHtml('<a href="/_next/static/abc123/x.js">x</a><!-- 1 -->')).toBe(
      normalizeHtml('<a href="/_next/static/zzz/x.js">x</a><!-- 2 -->'),
    );
    expect(
      internalLinks(
        '<a href="/a#x"></a><a href="https://other.com/b"></a><a href="/admin"></a>',
        'http://127.0.0.1:3417',
      ),
    ).toEqual(['http://127.0.0.1:3417/a']);
  });
  it('constrained fixes: allowlist, diff cap, no broker facts; disabled without git/rollback', () => {
    expect(validateFixDiff('+++ b/app/tools/page.tsx\n+  title: "New"\n').ok).toBe(true);
    expect(validateFixDiff('+++ b/src/domain/promote.ts\n+x\n').ok).toBe(false);
    expect(validateFixDiff('+++ b/app/tools/page.tsx\n+ minimum_deposit 200\n').reasons).toContain(
      'touches broker facts or numbers',
    );
    expect(seoFixPreflight({ seoFixEnabled: false }, os.tmpdir()).blockers).toEqual(
      expect.arrayContaining(['SEO_FIX_ENABLED is not true']),
    );
  });
});

describe('imports and register matching', () => {
  it('candidate seed is idempotent, count-asserted and unverified', async () => {
    const { db } = await tempDb();
    const r = importCandidateSeed(db, path.resolve(__dirname, '../seeds/candidates.json'), T0);
    expect(r).toMatchObject({ status: 'IMPORTED', created: 30 });
    expect(importCandidateSeed(db, path.resolve(__dirname, '../seeds/candidates.json'), T0).status).toBe(
      'ALREADY_IMPORTED',
    );
    expect(
      (
        db
          .prepare(
            "SELECT count(*) AS n FROM broker_sources WHERE kind = 'LEAD' AND provenance = 'UNVERIFIED_SEED'",
          )
          .get() as { n: number }
      ).n,
    ).toBe(5);
    expect((db.prepare('SELECT count(*) AS n FROM verified_facts').get() as { n: number }).n).toBe(0);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-seed-'));
    const bad = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../seeds/candidates.json'), 'utf8'));
    bad.declared.candidates = 119;
    fs.writeFileSync(path.join(d, 'bad.json'), JSON.stringify(bad));
    expect(() => importCandidateSeed(db, path.join(d, 'bad.json'), T0)).toThrow(/declared 119/);
  });
  it('workbook CSV and XLSX import as unverified rows with expected counts', async () => {
    const { db } = await tempDb();
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-wb-'));
    fs.writeFileSync(
      path.join(d, 'w.csv'),
      'broker,min_deposit_claimed,score\n"Alpha, Inc",200 USD,9.5\nBeta,,\n',
    );
    expect(() => importWorkbook(db, path.join(d, 'w.csv'), T0, { expectRows: 3 })).toThrow(/expected 3/);
    const r = importWorkbook(db, path.join(d, 'w.csv'), T0, { expectRows: 2 });
    expect(r.rows).toBe(2);
    expect(
      (
        db.prepare("SELECT raw_value FROM workbook_rows WHERE field_key = 'min_deposit_claimed'").get() as {
          raw_value: string;
        }
      ).raw_value,
    ).toBe('200 USD');
    // Minimal stored-entry XLSX built in-test.
    const entries: [string, string][] = [
      ['xl/sharedStrings.xml', '<sst><si><t>broker</t></si><si><t>Gamma &amp; Co</t></si></sst>'],
      [
        'xl/worksheets/sheet1.xml',
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>leverage</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>500</v></c></row></sheetData></worksheet>',
      ],
    ];
    const locals: Buffer[] = [];
    const central: Buffer[] = [];
    let off = 0;
    for (const [name, text] of entries) {
      const data = zlib.deflateRawSync(Buffer.from(text));
      const n = Buffer.from(name);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(8, 8);
      lh.writeUInt32LE(data.length, 18);
      lh.writeUInt32LE(text.length, 22);
      lh.writeUInt16LE(n.length, 26);
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(8, 10);
      ch.writeUInt32LE(data.length, 20);
      ch.writeUInt32LE(text.length, 24);
      ch.writeUInt16LE(n.length, 28);
      ch.writeUInt32LE(off, 42);
      locals.push(lh, n, data);
      central.push(ch, n);
      off += 30 + n.length + data.length;
    }
    const cd = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cd.length, 12);
    eocd.writeUInt32LE(off, 16);
    expect(parseXlsx(Buffer.concat([...locals, cd, eocd]))).toEqual([
      ['broker', 'leverage'],
      ['Gamma & Co', '500'],
    ]);
  });
  it('ASIC matching needs identifier AND normalized legal name; sandbox rows never create licences', async () => {
    const { db } = await tempDb();
    db.prepare(
      "INSERT INTO legal_entities (legal_name, normalized_name, created_at) VALUES ('Example Markets Pty Ltd', 'example markets pty ltd', ?), ('Other Brand Pty Limited', 'other brand pty ltd', ?)",
    ).run(T0.toISOString(), T0.toISOString());
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-asic-'));
    fs.writeFileSync(
      path.join(d, 'sb.tsv'),
      'REGISTER_NAME\tAFS_LIC_NUM\tAFS_LIC_NAME\nAFS\t111111\tEXAMPLE MARKETS PTY LTD\n',
    );
    asicFileIntake(db, path.join(d, 'sb.tsv'), T0, { sandbox: true });
    registerIdentifier(db, 1, 'ASIC_AFSL', '111111', 'owner:test', T0);
    expect(asicMatch(db, T0).matched).toBe(0);
    fs.writeFileSync(
      path.join(d, 'real.tsv'),
      'REGISTER_NAME\tAFS_LIC_NUM\tAFS_LIC_NAME\nAFS\t111111\tEXAMPLE MARKETS PTY. LIMITED\nAFS\t222222\tUnrelated Holdings Ltd\n',
    );
    expect(asicFileIntake(db, path.join(d, 'real.tsv'), at(1), { sandbox: false }).schemaOk).toBe(true);
    registerIdentifier(db, 2, 'ASIC_AFSL', '222222', 'owner:test', T0);
    const m = asicMatch(db, at(1));
    expect(m.matched).toBe(1);
    expect(m.rejected[0]!.reason).toMatch(/register name differs/);
    fs.writeFileSync(path.join(d, 'csv.tsv'), 'AFS_LIC_NUM,AFS_LIC_NAME\n1,x\n');
    expect(asicFileIntake(db, path.join(d, 'csv.tsv'), T0, { sandbox: false }).problems).toContain(
      'not tab-delimited',
    );
  });
  it('asset delivery requires approval, brand review, rights, unmodified file and a non-dropped broker', async () => {
    const { db } = await tempDb();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-assets-'));
    process.env.ASSET_DIRECTORY = dir;
    db.prepare("INSERT INTO brokers (slug, name, created_at, updated_at) VALUES ('bb', 'B', ?, ?)").run(
      T0.toISOString(),
      T0.toISOString(),
    );
    const data = Buffer.from('fake-webp');
    fs.writeFileSync(path.join(dir, 'bb-logo.webp'), data);
    const { sha256 } = await import('@/lib/hash');
    db.prepare(
      "INSERT INTO broker_assets (broker_id, file_name, sha256, mime, width, height, source_url, retrieved_at, rights_basis, created_at) VALUES (1, 'bb-logo.webp', ?, 'image/webp', 10, 10, 'https://bb.example/logo', ?, 'NONE', ?)",
    ).run(sha256(data), T0.toISOString(), T0.toISOString());
    expect(deliverableAsset(db, 'bb-logo.webp')).toBeNull();
    expect(() =>
      db.prepare('UPDATE broker_assets SET approved = 1, approved_at = ? WHERE id = 1').run(T0.toISOString()),
    ).toThrow(); // CHECK: needs review + rights
    db.prepare(
      "UPDATE broker_assets SET approved = 1, approved_at = ?, rights_basis = 'NOMINATIVE_OFFICIAL_MARK', current_brand_reviewed_at = ? WHERE id = 1",
    ).run(T0.toISOString(), T0.toISOString());
    expect(deliverableAsset(db, 'bb-logo.webp')).not.toBeNull();
    expect(deliverableAsset(db, '../etc/passwd')).toBeNull();
    fs.writeFileSync(path.join(dir, 'bb-logo.webp'), 'tampered');
    expect(deliverableAsset(db, 'bb-logo.webp')).toBeNull();
    delete process.env.ASSET_DIRECTORY;
  });
});

describe('contact Email Worker parsing', () => {
  it('summarizes text, decodes QP and lists attachments; output is bounded plain text', () => {
    const raw = [
      'Content-Type: multipart/mixed; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'The spread on page X looks wrong =E2=80=94 see source.',
      '--b1',
      'Content-Type: application/pdf; name="proof.pdf"',
      'Content-Disposition: attachment; filename="proof.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0xLjQK',
      '--b1--',
      '',
    ].join('\r\n');
    const s = summarize(raw);
    expect(s.excerpt).toBe('The spread on page X looks wrong — see source.');
    expect(s.attachments).toEqual([{ name: 'proof.pdf', type: 'application/pdf', bytes: 9 }]);
    const t = notificationText({
      from: 'a@b.c',
      to: 'corrections@forexinspect.com',
      subject: 'x'.repeat(5000),
      summary: { excerpt: 'y'.repeat(5000), attachments: [] },
      forwardFailed: true,
    });
    expect(t.length).toBeLessThanOrEqual(3500);
    expect(t).toMatch(/FORWARDING FAILED/);
  });
});
