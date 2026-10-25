/**
 * Median of N mobile Lighthouse runs per representative template (lab diagnostics, not field CWV).
 *   CHROME_PATH=... tsx scripts/lighthouse-report.ts [runs]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runs = Number(process.argv[2] ?? 3);
const MAIN = 'http://127.0.0.1:3417';
const E2E = 'http://127.0.0.1:3418';
const targets: [string, string][] = [
  ['Home (preparation state)', `${MAIN}/`],
  ['Tools hub', `${MAIN}/tools`],
  ['Calculator: position size', `${MAIN}/tools/position-size-calculator`],
  ['Calculator: compounding', `${MAIN}/tools/compounding-calculator`],
  ['Guide', `${MAIN}/guides/what-is-a-pip`],
  ['Methodology', `${MAIN}/methodology`],
  ['Directory (synthetic e2e)', `${E2E}/brokers`],
  ['Profile (synthetic e2e)', `${E2E}/brokers/alpha-fixture-markets`],
  ['Fees (synthetic e2e)', `${E2E}/brokers/alpha-fixture-markets/fees`],
  ['Accounts (synthetic e2e)', `${E2E}/brokers/alpha-fixture-markets/accounts`],
  ['Comparison (synthetic e2e)', `${E2E}/compare/alpha-fixture-markets-vs-beta-fixture-markets`],
];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const bin = path.resolve('node_modules/.bin/lighthouse');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-lh-'));
const rows: string[] = [];
const failedAudits = new Map<string, Set<string>>();
for (const [name, url] of targets) {
  const samples: {
    perf: number;
    a11y: number;
    seo: number;
    bp: number;
    lcp: number;
    cls: number;
    tbt: number;
    ttfb: number;
    fcp: number;
    bytes: number;
  }[] = [];
  for (let i = 0; i < runs; i++) {
    const out = path.join(tmp, `r.json`);
    execFileSync(
      bin,
      [
        url,
        '--quiet',
        '--output=json',
        `--output-path=${out}`,
        '--only-categories=performance,accessibility,seo,best-practices',
        '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
      ],
      { stdio: 'ignore', timeout: 180_000 },
    );
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    const a = j.audits;
    samples.push({
      perf: j.categories.performance.score * 100,
      a11y: j.categories.accessibility.score * 100,
      seo: j.categories.seo.score * 100,
      bp: j.categories['best-practices'].score * 100,
      lcp: a['largest-contentful-paint'].numericValue,
      cls: a['cumulative-layout-shift'].numericValue,
      tbt: a['total-blocking-time'].numericValue,
      ttfb: a['server-response-time'].numericValue,
      fcp: a['first-contentful-paint'].numericValue,
      bytes: a['total-byte-weight'].numericValue,
    });
    for (const cat of ['accessibility', 'seo', 'best-practices'])
      for (const ref of j.categories[cat].auditRefs)
        if (ref.weight > 0 && a[ref.id].score !== null && a[ref.id].score < 1)
          (failedAudits.get(name) ?? failedAudits.set(name, new Set()).get(name)!).add(`${cat}:${ref.id}`);
  }
  const m = (k: keyof (typeof samples)[number]) => median(samples.map((s) => s[k]));
  rows.push(
    `| ${name} | ${m('perf').toFixed(0)} | ${m('a11y').toFixed(0)} | ${m('seo').toFixed(0)} | ${m('bp').toFixed(0)} | ${(m('fcp') / 1000).toFixed(2)} | ${(m('lcp') / 1000).toFixed(2)} | ${m('cls').toFixed(3)} | ${m('tbt').toFixed(0)} | ${m('ttfb').toFixed(0)} | ${(m('bytes') / 1024).toFixed(0)} | ${samples.map((s) => s.perf.toFixed(0)).join('/')} |`,
  );
  console.log(rows[rows.length - 1]);
}
const ver = execFileSync(bin, ['--version']).toString().trim();
const md = [
  '# Lighthouse lab report',
  '',
  `Generated ${new Date().toISOString()} with Lighthouse ${ver}, default mobile emulation (simulated Slow 4G, 4× CPU slowdown), headless Chromium, ${runs} runs per URL; table shows the **median**. Server: local production build on loopback (see reports/performance-report.md for hardware). These are lab diagnostics only — field Core Web Vitals (p75) cannot be claimed from them.`,
  '',
  '| Template | Perf | A11y | SEO | Best practices | FCP s | LCP s | CLS | TBT ms | Server response ms | Transfer KiB | Perf per run |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ...rows,
  '',
  '## Audits below full score (any run)',
  '',
  ...[...failedAudits.entries()].map(([k, v]) => `- ${k}: ${[...v].join(', ')}`),
  failedAudits.size ? '' : '- none',
  '',
  'Notes: pages are served from `127.0.0.1` while canonical URLs point to `https://forexinspect.com`; the e2e pages use fictional fixture data in an isolated database.',
  '',
].join('\n');
fs.writeFileSync('reports/lighthouse-report.md', md);
console.log('written reports/lighthouse-report.md');
