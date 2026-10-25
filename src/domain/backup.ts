import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import type { DB } from '@/db/client';
import { sha256 } from '@/lib/hash';

export const MAGIC = Buffer.from('FIPB1');
export const VERSION = 1;
export const PART_BYTES = 45 * 1024 * 1024;
export const MIN_FREE_BYTES = 3 * 1024 ** 3;
export const KEEP_ARCHIVES = 7;

/** Key file: 32 raw bytes or 64 hex characters; must be owner-only and outside the archive. */
export function loadKey(file: string): Buffer {
  const st = fs.statSync(file);
  if (st.mode & 0o077) throw new Error('backup key file must be mode 0600 or 0400');
  const raw = fs.readFileSync(file);
  if (raw.length === 32) return raw;
  const hex = raw.toString('utf8').trim();
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  throw new Error('backup key must be 32 bytes or 64 hex characters');
}

export function generateKeyFile(file: string): void {
  if (fs.existsSync(file)) throw new Error('refusing to overwrite an existing key file');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, crypto.randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
}

/** Streamed gzip + AES-256-GCM: MAGIC | version | nonce(12) | ciphertext | tag(16). Header is authenticated. */
export async function encryptFile(src: string, dst: string, key: Buffer): Promise<void> {
  const nonce = crypto.randomBytes(12);
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION]), nonce]);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(header);
  const out = fs.createWriteStream(dst, { mode: 0o600 });
  out.write(header);
  await pipeline(fs.createReadStream(src), zlib.createGzip({ level: 6 }), cipher, out, { end: false });
  await new Promise<void>((resolve, reject) =>
    out.end(cipher.getAuthTag(), (e?: Error | null) => (e ? reject(e) : resolve())),
  );
}

/** Decrypt to a temporary file; the output is only trusted once the tag verifies. Tampering throws. */
export async function decryptFile(src: string, dst: string, key: Buffer): Promise<void> {
  const fd = fs.openSync(src, 'r');
  const size = fs.fstatSync(fd).size;
  const header = Buffer.alloc(18);
  fs.readSync(fd, header, 0, 18, 0);
  const tag = Buffer.alloc(16);
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  if (!header.subarray(0, 5).equals(MAGIC) || header[5] !== VERSION) throw new Error('not a FIPB1 archive');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(6, 18));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const tmp = `${dst}.partial`;
  try {
    await pipeline(
      fs.createReadStream(src, { start: 18, end: size - 17 }),
      decipher,
      zlib.createGunzip(),
      fs.createWriteStream(tmp, { mode: 0o600 }),
    );
    fs.renameSync(tmp, dst);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`archive authentication or decompression failed: ${(e as Error).message}`);
  }
}

export interface Manifest {
  format: 'FIPB1';
  createdAt: string;
  database: { file: string; sha256: string; bytes: number };
  files: { path: string; sha256: string; bytes: number }[];
  excluded: string[];
}

const walk = (dir: string, base: string, skip: (rel: string) => boolean, out: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(base, abs);
    if (skip(rel)) continue;
    if (e.isDirectory()) walk(abs, base, skip, out);
    else if (e.isFile()) out.push(rel);
  }
  return out;
};

export interface BackupOptions {
  projectDir: string;
  backupDir: string;
  keyFile: string;
  secretsFile?: string | null;
  hostConfigFiles?: string[];
  includeDependencies?: boolean;
  now: Date;
}

/**
 * Capture a consistent recovery archive: online SQLite backup (includes
 * committed WAL), project source/build, licensed asset files, host/service
 * config and the protected configuration — all inside the encrypted archive.
 * AI account/session credentials are never included.
 */
export async function createBackup(
  db: DB,
  o: BackupOptions,
): Promise<{ archive: string; sha256: string; bytes: number; manifest: Manifest }> {
  fs.mkdirSync(o.backupDir, { recursive: true, mode: 0o700 });
  const free = fs.statfsSync(o.backupDir);
  if (free.bavail * free.bsize < MIN_FREE_BYTES)
    throw new Error('less than 3 GiB free in the backup directory');
  const key = loadKey(o.keyFile);
  const stamp = o.now.toISOString().replace(/[:.]/g, '-');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-backup-'));
  try {
    fs.mkdirSync(path.join(stage, 'db'));
    const dbFile = path.join(stage, 'db', 'forexinspect.sqlite');
    await db.backup(dbFile);
    const excluded = [
      'node_modules (reinstall with pnpm install --frozen-lockfile)',
      '.next/cache',
      'backups/',
      'AI account/session credentials (~/.codex)',
      'recovery key',
    ];
    const skip = (rel: string) =>
      /^(\.git|backups|tmp|\.next-[^/]+|reports\/raw)(\/|$)/.test(rel) ||
      /^data\/(e2e|preview)/.test(rel) ||
      /^\.next\/cache(\/|$)/.test(rel) ||
      (!o.includeDependencies && /(^|\/)node_modules(\/|$)/.test(rel)) ||
      /^data\/.*\.sqlite(-wal|-shm)?$/.test(rel) ||
      rel === path.relative(o.projectDir, o.keyFile);
    const files = walk(o.projectDir, o.projectDir, skip);
    const copy = (abs: string, rel: string) => {
      const dst = path.join(stage, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(abs, dst);
    };
    for (const rel of files) copy(path.join(o.projectDir, rel), path.join('project', rel));
    for (const f of o.hostConfigFiles ?? [])
      if (fs.existsSync(f)) copy(f, path.join('host', f.replace(/^\//, '')));
    if (o.secretsFile && fs.existsSync(o.secretsFile))
      copy(o.secretsFile, path.join('config', 'production.env'));
    const all = walk(stage, stage, () => false).filter((r) => r !== 'manifest.json');
    const manifest: Manifest = {
      format: 'FIPB1',
      createdAt: o.now.toISOString(),
      database: {
        file: 'db/forexinspect.sqlite',
        sha256: sha256(fs.readFileSync(dbFile)),
        bytes: fs.statSync(dbFile).size,
      },
      files: all.map((r) => ({
        path: r,
        sha256: sha256(fs.readFileSync(path.join(stage, r))),
        bytes: fs.statSync(path.join(stage, r)).size,
      })),
      excluded,
    };
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const tarFile = path.join(stage, '..', `${path.basename(stage)}.tar`);
    const t = spawnSync('tar', ['-cf', tarFile, '-C', stage, '.'], { stdio: 'ignore' });
    if (t.status !== 0) throw new Error('tar failed');
    const archive = path.join(o.backupDir, `forexinspect-${stamp}.fipb`);
    await encryptFile(tarFile, archive, key);
    fs.rmSync(tarFile, { force: true });
    const buf = fs.readFileSync(archive);
    return { archive, sha256: sha256(buf), bytes: buf.length, manifest };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** Decrypt, extract and verify every manifest hash plus SQLite integrity and foreign keys. */
export async function verifyArchive(
  archive: string,
  keyFile: string,
  into?: string,
): Promise<{ ok: true; dir: string; manifest: Manifest } | { ok: false; reason: string }> {
  const key = loadKey(keyFile);
  const dir = into ?? fs.mkdtempSync(path.join(os.tmpdir(), 'fi-verify-'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tarFile = path.join(dir, '.archive.tar');
  try {
    await decryptFile(archive, tarFile, key);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  const list = spawnSync('tar', ['-tf', tarFile], { encoding: 'utf8' });
  if (
    list.status !== 0 ||
    list.stdout.split('\n').some((l) => l.startsWith('/') || l.split('/').includes('..'))
  )
    return { ok: false, reason: 'unsafe archive paths' };
  const x = spawnSync('tar', ['-xf', tarFile, '-C', dir, '--no-same-owner'], { stdio: 'ignore' });
  fs.rmSync(tarFile, { force: true });
  if (x.status !== 0) return { ok: false, reason: 'extract failed' };
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
  for (const f of manifest.files) {
    const p = path.join(dir, f.path);
    if (!fs.existsSync(p) || sha256(fs.readFileSync(p)) !== f.sha256)
      return { ok: false, reason: `hash mismatch: ${f.path}` };
  }
  const dbPath = path.join(dir, manifest.database.file);
  if (sha256(fs.readFileSync(dbPath)) !== manifest.database.sha256)
    return { ok: false, reason: 'database hash mismatch' };
  const rdb = new Database(dbPath, { readonly: true });
  try {
    const ic = rdb.pragma('integrity_check', { simple: true });
    if (ic !== 'ok') return { ok: false, reason: 'integrity_check failed' };
    if ((rdb.pragma('foreign_key_check') as unknown[]).length)
      return { ok: false, reason: 'foreign_key_check failed' };
  } finally {
    rdb.close();
  }
  return { ok: true, dir, manifest };
}

export function splitParts(
  file: string,
  partBytes = PART_BYTES,
): { path: string; sha256: string; bytes: number }[] {
  const size = fs.statSync(file).size;
  if (size <= partBytes) return [{ path: file, sha256: sha256(fs.readFileSync(file)), bytes: size }];
  const fd = fs.openSync(file, 'r');
  const parts: { path: string; sha256: string; bytes: number }[] = [];
  try {
    for (let off = 0, i = 1; off < size; off += partBytes, i++) {
      const len = Math.min(partBytes, size - off);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, off);
      const p = `${file}.part${String(i).padStart(2, '0')}`;
      fs.writeFileSync(p, buf, { mode: 0o600 });
      parts.push({ path: p, sha256: sha256(buf), bytes: len });
    }
  } finally {
    fs.closeSync(fd);
  }
  return parts;
}

/** Keep the newest N verified local archives; archives with failed uploads are retained. */
export function applyRetention(backupDir: string, keep = KEEP_ARCHIVES): string[] {
  const archives = fs
    .readdirSync(backupDir)
    .filter((f) => /^forexinspect-.*\.fipb$/.test(f))
    .sort()
    .reverse();
  const removed: string[] = [];
  for (const f of archives.slice(keep)) {
    if (fs.existsSync(path.join(backupDir, `${f}.upload-failed`))) continue;
    fs.rmSync(path.join(backupDir, f), { force: true });
    for (const extra of fs.readdirSync(backupDir).filter((x) => x.startsWith(`${f}.`)))
      fs.rmSync(path.join(backupDir, extra), { force: true });
    removed.push(f);
  }
  return removed;
}
