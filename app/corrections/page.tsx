import Link from 'next/link';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { config } from '@/config/env';
import { contactAddresses } from '@/content/site';
import { databaseReady, getDb } from '@/db/client';
import { formatDate } from '@/lib/time';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = pageMetadata({ title: 'Corrections', description: 'How to report an error in ForexInspect research and the list of resolved corrections.', path: '/corrections' });

export default async function Corrections() {
  await connection();
  const db = getDb();
  const rows = databaseReady(db)
    ? (db.prepare("SELECT page_path, public_summary, received_at, resolved_at FROM correction_requests WHERE status = 'RESOLVED_CORRECTED' ORDER BY resolved_at DESC LIMIT 100").all() as { page_path: string; public_summary: string; received_at: string; resolved_at: string }[])
    : [];
  const a = contactAddresses(config().contactDomain);
  return (
    <InfoPage path="/corrections" label="Corrections" eyebrow="Trust" title="Corrections" lead="If a published fact is wrong, out of date or shown with the wrong scope, tell us. Corrections are made only after checking an official source.">
      <h2>How to report an error</h2>
      <ol>
        <li>Email <a href={`mailto:${a.corrections}`}>{a.corrections}</a> with the ForexInspect page address (and the fact number if shown).</li>
        <li>Include a link to the broker’s official page or document that shows the correct information.</li>
        <li>Do not send personal or account details.</li>
      </ol>
      <p>There is no submission form. Reports are reviewed by a person; a change goes through the same evidence checks as any other fact. Unsupported claims are not published, and emailed text is never treated as evidence on its own.</p>
      <h2>Resolved corrections</h2>
      {rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={`${r.page_path}-${r.resolved_at}`}>
              <strong>{formatDate(r.resolved_at)}</strong> — <Link href={r.page_path}>{r.page_path}</Link>: {r.public_summary} <span className="small muted">(reported {formatDate(r.received_at)})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No corrections have been published yet.</p>
      )}
      <p className="small muted">Reporter names and messages are never published.</p>
    </InfoPage>
  );
}
