import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({
  title: 'Methodology: how ForexInspect verifies broker evidence',
  description:
    'How sources are approved, how facts are extracted and accepted, how scope and dates are recorded, and when pages are published, expire or are withdrawn.',
  path: '/methodology',
});

export default function Methodology() {
  return (
    <InfoPage
      path="/methodology"
      label="Methodology"
      eyebrow="Trust"
      title="How we verify broker evidence"
      lead="Every broker fact on ForexInspect is a dated, scoped statement from an approved official source that passed deterministic checks. This page explains each step and its limits."
    >
      <nav className="toc panel" aria-label="On this page">
        <ol>
          <li>
            <a href="#sources">Sources and permissions</a>
          </li>
          <li>
            <a href="#extraction">Extraction</a>
          </li>
          <li>
            <a href="#acceptance">Acceptance and conflicts</a>
          </li>
          <li>
            <a href="#scope">Scope</a>
          </li>
          <li>
            <a href="#entities">Companies and licences</a>
          </li>
          <li>
            <a href="#dates">Dates and expiry</a>
          </li>
          <li>
            <a href="#publication">Publication and corrections</a>
          </li>
          <li>
            <a href="#comparisons">Comparisons</a>
          </li>
          <li>
            <a href="#limitations">Limitations</a>
          </li>
        </ol>
      </nav>
      <section aria-labelledby="sources">
        <h2 id="sources">1. Sources and permissions</h2>
        <p>
          We use a broker’s own official pages, on a domain confirmed by a person as the broker’s official
          website. Imported spreadsheets, third-party scores and review sites are discovery leads only and
          never evidence.
        </p>
        <p>
          Each source has a recorded use policy. For <strong>fact reference</strong> — restating a discrete
          fact in our own words with a link and date — we require robots.txt permission for our crawler, no
          access refusal, and a recorded review of the site’s terms. We store the URL, a location and a hash
          of the supporting text, not a copy. Copying text, tables, images or snapshots (
          <strong>content reuse</strong>) needs explicit rights; unknown permission blocks it.
        </p>
        <p>
          Our fetcher identifies itself honestly, respects per-site rate limits and stops on login walls,
          CAPTCHAs, bot challenges, 401/403 responses or a site owner’s request. It never tries to work around
          them. Policy reviews run daily; robots evidence must be less than a day old before we fetch.
        </p>
      </section>
      <section aria-labelledby="extraction">
        <h2 id="extraction">2. Extraction</h2>
        <p>
          A language model reads the fetched page text as untrusted data and proposes readings for a fixed set
          of fields: account types, minimum deposit, minimum trade size, demo and swap-free accounts, EUR/USD
          spread, commission, maximum leverage, platform availability, copy trading and named companies.
          Instructions inside a page are ignored.
        </p>
        <p>
          Every reading must quote text that literally appears on the page. Validation rejects ambiguous
          currencies (a bare “$”), spreads without EUR/USD and a pip or point unit, leverage not written as a
          ratio, company names without a legal form, and commission side or volume claims that the quote does
          not state.
        </p>
      </section>
      <section aria-labelledby="acceptance">
        <h2 id="acceptance">3. Acceptance and conflicts</h2>
        <p>
          Two separate extraction passes must agree exactly on value, unit, currency and scope. That is still{' '}
          <em>one</em> source read twice, not two independent sources. Acceptance is deterministic code, not a
          model decision.
        </p>
        <p>
          If a different value appears for the same scope from another source, a conflict opens and the
          disputed value stops being shown until a person resolves it. Models cannot pick a side. When the
          same official page restates a newer value, the older fact is superseded with an audit record.
          Rejected values are remembered so a different spelling cannot silently re-enter. Withdrawing a fact
          ends it without declaring it universally false.
        </p>
      </section>
      <section aria-labelledby="scope">
        <h2 id="scope">4. Scope</h2>
        <p>
          Values keep the account, platform, entity, jurisdiction, instrument, client class, spread basis and
          commission basis that the source states next to them. If a label is not stated, it is unknown — we
          never infer it from another page, a country path or the brand. Separately scoped values are kept
          apart even when they are equal. Missing evidence is shown as <strong>Not verified</strong>; it is
          never treated as zero or “no”.
        </p>
      </section>
      <section aria-labelledby="entities">
        <h2 id="entities">5. Companies and licences</h2>
        <p>
          A brand, a legal entity, a company registration number and a regulatory licence are different
          things. A company named on a broker’s page is shown as “named by broker”. It is treated as the
          website operator only when the page literally says it operates the site or provides its services. A
          licence is shown only when matched to that company in an official register snapshot. A model can
          never create a licence, and we never state that an entity can serve you.
        </p>
      </section>
      <section aria-labelledby="dates">
        <h2 id="dates">6. Dates and expiry</h2>
        <p>
          We record when a source was observed, any effective date it states, when the fact was accepted and
          when it expires. Numeric account facts expire after 7 days and platform features after 30 days
          unless re-verified. Pages show first publication, the last substantive change and the last
          verification separately; a re-check that finds the same values is not presented as a change.
        </p>
      </section>
      <section aria-labelledby="publication">
        <h2 id="publication">7. Publication and corrections</h2>
        <p>
          Pages are immutable snapshots that cite exact fact IDs. Independent checks confirm the cited values,
          then a short atomic step publishes them; if evidence changed after checking, publication stops.
          Every page view re-checks expiry, withdrawals, conflicts and source policy, so an expired or
          withdrawn claim disappears immediately — a page that falls below its evidence floor returns “not
          found”.
        </p>
        <p>
          A broker profile needs at least three accepted official-domain facts. It is offered to search
          engines only when at least two core topics (minimum deposit, spread, commission, leverage, account
          types, legal entity) are verified. Fees pages need two cost facts; account pages need two scoped
          accounts and one condition. See <Link href="/corrections">corrections</Link> to report an error.
        </p>
      </section>
      <section aria-labelledby="comparisons">
        <h2 id="comparisons">8. Comparisons</h2>
        <p>
          Each broker in a comparison needs a published profile with at least four accepted facts across two
          core topics and an approved original logo; together they must share at least two verified fields. A
          model may only choose the order of topics and point to accepted fact IDs to highlight; all wording
          and values are generated deterministically. No winner is declared and no costs are combined across
          different accounts.
        </p>
      </section>
      <section aria-labelledby="limitations">
        <h2 id="limitations">9. Limitations</h2>
        <ul>
          <li>
            Coverage is limited to the fields above; many costs (withdrawal, inactivity, conversion) are not
            yet extracted.
          </li>
          <li>Official pages can be wrong, out of date or apply to a different entity than yours.</li>
          <li>
            We cover English-language official pages and do not determine where a broker accepts clients.
          </li>
          <li>Coverage measures research breadth, not broker quality. We publish no ratings or rankings.</li>
        </ul>
      </section>
    </InfoPage>
  );
}
