/** WCAG 2.x contrast for design-token pairs used in the UI. Writes reports/contrast-report.md. */
import fs from 'node:fs';

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (h: string) => {
  const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const pairs: [string, string, string, number][] = [
  ['Body text on background', '#0F172A', '#F4F9FF', 4.5],
  ['Body text on white card', '#0F172A', '#FFFFFF', 4.5],
  ['Muted text on background', '#475569', '#F4F9FF', 4.5],
  ['Muted text on white', '#475569', '#FFFFFF', 4.5],
  ['Muted text on secondary surface', '#475569', '#EAF4FF', 4.5],
  ['Link/action on white', '#1D4ED8', '#FFFFFF', 4.5],
  ['Link/action on background', '#1D4ED8', '#F4F9FF', 4.5],
  ['Link/action on secondary surface', '#1D4ED8', '#EAF4FF', 4.5],
  ['Accent (eyebrow) on background', '#0369A1', '#F4F9FF', 4.5],
  ['Accent on secondary surface', '#0369A1', '#EAF4FF', 4.5],
  ['White on primary button', '#FFFFFF', '#1D4ED8', 4.5],
  ['White on primary hover', '#FFFFFF', '#1E40AF', 4.5],
  ['Neutral nav text on white', '#334155', '#FFFFFF', 4.5],
  ['Status ok text on ok bg', '#14532D', '#DCFCE7', 4.5],
  ['Status warn text on warn bg', '#78350F', '#FEF3C7', 4.5],
  ['Status bad text on bad bg', '#991B1B', '#FEE2E2', 4.5],
  ['Status info text on info bg', '#075985', '#E0F2FE', 4.5],
  ['Neutral status text on neutral bg', '#334155', '#F1F5F9', 4.5],
  ['Control border on white (non-text, 3:1)', '#5B7FAE', '#FFFFFF', 3],
  ['Focus ring on white (non-text, 3:1)', '#1D4ED8', '#FFFFFF', 3],
  ['Focus ring on background (non-text, 3:1)', '#1D4ED8', '#F4F9FF', 3],
  ['Decorative border on white (not relied on)', '#B9D5F5', '#FFFFFF', 1],
];
const rows = pairs.map(([n, fg, bg, min]) => {
  const r = ratio(fg, bg);
  return { n, fg, bg, r, min, ok: r >= min };
});
const md = [
  '# Contrast report',
  '',
  `Generated ${new Date().toISOString()} (WCAG 2.x relative-luminance formula). Pale blue is used only for surfaces and decorative borders; meaningful control boundaries use the stronger border.`,
  '',
  '| Pair | FG | BG | Ratio | Required | Result |',
  '| --- | --- | --- | ---: | ---: | --- |',
  ...rows.map(
    (r) =>
      `| ${r.n} | \`${r.fg}\` | \`${r.bg}\` | ${r.r.toFixed(2)}:1 | ${r.min}:1 | ${r.ok ? 'PASS' : '**FAIL**'} |`,
  ),
  '',
].join('\n');
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/contrast-report.md', md);
console.log(rows.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.r.toFixed(2)} ${r.n}`).join('\n'));
process.exitCode = rows.every((r) => r.ok) ? 0 : 1;
