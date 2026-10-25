/**
 * Read-only SEO crawl of running instances using the production audit rules (src/domain/seo-audit.ts).
 * Uses a temporary database so operator SEO state is untouched. Writes reports/crawl-report.md.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/client';
import { migrate } from '../src/db/migrate';
import { seoCrawl } from '../src/domain/seo-audit';

const targets: [string, string][] = [
  ['main (publication off)', process.argv[2] ?? 'http://127.0.0.1:3417'],
  ['e2e synthetic (publication on)', process.argv[3] ?? 'http://127.0.0.1:3418'],
];
const out: string[] = [
  '# SEO crawl report',
  '',
  `Generated ${new Date().toISOString()}. Crawls each instance’s own \`/sitemap.xml\`, fetches every listed URL without following redirects, applies the deterministic rules in \`src/domain/seo-audit.ts\` (status, title/description presence/length heuristics/duplicates, single self-canonical, one h1, heading order, sitemap/robots consistency, JSON-LD parse and no rating markup, Open Graph/Twitter, image alt/dimensions, lang, viewport, main-before-footer) and checks every internal link. Canonical origin: https://forexinspect.com (URLs are mapped to the local origin for fetching). Length limits are local editorial heuristics, not Google rules.`,
  '',
];
let totalErrors = 0;
for (const [label, origin] of targets) {
  const db = openDatabase(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fi-crawl-')), 'seo.sqlite'));
  await migrate(db, { snapshotDir: null });
  const r = await seoCrawl(db, {
    origin,
    canonicalOrigin: 'https://forexinspect.com',
    fetch: (u, i) => fetch(u, { redirect: i?.redirect ?? 'follow', method: i?.method ?? 'GET' }),
    now: () => new Date(),
  });
  const errors = r.pages.flatMap((p) =>
    p.issues.filter((i) => i.severity === 'ERROR').map((i) => `${p.url}: ${i.rule} — ${i.message}`),
  );
  const warns = r.pages.flatMap((p) =>
    p.issues.filter((i) => i.severity !== 'ERROR').map((i) => `${p.url}: ${i.rule} — ${i.message}`),
  );
  totalErrors += errors.length;
  out.push(
    `## ${label}`,
    '',
    `- Sitemap URLs crawled: ${r.pages.length} (all HTTP 200: ${r.pages.every((p) => p.status === 200) ? 'yes' : 'no'})`,
    `- Internal links checked: ${new Set(r.pages.flatMap((p) => p.internalLinks)).size}; broken: ${r.brokenLinks.length}`,
    `- Errors: ${errors.length}; warnings/info: ${warns.length}`,
    '',
  );
  out.push(
    '| URL | Status | Title |',
    '| --- | --- | --- |',
    ...r.pages.map(
      (p) =>
        `| ${p.url.replace('https://forexinspect.com', '') || '/'} | ${p.status} | ${(p.title ?? '').replace(/\|/g, '\\|')} |`,
    ),
    '',
  );
  if (errors.length) out.push('### Errors', '', ...errors.map((e) => `- ${e}`), '');
  if (warns.length) out.push('### Warnings / info', '', ...warns.map((e) => `- ${e}`), '');
  console.log(
    label,
    r.pages.length,
    'pages',
    errors.length,
    'errors',
    warns.length,
    'warnings',
    r.brokenLinks.length,
    'broken',
  );
}
out.push(
  '## Not covered by this crawl',
  '',
  '- Pages outside the sitemap by design (empty directories while unpublished, noindex thin profiles, private routes) — verified separately in reports/smoke-report.md.',
  '- Google Search Console indexing state (requires an authorized property; not available here).',
  '',
);
fs.writeFileSync('reports/crawl-report.md', out.join('\n'));
process.exitCode = totalErrors ? 1 : 0;
