import Link from 'next/link';
import { connection } from 'next/server';
import { getDb, databaseReady } from '@/db/client';
import { opsSummary } from '@/domain/ops';
import { requireAdmin } from '@/server/auth';
import { Status, TableRegion } from '@/ui/primitives';
import { config } from '@/config/env';

export const metadata = { title: 'Operations', robots: { index: false, follow: false } };

export default async function Admin() {
  await connection();
  await requireAdmin();
  const db = getDb();
  if (!databaseReady(db)) return <div className="container section">Database not migrated. Run <code>pnpm migrate</code>.</div>;
  const s = opsSummary(db, new Date());
  const cfg = config();
  return (
    <div className="container section">
      <div className="row spread">
        <h1>Operations</h1>
        <form method="post" action="/admin/logout">
          <button className="btn btn-secondary btn-sm" type="submit">Sign out</button>
        </form>
      </div>
      <p className="muted">Private, noindex. Read-only overview; changes are made with the audited CLI. Publication {cfg.publicationEnabled ? <Status kind="ok">on</Status> : <Status kind="neutral">off</Status>} · automatic publication {cfg.autoPublicationEnabled ? <Status kind="ok">on</Status> : <Status kind="neutral">off</Status>}</p>
      <dl className="grid grid-4">
        {[
          ['Candidates', s.candidates],
          ['Selected', s.selected],
          ['Dropped', s.dropped],
          ['Starter leads', s.leads],
          ['Current accepted facts', s.verifiedFacts],
          ['Expiring in 24 h', s.expiringIn24h],
          ['Open conflicts', s.openConflicts],
          ['Published pages', s.publishedPages],
          ['Dead-letter jobs', s.deadLetters],
          ['Ask today (reserved/completed)', `${s.askToday.reserved}/${s.askToday.completed}`],
          ['Latest ECB rate date', s.ratesLatest ?? 'none'],
        ].map(([k, v]) => (
          <div key={String(k)} className="stat">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h2>Five-brand pilot</h2>
      <TableRegion id="pilot-cap" label="Pilot status">
        <table className="table-compact">
          <caption>Pilot brands and blockers</caption>
          <thead>
            <tr><th scope="col">Brand</th><th scope="col">Status</th><th scope="col">Domain</th><th scope="col">Sources</th><th scope="col">Facts</th><th scope="col">Blockers</th></tr>
          </thead>
          <tbody>
            {s.pilot.map((p) => (
              <tr key={p.slug}>
                <th scope="row">{p.name}</th>
                <td>{p.status}</td>
                <td>{p.domainConfirmed ? <Status kind="ok">confirmed</Status> : <Status kind="warn">unconfirmed</Status>}</td>
                <td>{p.sources.length ? p.sources.map((x) => <div key={x.url} className="small">{x.state}: {x.url}</div>) : <span className="small">{p.leads} unverified lead(s)</span>}</td>
                <td className="num">{p.verifiedFacts}</td>
                <td className="small">{p.blockers.join('; ') || 'none'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRegion>
      <h2>Sources by state</h2>
      <p>{Object.entries(s.sourcesByState).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'No sources registered.'}</p>
      <h2>Alerts</h2>
      {s.alerts.length ? (
        <ul>{s.alerts.map((a) => <li key={a.code + a.lastSeen}><Status kind={a.severity === 'CRITICAL' ? 'bad' : a.severity === 'WARNING' ? 'warn' : 'info'}>{a.severity}</Status> {a.code}: {a.message} (×{a.count}, last {a.lastSeen})</li>)}</ul>
      ) : <p>No open alerts.</p>}
      <h2>Recent publication runs</h2>
      {s.lastRuns.length ? <ul>{s.lastRuns.map((r) => <li key={r.startedAt + r.mode}>{r.startedAt} {r.mode} → {r.outcome ?? 'running'} {r.reason ? `(${r.reason})` : ''}</li>)}</ul> : <p>None.</p>}
      <p><Link href="/admin/assets">Asset audit</Link> · <Link href="/preview">Synthetic previews</Link></p>
    </div>
  );
}
