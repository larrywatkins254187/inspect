import Link from 'next/link';
import type { Metadata } from 'next';
import { getComparisons } from '@/server/public';
import { breadcrumbLd, pageMetadata } from '@/server/seo';
import { CompareSearch } from '@/ui/client/CompareSearch';
import { Breadcrumbs, EmptyState, JsonLd, PageHeader } from '@/ui/primitives';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  // Empty directories are kept out of the index until they hold published evidence.
  const list = await getComparisons();
  return pageMetadata({
    ...{
      title: 'Forex broker comparisons from verified evidence',
      description:
        'Side-by-side comparisons of two or three forex brokers built only from accepted, dated official-source facts. No winners, scores or combined costs.',
      path: '/compare',
    },
    noindex: list.length === 0,
  });
}
const crumbs = [
  { href: '/', label: 'Home' },
  { href: '/compare', label: 'Compare' },
];

export default async function ComparePage() {
  const items = await getComparisons();
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <PageHeader
        eyebrow="Comparisons"
        title="Broker comparisons"
        lead="Each comparison shows the same verified fields side by side, keeping every value’s own account and entity scope. Comparisons name no winner and never add up incompatible costs."
      />
      {items.length ? (
        <CompareSearch items={items} />
      ) : (
        <EmptyState title="No comparisons are published yet">
          <p>
            A comparison needs every broker to have a published profile with at least four accepted facts
            across two core topics, an approved original logo, and at least two shared verified fields. See
            the <Link href="/methodology#comparisons">methodology</Link>.
          </p>
        </EmptyState>
      )}
    </div>
  );
}
