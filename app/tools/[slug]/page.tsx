import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CALCULATORS, calculatorBySlug } from '@/calculators/defs';
import { CALC_CONTENT } from '@/calculators/content';
import { guideBySlug } from '@/guides/registry';
import { RISK_STATEMENT } from '@/content/site';
import { absolute, breadcrumbLd, pageMetadata } from '@/server/seo';
import { CalculatorWorkspace } from '@/ui/client/CalculatorWorkspace';
import { Breadcrumbs, JsonLd, Notice, PageHeader } from '@/ui/primitives';

export const dynamicParams = false;
export function generateStaticParams() {
  return CALCULATORS.map((c) => ({ slug: c.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = calculatorBySlug(slug);
  if (!c) return {};
  return pageMetadata({ title: c.title, description: `${c.summary} Formula, worked example, assumptions and FAQs.`.slice(0, 300), path: `/tools/${slug}` });
}

export default async function ToolPage({ params }: Params) {
  const { slug } = await params;
  const c = calculatorBySlug(slug);
  const content = CALC_CONTENT[slug];
  if (!c || !content) notFound();
  const crumbs = [
    { href: '/', label: 'Home' },
    { href: '/tools', label: 'Tools' },
    { href: `/tools/${slug}`, label: c.name },
  ];
  const guide = content.guide ? guideBySlug(content.guide) : null;
  return (
    <div className="container">
      <JsonLd data={breadcrumbLd(crumbs)} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: c.title,
          url: absolute(`/tools/${slug}`),
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any (web browser)',
          isAccessibleForFree: true,
          description: c.summary,
        }}
      />
      <Breadcrumbs items={crumbs} />
      <PageHeader eyebrow={c.category} title={c.title} lead={content.intro} />
      <CalculatorWorkspace slug={slug} />
      <div className="prose">
        <section aria-labelledby="formula-h">
          <h2 id="formula-h">Formula</h2>
          <pre className="formula">{content.formula}</pre>
          <p className="small muted">
            Notation: <em>C</em> contract size, <em>p</em> pip or point size, <em>L</em> lots, <em>R</em> quote-to-account conversion rate; direction +1 for buy, −1 for sell. These are your assumptions, not broker facts. Arithmetic uses exact decimals with explicit rounding.
          </p>
        </section>
        <section aria-labelledby="example-h">
          <h2 id="example-h">Worked example</h2>
          {content.example.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </section>
        <section aria-labelledby="assume-h">
          <h2 id="assume-h">Assumptions and limits</h2>
          <ul>
            {content.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="faq-h">
          <h2 id="faq-h">Questions</h2>
          <dl className="faq">
            {content.faqs.map((f) => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="rel-h">
          <h2 id="rel-h">Related</h2>
          <ul>
            {content.related.map((r) => {
              const rc = calculatorBySlug(r)!;
              return (
                <li key={r}>
                  <Link href={`/tools/${r}`}>{rc.title}</Link>
                </li>
              );
            })}
            {guide ? (
              <li>
                Guide: <Link href={`/guides/${guide.slug}`}>{guide.title}</Link>
              </li>
            ) : null}
            <li>
              <Link href="/brokers">Verified broker cost and account evidence</Link>
            </li>
          </ul>
        </section>
        <Notice kind="risk" title="Risk warning">
          <p>{RISK_STATEMENT}</p>
        </Notice>
      </div>
    </div>
  );
}
