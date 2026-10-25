import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { openDatabase, type DB } from '@/db/client';
import { migrate } from '@/db/migrate';
import { seedPreviewFixtures } from '@/domain/fixtures';
import { readAccounts, readFees, readProfile } from '@/domain/read';
import { requireAdmin } from '@/server/auth';
import { Notice } from '@/ui/primitives';
import { ProfileBody } from '@/ui/ProfileBody';

export const metadata = { title: 'Synthetic preview', robots: { index: false, follow: false } };

/** Isolated preview database: synthetic fixtures never touch the production database. */
async function previewDb(): Promise<DB> {
  const file = path.resolve(process.env.PREVIEW_DATABASE_PATH ?? 'data/preview.sqlite');
  const fresh = !fs.existsSync(file);
  const db = openDatabase(file);
  await migrate(db, { snapshotDir: null });
  const valid = !fresh && readProfile(db, 'example-markets-fixture', { now: new Date(), publicationEnabled: false, includeSynthetic: true });
  if (!valid) seedPreviewFixtures(db, new Date());
  return db;
}

export default async function Preview({ params }: { params: Promise<{ path?: string[] }> }) {
  await connection();
  await requireAdmin();
  const { path: segs = [] } = await params;
  const db = await previewDb();
  const opts = { now: new Date(), publicationEnabled: false, includeSynthetic: true };
  const banner = (
    <div className="container">
      <Notice kind="warn" title="Synthetic preview — fictional data">
        <p>This page is generated from clearly fictional fixtures in a separate preview database. It is private, noindex, and never appears in the sitemap, structured data or Ask.</p>
      </Notice>
    </div>
  );
  if (segs.length === 0)
    return (
      <>
        {banner}
        <div className="container">
          <h1>Previews</h1>
          <ul>
            <li><Link href="/preview/brokers/example-markets-fixture">Broker profile (fixture)</Link></li>
            <li><Link href="/preview/brokers/example-markets-fixture/fees">Fees view summary (fixture)</Link></li>
            <li><Link href="/preview/brokers/example-markets-fixture/accounts">Accounts view summary (fixture)</Link></li>
          </ul>
        </div>
      </>
    );
  if (segs[0] !== 'brokers' || !segs[1]) notFound();
  const slug = segs[1];
  const p = readProfile(db, slug, opts);
  if (!p) notFound();
  if (segs[2] === 'fees' || segs[2] === 'accounts') {
    const v = segs[2] === 'fees' ? readFees(db, slug, opts) : readAccounts(db, slug, opts);
    if (!v) notFound();
    return (
      <>
        {banner}
        <div className="container">
          <h1>{p.view.broker.name} — {segs[2]} (preview)</h1>
          <pre className="formula" style={{ maxHeight: 600, overflow: 'auto' }}>{JSON.stringify(v.view, null, 2)}</pre>
        </div>
      </>
    );
  }
  const crumbs = [
    { href: '/preview', label: 'Preview' },
    { href: `/preview/brokers/${slug}`, label: p.view.broker.name },
  ];
  return (
    <>
      {banner}
      <ProfileBody p={p} slug={slug} logo={null} hasFees={!!readFees(db, slug, opts)} hasAccounts={!!readAccounts(db, slug, opts)} comps={[]} related={[]} base="/preview/brokers" crumbs={crumbs} />
    </>
  );
}
