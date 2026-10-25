import Link from 'next/link';
import { COMMERCIAL_STATEMENT, FOOTER_GROUPS, RISK_STATEMENT, SITE_NAME, TOOL_LINKS } from '@/content/site';
import { ConsentSettingsButton } from './client/Consent';
import { Logo } from './icons';

export function SiteFooter({ analyticsOffered }: { analyticsOffered: boolean }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" className="brand">
              <Logo size={24} />
              <span>{SITE_NAME}</span>
            </Link>
            <p className="muted small" style={{ marginTop: 12 }}>
              Dated, scoped primary evidence about forex brokers, with general calculators and guides. English-language, worldwide audience.
            </p>
          </div>
          {FOOTER_GROUPS.map((g) => (
            <nav key={g.title} aria-label={`${g.title} links`}>
              <h2>{g.title}</h2>
              <ul>
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
                {g.title === 'Legal' && analyticsOffered ? (
                  <li>
                    <ConsentSettingsButton />
                  </li>
                ) : null}
              </ul>
            </nav>
          ))}
        </div>
        <nav aria-label="Calculators" style={{ marginTop: 32 }}>
          <div className="footer-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <h2>
                <Link href="/tools">Calculators</Link>
              </h2>
              <ul className="footer-tools">
                {TOOL_LINKS.map((t) => (
                  <li key={t.href}>
                    <Link href={t.href}>{t.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </nav>
        <div className="footer-notes">
          <p>
            <strong>Risk warning.</strong> {RISK_STATEMENT} See the <Link href="/risk-disclosure">risk disclosure</Link>.
          </p>
          <p>
            <strong>Independence.</strong> {COMMERCIAL_STATEMENT} ForexInspect is not a broker, does not open accounts, hold funds or execute trades.
          </p>
          <p>© {new Date().getUTCFullYear()} {SITE_NAME}. Inter typeface under the <a href="/licenses/Inter-OFL.txt">SIL Open Font License</a>.</p>
        </div>
      </div>
    </footer>
  );
}
