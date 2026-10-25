/**
 * HTTP smoke/acceptance checks against running instances. Writes reports/smoke-report.md.
 *   tsx scripts/smoke.ts [mainOrigin] [e2eOrigin]
 * main = safe base target (publication off); e2e = isolated synthetic fixture instance (publication on).
 */
import fs from 'node:fs';
import { CALCULATORS } from '../src/calculators/defs';
import { GUIDES } from '../src/guides/registry';

const MAIN = process.argv[2] ?? 'http://127.0.0.1:3417';
const E2E = process.argv[3] ?? 'http://127.0.0.1:3418';
const CANON = 'https://forexinspect.com';
const results: { group: string; name: string; ok: boolean; detail: string }[] = [];
const check = (group: string, name: string, ok: boolean, detail = '') => results.push({ group, name, ok, detail });

interface Got {
  status: number;
  headers: Headers;
  html: string;
  location: string | null;
}
async function get(url: string, init: RequestInit = {}): Promise<Got> {
  const r = await fetch(url, { redirect: 'manual', ...init });
  return { status: r.status, headers: r.headers, html: await r.text(), location: r.headers.get('location') };
}
const head = (h: string) => h.split('</head>')[0] ?? '';
const title = (h: string) => /<title>([^<]*)<\/title>/.exec(head(h))?.[1] ?? null;
const canonical = (h: string) => /<link rel="canonical" href="([^"]+)"/.exec(head(h))?.[1] ?? null;
const robots = (h: string) => /<meta name="robots" content="([^"]+)"/.exec(head(h))?.[1] ?? null;
const h1s = (h: string) => [...h.matchAll(/<h1\b/g)].length;
const mainBeforeFooter = (h: string, needle?: string) => {
  const m = h.indexOf('<main');
  const f = h.indexOf('<footer');
  return m >= 0 && f > m && (!needle || h.slice(m, f).includes(needle));
};
const jsonLd = (h: string) =>
  [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try {
      return JSON.parse(m[1]!) as Record<string, unknown>;
    } catch {
      return { parseError: true } as Record<string, unknown>;
    }
  });
const types = (h: string) => jsonLd(h).map((j) => String(j['@type'] ?? (j.parseError ? 'PARSE_ERROR' : '?')));

async function page(group: string, base: string, path: string, expect: { status?: number; indexable?: boolean; contains?: string[]; notContains?: string[]; ld?: string[] } = {}) {
  const g = await get(base + path);
  const want = expect.status ?? 200;
  check(group, `${path} → ${want}`, g.status === want, `got ${g.status}`);
  if (want !== 200) {
    if (want === 404) check(group, `${path} 404 is noindex`, /noindex/.test(robots(g.html) ?? g.headers.get('x-robots-tag') ?? ''), robots(g.html) ?? '');
    return g;
  }
  check(group, `${path} one h1`, h1s(g.html) === 1, `${h1s(g.html)} h1`);
  check(group, `${path} title`, !!title(g.html), title(g.html) ?? '');
  check(group, `${path} canonical self (https)`, canonical(g.html) === CANON + (path === '/' ? '' : path), canonical(g.html) ?? 'none');
  check(group, `${path} main before footer`, mainBeforeFooter(g.html));
  check(group, `${path} JSON-LD parses`, !types(g.html).includes('PARSE_ERROR'), types(g.html).join(', '));
  check(group, `${path} no rating schema`, !/aggregateRating|"Review"/.test(g.html));
  if (expect.indexable !== undefined) check(group, `${path} ${expect.indexable ? 'indexable' : 'noindex'}`, expect.indexable ? !/noindex/.test(robots(g.html) ?? '') : /noindex/.test(robots(g.html) ?? ''), robots(g.html) ?? 'index (default)');
  for (const c of expect.contains ?? []) check(group, `${path} SSR contains “${c.slice(0, 40)}”`, mainBeforeFooter(g.html, c), '');
  for (const c of expect.notContains ?? []) check(group, `${path} does not contain “${c.slice(0, 40)}”`, !g.html.includes(c));
  for (const t of expect.ld ?? []) check(group, `${path} JSON-LD ${t}`, types(g.html).includes(t), types(g.html).join(', '));
  check(group, `${path} og/twitter`, /property="og:title"/.test(head(g.html)) && /name="twitter:card"/.test(head(g.html)));
  return g;
}

// ── Main safe-base instance ───────────────────────────────────────────
const M = 'main (publication off)';
const home = await page(M, MAIN, '/', { indexable: true, contains: ['Broker research is in preparation', 'How a claim reaches a page'], notContains: ['challenges.cloudflare.com/turnstile', 'googletagmanager.com', 'Published brokers</dt>'], ld: ['Organization'] });
check(M, 'security headers', !!home.headers.get('content-security-policy') && home.headers.get('x-frame-options') === 'DENY' && home.headers.get('x-content-type-options') === 'nosniff');
check(M, 'no x-powered-by', !home.headers.get('x-powered-by'));
await page(M, MAIN, '/brokers', { indexable: false, contains: ['No broker profiles are published yet'] });
await page(M, MAIN, '/compare', { indexable: false });
await page(M, MAIN, '/sources', { indexable: false, contains: ['European Central Bank'] });
await page(M, MAIN, '/brokers/pepperstone', { status: 404 });
await page(M, MAIN, '/brokers/pepperstone/fees', { status: 404 });
await page(M, MAIN, '/compare/fxpro-vs-pepperstone', { status: 404 });
await page(M, MAIN, '/tools/not-a-tool', { status: 404 });
await page(M, MAIN, '/tools', { indexable: true, contains: ['Trade sizing'], ld: ['ItemList', 'BreadcrumbList'] });
for (const c of CALCULATORS) await page(M, MAIN, `/tools/${c.slug}`, { indexable: true, contains: ['Formula', 'Worked example', 'Reset inputs', 'Result'], ld: ['WebApplication', 'BreadcrumbList'] });
await page(M, MAIN, '/guides', { indexable: true });
for (const g of GUIDES) await page(M, MAIN, `/guides/${g.slug}`, { indexable: true, contains: [g.sections[0]!.heading.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')], ld: ['Article', 'BreadcrumbList'] });
for (const p of ['/methodology', '/about', '/contact', '/corrections', '/ai-policy', '/affiliate-disclosure', '/privacy', '/risk-disclosure', '/disclaimer', '/warnings']) await page(M, MAIN, p, { indexable: true });
const slash = await get(`${MAIN}/brokers/`);
check(M, 'trailing slash → 308', slash.status === 308 && slash.location === '/brokers', `${slash.status} ${slash.location}`);
for (const p of ['/admin', '/admin/assets', '/preview', '/preview/brokers/example-markets-fixture']) {
  const g = await get(MAIN + p);
  check(M, `${p} unauthorized → 404 noindex no-store`, g.status === 404 && /noindex/.test(g.headers.get('x-robots-tag') ?? '') && /no-store/.test(g.headers.get('cache-control') ?? ''), `${g.status} ${g.headers.get('x-robots-tag')} ${g.headers.get('cache-control')}`);
}
const bearer = await get(`${MAIN}/admin`, { headers: { authorization: 'Bearer guess' } });
check(M, '/admin with wrong bearer → 404', bearer.status === 404);
const ask = await get(`${MAIN}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'x', token: 'y', history: [] }) });
check(M, 'POST /api/ask with gates off → 404 no-store', ask.status === 404 && /no-store/.test(ask.headers.get('cache-control') ?? ''), String(ask.status));
const rates = await get(`${MAIN}/api/reference-rates`);
check(M, '/api/reference-rates dated, no-store', rates.status === 200 && /"date":"\d{4}-\d{2}-\d{2}"/.test(rates.html) && /no-store/.test(rates.headers.get('cache-control') ?? ''), rates.html.slice(0, 80));
const health = await get(`${MAIN}/health`);
check(M, '/health ok, no-store, publication off', health.status === 200 && /"publication":"off"/.test(health.html) && /no-store/.test(health.headers.get('cache-control') ?? ''));
const rb = await get(`${MAIN}/robots.txt`);
check(M, 'robots.txt disallows private routes + sitemap', /Disallow: \/admin/.test(rb.html) && /Disallow: \/preview/.test(rb.html) && /Sitemap: https:\/\/forexinspect.com\/sitemap.xml/.test(rb.html));
const sm = await get(`${MAIN}/sitemap.xml`);
const locs = [...sm.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
check(M, 'sitemap excludes empty directories and private routes', !locs.some((l) => /\/(brokers|compare|sources|admin|preview|api)(\/|$)/.test(l.replace(CANON, ''))), locs.length + ' urls');
check(M, 'sitemap has 15 tools + 4 guides', locs.filter((l) => l.includes('/tools/')).length === 15 && locs.filter((l) => l.includes('/guides/')).length === 4);
check(M, 'sitemap lastmod on every url', (sm.html.match(/<lastmod>/g) ?? []).length === locs.length);
const llms = await get(`${MAIN}/llms.txt`);
check(M, 'llms.txt navigation', llms.status === 200 && /^# ForexInspect/.test(llms.html) && !/\/admin/.test(llms.html));

// ── E2E synthetic instance (publication on, fictional fixtures) ──────
const E = 'e2e synthetic (publication on)';
const prof = await page(E, E2E, '/brokers/alpha-fixture-markets', { indexable: true, contains: ['100 USD', 'id="fact-', 'www.alpha-fixture-markets.invalid', 'What we could not verify', 'Not verified', 'Revision history', 'Named by broker', 'No licence has been independently matched'], ld: ['Article', 'BreadcrumbList'] });
check(E, 'profile fact anchors are stable fact-<observationId>', /id="fact-\d+"/.test(prof.html));
check(E, 'profile shows distinct observed/verified/re-check dates', /Observed /.test(prof.html) && /Verified /.test(prof.html) && /Re-check due /.test(prof.html));
await page(E, E2E, '/brokers/alpha-fixture-markets/fees', { indexable: true, contains: ['EUR/USD spreads', 'Complete cost basis', 'Fees not verified'] });
await page(E, E2E, '/brokers/alpha-fixture-markets/accounts', { indexable: true, contains: ['Conditions by account', 'Standard versus Raw'] });
const dir = await page(E, E2E, '/brokers', { indexable: true, contains: ['Alpha Fixture Markets', 'Core topic coverage'], ld: ['ItemList'] });
const list = jsonLd(dir.html).find((j) => j['@type'] === 'ItemList') as { itemListElement?: { name: string }[] } | undefined;
check(E, 'directory ItemList order = visible alphabetical order', JSON.stringify(list?.itemListElement?.map((i) => i.name)) === JSON.stringify(['Alpha Fixture Markets', 'Beta Fixture Markets']));
await page(E, E2E, '/compare/alpha-fixture-markets-vs-beta-fixture-markets', { indexable: true, contains: ['Shared verified fields', 'names no winner'], ld: ['Article'] });
const rev = await get(`${E2E}/compare/beta-fixture-markets-vs-alpha-fixture-markets`);
check(E, 'reversed comparison → 308 canonical', rev.status === 308 && rev.location === '/compare/alpha-fixture-markets-vs-beta-fixture-markets', `${rev.status} ${rev.location}`);
const img = await fetch(`${E2E}/compare/alpha-fixture-markets-vs-beta-fixture-markets/image`);
check(E, 'comparison share image PNG', img.status === 200 && img.headers.get('content-type') === 'image/png' && !!img.headers.get('x-asset-provenance'), `${img.status} ${img.headers.get('content-type')}`);
const home2 = await page(E, E2E, '/', { contains: ['Published brokers', 'Find a broker'] });
check(E, 'home stats derived from snapshots', /<dt>Published brokers<\/dt><dd>2<\/dd>/.test(home2.html));
await page(E, E2E, '/sources', { indexable: true, contains: ['www.alpha-fixture-markets.invalid'] });
const sm2 = await get(`${E2E}/sitemap.xml`);
check(E, 'sitemap includes eligible profile/child/comparison pages', ['/brokers/alpha-fixture-markets', '/brokers/alpha-fixture-markets/fees', '/compare/alpha-fixture-markets-vs-beta-fixture-markets', '/brokers'].every((p) => sm2.html.includes(`<loc>${CANON}${p}</loc>`)));
const logo = await fetch(`${E2E}/asset-file/alpha-fixture-markets-logo.webp`);
check(E, 'approved asset served with bounded cache', logo.status === 200 && /max-age=3600/.test(logo.headers.get('cache-control') ?? ''));
const remote = await fetch(`${E2E}/_next/image?url=${encodeURIComponent('https://evil.example/x.png')}&w=256&q=80`);
check(E, 'image optimizer rejects remote URLs', remote.status >= 400, String(remote.status));

const failed = results.filter((r) => !r.ok);
const md = [
  '# HTTP smoke and acceptance report',
  '',
  `Generated ${new Date().toISOString()}. Main: \`${MAIN}\` (safe base: publication/integrations off). E2E: \`${E2E}\` (isolated synthetic fixture database, publication on; fictional brokers, never production).`,
  '',
  `**${results.length - failed.length} / ${results.length} checks passed.**`,
  '',
  ...[...new Set(results.map((r) => r.group))].flatMap((g) => [`## ${g}`, '', '| Check | Result | Detail |', '| --- | --- | --- |', ...results.filter((r) => r.group === g).map((r) => `| ${r.name.replace(/\|/g, '\\|')} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '\\|').slice(0, 120)} |`), '']),
].join('\n');
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/smoke-report.md', md);
console.log(`${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log(`FAIL [${f.group}] ${f.name}: ${f.detail}`);
process.exitCode = failed.length ? 1 : 0;
