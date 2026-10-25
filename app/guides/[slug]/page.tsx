import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { GUIDES, guideBySlug, type Block } from '@/guides/registry';
import { formatDate } from '@/lib/time';
import { absolute, breadcrumbLd, pageMetadata } from '@/server/seo';
import { Breadcrumbs, JsonLd, Notice, TableRegion } from '@/ui/primitives';
import { RISK_STATEMENT } from '@/content/site';

export const dynamicParams = false;
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) return {};
  return pageMetadata({ title: g.title, description: g.description, path: `/guides/${slug}`, type: 'article', publishedTime: g.contentDate, modifiedTime: g.contentDate });
}

function BlockView({ b, i }: { b: Block; i: string }) {
  if (typeof b === 'string') return <p>{b}</p>;
  if ('list' in b)
    return (
      <ul>
        {b.list.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    );
  if ('formula' in b) return <pre className="formula">{b.formula}</pre>;
  return (
    <TableRegion id={`tbl-${i}`} label={b.table.caption}>
      <table>
        <caption>{b.table.caption}</caption>
        <thead>
          <tr>
            {b.table.headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.table.rows.map((r) => (
            <tr key={r.join('|')}>
              {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableRegion>
  );
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const g = guideBySlug(slug);
  if (!g) notFound();
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/guides', label: 'Guides' },
    { href: `/guides/${slug}`, label: g.title.split(':')[0]! },
  ];
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, url: absolute(`/guides/${slug}`), datePublished: g.contentDate, dateModified: g.contentDate, publisher: { '@type': 'Organization', name: 'ForexInspect', url: absolute('/') } }} />
      <Breadcrumbs items={crumbs} />
      <article className="prose">
        <header className="page-header">
          <span className="eyebrow">Guide</span>
          <h1>{g.title}</h1>
          <p className="lead">{g.intro}</p>
          <p className="small muted">Written {formatDate(g.contentDate)}. General education, not advice; no named author or expert review is claimed.</p>
        </header>
        <nav className="toc panel" aria-label="On this page">
          <p style={{ fontWeight: 650, margin: '0 0 8px' }}>On this page</p>
          <ol>
            {g.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.heading}</a>
              </li>
            ))}
            <li>
              <a href="#questions">Questions</a>
            </li>
          </ol>
        </nav>
        {g.sections.map((s) => (
          <section key={s.id} aria-labelledby={s.id}>
            <h2 id={s.id}>{s.heading}</h2>
            {s.blocks.map((b, i) => (
              <BlockView key={i} b={b} i={`${s.id}-${i}`} />
            ))}
          </section>
        ))}
        <section aria-labelledby="questions">
          <h2 id="questions">Questions</h2>
          <dl className="faq">
            {g.faqs.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="related">
          <h2 id="related">Related</h2>
          <ul>
            {g.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href}>{r.label}</Link>
              </li>
            ))}
          </ul>
        </section>
        <Notice kind="risk" title="Risk warning">
          <p>{RISK_STATEMENT}</p>
        </Notice>
      </article>
    </div>
  );
}
