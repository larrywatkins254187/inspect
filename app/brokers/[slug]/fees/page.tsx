import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getFees } from '@/server/public';
import { breadcrumbLd, pageMetadata } from '@/server/seo';
import { EvidencePanel, FactCard, SourceList } from '@/ui/broker';
import { Breadcrumbs, JsonLd, Notice, NotVerified, PageHeader, Status } from '@/ui/primitives';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const f = await getFees(slug);
  if (!f) return { title: 'Not found', robots: { index: false, follow: true } };
  return pageMetadata({
    title: `${f.view.broker.name} spreads and commissions (verified)`,
    description: `Source-checked EUR/USD spread and commission evidence for ${f.view.broker.name}, with account scope, cost basis and which fees are not verified.`,
    path: `/brokers/${slug}/fees`,
    noindex: !f.indexable,
    type: 'article',
    publishedTime: f.dates.firstPublished,
    modifiedTime: f.dates.materialUpdated,
  });
}

export default async function FeesPage({ params }: Params) {
  const { slug } = await params;
  const f = await getFees(slug);
  if (!f) notFound();
  const v = f.view;
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/brokers', label: 'Brokers' },
    { href: `/brokers/${slug}`, label: v.broker.name },
    { href: `/brokers/${slug}/fees`, label: 'Fees' },
  ];
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <div className="with-aside">
        <div>
          <PageHeader eyebrow="Costs" title={`${v.broker.name} spreads and commissions`} lead={`Verified trading-cost statements from ${v.broker.name}’s official pages. This is partial cost evidence, not an all-in cost or a live price.`} />
          <section aria-labelledby="sp-h">
            <h2 id="sp-h">EUR/USD spreads</h2>
            {v.spreads.length ? (
              <ul className="fact-list">
                {v.spreads.map((s) => (
                  <FactCard key={s.factId} fact={s} />
                ))}
              </ul>
            ) : (
              <p>
                <NotVerified>No EUR/USD spread is verified.</NotVerified>
              </p>
            )}
            <p className="small muted">Advertised spreads are typically minimums or averages under stated conditions. They are not executable live prices.</p>
          </section>
          <section aria-labelledby="cm-h">
            <h2 id="cm-h">Commissions</h2>
            {v.commissions.length ? (
              <ul className="fact-list">
                {v.commissions.map((c) => (
                  <FactCard key={c.factId} fact={c}>
                    <p className="small" style={{ margin: '8px 0 0' }}>
                      {c.usableForCost ? <Status kind="ok">Complete cost basis</Status> : <Status kind="warn">Excluded from cost inputs</Status>} {c.exclusion ?? 'Currency, side and volume basis are all stated.'}
                    </p>
                  </FactCard>
                ))}
              </ul>
            ) : (
              <p>
                <NotVerified>No trading commission is verified.</NotVerified>
              </p>
            )}
          </section>
          <section aria-labelledby="uk-h">
            <h2 id="uk-h">Fees not verified</h2>
            <p>ForexInspect has no accepted evidence for these costs. Check the broker’s fee schedule and account documents.</p>
            <ul>
              {v.unknownFees.map((u) => (
                <li key={u}>
                  {u}: <NotVerified />
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="calc-h">
            <h2 id="calc-h">Estimate costs with your own assumptions</h2>
            <ul>
              <li>
                <Link href="/tools/spread-cost-calculator">Spread cost calculator</Link>
              </li>
              <li>
                <Link href="/tools/pip-calculator">Pip value calculator</Link>
              </li>
              <li>
                <Link href="/tools/swap-calculator">Swap calculator</Link>
              </li>
            </ul>
            <p className="small muted">Calculators use values you enter. Combining a spread with a commission is only meaningful for the same account, instrument and currency.</p>
          </section>
          <section aria-labelledby="src-h">
            <h2 id="src-h">Sources</h2>
            <SourceList sources={v.sources} />
            <p className="small">
              <Link href={`/brokers/${slug}`}>All {v.broker.name} evidence</Link>
            </p>
          </section>
          <Notice kind="risk">
            <p>Costs are only part of the risk of leveraged trading. See the <Link href="/risk-disclosure">risk disclosure</Link>.</p>
          </Notice>
        </div>
        <EvidencePanel dates={f.dates} revisionNo={f.revision.revision_no} factCount={v.spreads.length + v.commissions.length} sourceCount={v.sources.length} />
      </div>
    </div>
  );
}
