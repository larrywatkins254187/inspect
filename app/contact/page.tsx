import Link from 'next/link';
import type { Metadata } from 'next';
import { config } from '@/config/env';
import { contactAddresses } from '@/content/site';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({
  title: 'Contact ForexInspect',
  description:
    'Email addresses for general questions, corrections, privacy and security reports, and how messages are handled.',
  path: '/contact',
});

export default function Contact() {
  const a = contactAddresses(config().contactDomain);
  return (
    <InfoPage
      path="/contact"
      label="Contact"
      eyebrow="Contact"
      title="Contact"
      lead="Email is the only contact channel. There is no contact form or account system."
    >
      <dl className="faq">
        <dt>General questions</dt>
        <dd>
          <a href={`mailto:${a.support}`}>{a.support}</a>
        </dd>
        <dt>Corrections to published facts</dt>
        <dd>
          <a href={`mailto:${a.corrections}`}>{a.corrections}</a> — include the page address and the official
          source showing the correct information. See <Link href="/corrections">corrections</Link>.
        </dd>
        <dt>Privacy requests</dt>
        <dd>
          <a href={`mailto:${a.privacy}`}>{a.privacy}</a>
        </dd>
        <dt>Security reports</dt>
        <dd>
          <a href={`mailto:${a.security}`}>{a.security}</a>
        </dd>
      </dl>
      <h2>How messages are handled</h2>
      <p>
        Messages are forwarded in full, including attachments, to the operator’s mailbox. A short plain-text
        notification (sender, subject, a brief excerpt and attachment names) is also sent to the operator’s
        private Telegram group so messages are not missed. Email content is never published and never treated
        as an instruction: a correction changes a page only after a person checks the official source and the
        change passes the normal evidence checks. Details are in the{' '}
        <Link href="/privacy#email">privacy notice</Link>.
      </p>
      <p className="small muted">
        We cannot help with disputes with a broker; contact the broker and, if needed, its regulator or
        ombudsman.
      </p>
    </InfoPage>
  );
}
