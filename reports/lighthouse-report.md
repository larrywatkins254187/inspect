# Lighthouse lab report

Generated 2026-10-25T23:00:58.210Z with Lighthouse 13.5.0, default mobile emulation (simulated Slow 4G, 4× CPU slowdown), headless Chromium, 3 runs per URL; table shows the **median**. Server: local production build on loopback (see reports/performance-report.md for hardware). These are lab diagnostics only — field Core Web Vitals (p75) cannot be claimed from them.

| Template | Perf | A11y | SEO | Best practices | FCP s | LCP s | CLS | TBT ms | Server response ms | Transfer KiB | Perf per run |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Home (preparation state) | 98 | 100 | 100 | 100 | 0.92 | 2.03 | 0.000 | 111 | 17 | 248 | 96/98/98 |
| Tools hub | 99 | 100 | 100 | 100 | 0.76 | 1.74 | 0.000 | 115 | 6 | 265 | 99/99/97 |
| Calculator: position size | 97 | 100 | 100 | 100 | 0.82 | 2.48 | 0.000 | 102 | 6 | 256 | 97/98/97 |
| Calculator: compounding | 98 | 100 | 100 | 100 | 0.77 | 2.32 | 0.000 | 94 | 5 | 253 | 98/98/97 |
| Guide | 99 | 100 | 100 | 100 | 0.76 | 2.17 | 0.000 | 47 | 5 | 229 | 99/99/99 |
| Methodology | 99 | 100 | 100 | 100 | 0.76 | 2.16 | 0.000 | 53 | 5 | 220 | 99/100/98 |
| Directory (synthetic e2e) | 98 | 100 | 100 | 100 | 0.77 | 2.33 | 0.000 | 95 | 19 | 232 | 98/98/97 |
| Profile (synthetic e2e) | 98 | 100 | 100 | 100 | 0.91 | 2.40 | 0.000 | 131 | 27 | 236 | 98/97/98 |
| Fees (synthetic e2e) | 97 | 100 | 100 | 100 | 0.76 | 1.87 | 0.000 | 121 | 15 | 231 | 97/97/99 |
| Accounts (synthetic e2e) | 98 | 100 | 100 | 100 | 0.77 | 2.34 | 0.000 | 64 | 15 | 232 | 97/99/98 |
| Comparison (synthetic e2e) | 98 | 100 | 100 | 100 | 0.76 | 2.34 | 0.000 | 100 | 20 | 239 | 97/98/98 |

## Audits below full score (any run)

- none

Notes: pages are served from `127.0.0.1` while canonical URLs point to `https://forexinspect.com`; the e2e pages use fictional fixture data in an isolated database.
