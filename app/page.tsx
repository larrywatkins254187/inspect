import Link from 'next/link';
import type { Metadata } from 'next';
import { askAvailability, config } from '@/config/env';
import { CALCULATORS } from '@/calculators/defs';
import { GUIDES } from '@/guides/registry';
import { COMMERCIAL_STATEMENT } from '@/content/site';
import { getDirectory, getStats } from '@/server/public';
import { toFinder } from '@/server/finder';
import { organizationLd, pageMetadata } from '@/server/seo';
import { BrokerFinder } from '@/ui/client/BrokerFinder';
import { AskPanel } from '@/ui/client/Ask';
import { EvidenceArt } from '@/ui/EvidenceArt';
import { JsonLd, Notice } from '@/ui/primitives';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: 'ForexInspect — evidence-first forex broker research',
  description: 'Check what forex brokers state about deposits, spreads, commissions, leverage, accounts and the companies behind them, with dated official sources. No ratings or affiliate links.',
  path: '/',
});

export default async function Home() {
  const [entries, stats] = await Promise.all([getDirectory(), getStats()]);
  const cfg = config();
  const ask = askAvailability(cfg).available && entries.length > 0;
  const preparing = entries.length === 0;
  return (
    <>
      <JsonLd data={organizationLd()} />
      <div className="container">
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <span className="eyebrow">Source-checked broker research</span>
            <h1 id="hero-title">Inspect what a forex broker actually states — for which account and which company.</h1>
            <p className="lead">
              ForexInspect records broker claims from official pages with their exact scope and dates: the account, entity, platform and instrument a value applies to, when it was observed and when it expires. Missing evidence is shown as <strong>Not verified</strong>, never as zero.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/brokers">
                Browse brokers
              </Link>
              <Link className="btn btn-secondary" href="/methodology">
                How we verify
              </Link>
            </div>
            {preparing ? (
              <Notice title="Broker research is in preparation">
                <p>
                  No broker profiles are published yet. Each profile appears only after official-source evidence passes every check described in the <Link href="/methodology">methodology</Link>. The <Link href="/tools">calculators</Link> and <Link href="/guides">guides</Link> work now with assumptions you enter.
                </p>
              </Notice>
            ) : (
              <dl className="stat-row" style={{ marginTop: 24 }} aria-label="Currently published evidence">
                <div className="stat">
                  <dt>Published brokers</dt>
                  <dd>{stats.brokers}</dd>
                </div>
                <div className="stat">
                  <dt>Facts shown</dt>
                  <dd>{stats.facts}</dd>
                </div>
                <div className="stat">
                  <dt>Cited sources</dt>
                  <dd>{stats.sources}</dd>
                </div>
              </dl>
            )}
          </div>
          <EvidenceArt />
        </section>

        <section className="section reveal" aria-labelledby="finder-title">
          <h2 id="finder-title">Find a broker</h2>
          {preparing ? (
            <p className="muted reading">The finder searches published profiles by name, documented platform and register record. It will list brokers once their evidence is published.</p>
          ) : (
            <BrokerFinder entries={entries.map(toFinder)} headingLevel={3} />
          )}
        </section>

        {ask ? (
          <section className="section reveal" aria-labelledby="ask-title">
            <h2 id="ask-title">Ask ForexInspect</h2>
            <AskPanel siteKey={cfg.turnstile.siteKey!} />
          </section>
        ) : null}

        <section className="section reveal" aria-labelledby="flow-title">
          <h2 id="flow-title">How a claim reaches a page</h2>
          <ol className="flow">
            <li>
              <h3 style={{ marginTop: 0 }}>Approved source</h3>
              <p className="small muted">Only official broker pages whose use policy, robots rules and access have been reviewed. No logins, CAPTCHAs or bot-block workarounds.</p>
            </li>
            <li>
              <h3 style={{ marginTop: 0 }}>Two readings</h3>
              <p className="small muted">Two separate extraction passes must agree on the exact value, unit, currency and scope, and quote text that literally appears on the page.</p>
            </li>
            <li>
              <h3 style={{ marginTop: 0 }}>Accepted fact</h3>
              <p className="small muted">Deterministic checks accept a dated fact with an expiry. Conflicting values in the same scope stop until resolved by a person.</p>
            </li>
            <li>
              <h3 style={{ marginTop: 0 }}>Checked page</h3>
              <p className="small muted">Pages cite exact fact IDs and re-check expiry, conflicts and source policy on every read. Expired or withdrawn claims disappear.</p>
            </li>
          </ol>
        </section>

        <section className="section reveal" aria-labelledby="tools-title">
          <div className="row spread">
            <h2 id="tools-title" style={{ marginTop: 0 }}>
              Calculators and guides
            </h2>
            <Link href="/tools">All {CALCULATORS.length} calculators</Link>
          </div>
          <ul className="grid grid-3" style={{ listStyle: 'none', padding: 0 }}>
            {CALCULATORS.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link className="card card-tight card-link" href={`/tools/${c.slug}`} style={{ height: '100%' }}>
                  <span className="card-title">{c.title}</span>
                  <p className="small muted" style={{ margin: '6px 0 0' }}>
                    {c.summary}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <ul className="grid grid-2" style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link className="card card-tight card-link" href={`/guides/${g.slug}`} style={{ height: '100%' }}>
                  <span className="card-title">{g.title}</span>
                  <p className="small muted" style={{ margin: '6px 0 0' }}>
                    {g.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="section reveal" aria-labelledby="trust-title">
          <h2 id="trust-title">Trust and independence</h2>
          <p className="reading">{COMMERCIAL_STATEMENT}</p>
          <ul className="grid grid-3" style={{ listStyle: 'none', padding: 0 }}>
            {[
              ['/methodology', 'Methodology', 'Extraction, acceptance, scope and date rules.'],
              ['/sources', 'Sources', 'Every currently cited official source.'],
              ['/corrections', 'Corrections', 'How to report an error and what we corrected.'],
              ['/ai-policy', 'AI policy', 'Where models are used and what they cannot decide.'],
              ['/affiliate-disclosure', 'Commercial disclosure', 'How the site is (not) funded by brokers.'],
              ['/risk-disclosure', 'Risk disclosure', 'Leveraged trading can lose money quickly.'],
            ].map(([href, t, d]) => (
              <li key={href}>
                <Link className="card card-tight card-link" href={href!} style={{ height: '100%' }}>
                  <span className="card-title">{t}</span>
                  <p className="small muted" style={{ margin: '6px 0 0' }}>
                    {d}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="small muted reading">
            Regulator directories are referenced as places to check a company yourself. Listing a regulator does not mean any broker shown here is authorised by it.
          </p>
        </section>
      </div>
    </>
  );
}
