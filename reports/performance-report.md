# Performance report

Generated 2026-10-25T22:40:34.558Z.

**Hardware/conditions:** 4 vCPU (Intel(R) Xeon(R) Processor @ 2.10GHz), 16 GiB RAM, Linux 6.18.44-fc-v153, Node v24.21.0, Next.js production build via `next start` on loopback (no Nginx, no TLS, no CDN). Client network excluded. 300 requests per URL at concurrency 10 after 20 warm-up requests. Synthetic e2e database: 2 fictional brokers, ~11 facts each.

## Origin latency (full response, ms)

| Template | p50 | p95 | max | p95 ≤ 300 ms | non-200 |
| --- | ---: | ---: | ---: | --- | ---: |
| Home | 84.7 | 105.4 | 164.9 | within | 0 |
| Home with evidence (e2e) | 112.3 | 151.9 | 246.3 | within | 0 |
| Directory (e2e) | 99.7 | 158.8 | 178.1 | within | 0 |
| Profile (e2e) | 182.0 | 228.0 | 383.4 | within | 0 |
| Fees (e2e) | 106.9 | 161.9 | 236.4 | within | 0 |
| Accounts (e2e) | 92.1 | 127.0 | 174.7 | within | 0 |
| Comparison (e2e) | 120.3 | 166.8 | 234.1 | within | 0 |
| Tools hub (static) | 20.9 | 36.8 | 65.9 | within | 0 |
| Calculator (static) | 20.1 | 35.0 | 42.6 | within | 0 |
| Guide (static) | 18.6 | 39.0 | 43.5 | within | 0 |
| Sitemap (e2e) | 97.0 | 202.4 | 290.8 | within | 0 |

## Read-model cost (in-process, e2e database)

| Function | SQLite statement executions | ms |
| --- | ---: | ---: |
| readProfile | 17 | 12.19 |
| readFees | 9 | 1.00 |
| readDirectory (2 brokers) | 54 | 4.23 |
| readComparison | 49 | 1.99 |

Server memory (RSS of running next-server processes): 123 MiB, 223 MiB, 514 MiB.

Rendering is per request for evidence pages so read-time checks (expiry, withdrawal, conflicts, policy, publication switch) always apply; no shared HTML cache is used (the removed RAM cache was not restored). Static tool/guide pages are prerendered at build time. Request-scoped memoization (React `cache`) shares one clock and one read per request.

Limitations: measured on this sandbox, not the production VPS; real data volume (≤30 brokers) will raise directory/sitemap cost roughly linearly. Re-run `pnpm tsx scripts/perf-report.ts` on the VPS behind Nginx for the acceptance figure.
