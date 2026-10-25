import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { parseComparisonSlug } from '@/domain/comparisons';
import { getComparison } from '@/server/public';
import { absolute, breadcrumbLd, pageMetadata } from '@/server/seo';
import { SourceList } from '@/ui/broker';
import { Breadcrumbs, JsonLd, Notice, NotVerified, PageHeader, TableRegion } from '@/ui/primitives';
import { formatDate } from '@/lib/time';
import { RISK_STATEMENT } from '@/content/site';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ slug: string }> };

async function resolve(slug: string) {
  const parsed = parseComparisonSlug(slug);
  if (!parsed) return null;
  const c = await getComparison(parsed.canonical);
  if (!c) return null;
  return { parsed, c };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const r = await resolve(slug);
  if (!r) return { title: 'Not found', robots: { index: false, follow: true } };
  const names = r.c.view.brokers.map((b) => b.name).join(' vs ');
  return pageMetadata({
    title: `${names}: verified evidence side by side`,
    description:
      `Compare ${names} on ${r.c.view.shared.map((s) => s.label.toLowerCase()).join(', ')} using dated official-source facts with account and entity scope.`.slice(
        0,
        300,
      ),
    path: `/compare/${r.parsed.canonical}`,
    type: 'article',
    image: `/compare/${r.parsed.canonical}/image`,
    publishedTime: r.c.dates.firstPublished,
    modifiedTime: r.c.dates.materialUpdated,
  });
}

export default async function ComparisonArticle({ params }: Params) {
  const { slug } = await params;
  const r = await resolve(slug);
  if (!r) notFound();
  if (!r.parsed.isCanonical) permanentRedirect(`/compare/${r.parsed.canonical}`);
  const v = r.c.view;
  const names = v.brokers.map((b) => b.name).join(' vs ');
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/compare', label: 'Compare' },
    { href: `/compare/${v.slug}`, label: names },
  ];
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: `${names}: verified evidence side by side`,
          url: absolute(`/compare/${v.slug}`),
          datePublished: r.c.dates.firstPublished,
          dateModified: r.c.dates.materialUpdated,
          publisher: { '@type': 'Organization', name: 'ForexInspect' },
        }}
      />
      <Breadcrumbs items={crumbs} />
      <PageHeader eyebrow="Comparison" title={`${names}: verified evidence side by side`}>
        <p className="small muted">
          First published {formatDate(r.c.dates.firstPublished)} · Substantively updated{' '}
          {formatDate(r.c.dates.materialUpdated)}
        </p>
      </PageHeader>
      <section aria-labelledby="sum-h">
        <h2 id="sum-h" style={{ marginTop: 0 }}>
          Summary
        </h2>
        {v.summary.map((s) => (
          <p key={s} className="reading">
            {s}
          </p>
        ))}
      </section>
      <section aria-labelledby="tbl-h">
        <h2 id="tbl-h">Shared verified fields</h2>
        <TableRegion id="cmp-cap" label={`${names} shared fields`}>
          <table>
            <caption>
              Values keep their own scope; equal-looking values may apply to different accounts or companies.
            </caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                {v.brokers.map((b) => (
                  <th key={b.slug} scope="col">
                    {b.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.shared.map((row) => (
                <tr key={row.field}>
                  <th scope="row">{row.label}</th>
                  {row.cells.map((cell, i) => (
                    <td key={v.brokers[i]!.slug}>
                      {cell.length ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {cell.map((f) => (
                            <li key={f.factId}>
                              <Link href={`/brokers/${v.brokers[i]!.slug}#${f.anchor}`}>{f.display}</Link>
                              {f.scopeNotes.length ? (
                                <span className="small muted"> ({f.scopeNotes.join('; ')})</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <NotVerified />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      </section>
      {v.highlights.length ? (
        <section aria-labelledby="hl-h">
          <h2 id="hl-h">Recorded differences worth checking</h2>
          <ul>
            {v.highlights.map((h) => (
              <li key={h.fact.factId}>
                {h.broker} — {h.fact.display}
                {h.fact.scopeNotes.length ? ` (${h.fact.scopeNotes.join('; ')})` : ''}{' '}
                <Link href={`/brokers/${h.slug}#${h.fact.anchor}`}>evidence</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {v.topics.map((t) => (
        <section key={t.topic} aria-labelledby={`ct-${t.topic}`}>
          <h2 id={`ct-${t.topic}`}>{t.label}</h2>
          <div className={`grid ${v.brokers.length === 3 ? 'grid-3' : 'grid-2'}`}>
            {t.perBroker.map((p) => (
              <div key={p.slug} className="card card-tight">
                <h3 style={{ marginTop: 0 }}>{p.name}</h3>
                {p.facts.length ? (
                  <ul className="small">
                    {p.facts.map((f) => (
                      <li key={f.factId}>
                        <Link href={`/brokers/${p.slug}#${f.anchor}`}>{f.display}</Link>
                        {f.scopeNotes.length ? (
                          <span className="muted"> ({f.scopeNotes.join('; ')})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    <NotVerified />
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <section aria-labelledby="lim-h">
        <h2 id="lim-h">Limitations</h2>
        <ul>
          <li>
            Only fields with accepted official-source evidence appear; a missing value is not verified, not
            zero.
          </li>
          <li>
            No winner is declared and costs are not added across different accounts, instruments or
            currencies.
          </li>
          <li>
            Which entity can serve you depends on your country and client type; check each broker’s documents
            and the regulator’s register.
          </li>
        </ul>
        <h3>Questions</h3>
        <dl className="faq">
          <dt>Which broker is cheaper?</dt>
          <dd>
            This page does not say. Spreads and commissions are recorded with different scopes; compare
            like-for-like accounts with the calculators and the official fee schedules.
          </dd>
          <dt>Why are some values missing?</dt>
          <dd>
            ForexInspect shows only evidence that passed every check. Missing values are labelled “Not
            verified”.
          </dd>
        </dl>
      </section>
      <section aria-labelledby="src-h">
        <h2 id="src-h">Sources and logos</h2>
        <SourceList sources={v.sources} />
        <p className="small muted">
          Logos are the brokers’ own marks, shown unaltered to identify them
          {v.brokers.some((b) => b.logo.attribution)
            ? `: ${v.brokers
                .map((b) => b.logo.attribution)
                .filter(Boolean)
                .join('; ')}`
            : ''}
          . Their use does not imply endorsement.
        </p>
      </section>
      <Notice kind="risk">
        <p>{RISK_STATEMENT}</p>
      </Notice>
    </div>
  );
}
