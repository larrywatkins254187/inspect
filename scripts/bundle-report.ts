/** Per-route initial JS/CSS (gzip) from the production build, written to reports/bundle-report.md. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const origin = process.argv[2] ?? 'http://127.0.0.1:3417';
const routes = [
  '/',
  '/brokers',
  '/compare',
  '/tools',
  '/tools/position-size-calculator',
  '/tools/currency-converter',
  '/guides',
  '/guides/what-is-a-pip',
  '/methodology',
  '/sources',
];
const gz = (b: Buffer) => zlib.gzipSync(b, { level: 9 }).length;
const kib = (n: number) => (n / 1024).toFixed(1);

const rows: string[] = [];
for (const r of routes) {
  const html = await (await fetch(origin + r)).text();
  const scripts = [...html.matchAll(/<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]!);
  const styles = [...html.matchAll(/<link[^>]+href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]!);
  const size = (urls: string[]) =>
    urls.reduce((n, u) => n + gz(fs.readFileSync(path.join(root, '.next', u.replace('/_next/', '')))), 0);
  const js = size([...new Set(scripts)]);
  const css = size([...new Set(styles)]);
  const htmlGz = gz(Buffer.from(html));
  const budget = r.startsWith('/tools/') || r === '/' ? 200 : 150;
  rows.push(
    `| \`${r}\` | ${kib(js)} | ${budget} | ${js / 1024 <= budget ? 'within' : 'OVER'} | ${kib(css)} | ${kib(htmlGz)} | ${new Set(scripts).size} |`,
  );
}
const out = [
  '# Bundle report',
  '',
  `Generated ${new Date().toISOString()} from \`${origin}\` (production build). Sizes are gzip level 9 of the files referenced by each route's initial HTML (framework included).`,
  '',
  '| Route | Initial JS KiB (gzip) | Budget KiB | Status | CSS KiB (gzip) | HTML KiB (gzip) | Scripts |',
  '| --- | ---: | ---: | --- | ---: | ---: | ---: |',
  ...rows,
  '',
].join('\n');
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/bundle-report.md', out);
console.log(out);
