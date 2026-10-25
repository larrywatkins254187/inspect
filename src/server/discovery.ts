import 'server-only';
import { CALCULATORS } from '@/calculators/defs';
import { GUIDES } from '@/guides/registry';
import { STATIC_CONTENT_DATE } from '@/content/dates';
import { getComparisons, getDirectory, getFees, getAccounts, getSources } from './public';

export interface DiscoveryEntry {
  path: string;
  title: string;
  lastModified: string;
  section: 'core' | 'broker' | 'comparison' | 'tool' | 'guide' | 'trust';
}

const TRUST: [string, string][] = [
  ['/methodology', 'Methodology'],
  ['/about', 'About'],
  ['/contact', 'Contact'],
  ['/corrections', 'Corrections'],
  ['/ai-policy', 'AI policy'],
  ['/affiliate-disclosure', 'Commercial disclosure'],
  ['/privacy', 'Privacy'],
  ['/risk-disclosure', 'Risk disclosure'],
  ['/disclaimer', 'Disclaimer'],
  ['/warnings', 'Warnings'],
];

/** Eligible indexable URLs only; lastModified is the substantive change date, never fetch/build time. */
export async function discoveryEntries(): Promise<DiscoveryEntry[]> {
  const [brokers, comps, sources] = await Promise.all([getDirectory(), getComparisons(), getSources()]);
  const out: DiscoveryEntry[] = [
    { path: '/', title: 'Home', lastModified: STATIC_CONTENT_DATE, section: 'core' },
    { path: '/tools', title: 'Calculators', lastModified: STATIC_CONTENT_DATE, section: 'core' },
    { path: '/guides', title: 'Guides', lastModified: STATIC_CONTENT_DATE, section: 'core' },
  ];
  const newest = (xs: (string | null)[]) => xs.filter(Boolean).sort().pop() ?? STATIC_CONTENT_DATE;
  if (brokers.length) out.push({ path: '/brokers', title: 'Broker directory', lastModified: newest(brokers.map((b) => b.materialUpdated)), section: 'core' });
  if (comps.length) out.push({ path: '/compare', title: 'Comparisons', lastModified: newest(comps.map((c) => c.materialUpdated)), section: 'core' });
  if (sources.length) out.push({ path: '/sources', title: 'Sources', lastModified: newest(brokers.map((b) => b.materialUpdated)), section: 'trust' });
  for (const b of brokers.filter((x) => x.indexable)) {
    out.push({ path: `/brokers/${b.slug}`, title: b.name, lastModified: b.materialUpdated ?? STATIC_CONTENT_DATE, section: 'broker' });
    const [fees, acc] = await Promise.all([getFees(b.slug), getAccounts(b.slug)]);
    if (fees?.indexable) out.push({ path: `/brokers/${b.slug}/fees`, title: `${b.name} fees`, lastModified: fees.dates.materialUpdated ?? STATIC_CONTENT_DATE, section: 'broker' });
    if (acc?.indexable) out.push({ path: `/brokers/${b.slug}/accounts`, title: `${b.name} accounts`, lastModified: acc.dates.materialUpdated ?? STATIC_CONTENT_DATE, section: 'broker' });
  }
  for (const c of comps) out.push({ path: `/compare/${c.slug}`, title: c.names.join(' vs '), lastModified: c.materialUpdated ?? STATIC_CONTENT_DATE, section: 'comparison' });
  for (const c of CALCULATORS) out.push({ path: `/tools/${c.slug}`, title: c.title, lastModified: STATIC_CONTENT_DATE, section: 'tool' });
  for (const g of GUIDES) out.push({ path: `/guides/${g.slug}`, title: g.title, lastModified: g.contentDate, section: 'guide' });
  for (const [path, title] of TRUST) out.push({ path, title, lastModified: STATIC_CONTENT_DATE, section: 'trust' });
  return out;
}
