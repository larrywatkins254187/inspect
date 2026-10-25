import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAccounts } from '@/server/public';
import { breadcrumbLd, pageMetadata } from '@/server/seo';
import { EvidencePanel, SourceList } from '@/ui/broker';
import { Breadcrumbs, JsonLd, NotVerified, PageHeader, TableRegion } from '@/ui/primitives';
import type { ShownFact } from '@/domain/broker-view';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = await getAccounts(slug);
  if (!a) return { title: 'Not found', robots: { index: false, follow: true } };
  return pageMetadata({
    title: `${a.view.broker.name} account types compared (verified)`,
    description: `Verified account types and conditions for ${a.view.broker.name}: deposits, spreads, commissions, leverage and platforms per account, with unknowns marked.`,
    path: `/brokers/${slug}/accounts`,
    noindex: !a.indexable,
    type: 'article',
    publishedTime: a.dates.firstPublished,
    modifiedTime: a.dates.materialUpdated,
  });
}

const Cell = ({ facts }: { facts: ShownFact[] | undefined }) =>
  facts?.length ? (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {facts.map((f) => (
        <li key={f.factId}>
          {f.display}
          {f.scopeNotes.filter((n) => !/^(Account|Entity|Jurisdiction):/.test(n)).length ? <span className="small muted"> ({f.scopeNotes.filter((n) => !/^(Account|Entity|Jurisdiction):/.test(n)).join('; ')})</span> : null}{' '}
          <a className="small" href={f.sourceUrl} rel="noopener nofollow" target="_blank">
            source<span className="visually-hidden"> for fact {f.factId} (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  ) : (
    <NotVerified />
  );

export default async function AccountsPage({ params }: Params) {
  const { slug } = await params;
  const a = await getAccounts(slug);
  if (!a) notFound();
  const v = a.view;
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/brokers', label: 'Brokers' },
    { href: `/brokers/${slug}`, label: v.broker.name },
    { href: `/brokers/${slug}/accounts`, label: 'Accounts' },
  ];
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <div className="with-aside">
        <div>
          <PageHeader eyebrow="Accounts" title={`${v.broker.name} account types compared`} lead={`${v.accounts.length} account types recorded on ${v.broker.name}’s official pages, with every documented condition and explicit unknowns.`} />
          <TableRegion id="acc-cap" label={`${v.broker.name} account conditions`}>
            <table>
              <caption>Conditions by account</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  {v.conditionFields.map((c) => (
                    <th key={c.field} scope="col">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.accounts.map((acc) => (
                  <tr key={`${acc.label}|${acc.entity}|${acc.jurisdiction}`}>
                    <th scope="row">
                      {acc.label}
                      <div className="small muted">{acc.entity || acc.jurisdiction ? [acc.entity, acc.jurisdiction].filter(Boolean).join(' · ') : 'Entity not stated'}</div>
                    </th>
                    {v.conditionFields.map((c) => (
                      <td key={c.field}>
                        <Cell facts={acc.conditions[c.field]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
          <section aria-labelledby="svr-h">
            <h2 id="svr-h">Standard versus Raw</h2>
            {v.standardVsRaw.available ? (
              <>
                <p>
                  Both accounts are recorded for the same entity and jurisdiction. These comparable conditions differ between {v.standardVsRaw.standard} and {v.standardVsRaw.raw}:
                </p>
                <ul>
                  {v.standardVsRaw.differing.map((d) => (
                    <li key={d.field}>
                      {d.label}: {d.standard.map((x) => x.display).join(', ')} ({v.standardVsRaw.available ? v.standardVsRaw.standard : ''}) vs {d.raw.map((x) => x.display).join(', ')} ({v.standardVsRaw.available ? v.standardVsRaw.raw : ''})
                    </li>
                  ))}
                </ul>
                <p className="small muted">A lower spread with a commission is not automatically cheaper; compare using the same instrument, volume and currency.</p>
              </>
            ) : (
              <p className="muted">Not shown: {v.standardVsRaw.reason}</p>
            )}
          </section>
          <section aria-labelledby="src-h">
            <h2 id="src-h">Sources</h2>
            <SourceList sources={v.sources} />
            <p className="small">
              <Link href={`/brokers/${slug}`}>All {v.broker.name} evidence</Link>
            </p>
          </section>
        </div>
        <EvidencePanel dates={a.dates} revisionNo={a.revision.revision_no} factCount={v.accounts.reduce((n, x) => n + Object.values(x.conditions).flat().length + (x.typeFact ? 1 : 0), 0)} sourceCount={v.sources.length} />
      </div>
    </div>
  );
}
