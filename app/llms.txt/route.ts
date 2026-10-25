import { discoveryEntries } from '@/server/discovery';
import { absolute } from '@/server/seo';
import { COMMERCIAL_STATEMENT } from '@/content/site';

export const dynamic = 'force-dynamic';

/** Optional machine-readable navigation guide. Not a ranking mechanism. */
export async function GET() {
  const entries = await discoveryEntries();
  const group = (s: string) =>
    entries.filter((e) => e.section === s).map((e) => `- [${e.title}](${absolute(e.path)})`);
  const body = [
    '# ForexInspect',
    '',
    '> Evidence-first forex broker research: dated, scoped facts from approved official broker pages, plus general calculators and guides. ' +
      COMMERCIAL_STATEMENT,
    '',
    'Facts carry account/entity/jurisdiction scope and observation/verification/expiry dates. "Not verified" means no accepted evidence, never zero. Pages are re-checked on every read.',
    '',
    '## Research',
    ...group('core'),
    ...group('broker'),
    ...group('comparison'),
    '',
    '## Calculators',
    ...group('tool'),
    '',
    '## Guides',
    ...group('guide'),
    '',
    '## Trust and policies',
    ...group('trust'),
    '',
  ].join('\n');
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
