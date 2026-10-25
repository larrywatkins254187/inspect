import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({ title: 'Warnings: common forex broker red flags', description: 'Warning signs to check before using a forex broker: unmatched licences, clone firms, bonuses, withdrawal conditions and unsolicited contact.', path: '/warnings' });

export default function Warnings() {
  return (
    <InfoPage path="/warnings" label="Warnings" eyebrow="Legal" title="Warnings and red flags" lead="General warning signs to check yourself. ForexInspect does not label any broker as a scam or as safe.">
      <ul>
        <li><strong>Licence claims you cannot match</strong> in the regulator’s own register, or a register entry for a different company or website (possible clone firm).</li>
        <li><strong>Offshore entities</strong> serving you when the brand also has a more strictly regulated entity — check which company your account would be with.</li>
        <li><strong>Bonuses or guaranteed returns</strong>, especially with conditions that block withdrawals.</li>
        <li><strong>Pressure and unsolicited contact</strong>, “account managers” urging deposits, or requests for remote access to your device.</li>
        <li><strong>Unclear fees</strong> or withdrawal terms you cannot find in writing.</li>
        <li><strong>Payment to individuals</strong> or to companies not named in your client agreement.</li>
      </ul>
      <p>Many regulators publish warning lists of unauthorised firms. If something feels wrong, stop and verify using the regulator’s official website. See also <Link href="/guides/how-to-choose-a-forex-broker">how to choose a forex broker</Link>.</p>
    </InfoPage>
  );
}
