import type { Metadata } from 'next';
import { COMMERCIAL_STATEMENT } from '@/content/site';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({
  title: 'Commercial and affiliate disclosure',
  description:
    'ForexInspect uses no affiliate links, accepts no broker payments for inclusion and publishes no ratings, rankings or recommendations.',
  path: '/affiliate-disclosure',
});

export default function Affiliate() {
  return (
    <InfoPage
      path="/affiliate-disclosure"
      label="Commercial disclosure"
      eyebrow="Trust"
      title="Commercial and affiliate disclosure"
      lead={COMMERCIAL_STATEMENT}
    >
      <h2>Current position</h2>
      <ul>
        <li>No affiliate or tracked referral links: links to brokers go directly to their official pages.</li>
        <li>
          No payment, sponsorship or free service from brokers in exchange for inclusion, placement or
          wording.
        </li>
        <li>No ratings, scores, rankings, “best” lists or recommendations.</li>
        <li>
          Which brokers are researched is decided by evidence availability and source permissions, not by
          commercial relationships.
        </li>
      </ul>
      <h2>If this changes</h2>
      <p>
        Any future commercial arrangement will be disclosed on this page before it takes effect, and on every
        page where it applies. It would not change evidence rules: facts would still need the same sources and
        checks.
      </p>
    </InfoPage>
  );
}
