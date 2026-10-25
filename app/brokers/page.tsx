import Link from 'next/link';
import type { Metadata } from 'next';
import { CORE_TOPICS } from '@/domain/fields';
import { getDirectory } from '@/server/public';
import { toFinder } from '@/server/finder';
import { absolute, breadcrumbLd, pageMetadata } from '@/server/seo';
import { BrokerFinder } from '@/ui/client/BrokerFinder';
import { Breadcrumbs, EmptyState, JsonLd, PageHeader, Status, TableRegion } from '@/ui/primitives';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // Empty directories are kept out of the index until they hold published evidence.
  const list = await getDirectory();
  return pageMetadata({ ...{
  title: 'Forex broker directory: verified evidence by topic',
  description: 'Alphabetical directory of forex brokers with published, source-checked evidence. See which core topics are verified and which are not.',
  path: '/brokers',
}, noindex: list.length === 0 });
}

const crumbs = [
  { href: '/', label: 'Home' },
  { href: '/brokers', label: 'Brokers' },
];

export default async function BrokersPage() {
  const entries = await getDirectory();
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      {entries.length ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Published broker profiles',
            itemListOrder: 'https://schema.org/ItemListOrderAscending',
            numberOfItems: entries.length,
            itemListElement: entries.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.name, url: absolute(`/brokers/${e.slug}`) })),
          }}
        />
      ) : null}
      <Breadcrumbs items={crumbs} />
      <PageHeader eyebrow="Directory" title="Forex broker directory" lead="Brokers with published, source-checked evidence, in alphabetical order. Coverage shows which core topics are verified; it measures research breadth, not broker quality." />
      <section id="finder" aria-labelledby="finder-h" className="section" style={{ paddingTop: 0 }}>
        <h2 id="finder-h" className="visually-hidden">
          Search published brokers
        </h2>
        {entries.length ? (
          <BrokerFinder entries={entries.map(toFinder)} />
        ) : (
          <EmptyState title="No broker profiles are published yet">
            <p>
              Profiles appear only after official-source evidence passes every check in our <Link href="/methodology">methodology</Link>: an owner-confirmed official domain, an approved source policy and at least three accepted facts. Research is in preparation.
            </p>
            <p>
              Meanwhile the <Link href="/tools">calculators</Link> and <Link href="/guides">guides</Link> work with assumptions you enter.
            </p>
          </EmptyState>
        )}
      </section>
      {entries.length ? (
        <section aria-labelledby="coverage-h">
          <h2 id="coverage-h">Core topic coverage</h2>
          <TableRegion id="coverage-cap" label="Core topic coverage by broker">
            <table className="table-compact">
              <caption>
                Verified core topics <span className="muted">(“Not verified” means no accepted evidence yet — not zero or absent)</span>
              </caption>
              <thead>
                <tr>
                  <th scope="col">Broker</th>
                  {CORE_TOPICS.map((t) => (
                    <th key={t.key} scope="col">
                      {t.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.slug}>
                    <th scope="row">
                      <Link href={`/brokers/${e.slug}`}>{e.name}</Link>
                    </th>
                    {e.coverage.map((c) => (
                      <td key={c.topic}>{c.covered ? <Status kind="ok">Verified</Status> : <Status kind="neutral">Not verified</Status>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        </section>
      ) : null}
    </div>
  );
}
