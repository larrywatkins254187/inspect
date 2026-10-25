import Link from 'next/link';
import type { Metadata } from 'next';
import { GUIDES } from '@/guides/registry';
import { breadcrumbLd, pageMetadata } from '@/server/seo';
import { Breadcrumbs, JsonLd, PageHeader } from '@/ui/primitives';

export const metadata: Metadata = pageMetadata({
  title: 'Forex guides: pips, leverage, MT4 vs MT5 and choosing a broker',
  description:
    'Plain-English explainers on pips, leverage and margin, MetaTrader 4 versus 5, and how to check a forex broker using primary sources.',
  path: '/guides',
});
const crumbs = [
  { href: '/', label: 'Home' },
  { href: '/guides', label: 'Guides' },
];

export default function GuidesPage() {
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <PageHeader
        eyebrow="Guides"
        title="Forex guides"
        lead="General explanations of trading concepts. Guides contain no broker-specific numbers; verified broker evidence lives on the broker pages."
      />
      <ul className="grid grid-2" style={{ listStyle: 'none', padding: 0 }}>
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link className="card card-link" href={`/guides/${g.slug}`} style={{ height: '100%' }}>
              <span className="card-title" style={{ fontSize: '1.125rem' }}>
                {g.title}
              </span>
              <p className="muted" style={{ margin: '8px 0 0' }}>
                {g.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
