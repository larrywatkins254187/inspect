import { connection } from 'next/server';
import { getDb, databaseReady } from '@/db/client';
import { assetAudit } from '@/domain/assets';
import { requireAdmin } from '@/server/auth';
import { Status, TableRegion } from '@/ui/primitives';

export const metadata = { title: 'Asset audit', robots: { index: false, follow: false } };

export default async function Assets({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await connection();
  await requireAdmin();
  const { q = '' } = await searchParams;
  const db = getDb();
  const rows = databaseReady(db) ? assetAudit(db, q) : [];
  return (
    <div className="container section">
      <h1>Asset audit</h1>
      <form method="get" className="row" role="search">
        <label htmlFor="q" className="visually-hidden">
          Broker name
        </label>
        <input
          id="q"
          name="q"
          className="input"
          defaultValue={q}
          style={{ maxWidth: 320 }}
          placeholder="Broker name"
        />
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
      </form>
      <TableRegion id="assets-cap" label="Logo assets">
        <table className="table-compact">
          <caption>Logo files, integrity, current-brand review and rights ({rows.length})</caption>
          <thead>
            <tr>
              <th scope="col">Broker</th>
              <th scope="col">File</th>
              <th scope="col">Integrity</th>
              <th scope="col">Brand review</th>
              <th scope="col">Rights</th>
              <th scope="col">Source</th>
              <th scope="col">Approved</th>
              <th scope="col">Unresolved</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug}>
                <th scope="row">{r.broker}</th>
                <td>{r.file ?? '—'}</td>
                <td>
                  {r.integrity === 'OK' ? (
                    <Status kind="ok">OK</Status>
                  ) : (
                    <Status kind={r.integrity === 'NO_RECORD' ? 'neutral' : 'bad'}>{r.integrity}</Status>
                  )}
                </td>
                <td>{r.brandReviewed ? 'yes' : 'no'}</td>
                <td>
                  {r.rights}
                  {r.attribution ? <div className="small muted">{r.attribution}</div> : null}
                </td>
                <td className="small">{r.source ?? '—'}</td>
                <td>
                  {r.approved ? (
                    <Status kind="ok">approved</Status>
                  ) : (
                    <Status kind="neutral">not approved</Status>
                  )}
                </td>
                <td className="small">{r.unresolved ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRegion>
    </div>
  );
}
