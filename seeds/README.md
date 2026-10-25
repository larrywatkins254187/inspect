# Seeds and import templates

- `candidates.json` — the **unverified** candidate scaffold reconstructable from the PRD: the 30 named
  wave A/B/C candidates and the 5 pilot starter leads. It contains names, slugs, waves and lead URLs
  only. It is *not* the original 119-row intake, the 18 original starter leads or the 103-field workbook.
- `workbook-template.csv` — header-only template for an original workbook export. Import real files with
  `pnpm cli workbook <file.csv|file.xlsx> --expect-rows N`. Every value lands as `UNVERIFIED_IMPORT`
  discovery data and never becomes a fact.

Missing original inputs (must be supplied by the owner; never fabricated): the complete 119-candidate
import, the remaining 89 names and 13 leads, original row values, accepted-fact database, source
permissions, licensed logo files and historical revisions.
