import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { DB } from '@/db/client';
import { sha256 } from '@/lib/hash';
import { assetDir } from './assets';
import { audit } from './audit';
import { complete, fail, leaseNext } from './jobs';

/**
 * Import an official mark: resized/converted to WebP without recolouring or
 * altering it. Approval is a separate owner review (current brand + rights).
 */
export async function importLogo(
  db: DB,
  slug: string,
  file: string,
  meta: { sourceUrl: string; retrievedAt: string; attribution: string | null },
  now: Date,
) {
  const b = db.prepare('SELECT id FROM brokers WHERE slug = ?').get(slug) as { id: number } | undefined;
  if (!b) throw new Error('unknown broker');
  if (!meta.sourceUrl.startsWith('https://')) throw new Error('source URL must be https');
  const input = fs.readFileSync(file);
  if (input.length > 5 * 1024 * 1024) throw new Error('logo file too large');
  const img = sharp(input, { limitInputPixels: 25_000_000 });
  const md = await img.metadata();
  if (!md.width || !md.height) throw new Error('unreadable image');
  const out = await img
    .resize({ width: Math.min(512, md.width), withoutEnlargement: true, fit: 'inside' })
    .webp({ lossless: true })
    .toBuffer({ resolveWithObject: true });
  const name = `${slug}-logo.webp`;
  fs.mkdirSync(assetDir(), { recursive: true });
  fs.writeFileSync(path.join(assetDir(), name), out.data);
  db.prepare(
    `INSERT INTO broker_assets (broker_id, kind, file_name, sha256, mime, width, height, source_url, retrieved_at, rights_basis, attribution, approved, unresolved_reason, created_at)
     VALUES (?, 'LOGO', ?, ?, 'image/webp', ?, ?, ?, ?, 'NONE', ?, 0, 'awaiting owner rights and current-brand review', ?)
     ON CONFLICT(file_name) DO UPDATE SET sha256 = excluded.sha256, width = excluded.width, height = excluded.height, source_url = excluded.source_url, retrieved_at = excluded.retrieved_at, approved = 0, approved_at = NULL, current_brand_reviewed_at = NULL, rights_basis = 'NONE', unresolved_reason = excluded.unresolved_reason`,
  ).run(
    b.id,
    name,
    sha256(out.data),
    out.info.width,
    out.info.height,
    meta.sourceUrl,
    meta.retrievedAt,
    meta.attribution,
    now.toISOString(),
  );
  audit(db, {
    actor: 'cli:logo-import',
    action: 'asset.import',
    subject: name,
    at: now,
    detail: { source: meta.sourceUrl },
  });
  return { file: name, width: out.info.width, height: out.info.height, approved: false };
}

/** Bounded discovery from an approved logo source: records the download for review; never auto-approves. */
export async function runLogoJob(db: DB, now: Date, userAgent: string | null) {
  const lease = leaseNext(db, 'logo', now, 10 * 60_000);
  if (!lease) return { outcome: 'NO_DUE_JOB' };
  const src = db
    .prepare('SELECT * FROM logo_sources WHERE id = ? AND approved = 1')
    .get(JSON.parse(lease.job.payload_json).logoSource) as
    { id: number; broker_id: number; url: string; host: string } | undefined;
  if (!src || !userAgent) {
    fail(db, lease, src ? 'USER_AGENT_MISSING' : 'SOURCE_NOT_APPROVED', now, { retryable: false });
    return { outcome: 'FAILED' };
  }
  const day = now.toISOString().slice(0, 10);
  const t = db.prepare('SELECT day, request_count FROM logo_host_traffic WHERE host = ?').get(src.host) as
    { day: string; request_count: number } | undefined;
  if (t && t.day === day && t.request_count >= 5) {
    fail(db, lease, 'HOST_BUDGET', now, { retryable: true, baseMs: 3_600_000 });
    return { outcome: 'DEFERRED' };
  }
  db.prepare(
    'INSERT INTO logo_host_traffic (host, day, request_count, last_request_at) VALUES (?, ?, 1, ?) ON CONFLICT(host) DO UPDATE SET request_count = CASE WHEN day = excluded.day THEN request_count + 1 ELSE 1 END, day = excluded.day, last_request_at = excluded.last_request_at',
  ).run(src.host, day, now.toISOString());
  const res = await fetch(src.url, {
    headers: { 'user-agent': userAgent },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok || !/^image\/(png|webp|svg\+xml)/.test(ct)) {
    db.prepare(
      "INSERT INTO logo_discoveries (broker_id, url, found_at, status, detail) VALUES (?, ?, ?, 'REJECTED', ?)",
    ).run(src.broker_id, src.url, now.toISOString(), `HTTP ${res.status} ${ct}`);
    fail(db, lease, `HTTP_${res.status}`, now, { retryable: res.status >= 500 });
    return { outcome: 'REJECTED', status: res.status };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(assetDir(), `.discovery-${src.id}`);
  fs.mkdirSync(assetDir(), { recursive: true });
  fs.writeFileSync(tmp, buf);
  db.prepare(
    "INSERT INTO logo_discoveries (broker_id, url, found_at, status, detail) VALUES (?, ?, ?, 'FOUND', ?)",
  ).run(src.broker_id, src.url, now.toISOString(), `${buf.length} bytes; import with logo-import`);
  complete(db, lease, { saved: path.basename(tmp) }, now);
  return { outcome: 'FOUND', saved: tmp };
}
