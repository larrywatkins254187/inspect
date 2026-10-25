import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAccounts, getDirectory, getFees, getLogo, getProfile, comparisonsFor } from '@/server/public';
import { absolute, breadcrumbLd, pageMetadata } from '@/server/seo';
import { ProfileBody } from '@/ui/ProfileBody';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProfile(slug);
  if (!p) return { title: 'Broker not found', robots: { index: false, follow: true } };
  const covered = p.view.coverage.filter((c) => c.covered).map((c) => c.label.toLowerCase());
  return pageMetadata({
    title: `${p.view.broker.name}: verified account, cost and company evidence`,
    description:
      `Dated, source-checked facts for ${p.view.broker.name}${covered.length ? ` covering ${covered.slice(0, 4).join(', ')}` : ''}, with scope, official sources and what is not verified.`.slice(
        0,
        300,
      ),
    path: `/brokers/${slug}`,
    noindex: !p.indexable,
    type: 'article',
    publishedTime: p.dates.firstPublished,
    modifiedTime: p.dates.materialUpdated,
  });
}

export default async function BrokerProfile({ params }: Params) {
  const { slug } = await params;
  const p = await getProfile(slug);
  if (!p) notFound();
  const v = p.view;
  const [logo, fees, accounts, comps, dir] = await Promise.all([
    getLogo(v.broker.id),
    getFees(slug),
    getAccounts(slug),
    comparisonsFor(slug),
    getDirectory(),
  ]);
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/brokers', label: 'Brokers' },
    { href: `/brokers/${slug}`, label: v.broker.name },
  ];
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${v.broker.name}: accounts, costs, leverage and companies`,
    url: absolute(`/brokers/${slug}`),
    datePublished: p.dates.firstPublished,
    dateModified: p.dates.materialUpdated,
    publisher: { '@type': 'Organization', name: 'ForexInspect', url: absolute('/') },
    about: { '@type': 'Organization', name: v.broker.name, url: `https://${v.broker.officialDomain}` },
  };
  return (
    <ProfileBody
      p={p}
      slug={slug}
      logo={logo}
      hasFees={!!fees}
      hasAccounts={!!accounts}
      comps={comps}
      related={dir.filter((d) => d.slug !== slug).slice(0, 4)}
      crumbs={crumbs}
      jsonLd={[breadcrumbLd(crumbs), article]}
    />
  );
}
