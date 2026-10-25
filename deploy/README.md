# Deployment templates

Templates only — a file in this directory is **not** proof that a service is installed or enabled.
Install on the VPS as root after review:

```bash
install -m 0644 deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
install -m 0644 deploy/nginx/forexinspect.conf /etc/nginx/sites-available/forexinspect
ln -s /etc/nginx/sites-available/forexinspect /etc/nginx/sites-enabled/forexinspect
nginx -t && systemctl reload nginx
systemctl daemon-reload
systemctl enable --now forexinspect-web.service
# Enable only the timers whose prerequisites are met (see STATUS.md / RUNBOOK.md):
systemctl enable --now forexinspect-prices.timer forexinspect-monitor.timer forexinspect-maintenance.timer
```

| Timer | Schedule (UTC) | Command | Prerequisites |
| --- | --- | --- | --- |
| prices | every 10 min | `cli prices-refresh` | `MARKET_RATES_ENABLED="true"` |
| compare | 00/04/08/12/16/20:25 | `cli compare-cycle` | publication + auto-publication on, Codex login, approved logos |
| seo | 00/06/12/18:40 | `cli seo-crawl` (read-only) | app running on loopback |
| policy-review | daily 02:10 | `cli policy-review --live` | approved sources, honest `SOURCE_USER_AGENT` |
| publish | daily 03:30 | `cli publish-auto` | `PUBLICATION_ENABLED` and `AUTO_PUBLICATION_ENABLED` |
| monitor | hourly | `cli monitor` | — |
| maintenance | daily 04:50 | `cli maintenance` | — |
| backup | daily 07:00 (+≤10 min jitter, catch-up) | `cli backup --upload` | key file, `BACKUP_TRANSPORT_APPROVED`, Telegram Bot API |

Extraction/promotion (`cli extract <source> --live`, `cli promote <doc>`) is run by the operator or a reviewed
wrapper per source; it needs `CODEX_ENABLED`, `CODEX_MODEL` and `codex login` as the `forexinspect` user.
