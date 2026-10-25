import { CALCULATORS } from '@/calculators/defs';

export const SITE_NAME = 'ForexInspect';
export const SITE_TAGLINE = 'Evidence-first forex broker research';

export const PRIMARY_NAV = [
  { href: '/brokers', label: 'Brokers' },
  { href: '/compare', label: 'Compare' },
  { href: '/tools', label: 'Tools' },
  { href: '/guides', label: 'Guides' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/sources', label: 'Sources' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
] as const;

export const FOOTER_GROUPS = [
  {
    title: 'Research',
    links: [
      { href: '/brokers', label: 'Broker directory' },
      { href: '/compare', label: 'Comparisons' },
      { href: '/guides', label: 'Guides' },
      { href: '/sources', label: 'Sources' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { href: '/methodology', label: 'Methodology' },
      { href: '/corrections', label: 'Corrections' },
      { href: '/ai-policy', label: 'AI policy' },
      { href: '/affiliate-disclosure', label: 'Commercial disclosure' },
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/risk-disclosure', label: 'Risk disclosure' },
      { href: '/disclaimer', label: 'Disclaimer' },
      { href: '/warnings', label: 'Warnings' },
    ],
  },
] as const;

export const TOOL_LINKS = CALCULATORS.map((c) => ({ href: `/tools/${c.slug}`, label: c.name }));

export function contactAddresses(domain: string) {
  return {
    support: `support@${domain}`,
    corrections: `corrections@${domain}`,
    privacy: `privacy@${domain}`,
    security: `security@${domain}`,
  };
}

/** Public commercial position — must match actual behaviour (no affiliate code exists). */
export const COMMERCIAL_STATEMENT =
  'ForexInspect publishes no broker ratings, rankings or recommendations, uses no affiliate links and accepts no payment from brokers for inclusion.';
export const RISK_STATEMENT =
  'Trading leveraged products such as forex and CFDs carries a high risk of losing money rapidly. Only trade with money you can afford to lose. ForexInspect provides information, not personal financial advice.';
