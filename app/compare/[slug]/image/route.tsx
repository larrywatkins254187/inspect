import fs from 'node:fs';
import { ImageResponse } from 'next/og';
import { connection } from 'next/server';
import { config } from '@/config/env';
import { getDb } from '@/db/client';
import { deliverableAsset } from '@/domain/assets';
import { parseComparisonSlug, readComparison } from '@/domain/comparisons';

/** VS share image: approved, unaltered logos on a reviewed background; same eligibility as the article. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const parsed = parseComparisonSlug(slug);
  const notFound = () =>
    new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  if (!parsed || !parsed.isCanonical) return notFound();
  const db = getDb();
  const c = readComparison(db, parsed.canonical, {
    now: new Date(),
    publicationEnabled: config().publicationEnabled,
  });
  if (!c) return notFound();
  const logos: { name: string; data: string; width: number; height: number }[] = [];
  for (const b of c.view.brokers) {
    const file = b.logo.src.replace('/asset-file/', '');
    const d = deliverableAsset(db, file);
    if (!d) return notFound();
    logos.push({
      name: b.name,
      data: `data:${d.row.mime};base64,${fs.readFileSync(d.file).toString('base64')}`,
      width: d.row.width,
      height: d.row.height,
    });
  }
  const img = new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F4F9FF',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        {logos.map((l, i) => (
          <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
            {i > 0 ? <div style={{ fontSize: 72, fontWeight: 800, color: '#1D4ED8' }}>VS</div> : null}
            <div
              style={{
                display: 'flex',
                background: '#FFFFFF',
                border: '2px solid #B9D5F5',
                borderRadius: 24,
                padding: 32,
                width: 300,
                height: 200,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
              <img
                src={l.data}
                width={Math.min(236, l.width)}
                height={Math.round((Math.min(236, l.width) / l.width) * l.height)}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 48, fontSize: 30, color: '#0F172A' }}>
        {c.view.brokers.map((b) => b.name).join(' vs ')} — verified evidence
      </div>
      <div style={{ marginTop: 12, fontSize: 22, color: '#475569' }}>
        forexinspect.com · logos are the brokers’ own marks
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
  img.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  img.headers.set(
    'x-asset-provenance',
    c.view.brokers.map((b) => `${b.slug}:approved-official-mark`).join(','),
  );
  return img;
}
