# Lighthouse lab report

Generated 2026-10-25T22:36:32.852Z with Lighthouse 13.5.0, default mobile emulation (simulated Slow 4G, 4× CPU slowdown), headless Chromium, 3 runs per URL; table shows the **median**. Server: local production build on loopback (see reports/performance-report.md for hardware). These are lab diagnostics only — field Core Web Vitals (p75) cannot be claimed from them.

| Template | Perf | A11y | SEO | Best practices | FCP s | LCP s | CLS | TBT ms | Server response ms | Transfer KiB | Perf per run |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Home (preparation state) | 97 | 100 | 100 | 100 | 0.91 | 2.46 | 0.000 | 96 | 19 | 249 | 98/97/97 |
| Tools hub | 97 | 100 | 100 | 100 | 0.76 | 2.47 | 0.000 | 112 | 6 | 266 | 97/97/98 |
| Calculator: position size | 98 | 100 | 100 | 100 | 0.76 | 2.32 | 0.000 | 90 | 7 | 256 | 98/98/98 |
| Calculator: compounding | 97 | 100 | 100 | 100 | 0.76 | 2.32 | 0.000 | 99 | 7 | 253 | 97/98/97 |
| Guide | 98 | 100 | 100 | 100 | 0.77 | 2.17 | 0.000 | 65 | 5 | 228 | 98/99/98 |
| Methodology | 99 | 100 | 100 | 100 | 0.76 | 2.17 | 0.000 | 45 | 4 | 220 | 98/99/100 |
| Directory (synthetic e2e) | 98 | 100 | 100 | 100 | 0.77 | 2.33 | 0.000 | 92 | 27 | 233 | 99/98/98 |
| Profile (synthetic e2e) | 98 | 100 | 100 | 100 | 0.92 | 2.40 | 0.000 | 58 | 33 | 236 | 98/98/98 |
| Fees (synthetic e2e) | 99 | 100 | 100 | 100 | 0.77 | 2.02 | 0.000 | 104 | 15 | 232 | 99/97/99 |
| Accounts (synthetic e2e) | 98 | 100 | 100 | 100 | 0.76 | 2.31 | 0.000 | 123 | 15 | 231 | 99/96/98 |
| Comparison (synthetic e2e) | 99 | 100 | 100 | 100 | 0.77 | 2.02 | 0.000 | 60 | 14 | 238 | 98/100/99 |

## Audits below full score (any run)

- none

Notes: pages are served from `127.0.0.1` while canonical URLs point to `https://forexinspect.com`; the e2e pages use fictional fixture data in an isolated database.
