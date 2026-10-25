import Link from 'next/link';
import type { Metadata } from 'next';
import { COMMERCIAL_STATEMENT } from '@/content/site';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({ title: 'About ForexInspect', description: 'What ForexInspect is, what it is not, and how the research product is operated.', path: '/about' });

export default function About() {
  return (
    <InfoPage path="/about" label="About" eyebrow="About" title="About ForexInspect" lead="ForexInspect is an English-language research site that records what forex brokers state on their official websites, with the scope and dates needed to check those claims.">
      <h2>What we do</h2>
      <p>We collect discrete facts — deposits, spreads, commissions, leverage, account types, platforms and the companies brokers name — from approved official sources, accept them only after deterministic checks, and publish them with links and dates. We also provide general calculators and guides.</p>
      <h2>What we are not</h2>
      <ul>
        <li>We are not a broker. We do not open accounts, hold funds, process payments or execute trades.</li>
        <li>We do not give personal financial advice or tell you which broker to use.</li>
        <li>We do not test brokers firsthand, and we do not claim expert reviews or credentials.</li>
      </ul>
      <h2>Independence</h2>
      <p>{COMMERCIAL_STATEMENT} If that ever changes, the <Link href="/affiliate-disclosure">commercial disclosure</Link> will be updated first.</p>
      <h2>How the site is run</h2>
      <p>ForexInspect is an independent project. Its operator uses the automated, audited workflow described in the <Link href="/methodology">methodology</Link>. Automated steps prepare readings; acceptance rules are deterministic, and decisions about source policies, conflicts and corrections are made by a person.</p>
      <p>Questions or corrections: see <Link href="/contact">contact</Link>.</p>
    </InfoPage>
  );
}
