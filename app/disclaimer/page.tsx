import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({ title: 'Disclaimer', description: 'ForexInspect provides general information for research. It is not financial advice, an offer or an endorsement of any broker.', path: '/disclaimer' });

export default function Disclaimer() {
  return (
    <InfoPage path="/disclaimer" label="Disclaimer" eyebrow="Legal" title="Disclaimer" lead="ForexInspect provides general information to help you research. It is not financial, legal or tax advice.">
      <ul>
        <li>Broker facts are restated from official sources at the dates shown and may have changed. Confirm on the official page and in the account documents.</li>
        <li>Showing a broker does not mean it is suitable for you, authorised in your country or endorsed by us. Showing a regulator does not mean any broker is authorised by it.</li>
        <li>“Not verified” means we have no accepted evidence — not that a feature or fee is absent.</li>
        <li>Reference exchange rates are daily European Central Bank figures for information, not tradable quotes.</li>
        <li>We take care to be accurate but cannot guarantee completeness. Report errors via <Link href="/corrections">corrections</Link>.</li>
      </ul>
      <p>Trademarks and logos belong to their owners and are used only to identify the brokers concerned.</p>
    </InfoPage>
  );
}
