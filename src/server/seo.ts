import type { Metadata } from 'next';
import { config } from '@/config/env';
import { SITE_NAME } from '@/content/site';

export const absolute = (path: string) => `${config().siteUrl}${path === '/' ? '' : path}`;

export function pageMetadata(p: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
  type?: 'website' | 'article';
  image?: string;
  publishedTime?: string | null;
  modifiedTime?: string | null;
}): Metadata {
  const url = absolute(p.path);
  const image = p.image ?? '/opengraph-image';
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: url },
    robots: p.noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type: p.type ?? 'website',
      url,
      title: p.title,
      description: p.description,
      siteName: SITE_NAME,
      locale: 'en',
      images: [{ url: image, width: 1200, height: 630, alt: `${SITE_NAME}: ${p.title}` }],
      ...(p.type === 'article' && p.publishedTime ? { publishedTime: p.publishedTime } : {}),
      ...(p.type === 'article' && p.modifiedTime ? { modifiedTime: p.modifiedTime } : {}),
    },
    twitter: { card: 'summary_large_image', title: p.title, description: p.description, images: [image] },
  };
}

export function breadcrumbLd(items: { href: string; label: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: absolute(c.href),
    })),
  };
}

export const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: absolute('/'),
  logo: absolute('/icon.svg'),
  description: 'Evidence-first forex broker research with dated, scoped primary sources.',
});
