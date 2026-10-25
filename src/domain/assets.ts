import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '@/db/client';
import { sha256 } from '@/lib/hash';
import { audit } from './audit';

/** Licensed asset files live outside the repository (PRD §16). */
export const assetDir = () => path.resolve(process.env.ASSET_DIRECTORY ?? 'data/assets');
const SAFE_FILE = /^[a-z0-9][a-z0-9._-]{0,80}\.(webp|png|svg)$/;

export interface AssetRow {
  id: number;
  broker_id: number;
  file_name: string;
  sha256: string;
  mime: string;
  width: number;
  height: number;
  source_url: string;
  retrieved_at: string;
  rights_basis: string;
  attribution: string | null;
  current_brand_reviewed_at: string | null;
  approved: number;
  removal_requested_at: string | null;
  unresolved_reason: string | null;
}

/** Delivery check, re-run on every request: approved, not withdrawn, file present and unmodified. */
export function deliverableAsset(db: DB, fileName: string): { row: AssetRow; file: string } | null {
  if (!SAFE_FILE.test(fileName)) return null;
  const row = db.prepare('SELECT * FROM broker_assets WHERE file_name = ?').get(fileName) as AssetRow | undefined;
  if (!row || row.approved !== 1 || row.removal_requested_at || row.rights_basis === 'NONE' || !row.current_brand_reviewed_at) return null;
  const broker = db.prepare('SELECT status FROM brokers WHERE id = ?').get(row.broker_id) as { status: string } | undefined;
  if (!broker || broker.status === 'DROPPED') return null;
  const file = path.join(assetDir(), fileName);
  if (path.dirname(file) !== assetDir() || !fs.existsSync(file)) return null;
  if (sha256(fs.readFileSync(file)) !== row.sha256) return null;
  return { row, file };
}

export function approvedLogo(db: DB, brokerId: number): { src: string; width: number; height: number; attribution: string | null } | null {
  const rows = db.prepare("SELECT file_name FROM broker_assets WHERE broker_id = ? AND kind = 'LOGO' AND approved = 1 AND removal_requested_at IS NULL ORDER BY approved_at DESC").all(brokerId) as { file_name: string }[];
  for (const r of rows) {
    const d = deliverableAsset(db, r.file_name);
    if (d) return { src: `/asset-file/${r.file_name}`, width: d.row.width, height: d.row.height, attribution: d.row.attribution };
  }
  return null;
}

export interface AssetAuditRow {
  broker: string;
  slug: string;
  file: string | null;
  filePresent: boolean;
  integrity: 'OK' | 'MISMATCH' | 'MISSING' | 'NO_RECORD';
  brandReviewed: boolean;
  rights: string;
  attribution: string | null;
  source: string | null;
  approved: boolean;
  unresolved: string | null;
}

export function assetAudit(db: DB, query = ''): AssetAuditRow[] {
  const brokers = db.prepare("SELECT id, slug, name FROM brokers WHERE status <> 'DROPPED' AND lower(name) LIKE ? ORDER BY name").all(`%${query.toLowerCase().slice(0, 60)}%`) as { id: number; slug: string; name: string }[];
  return brokers.map((b) => {
    const a = db.prepare("SELECT * FROM broker_assets WHERE broker_id = ? AND kind = 'LOGO' ORDER BY id DESC LIMIT 1").get(b.id) as AssetRow | undefined;
    if (!a) return { broker: b.name, slug: b.slug, file: null, filePresent: false, integrity: 'NO_RECORD', brandReviewed: false, rights: 'NONE', attribution: null, source: null, approved: false, unresolved: 'no logo imported; text fallback shown' };
    const file = path.join(assetDir(), a.file_name);
    const present = fs.existsSync(file);
    const integrity = !present ? 'MISSING' : sha256(fs.readFileSync(file)) === a.sha256 ? 'OK' : 'MISMATCH';
    return { broker: b.name, slug: b.slug, file: a.file_name, filePresent: present, integrity, brandReviewed: !!a.current_brand_reviewed_at, rights: a.rights_basis, attribution: a.attribution, source: a.source_url, approved: a.approved === 1, unresolved: a.unresolved_reason };
  });
}

/** CLI-reviewed decision; approval needs rights basis and current-brand review (also enforced by a CHECK). */
export function reviewAsset(db: DB, fileName: string, decision: 'APPROVE' | 'REJECT' | 'REMOVE', reviewer: string, notes: string, now: Date, reviewFileSha?: string): void {
  if (!reviewer.startsWith('owner:')) throw new Error('asset review requires an owner');
  const a = db.prepare('SELECT * FROM broker_assets WHERE file_name = ?').get(fileName) as AssetRow | undefined;
  if (!a) throw new Error('unknown asset');
  db.transaction(() => {
    if (decision === 'APPROVE') db.prepare('UPDATE broker_assets SET approved = 1, approved_at = ?, unresolved_reason = NULL WHERE id = ?').run(now.toISOString(), a.id);
    if (decision === 'REJECT') db.prepare('UPDATE broker_assets SET approved = 0, unresolved_reason = ? WHERE id = ?').run(notes.slice(0, 200), a.id);
    if (decision === 'REMOVE') db.prepare('UPDATE broker_assets SET approved = 0, removal_requested_at = ? WHERE id = ?').run(now.toISOString(), a.id);
    db.prepare('INSERT INTO broker_asset_reviews (asset_id, decision, reviewer, notes, review_file_sha256, at) VALUES (?,?,?,?,?,?)').run(a.id, decision, reviewer, notes.slice(0, 500), reviewFileSha ?? null, now.toISOString());
    audit(db, { actor: reviewer, action: `asset.${decision.toLowerCase()}`, subject: `asset:${fileName}`, at: now });
  })();
}
