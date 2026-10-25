/**
 * Browser verification (Playwright + axe-core). Writes reports/browser-report.md and screenshots.
 *   tsx scripts/browser-check.ts [main] [e2e] [consent]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
// Playwright is preinstalled globally in this environment (not a project dependency), so it is loaded untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require('playwright') as { chromium: any };
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const MAIN = process.argv[2] ?? 'http://127.0.0.1:3417';
const E2E = process.argv[3] ?? 'http://127.0.0.1:3418';
const CONSENT = process.argv[4] ?? 'http://127.0.0.1:3419';
const results: { group: string; name: string; ok: boolean; detail: string }[] = [];
const check = (group: string, name: string, ok: boolean, detail = '') => {
  results.push({ group, name, ok, detail });
  if (!ok) console.log(`FAIL [${group}] ${name}: ${detail}`);
};
fs.mkdirSync('reports/screenshots', { recursive: true });

const browser = await chromium.launch();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

async function axe(page: Page): Promise<{ id: string; impact: string; nodes: number }[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const r = await (
      window as unknown as {
        axe: {
          run: (o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe.run({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
      },
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
}

// ── Responsive layout and accessibility ──────────────────────────────
const pages = [
  [MAIN, '/'],
  [MAIN, '/brokers'],
  [MAIN, '/tools'],
  [MAIN, '/tools/position-size-calculator'],
  [MAIN, '/tools/compounding-calculator'],
  [MAIN, '/tools/currency-converter'],
  [MAIN, '/guides/mt4-vs-mt5'],
  [MAIN, '/methodology'],
  [E2E, '/'],
  [E2E, '/brokers'],
  [E2E, '/brokers/alpha-fixture-markets'],
  [E2E, '/brokers/alpha-fixture-markets/fees'],
  [E2E, '/brokers/alpha-fixture-markets/accounts'],
  [E2E, '/compare/alpha-fixture-markets-vs-beta-fixture-markets'],
] as const;
const widths = [320, 375, 768, 1024, 1440];
const axeSummary: Record<string, string> = {};
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const [base, p] of pages) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    check(
      `layout ${w}px`,
      `${base === E2E ? 'e2e' : 'main'} ${p} no horizontal page overflow`,
      o.sw <= o.iw,
      `scrollWidth ${o.sw} / ${o.iw}`,
    );
    if (w === 375 || w === 1440) {
      const v = await axe(page);
      const serious = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
      axeSummary[`${w} ${base === E2E ? 'e2e' : 'main'} ${p}`] = v.length
        ? v.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(' ')
        : 'none';
      check(
        `axe ${w}px`,
        `${base === E2E ? 'e2e' : 'main'} ${p} no serious/critical violations`,
        serious.length === 0,
        serious.map((x) => `${x.id}×${x.nodes}`).join(', '),
      );
    }
    if (
      (w === 375 || w === 1440) &&
      [
        '/',
        '/brokers/alpha-fixture-markets',
        '/tools/position-size-calculator',
        '/compare/alpha-fixture-markets-vs-beta-fixture-markets',
      ].includes(p)
    )
      await page.screenshot({
        path: `reports/screenshots/${base === E2E ? 'e2e' : 'main'}${p.replace(/\//g, '_') || '_home'}-${w}.png`,
        fullPage: false,
      });
  }
  await ctx.close();
}
// 200% zoom of a 1280px window = 640 CSS px with device scale 2.
{
  const ctx = await browser.newContext({ viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const [base, p] of pages) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    const o = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    check(
      'zoom 200%',
      `${base === E2E ? 'e2e' : 'main'} ${p} reflows without horizontal scroll`,
      o.sw <= o.iw,
      `${o.sw}/${o.iw}`,
    );
  }
  // Tables scroll inside a labelled, focusable region rather than the page.
  await page.goto(`${E2E}/brokers/alpha-fixture-markets/accounts`);
  const region = await page.evaluate(() => {
    const r = document.querySelector('.table-scroll[role="region"]');
    return r
      ? {
          tab: r.getAttribute('tabindex'),
          label:
            !!r.getAttribute('aria-labelledby') &&
            !!document.getElementById(r.getAttribute('aria-labelledby')!)?.textContent,
        }
      : null;
  });
  check(
    'zoom 200%',
    'tables scroll in labelled keyboard-focusable regions',
    !!region && region.tab === '0' && region.label,
    JSON.stringify(region),
  );
  await ctx.close();
}

// ── Keyboard: skip link, mobile menu, focus visibility ───────────────
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(MAIN + '/');
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => ({
    cls: document.activeElement?.className,
    top: document.activeElement?.getBoundingClientRect().top ?? -1,
    outline: getComputedStyle(document.activeElement!).outlineStyle,
  }));
  check(
    'keyboard',
    'first Tab focuses visible skip link',
    first.cls === 'skip-link' && first.top >= 0,
    JSON.stringify(first),
  );
  await page.keyboard.press('Enter');
  check(
    'keyboard',
    'skip link moves focus to main',
    await page.evaluate(() => document.activeElement?.id === 'main'),
  );
  const btn = page.locator('button.menu-button');
  await btn.focus();
  const focusRing = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  check('keyboard', 'focused control shows a visible focus outline', focusRing !== 'none', focusRing);
  await page.keyboard.press('Enter');
  check(
    'keyboard',
    'menu opens with aria-expanded and focuses first link',
    (await btn.getAttribute('aria-expanded')) === 'true' &&
      (await page.evaluate(() => document.activeElement?.closest('#mobile-menu') !== null)),
  );
  await page.keyboard.press('Escape');
  check(
    'keyboard',
    'Escape closes menu and restores focus to the button',
    (await btn.getAttribute('aria-expanded')) === 'false' &&
      (await page.evaluate(() => document.activeElement?.classList.contains('menu-button'))),
  );
  await page.goto(MAIN + '/tools');
  check(
    'keyboard',
    'current page marked aria-current',
    (await page.locator('a.nav-link[aria-current="page"]').first().textContent())?.includes('Tools') ?? false,
  );
  await ctx.close();
}

// ── Calculators ──────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(MAIN + '/tools/position-size-calculator', { waitUntil: 'networkidle' });
  const primary = () => page.locator('.result-primary dd').first().textContent();
  check(
    'calculator',
    'SSR/hydrated default result',
    (await primary())?.startsWith('0.50') ?? false,
    (await primary()) ?? '',
  );
  const bal = page.locator('#position-size-calculator-balance');
  await bal.fill('abc');
  const inv = await bal.getAttribute('aria-invalid');
  const desc = await bal.getAttribute('aria-describedby');
  const errText = desc ? await page.locator(`[id="${desc.split(' ').pop()}"]`).textContent() : '';
  check(
    'calculator',
    'invalid input → aria-invalid + associated error',
    inv === 'true' && /digits/.test(errText ?? ''),
    `${inv} ${errText}`,
  );
  check('calculator', 'no stale result while invalid', (await page.locator('.result-primary').count()) === 0);
  await bal.fill('20000');
  check(
    'calculator',
    'valid input recalculates',
    (await primary())?.startsWith('1.00') ?? false,
    (await primary()) ?? '',
  );
  await page.selectOption('#position-size-calculator-instrument', 'USD/JPY');
  check(
    'calculator',
    'instrument sets typical pip size',
    (await page.inputValue('#position-size-calculator-pipSize')) === '0.01',
  );
  check(
    'calculator',
    'missing conversion rate is not treated as 1',
    (await page.locator('.result-primary').count()) === 0,
  );
  await page.getByRole('button', { name: 'Apply ECB reference rate' }).click();
  const r = await page.inputValue('#position-size-calculator-rate');
  check('calculator', 'dated ECB reference rate applied explicitly', /^0\.00\d+/.test(r), r);
  await page.getByRole('button', { name: 'Reset inputs' }).click();
  check(
    'calculator',
    'Reset restores defaults',
    (await page.inputValue('#position-size-calculator-balance')) === '10000' &&
      (await page.inputValue('#position-size-calculator-instrument')) === 'EUR/USD',
  );
  await page.goto(MAIN + '/tools');
  await page.fill('input[type="search"]', 'swap');
  check(
    'tools hub',
    'search filters with live count',
    /1 of 15/.test((await page.locator('[aria-live="polite"]').first().textContent()) ?? ''),
  );
  await page.getByRole('button', { name: /^Clear$/ }).click();
  await page.getByRole('button', { name: /Chart levels \(2\)/ }).click();
  check(
    'tools hub',
    'category filter (Chart levels = 2)',
    /2 of 15/.test((await page.locator('[aria-live="polite"]').first().textContent()) ?? ''),
  );
  await ctx.close();
}

// ── Finder ───────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 768, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(E2E + '/brokers', { waitUntil: 'networkidle' });
  const search = page.getByLabel('Search name, platform or regulator code');
  await search.fill('mt5 alpha');
  check(
    'finder',
    'word search across name and platform',
    /1 of 2/.test((await page.locator('form[role="search"] [aria-live="polite"]').textContent()) ?? ''),
  );
  await search.fill('zzz');
  check('finder', 'no-results state', (await page.getByText('No published brokers match').count()) === 1);
  await page.getByRole('button', { name: 'Clear filters' }).first().click();
  check(
    'finder',
    'clear resets',
    /2 of 2/.test((await page.locator('form[role="search"] [aria-live="polite"]').textContent()) ?? ''),
  );
  check('finder', 'filters do not change the URL (no indexable filter pages)', !page.url().includes('?'));
  await ctx.close();
}

// ── Ask (mocked Turnstile and API) ───────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await ctx.newPage();
  let turnstileLoads = 0;
  await page.route('https://challenges.cloudflare.com/**', (route: Page) => {
    turnstileLoads++;
    return route.fulfill({
      contentType: 'application/javascript',
      body: 'window.turnstile={render:function(el,o){setTimeout(function(){o.callback("mock-token")},50);return "w1"},reset:function(){},remove:function(){}};',
    });
  });
  let mode: 'ok' | 'error' = 'ok';
  const bodies: unknown[] = [];
  await page.route('**/api/ask', async (route: Page) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return mode === 'ok'
      ? route.fulfill({
          json: {
            ok: true,
            parts: [
              {
                kind: 'verified',
                text: 'Alpha Fixture Markets — Minimum deposit: 100 USD (Account: Standard).',
                citations: [
                  {
                    factId: 1,
                    broker: 'Alpha Fixture Markets',
                    href: '/brokers/alpha-fixture-markets#fact-1',
                    sourceUrl: 'https://www.alpha-fixture-markets.invalid/accounts',
                    label: 'Minimum deposit',
                  },
                ],
              },
              { kind: 'general', text: 'A minimum deposit is the smallest first funding amount.' },
              { kind: 'no_data' },
            ],
          },
        })
      : route.fulfill({ status: 429, json: { ok: false, code: 'RATE_LIMITED' } });
  });
  await page.goto(E2E + '/', { waitUntil: 'networkidle' });
  check(
    'ask',
    'Ask visible only when all gates pass (e2e instance)',
    (await page.getByRole('heading', { name: 'Ask ForexInspect' }).count()) === 1,
  );
  check('ask', 'Turnstile not loaded before asking', turnstileLoads === 0);
  const askBtn = page.getByRole('button', { name: 'Ask', exact: true });
  await askBtn.click();
  check(
    'ask',
    'empty question → field error',
    (await page.locator('p.field-error[role="alert"]').textContent())?.includes('Enter a question') ?? false,
  );
  const q = page.getByLabel('Ask about published broker evidence');
  await q.fill('What is the minimum deposit at Alpha Fixture Markets?');
  await askBtn.click();
  await page.waitForSelector('dialog.dialog[open]');
  check('ask', 'native modal opens and loads Turnstile on demand', turnstileLoads === 1);
  check(
    'ask',
    'focus is inside the dialog',
    await page.evaluate(() => !!document.activeElement?.closest('dialog')),
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.dialog[open]'));
  check(
    'ask',
    'Escape cancels, restores focus, keeps question',
    (await page.evaluate(() => document.activeElement?.textContent)) === 'Ask' &&
      (await q.inputValue()).startsWith('What is'),
  );
  await askBtn.click();
  await page.waitForSelector('dialog.dialog[open]');
  const send = page.getByRole('button', { name: 'Send question' });
  await send.waitFor();
  await page.waitForFunction(
    () => !(document.querySelector('dialog[open] .btn-primary') as HTMLButtonElement)?.disabled,
  );
  await send.click();
  await page.waitForSelector('.thread');
  check(
    'ask',
    'answer rendered with citation chip and labels',
    (await page.locator('.thread a.chip').count()) === 1 &&
      (await page.getByText('General explanation — not verified by ForexInspect').count()) === 1 &&
      (await page.getByText('We have no verified data on that.').count()) === 1,
  );
  check(
    'ask',
    'request carries fresh token and ≤6 history turns',
    (bodies[0] as { token: string; history: unknown[] }).token === 'mock-token' &&
      (bodies[0] as { history: unknown[] }).history.length === 0,
  );
  mode = 'error';
  await q.fill('And at Beta Fixture Markets?');
  await askBtn.click();
  await page.waitForSelector('dialog.dialog[open]');
  await page.waitForFunction(
    () => !(document.querySelector('dialog[open] .btn-primary') as HTMLButtonElement)?.disabled,
  );
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.waitForFunction(() => !document.querySelector('dialog.dialog[open]'));
  check(
    'ask',
    'rate-limit error shown, question preserved, new token used',
    ((await page.locator('p.field-error[role="alert"]').textContent()) ?? '').includes(
      'Too many questions',
    ) &&
      (await q.inputValue()) === 'And at Beta Fixture Markets?' &&
      turnstileLoads === 1 &&
      bodies.length === 2 &&
      (bodies[1] as { history: unknown[] }).history.length === 2,
  );
  await page.screenshot({ path: 'reports/screenshots/e2e_ask-375.png', fullPage: false });
  await ctx.close();
}

// ── Motion, reduced motion and no-JS rendering ───────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 700 },
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();
  await page.goto(MAIN + '/', { waitUntil: 'load' });
  const pending: { p: boolean; top: number }[] = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal')].map((e) => ({
      p: e.classList.contains('reveal-pending'),
      top: e.getBoundingClientRect().top,
    })),
  );
  check(
    'motion',
    'only below-the-fold sections are hidden for reveal',
    pending.every((x) => !x.p || x.top > 700),
    JSON.stringify(pending),
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  check(
    'motion',
    'revealed after scrolling into view',
    await page.evaluate(() => document.querySelectorAll('.reveal-pending').length === 0),
  );
  await ctx.close();
  const rctx = await browser.newContext({ viewport: { width: 375, height: 700 }, reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  await rp.goto(MAIN + '/', { waitUntil: 'load' });
  check(
    'motion',
    'reduced motion: nothing hidden, no reveal work',
    await rp.evaluate(() => document.querySelectorAll('.reveal-pending').length === 0),
  );
  const dur = await rp.evaluate(() => getComputedStyle(document.querySelector('.btn')!).transitionDuration);
  check(
    'motion',
    'reduced motion: transitions effectively disabled',
    /^0\.00001s|^1e-05s|^0s/.test(dur),
    dur,
  );
  await rctx.close();
  const nctx = await browser.newContext({ viewport: { width: 375, height: 700 }, javaScriptEnabled: false });
  const np = await nctx.newPage();
  await np.goto(E2E + '/brokers/alpha-fixture-markets');
  check(
    'no-JS',
    'facts and sources visible without JavaScript',
    (await np.getByText('100 USD').count()) > 0 &&
      (await np.getByText('What we could not verify').count()) === 1,
  );
  await np.goto(MAIN + '/tools/pip-calculator');
  check(
    'no-JS',
    'calculator formula/example server-rendered without JavaScript',
    (await np.getByRole('heading', { name: 'Formula' }).count()) === 1,
  );
  await np.goto(MAIN + '/');
  check(
    'no-JS',
    'nothing hidden by motion without JavaScript',
    await np.evaluate(() => document.querySelectorAll('.reveal-pending').length === 0),
  );
  await nctx.close();
}

// ── Consent (separate analytics-enabled build) ───────────────────────
{
  const ok = await fetch(CONSENT + '/health')
    .then((r) => r.ok)
    .catch(() => false);
  if (!ok) check('consent', 'consent instance reachable', false, `${CONSENT} not running`);
  else {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const page = await ctx.newPage();
    const google: string[] = [];
    page.on('request', (r: { url(): string }) => {
      if (/google|gtag/.test(r.url())) google.push(r.url());
    });
    await page.goto(CONSENT + '/', { waitUntil: 'networkidle' });
    const banner = page.getByRole('region', { name: 'Optional analytics' });
    check(
      'consent',
      'banner shown with equal Accept/Decline',
      (await banner.count()) === 1 &&
        (await banner.getByRole('button', { name: 'Accept' }).getAttribute('class')) ===
          (await banner.getByRole('button', { name: 'Decline' }).getAttribute('class')),
    );
    check('consent', 'no Google request before consent', google.length === 0, google.join(' '));
    await banner.getByRole('button', { name: 'Decline' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    check(
      'consent',
      'decline persists across reloads',
      (await page.getByRole('region', { name: 'Optional analytics' }).count()) === 0 &&
        (await page.evaluate(() => localStorage.getItem('fi-consent-v1'))) === 'denied',
    );
    await page.getByRole('button', { name: 'Analytics settings' }).click();
    check(
      'consent',
      'footer settings reopen the choice',
      (await page.getByRole('region', { name: 'Optional analytics' }).count()) === 1,
    );
    await page.getByRole('button', { name: 'Accept' }).click();
    await page.waitForTimeout(500);
    check(
      'consent',
      'non-production host never loads GA even after accept',
      google.length === 0,
      google.join(' '),
    );
    await page.goto(CONSENT + '/admin');
    check('consent', 'private routes excluded', google.length === 0);
    await ctx.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
const md = [
  '# Browser verification report',
  '',
  `Generated ${new Date().toISOString()} with Playwright Chromium and axe-core 4.14 (WCAG 2.0/2.1/2.2 A/AA + best-practice rules). Main \`${MAIN}\`, e2e synthetic \`${E2E}\`, consent build \`${CONSENT}\`.`,
  '',
  `**${results.length - failed.length} / ${results.length} checks passed.** Automated checks do not replace manual screen-reader testing (not performed in this environment).`,
  '',
  ...[...new Set(results.map((r) => r.group))].flatMap((g) => [
    `## ${g}`,
    '',
    '| Check | Result | Detail |',
    '| --- | --- | --- |',
    ...results
      .filter((r) => r.group === g)
      .map(
        (r) =>
          `| ${r.name.replace(/\|/g, '\\|')} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '\\|').slice(0, 140)} |`,
      ),
    '',
  ]),
  '## axe findings (all impacts)',
  '',
  '| Page | Violations (id, impact, nodes) |',
  '| --- | --- |',
  ...Object.entries(axeSummary).map(([k, v]) => `| ${k} | ${v} |`),
  '',
].join('\n');
fs.writeFileSync(path.join('reports', 'browser-report.md'), md);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
