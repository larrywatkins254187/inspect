# Performance report

Generated 2026-10-25T22:54:33.257Z.

**Hardware/conditions:** 4 vCPU (Intel(R) Xeon(R) Processor @ 2.10GHz), 16 GiB RAM, Linux 6.18.44-fc-v153, Node v24.21.0, Next.js production build via `next start` on loopback (no Nginx, no TLS, no CDN). Client network excluded. 300 requests per URL at concurrency 10 after 20 warm-up requests. Synthetic e2e database: 2 fictional brokers, ~11 facts each.

## Origin latency (full response, ms)

| Template | p50 | p95 | max | p95 ≤ 300 ms | non-200 |
| --- | ---: | ---: | ---: | --- | ---: |
| Home | 88.5 | 126.1 | 189.4 | within | 0 |
| Home with evidence (e2e) | 114.3 | 150.1 | 259.0 | within | 0 |
| Directory (e2e) | 98.5 | 138.6 | 157.6 | within | 0 |
| Profile (e2e) | 192.3 | 252.0 | 307.6 | within | 0 |
| Fees (e2e) | 106.3 | 172.0 | 278.1 | within | 0 |
| Accounts (e2e) | 89.0 | 121.2 | 166.5 | within | 0 |
| Comparison (e2e) | 117.3 | 154.7 | 204.5 | within | 0 |
| Tools hub (static) | 18.9 | 31.1 | 48.9 | within | 0 |
| Calculator (static) | 18.9 | 31.8 | 39.8 | within | 0 |
| Guide (static) | 16.8 | 32.2 | 37.5 | within | 0 |
| Sitemap (e2e) | 98.3 | 208.7 | 298.0 | within | 0 |

## Read-model cost (in-process, e2e database)

| Function | SQLite statement executions | ms |
| --- | ---: | ---: |
| readProfile | 17 | 11.64 |
| readFees | 9 | 0.82 |
| readDirectory (2 brokers) | 54 | 4.81 |
| readComparison | 49 | 1.84 |

Server memory (RSS of running next-server processes): 584 MiB, 229 MiB, 145 MiB.

Rendering is per request for evidence pages so read-time checks (expiry, withdrawal, conflicts, policy, publication switch) always apply; no shared HTML cache is used (the removed RAM cache was not restored). Static tool/guide pages are prerendered at build time. Request-scoped memoization (React `cache`) shares one clock and one read per request.

Limitations: measured on this sandbox, not the production VPS; real data volume (≤30 brokers) will raise directory/sitemap cost roughly linearly. Re-run `pnpm tsx scripts/perf-report.ts` on the VPS behind Nginx for the acceptance figure.
