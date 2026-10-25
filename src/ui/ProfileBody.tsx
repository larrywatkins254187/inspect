import Link from 'next/link';
import type { readProfile } from '@/domain/read';
import { RISK_STATEMENT } from '@/content/site';
import {
  EntitySection,
  EvidencePanel,
  FactCard,
  FaqList,
  GlanceCell,
  HistoryList,
  LogoOrText,
  SentenceText,
  SourceList,
} from './broker';
import { Breadcrumbs, JsonLd, Notice, Status, TableRegion } from './primitives';

export interface ProfileBodyProps {
  p: NonNullable<ReturnType<typeof readProfile>>;
  slug: string;
  logo: { src: string; width: number; height: number } | null;
  hasFees: boolean;
  hasAccounts: boolean;
  comps: { slug: string; names: string[] }[];
  related: { slug: string; name: string }[];
  base?: string;
  jsonLd?: unknown[];
  crumbs: { href: string; label: string }[];
}

/** Profile rendering shared by public pages and authenticated synthetic previews. */
export function ProfileBody({
  p,
  slug,
  logo,
  hasFees,
  hasAccounts,
  comps,
  related,
  base = '/brokers',
  jsonLd = [],
  crumbs,
}: ProfileBodyProps) {
  const v = p.view;
  const fees = hasFees;
  const accounts = hasAccounts;
  return (
    <div className="container">
      {jsonLd.map((d, i) => (
        <JsonLd key={i} data={d} />
      ))}
      <Breadcrumbs items={crumbs} />
      <div className="with-aside" style={{ marginTop: 24 }}>
        <div>
          <header className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <LogoOrText name={v.broker.name} logo={logo} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="eyebrow">Broker evidence</span>
              <h1 style={{ marginBottom: 8 }}>{v.broker.name}: accounts, costs, leverage and companies</h1>
              <p className="muted small" style={{ margin: 0 }}>
                Official website: {v.broker.officialDomain} (owner-confirmed). Facts below are restated from
                official pages with links; they are not an endorsement.
              </p>
            </div>
          </header>

          <section aria-labelledby="summary-h">
            <h2 id="summary-h">Summary</h2>
            {v.summary.map((s, i) => (
              <SentenceText key={i} s={s} slug={slug} facts={v.facts} base={base} />
            ))}
            <ul className="chips" aria-label="Core topic coverage">
              {v.coverage.map((c) => (
                <li key={c.topic}>
                  {c.covered ? (
                    <Status kind="ok">{c.label}</Status>
                  ) : (
                    <Status kind="neutral">{c.label}: not verified</Status>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {v.glance.length ? (
            <section aria-labelledby="glance-h">
              <h2 id="glance-h">Accounts at a glance</h2>
              <TableRegion id="glance-cap" label={`${v.broker.name} accounts at a glance`}>
                <table>
                  <caption>
                    Account conditions{' '}
                    <span className="muted">
                      — each row is one recorded account/entity/jurisdiction scope
                    </span>
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col">Minimum deposit</th>
                      <th scope="col">Max leverage</th>
                      <th scope="col">EUR/USD spread</th>
                      <th scope="col">Commission</th>
                      <th scope="col">Platforms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.glance.map((g) => (
                      <tr key={`${g.account}|${g.entity}|${g.jurisdiction}`}>
                        <th scope="row">
                          {g.account}
                          {g.entity || g.jurisdiction ? (
                            <div className="small muted">
                              {[g.entity, g.jurisdiction].filter(Boolean).join(' · ')}
                            </div>
                          ) : (
                            <div className="small muted">Entity not stated</div>
                          )}
                        </th>
                        <td>
                          <GlanceCell cell={g.cells.minimum_deposit} />
                        </td>
                        <td>
                          <GlanceCell cell={g.cells.maximum_leverage} />
                        </td>
                        <td>
                          <GlanceCell cell={g.cells.eurusd_spread} />
                        </td>
                        <td>
                          <GlanceCell cell={g.cells.trading_commission} />
                        </td>
                        <td>
                          <GlanceCell cell={g.cells.platforms} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableRegion>
            </section>
          ) : null}

          {v.topics.map((t) => (
            <section key={t.topic} aria-labelledby={`t-${t.topic}`}>
              <h2 id={`t-${t.topic}`}>{t.label}</h2>
              {t.fields.map((g) => (
                <div key={g.field}>
                  <h3>{g.label}</h3>
                  <ul className="fact-list">
                    {g.facts.map((f) => (
                      <FactCard key={f.factId} fact={f} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}

          <section aria-labelledby="entity-h">
            <h2 id="entity-h">Companies, operator and licences</h2>
            <EntitySection
              name={v.broker.name}
              named={v.namedCompanies}
              operators={v.operators}
              licences={v.licences}
              slug={slug}
              base={base}
            />
          </section>

          {fees || accounts || comps.length ? (
            <section aria-labelledby="more-h">
              <h2 id="more-h">More evidence for {v.broker.name}</h2>
              <ul>
                {fees ? (
                  <li>
                    <Link href={`${base}/${slug}/fees`}>{v.broker.name} spreads and commissions</Link>
                  </li>
                ) : null}
                {accounts ? (
                  <li>
                    <Link href={`${base}/${slug}/accounts`}>{v.broker.name} account types compared</Link>
                  </li>
                ) : null}
                {comps.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/compare/${c.slug}`}>{c.names.join(' vs ')}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="unknown-h">
            <h2 id="unknown-h">What we could not verify</h2>
            {v.unknowns.length ? (
              <>
                <p>
                  These fields have no accepted evidence for {v.broker.name}. That does not mean the value is
                  zero, absent or unavailable.
                </p>
                <ul className="chips">
                  {v.unknowns.map((u) => (
                    <li key={u.field} className="chip">
                      {u.label}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                All extracted fields have at least one accepted value. Other topics (for example withdrawal
                fees or client protection) are outside the current extraction set.
              </p>
            )}
            <p className="small muted">
              Eligibility, client protection and country availability are never inferred from a brand, locale
              or group list.
            </p>
          </section>

          <section aria-labelledby="faq-h">
            <h2 id="faq-h">Questions</h2>
            <FaqList faqs={v.faqs} slug={slug} facts={v.facts} base={base} />
          </section>

          <section aria-labelledby="src-h">
            <h2 id="src-h">Sources and limitations</h2>
            <SourceList sources={v.sources} />
            <p className="small muted">
              Facts are restated in our own words with a link to the official page; source text is not
              republished. Brokers change terms without notice: always confirm on the official page and in the
              account documents before acting. Found an error? See{' '}
              <Link href="/corrections">corrections</Link>.
            </p>
          </section>

          <section aria-labelledby="hist-h">
            <h2 id="hist-h">Revision history</h2>
            <HistoryList history={p.history} />
          </section>

          {related.length ? (
            <section aria-labelledby="rel-h">
              <h2 id="rel-h">Other published brokers</h2>
              <ul>
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`${base}/${r.slug}`}>{r.name}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <Notice kind="risk" title="Risk warning">
            <p>{RISK_STATEMENT}</p>
          </Notice>
        </div>
        <div>
          <EvidencePanel
            dates={p.dates}
            revisionNo={p.revision.revision_no}
            factCount={v.facts.length}
            sourceCount={v.sources.length}
            indexable={p.indexable}
          />
        </div>
      </div>
    </div>
  );
}
