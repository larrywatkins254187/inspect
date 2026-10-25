# Verification reports

All figures are measured in this sandbox (4 vCPU, 15 GiB RAM, Node 24.21.0, local production build on
loopback). They are lab/local results; field Core Web Vitals and production-VPS latency are not claimed.

| Report | What it shows |
| --- | --- |
| [smoke-report.md](smoke-report.md) | Real HTTP status codes (200/308/404), headers, canonical/robots/JSON-LD, SSR content, private-route protection, sitemap/llms |
| [browser-report.md](browser-report.md) | Playwright + axe: 5 widths + 200 % zoom overflow, keyboard/skip link/menu, dialog focus, calculators, finder, mocked Ask, consent, motion/no-JS |
| [lighthouse-report.md](lighthouse-report.md) | Median of 3 mobile Lighthouse runs on 11 templates |
| [performance-report.md](performance-report.md) | Origin latency at concurrency 10, read-model statement counts, memory |
| [bundle-report.md](bundle-report.md) | Initial JS/CSS per route vs budgets |
| [crawl-report.md](crawl-report.md) | SEO audit rules over both sitemaps, internal link check |
| [contrast-report.md](contrast-report.md) | Design-token contrast ratios |
| [screenshots/](screenshots/) | Representative pages at 375 and 1440 px |

Pages under `e2e:` / port 3418 use the isolated fictional fixture database (`scripts/e2e-db.ts`).
