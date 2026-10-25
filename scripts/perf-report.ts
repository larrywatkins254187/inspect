/**
 * Origin latency at fixed concurrency (default 10) against running instances, plus read-model query
 * counts and timings measured in-process. Writes reports/performance-report.md.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import Database from 'better-sqlite3';

const N = Number(process.argv[2] ?? 300);
const C = Number(process.argv[3] ?? 10);
const MAIN = 'http://127.0.0.1:3417';
const E2E = 'http://127.0.0.1:3418';
const urls: [string, string][] = [
  ['Home', `${MAIN}/`],
  ['Home with evidence (e2e)', `${E2E}/`],
  ['Directory (e2e)', `${E2E}/brokers`],
  ['Profile (e2e)', `${E2E}/brokers/alpha-fixture-markets`],
  ['Fees (e2e)', `${E2E}/brokers/alpha-fixture-markets/fees`],
  ['Accounts (e2e)', `${E2E}/brokers/alpha-fixture-markets/accounts`],
  ['Comparison (e2e)', `${E2E}/compare/alpha-fixture-markets-vs-beta-fixture-markets`],
  ['Tools hub (static)', `${MAIN}/tools`],
  ['Calculator (static)', `${MAIN}/tools/position-size-calculator`],
  ['Guide (static)', `${MAIN}/guides/what-is-a-pip`],
  ['Sitemap (e2e)', `${E2E}/sitemap.xml`],
];
const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)]!;

async function load(url: string) {
  const times: number[] = [];
  let next = 0;
  let errors = 0;
  const worker = async () => {
    while (next < N) {
      next++;
      const t = performance.now();
      const r = await fetch(url);
      await r.arrayBuffer();
      const dt = performance.now() - t;
      if (r.status !== 200) errors++;
      times.push(dt);
    }
  };
  for (let i = 0; i < 20; i++) await (await fetch(url)).arrayBuffer(); // warm-up
  await Promise.all(Array.from({ length: C }, worker));
  return { p50: pct(times, 50), p95: pct(times, 95), max: Math.max(...times), errors };
}

const rows: string[] = [];
for (const [name, url] of urls) {
  const r = await load(url);
  rows.push(
    `| ${name} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.max.toFixed(1)} | ${r.p95 <= 300 ? 'within' : 'OVER'} | ${r.errors} |`,
  );
  console.log(rows[rows.length - 1]);
}

// In-process read-model query counts (statement executions) and timing on the e2e database.
let execs = 0;
const proto = Database.prototype as unknown as {
  prepare: (sql: string) => { get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown };
};
const origPrepare = proto.prepare;
proto.prepare = function (this: unknown, sql: string) {
  const st = origPrepare.call(this, sql) as {
    get: (...a: unknown[]) => unknown;
    all: (...a: unknown[]) => unknown;
  };
  const g = st.get.bind(st);
  const a = st.all.bind(st);
  st.get = (...x: unknown[]) => (execs++, g(...x));
  st.all = (...x: unknown[]) => (execs++, a(...x));
  return st;
} as never;
const { openDatabase } = await import('../src/db/client');
const read = await import('../src/domain/read');
const { readComparison } = await import('../src/domain/comparisons');
const db = openDatabase('data/e2e.sqlite');
const opts = { now: new Date(), publicationEnabled: true };
const q: string[] = [];
for (const [name, fn] of [
  ['readProfile', () => read.readProfile(db, 'alpha-fixture-markets', opts)],
  ['readFees', () => read.readFees(db, 'alpha-fixture-markets', opts)],
  ['readDirectory (2 brokers)', () => read.readDirectory(db, opts)],
  ['readComparison', () => readComparison(db, 'alpha-fixture-markets-vs-beta-fixture-markets', opts)],
] as [string, () => unknown][]) {
  execs = 0;
  const t = performance.now();
  fn();
  const ms = performance.now() - t;
  q.push(`| ${name} | ${execs} | ${ms.toFixed(2)} |`);
}
const pids = execSync('ps -eo pid,rss,args | grep next-server | grep -v grep || true')
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);
const rss = pids.map((l) => `${(Number(l.trim().split(/\s+/)[1]) / 1024).toFixed(0)} MiB`).join(', ');
const cpu = os.cpus()[0]?.model ?? 'unknown';
const md = [
  '# Performance report',
  '',
  `Generated ${new Date().toISOString()}.`,
  '',
  `**Hardware/conditions:** ${os.cpus().length} vCPU (${cpu}), ${(os.totalmem() / 1024 ** 3).toFixed(0)} GiB RAM, Linux ${os.release()}, Node ${process.version}, Next.js production build via \`next start\` on loopback (no Nginx, no TLS, no CDN). Client network excluded. ${N} requests per URL at concurrency ${C} after 20 warm-up requests. Synthetic e2e database: 2 fictional brokers, ~11 facts each.`,
  '',
  '## Origin latency (full response, ms)',
  '',
  '| Template | p50 | p95 | max | p95 ≤ 300 ms | non-200 |',
  '| --- | ---: | ---: | ---: | --- | ---: |',
  ...rows,
  '',
  '## Read-model cost (in-process, e2e database)',
  '',
  '| Function | SQLite statement executions | ms |',
  '| --- | ---: | ---: |',
  ...q,
  '',
  `Server memory (RSS of running next-server processes): ${rss || 'n/a'}.`,
  '',
  'Rendering is per request for evidence pages so read-time checks (expiry, withdrawal, conflicts, policy, publication switch) always apply; no shared HTML cache is used (the removed RAM cache was not restored). Static tool/guide pages are prerendered at build time. Request-scoped memoization (React `cache`) shares one clock and one read per request.',
  '',
  'Limitations: measured on this sandbox, not the production VPS; real data volume (≤30 brokers) will raise directory/sitemap cost roughly linearly. Re-run `pnpm tsx scripts/perf-report.ts` on the VPS behind Nginx for the acceptance figure.',
  '',
].join('\n');
fs.writeFileSync('reports/performance-report.md', md);
console.log(q.join('\n'));
console.log(`RSS: ${rss}`);
