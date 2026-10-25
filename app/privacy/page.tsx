import Link from 'next/link';
import type { Metadata } from 'next';
import { config } from '@/config/env';
import { contactAddresses } from '@/content/site';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({ title: 'Privacy notice', description: 'What ForexInspect collects: optional consent-based analytics, Ask questions kept for 30 days with a salted network hash, and contact emails.', path: '/privacy' });

export default function Privacy() {
  const cfg = config();
  const a = contactAddresses(cfg.contactDomain);
  return (
    <InfoPage path="/privacy" label="Privacy" eyebrow="Legal" title="Privacy notice" lead="ForexInspect has no user accounts and does not sell data. This notice explains the limited processing that happens when you use the site.">
      <h2 id="basics">Basic site use</h2>
      <p>Our server receives standard request information (IP address, browser user agent, requested page) to deliver pages and protect the service. Server logs are kept for operational security and are not used for advertising. Calculator inputs stay in your browser and are not sent to us.</p>
      <h2 id="analytics">Optional analytics</h2>
      <p>{cfg.analytics.enabled && cfg.analytics.measurementId ? 'If you choose “Accept”, Google Analytics 4 loads and counts page views and two anonymous events (a calculator was used; an evidence link was opened). Nothing loads from Google before you accept.' : 'Analytics are currently switched off. If they are enabled in future, Google Analytics 4 will load only after you choose “Accept” in a consent prompt.'} Page views are sent without query strings or fragments and referrers are reduced to the site origin. We never send calculator inputs, questions, evidence values or personal details. Your choice is stored in your browser; you can change it any time with “Analytics settings” in the footer, which also stops future tracking and removes Google Analytics cookies on this site. Private and operational pages never load analytics.</p>
      <h2 id="ask">Ask ForexInspect</h2>
      <p>When Ask is available, Cloudflare Turnstile loads only after you press Ask, to check that a person is asking; Cloudflare processes the check under its own privacy policy. Your question, the short in-page conversation history sent with it (up to six turns) and the answer are stored for <strong>30 days</strong> to prevent abuse and improve accuracy, then deleted. Instead of your IP address we store a salted one-way hash to apply rate limits (10 attempts per hour). Please do not include personal details in questions. The conversation shown on the page lives only in your browser tab.</p>
      <h2 id="email">Contact emails</h2>
      <p>Mail to our addresses is processed by Cloudflare Email Routing and a Cloudflare Email Worker. The full message and attachments are forwarded to the operator’s mailbox. A short plain-text notification — sender, subject, a brief excerpt of the body and attachment names and sizes — is sent through Telegram to the operator’s private group. Email content is not published. Corrections are accepted only after a person verifies the official source; resolved corrections are listed without your name or message.</p>
      <h2 id="rights">Your choices and rights</h2>
      <p>You can decline analytics, avoid Ask, and request access to or deletion of data we hold about you by writing to <a href={`mailto:${a.privacy}`}>{a.privacy}</a>. Ask records are deleted automatically after 30 days.</p>
      <p className="small muted">See also the <Link href="/ai-policy">AI policy</Link> and <Link href="/disclaimer">disclaimer</Link>.</p>
    </InfoPage>
  );
}
