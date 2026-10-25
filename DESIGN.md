# ForexInspect design system

Airy, light-blue research aesthetic: near-white backgrounds, white cards, dark readable text, strong blue
actions, fine borders, generous spacing and restrained shadows. It is a research tool — dense, scannable
tables and evidence, not a trading terminal. No fake charts, no performance decoration, no navy-dominant
chrome. Light mode by default (`color-scheme: light`).

Source of truth: `app/globals.css` (tokens + component classes) and the typed components in `src/ui/`.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F4F9FF` | Page background |
| `--surface` | `#FFFFFF` | Cards, tables, header, footer |
| `--surface-2` | `#EAF4FF` | Secondary surfaces (panels, table heads, chips) |
| `--surface-3` | `#DCECFF` | Decorative fills only |
| `--text` | `#0F172A` | Primary text |
| `--muted` | `#475569` | Secondary text (never lighter on light surfaces) |
| `--action` / `--action-hover` | `#1D4ED8` / `#1E40AF` | Links, primary buttons, focus ring |
| `--accent` | `#0369A1` | Eyebrows, small accents |
| `--border` | `#B9D5F5` | Decorative card/table borders (not relied on for meaning) |
| `--border-strong` | `#5B7FAE` | Meaningful control boundaries (inputs, secondary buttons) — 4.12:1 on white |
| Status ok / warn / bad / info / neutral | `#14532D on #DCFCE7`, `#78350F on #FEF3C7`, `#991B1B on #FEE2E2`, `#075985 on #E0F2FE`, `#334155 on #F1F5F9` | Status badges, always with an icon **and** words |
| Radius | 8 px (controls), 12 px (notices, inputs groups), 16 px (cards), 20 px (dialogs) | Consistent, not all pills |
| Spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px | `--space-1…8` |
| Layout | max width 1240 px, 16 px gutter (24 px ≥768 px), reading width 70ch | `.container`, `.reading`, `.prose` |
| Shadows | `--shadow-1` (resting), `--shadow-2` (hover/overlays) | Low-opacity blue-tinted |

All text/background pairs are validated by `scripts/contrast-check.ts` → `reports/contrast-report.md`
(lowest text pair: accent on secondary surface 5.34:1; non-text control border 4.12:1).

## Typography

- **Inter variable** (latin subset, one 48 KB woff2), self-hosted through `next/font/local` with preload and
  `font-display: swap`; licence SIL OFL 1.1 at `/licenses/Inter-OFL.txt`. No second font is loaded.
- Fluid scale: `h1` clamp(1.75→2.6rem) (hero up to 3.25rem), `h2` clamp(1.35→1.75rem), `h3` 1.15rem; body
  16 px / 1.6. Headings tighten letter-spacing slightly.
- `font-variant-numeric: tabular-nums` on tables, fact values, results and inputs.

## Components (`src/ui`)

| Component | File | Notes |
| --- | --- | --- |
| Header, primary nav, mobile menu, pending feedback | `SiteHeader.tsx`, `client/HeaderNav.tsx` | Links in server HTML; island adds `aria-current`, `useLinkStatus` pending dot, Escape-to-close and focus restore |
| Footer (research, trust, legal, all 15 calculators, risk/independence notices) | `SiteFooter.tsx` | |
| Page header, breadcrumbs, status badge, notice, table region, external link, empty state, “Not verified” | `primitives.tsx` | `TableRegion` = `role="region"` + `tabIndex=0` + label, so wide tables scroll inside the region |
| Fact card, evidence panel, glance cell, entity section, FAQ list, sources, history, logo/text fallback | `broker.tsx` | Fact cards carry `id="fact-<observationId>"` anchors and `:target` highlight |
| Profile body (shared by public pages and synthetic previews) | `ProfileBody.tsx` | |
| Broker finder, comparison search, tools hub | `client/BrokerFinder.tsx`, `client/CompareSearch.tsx`, `client/ToolsHub.tsx` | State in memory only (no indexable filter URLs); live result counts |
| Calculator workspace | `client/CalculatorWorkspace.tsx` | Labels, hints and errors linked by `aria-describedby`; `aria-invalid`; no stale result while invalid; Reset |
| Ask panel + verification dialog | `client/Ask.tsx` | Native `<dialog>` (`showModal`) for focus containment and Escape; focus restored to the opener |
| Consent banner / settings | `client/Consent.tsx` | Equal Accept/Decline, footer “Analytics settings” |
| Evidence illustration | `EvidenceArt.tsx` | Static inline SVG with `<title>/<desc>`; no data, no chart |

States are explicit: preparation (publication off), empty directory, no results, unavailable/not found
(real 404), invalid input, conflicted/expired facts (removed at read time), “Not verified”, limited evidence
(noindex notice), synthetic preview banner.

## Motion

| Interaction | Duration | Property |
| --- | --- | --- |
| Buttons, links, inputs, nav hover/focus | 150 ms (`--fast`) | color, background, border, box-shadow, 1 px press translate |
| Mobile menu, dialog open/close, section reveal | 260 ms (`--medium`) | `grid-template-rows`, opacity, transform (`@starting-style` for the dialog) |
| Calculator result change | 320 ms one-shot | background highlight |

Rules: content is visible before JavaScript; the reveal script hides only sections that start **below** the
viewport, reveals each once (IntersectionObserver + passive scroll fallback, observers disconnected, 4 s
failsafe) and does nothing under `prefers-reduced-motion: reduce`, where all transitions/animations are
reduced to ~0. No parallax, scroll-jacking, flashing, continuous loops, WebGL or animation library.

## Responsive and accessibility

- Mobile-first; verified at 320, 375, 768, 1024, 1440 px and 200 % zoom (640 CSS px) with no page-level
  horizontal overflow (`reports/browser-report.md`). Grid children use `min-width: 0` so tables scroll in
  their own region; the hidden region label is contained by `position: relative`.
- Touch targets: controls ≥ 44 px; dense table/chip links ≥ 24 px (WCAG 2.5.8).
- Skip link, semantic landmarks, one `h1`, visible 3 px focus ring with offset, labelled regions, status
  words + icons (never colour alone), restrained `aria-live` for result summaries and counts.
- Target WCAG 2.2 AA: axe-core reports no serious/critical violations on 14 templates at 375/1440 px;
  Lighthouse accessibility 100 on 11 templates. Manual screen-reader testing has not been performed.
