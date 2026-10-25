import type { ReactNode } from 'react';
import { breadcrumbLd } from '@/server/seo';
import { Breadcrumbs, JsonLd, PageHeader } from './primitives';

/** Shared shell for trust/legal pages. */
export function InfoPage({ path, label, eyebrow, title, lead, children }: { path: string; label: string; eyebrow: string; title: string; lead: string; children: ReactNode }) {
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: path, label },
  ];
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <Breadcrumbs items={crumbs} />
      <article className="prose">
        <PageHeader eyebrow={eyebrow} title={title} lead={lead} />
        {children}
      </article>
    </div>
  );
}
