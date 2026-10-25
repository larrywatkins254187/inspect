import { spawnSync } from 'node:child_process';
import type { DB } from '@/db/client';
import { sha256 } from '@/lib/hash';

export type SeoFetch = (
  url: string,
  init?: { method?: string; redirect?: 'manual' | 'follow' },
) => Promise<{
  status: number;
  url: string;
  headers: { get(n: string): string | null };
  text(): Promise<string>;
}>;

export interface PageCheck {
  url: string;
  status: number;
  finalUrl: string;
  robots: string | null;
  hash: string | null;
  issues: { rule: string; severity: 'INFO' | 'WARNING' | 'ERROR'; message: string; key: string }[];
  internalLinks: string[];
  title: string | null;
  description: string | null;
}

/** Remove framework/volatile noise so unchanged pages hash identically between runs. */
export function normalizeHtml(html: string): string {
  return html
    .replace(/<script[^>]*>self\.__next_f[\s\S]*?<\/script>/g, '')
    .replace(/<script[^>]*src="\/_next\/static\/[^"]*"[^>]*><\/script>/g, '')
    .replace(/\/_next\/static\/[^"')]+/g, '/_next/static/*')
    .replace(/nonce="[^"]*"/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const attr = (tag: string, name: string) =>
  new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1] ?? null;
const metaContent = (html: string, key: string, by: 'name' | 'property' = 'name') => {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi))
    if (attr(m[0], by)?.toLowerCase() === key) return attr(m[0], 'content');
  return null;
};
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

/** Deterministic SEO rules. Length limits are local editorial heuristics, not Google rules. */
export function checkHtml(
  url: string,
  html: string,
  status: number,
  headers: { get(n: string): string | null },
  inSitemap: boolean,
): PageCheck['issues'] {
  const issues: PageCheck['issues'] = [];
  const add = (rule: string, severity: 'INFO' | 'WARNING' | 'ERROR', message: string, key = '') =>
    issues.push({ rule, severity, message, key });
  if (status !== 200) add('status', 'ERROR', `HTTP ${status} for a sitemap URL`);
  const head = html.split(/<\/head>/i)[0] ?? '';
  const title = /<title>([\s\S]*?)<\/title>/i.exec(head)?.[1]?.trim() ?? null;
  if (!title) add('title-missing', 'ERROR', 'No <title> in <head>');
  else if (title.length < 15 || title.length > 70)
    add('title-length', 'INFO', `Title length ${title.length} outside 15–70 heuristic`);
  const desc = metaContent(head, 'description');
  if (!desc) add('description-missing', 'ERROR', 'No meta description');
  else if (desc.length < 50 || desc.length > 170)
    add('description-length', 'INFO', `Description length ${desc.length} outside 50–170 heuristic`);
  const canonTag = [...head.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/gi)];
  if (canonTag.length !== 1) add('canonical-count', 'ERROR', `${canonTag.length} canonical links`);
  else if (decode(attr(canonTag[0]![0], 'href') ?? '') !== url)
    add('canonical-mismatch', 'ERROR', `Canonical ${attr(canonTag[0]![0], 'href')} ≠ ${url}`);
  const h1 = [...html.matchAll(/<h1\b/gi)].length;
  if (h1 !== 1) add('h1-count', 'ERROR', `${h1} h1 elements`);
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++)
    if (levels[i]! > levels[i - 1]! + 1) {
      add(
        'heading-skip',
        'WARNING',
        `Heading jumps from h${levels[i - 1]} to h${levels[i]}`,
        `${levels[i - 1]}-${levels[i]}`,
      );
      break;
    }
  const robots = metaContent(head, 'robots') ?? headers.get('x-robots-tag');
  if (inSitemap && robots && /noindex/i.test(robots))
    add('sitemap-noindex', 'ERROR', 'Sitemap URL is noindex');
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1]!) as {
        '@context'?: string;
        '@type'?: string;
        aggregateRating?: unknown;
        review?: unknown;
      };
      if (!j['@context'] || !j['@type']) add('jsonld-shape', 'WARNING', 'JSON-LD without @context/@type');
      if (j.aggregateRating || j.review)
        add('jsonld-rating', 'ERROR', 'Review/AggregateRating markup is not allowed');
    } catch {
      add('jsonld-parse', 'ERROR', 'JSON-LD does not parse');
    }
  }
  for (const k of ['og:title', 'og:description', 'og:image', 'og:url'])
    if (!metaContent(head, k, 'property')) add('og-missing', 'WARNING', `Missing ${k}`, k);
  if (!metaContent(head, 'twitter:card')) add('twitter-missing', 'WARNING', 'Missing twitter:card');
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0];
    if (attr(t, 'alt') === null) add('img-alt', 'ERROR', 'Image without alt', attr(t, 'src') ?? '');
    if (!attr(t, 'width') || !attr(t, 'height'))
      add('img-dimensions', 'WARNING', 'Image without width/height', attr(t, 'src') ?? '');
  }
  if (!/<html[^>]*\blang="en"/i.test(html)) add('lang', 'ERROR', 'html lang is not "en"');
  if (!metaContent(head, 'viewport')) add('viewport', 'ERROR', 'Missing viewport meta');
  const mainIdx = html.search(/<main\b/i);
  const footIdx = html.search(/<footer\b/i);
  if (mainIdx < 0 || (footIdx >= 0 && footIdx < mainIdx))
    add('main-order', 'ERROR', 'Main content missing or after footer in initial HTML');
  return issues;
}

export function internalLinks(html: string, origin: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]*)(#[^"]*)?"[^>]*>/gi)) {
    const href = decode(m[1] ?? '');
    if (!href || href.startsWith('mailto:')) continue;
    try {
      const u = new URL(href, origin);
      if (u.origin === origin && !/^\/(admin|preview|api)/.test(u.pathname))
        out.add(`${u.origin}${u.pathname}`);
    } catch {
      /* ignore malformed */
    }
  }
  return [...out];
}

export function sitemapUrls(xml: string, origin: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => decode(m[1]!.trim()))
    .filter((u) => u.startsWith(origin))
    .slice(0, 2000);
}

export interface CrawlResult {
  runId: number;
  pages: PageCheck[];
  brokenLinks: { from: string; to: string; status: number }[];
  issueCounts: Record<string, number>;
  unchanged: number;
}

/**
 * Crawl the same-origin sitemap, apply deterministic checks, upsert
 * fingerprinted issues and transition previously open issues to FIXED only
 * after this live recheck. Removed pages retire their issues as STALE.
 */
export async function seoCrawl(
  db: DB,
  opts: { origin: string; canonicalOrigin: string; fetch: SeoFetch; now: () => Date; maxPages?: number },
): Promise<CrawlResult> {
  const startIso = opts.now().toISOString();
  const runId = Number(
    db.prepare("INSERT INTO seo_runs (kind, started_at, status) VALUES ('CRAWL', ?, 'RUNNING')").run(startIso)
      .lastInsertRowid,
  );
  const smRes = await opts.fetch(`${opts.origin}/sitemap.xml`);
  const sm = await smRes.text();
  const canonicalUrls = sitemapUrls(sm, opts.canonicalOrigin).slice(0, opts.maxPages ?? 300);
  const toLocal = (u: string) => opts.origin + u.slice(opts.canonicalOrigin.length);
  const pages: PageCheck[] = [];
  const linkStatus = new Map<string, number>();
  let unchanged = 0;
  for (const cu of canonicalUrls) {
    const res = await opts.fetch(toLocal(cu), { redirect: 'manual' });
    const html = await res.text();
    const hash = sha256(normalizeHtml(html));
    const prev = db.prepare('SELECT content_hash FROM seo_pages WHERE url = ?').get(cu) as
      { content_hash: string | null } | undefined;
    if (prev?.content_hash === hash) unchanged++;
    const issues = checkHtml(cu, html, res.status, res.headers, true);
    const links = internalLinks(html, opts.origin);
    pages.push({
      url: cu,
      status: res.status,
      finalUrl: res.url,
      robots: res.headers.get('x-robots-tag'),
      hash,
      issues,
      internalLinks: links,
      title: /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null,
      description: metaContent(html, 'description'),
    });
    db.prepare(
      `INSERT INTO seo_pages (url, status, final_url, robots, content_hash, first_seen, last_seen, fetched_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(url) DO UPDATE SET status = excluded.status, final_url = excluded.final_url, robots = excluded.robots, content_hash = excluded.content_hash, last_seen = excluded.last_seen, fetched_at = excluded.fetched_at, removed_at = NULL`,
    ).run(cu, res.status, res.url, res.headers.get('x-robots-tag'), hash, startIso, startIso, startIso);
    linkStatus.set(toLocal(cu), res.status);
  }
  // Duplicate titles/descriptions across the crawl.
  const dup = (k: 'title' | 'description') => {
    const m = new Map<string, string[]>();
    for (const p of pages) if (p[k]) m.set(p[k]!, [...(m.get(p[k]!) ?? []), p.url]);
    for (const [v, urls] of m)
      if (urls.length > 1)
        for (const u of urls)
          pages
            .find((p) => p.url === u)!
            .issues.push({
              rule: `${k}-duplicate`,
              severity: 'WARNING',
              message: `Duplicate ${k} shared by ${urls.length} pages`,
              key: sha256(v).slice(0, 12),
            });
  };
  dup('title');
  dup('description');
  // Internal link check (bounded, cached).
  const brokenLinks: CrawlResult['brokenLinks'] = [];
  for (const p of pages) {
    for (const l of p.internalLinks.slice(0, 200)) {
      if (!linkStatus.has(l)) {
        if (linkStatus.size > 1500) break;
        const r = await opts.fetch(l, { method: 'GET', redirect: 'manual' });
        await r.text();
        linkStatus.set(l, r.status);
      }
      const st = linkStatus.get(l)!;
      if (st >= 400) {
        brokenLinks.push({ from: p.url, to: l, status: st });
        p.issues.push({
          rule: 'broken-link',
          severity: 'ERROR',
          message: `Internal link to ${l} returns ${st}`,
          key: l,
        });
      }
    }
  }
  const now = opts.now().toISOString();
  const seen = new Set<string>();
  const upsert = db.prepare(
    `INSERT INTO seo_issues (fingerprint, url, rule, severity, message, state, source, first_seen, last_seen, run_id, transitions_json)
     VALUES (@fp, @url, @rule, @severity, @message, 'OPEN', 'RULE', @now, @now, @run, @tr)
     ON CONFLICT(fingerprint) DO UPDATE SET last_seen = @now, run_id = @run, message = @message,
       state = CASE WHEN state IN ('FIXED','STALE','FAILED') THEN 'OPEN' ELSE state END`,
  );
  db.transaction(() => {
    for (const p of pages)
      for (const i of p.issues) {
        const fp = sha256(`${i.rule}|${p.url}|${i.key}`);
        seen.add(fp);
        upsert.run({
          fp,
          url: p.url,
          rule: i.rule,
          severity: i.severity,
          message: i.message,
          now,
          run: runId,
          tr: JSON.stringify([{ to: 'OPEN', at: now }]),
        });
      }
    const crawled = new Set(pages.map((p) => p.url));
    for (const row of db
      .prepare(
        "SELECT id, fingerprint, url, transitions_json FROM seo_issues WHERE state IN ('OPEN','IN_PROGRESS') AND source = 'RULE'",
      )
      .all() as { id: number; fingerprint: string; url: string; transitions_json: string }[]) {
      if (seen.has(row.fingerprint)) continue;
      const tr = [
        ...(JSON.parse(row.transitions_json) as unknown[]),
        { to: crawled.has(row.url) ? 'FIXED' : 'STALE', at: now },
      ];
      db.prepare('UPDATE seo_issues SET state = ?, verified_at = ?, transitions_json = ? WHERE id = ?').run(
        crawled.has(row.url) ? 'FIXED' : 'STALE',
        crawled.has(row.url) ? now : null,
        JSON.stringify(tr),
        row.id,
      );
    }
    db.prepare('UPDATE seo_pages SET removed_at = ? WHERE removed_at IS NULL AND last_seen < ?').run(
      now,
      startIso,
    );
  })();
  const issueCounts: Record<string, number> = {};
  for (const p of pages) for (const i of p.issues) issueCounts[i.rule] = (issueCounts[i.rule] ?? 0) + 1;
  db.prepare(
    "UPDATE seo_runs SET finished_at = ?, status = 'SUCCEEDED', pages = ?, issues = ?, detail_json = ? WHERE id = ?",
  ).run(
    now,
    pages.length,
    Object.values(issueCounts).reduce((a, b) => a + b, 0),
    JSON.stringify({ unchanged, brokenLinks: brokenLinks.length }),
    runId,
  );
  return { runId, pages, brokenLinks, issueCounts, unchanged };
}

export const SEO_FIX_ALLOWLIST = [
  /^app\/(?!api\/|admin\/|preview\/)[\w\-[\]/]+\/page\.tsx$/,
  /^src\/server\/seo\.ts$/,
  /^src\/content\/[\w-]+\.ts$/,
  /^app\/globals\.css$/,
];
export const SEO_FIX_MAX_DIFF_LINES = 80;

/**
 * Preconditions for constrained code repair. Current live editing may have no
 * Git checkout; without a clean worktree and rollback path, repair stays off
 * and read-only crawl/check/report continues.
 */
export function seoFixPreflight(
  cfg: { seoFixEnabled: boolean },
  projectDir: string,
): { ok: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!cfg.seoFixEnabled) blockers.push('SEO_FIX_ENABLED is not true');
  const git = spawnSync('git', ['-C', projectDir, 'status', '--porcelain'], { encoding: 'utf8' });
  if (git.status !== 0) blockers.push('project is not a Git checkout (no rollback path)');
  else if (git.stdout.trim()) blockers.push('worktree has uncommitted changes');
  return { ok: blockers.length === 0, blockers };
}

/** Validate a proposed unified diff: allowlisted paths, size cap, no broker facts/numbers. */
export function validateFixDiff(diff: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const files = [...diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]!);
  if (!files.length) reasons.push('no files');
  for (const f of files)
    if (!SEO_FIX_ALLOWLIST.some((re) => re.test(f))) reasons.push(`path not allowlisted: ${f}`);
  const changed = diff.split('\n').filter((l) => /^[+-](?![+-])/.test(l));
  if (changed.length > SEO_FIX_MAX_DIFF_LINES) reasons.push(`diff too large (${changed.length} lines)`);
  if (
    changed.some(
      (l) => /\b(fact|licen[cs]e|minimum_deposit|leverage|spread|commission)\b/i.test(l) && /\d/.test(l),
    )
  )
    reasons.push('touches broker facts or numbers');
  return { ok: reasons.length === 0, reasons };
}

export function seoReport(db: DB): {
  byState: Record<string, number>;
  byRule: { rule: string; state: string; n: number }[];
  lastRun: unknown;
} {
  const byState: Record<string, number> = {};
  for (const r of db.prepare('SELECT state, count(*) AS n FROM seo_issues GROUP BY state').all() as {
    state: string;
    n: number;
  }[])
    byState[r.state] = r.n;
  return {
    byState,
    byRule: db
      .prepare('SELECT rule, state, count(*) AS n FROM seo_issues GROUP BY rule, state ORDER BY n DESC')
      .all() as { rule: string; state: string; n: number }[],
    lastRun: db.prepare('SELECT * FROM seo_runs ORDER BY id DESC LIMIT 1').get() ?? null,
  };
}
