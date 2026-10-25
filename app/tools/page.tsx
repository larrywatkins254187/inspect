import type { Metadata } from 'next';
import { CALCULATORS, CATEGORIES } from '@/calculators/defs';
import { absolute, breadcrumbLd, pageMetadata } from '@/server/seo';
import { ToolsHub } from '@/ui/client/ToolsHub';
import { Breadcrumbs, JsonLd, Notice, PageHeader } from '@/ui/primitives';

export const metadata: Metadata = pageMetadata({
  title: 'Forex calculators: pip, position size, margin and more',
  description: '15 free forex and trading calculators with exact decimal arithmetic, formulas and worked examples: pip value, position size, margin, profit, swap, pivots and more.',
  path: '/tools',
});
const crumbs = [
  { href: '/', label: 'Home' },
  { href: '/tools', label: 'Tools' },
];

export default function ToolsPage() {
  const items = CALCULATORS.map((c) => ({ slug: c.slug, title: c.title, summary: c.summary, category: c.category }));
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Forex calculators', numberOfItems: items.length, itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.title, url: absolute(`/tools/${c.slug}`) })) }} />
      <Breadcrumbs items={crumbs} />
      <PageHeader eyebrow="Tools" title="Forex and trading calculators" lead="Fifteen calculators using exact decimal arithmetic and assumptions you control. Each explains its formula, a worked example and what it leaves out." />
      <ToolsHub items={items} categories={CATEGORIES} />
      <Notice kind="info">
        <p>Defaults such as contract sizes are typical assumptions, not any broker’s specification. Results are estimates for planning, not trading advice.</p>
      </Notice>
    </div>
  );
}
