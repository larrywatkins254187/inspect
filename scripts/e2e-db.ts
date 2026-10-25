/**
 * Build an ISOLATED synthetic end-to-end database (default data/e2e.sqlite) for HTTP verification of
 * research templates. Fictional brokers only; never point production at this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { openDatabase } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { seedFixtureBroker } from '../src/domain/fixtures';
import { runCompareCycle } from '../src/domain/comparisons';
import { sha256 } from '../src/lib/hash';
import type { AiProvider } from '../src/ai/provider';

const file = path.resolve(process.argv[2] ?? 'data/e2e.sqlite');
const assets = path.resolve(process.env.ASSET_DIRECTORY ?? 'data/e2e-assets');
if (file === path.resolve(process.env.DATABASE_PATH ?? 'data/forexinspect.sqlite'))
  throw new Error('refusing to write fixtures into the main database');
for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
fs.rmSync(assets, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });
process.env.ASSET_DIRECTORY = assets;
const db = openDatabase(file);
await migrate(db, { snapshotDir: null });
const now = new Date();
const brokers = [
  { slug: 'alpha-fixture-markets', name: 'Alpha Fixture Markets', initials: 'AF' },
  { slug: 'beta-fixture-markets', name: 'Beta Fixture Markets', initials: 'BF' },
];
for (const b of brokers) {
  const r = seedFixtureBroker(db, now, { ...b, synthetic: false });
  // Synthetic placeholder mark (not a real broker logo) so the comparison image path can be exercised.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" rx="16" fill="#EAF4FF"/><text x="120" y="62" font-family="sans-serif" font-size="40" font-weight="700" text-anchor="middle" fill="#1D4ED8">${b.initials} fixture</text></svg>`;
  const png = await sharp(Buffer.from(svg)).webp({ lossless: true }).toBuffer();
  const name = `${b.slug}-logo.webp`;
  fs.writeFileSync(path.join(assets, name), png);
  db.prepare(
    "INSERT INTO broker_assets (broker_id, file_name, sha256, mime, width, height, source_url, retrieved_at, rights_basis, attribution, current_brand_reviewed_at, approved, approved_at, created_at) VALUES (?, ?, ?, 'image/webp', 240, 96, ?, ?, 'LICENSED', 'Synthetic fixture mark', ?, 1, ?, ?)",
  ).run(
    r.brokerId,
    name,
    sha256(png),
    `https://www.${b.slug}.invalid/logo`,
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
    now.toISOString(),
  );
  console.log(b.slug, r.published);
}
const plan: AiProvider = {
  name: 'fixture-plan',
  model: 'none',
  adapterVersion: 'fixture-v1',
  availability: () => ({ ok: true }),
  complete: async () => ({
    ok: true,
    text: JSON.stringify({
      topicOrder: ['costs', 'accounts', 'leverage', 'platforms', 'entity'],
      highlights: [],
    }),
    usage: { units: 0, durationMs: 0 },
  }),
};
console.log(
  await runCompareCycle(db, plan, { now, publicationEnabled: true, enabled: true, rng: () => 0.1 }),
);
db.close();
console.log(`e2e database ready: ${file} (assets ${assets})`);
