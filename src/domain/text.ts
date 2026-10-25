import { sha256 } from '@/lib/hash';

export const PARSER_VERSION = 'html-text-v2';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  euro: '€',
  pound: '£',
  yen: '¥',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * HTML → normalized main text. Navigation, headers, footers, banners, scripts
 * and styles are removed so that template churn does not manufacture fact
 * changes or model work (PRD §11). The output is untrusted data.
 */
export function htmlToText(html: string): string {
  let s = html.slice(0, 2_000_000);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of [
    'script',
    'style',
    'noscript',
    'svg',
    'template',
    'iframe',
    'nav',
    'header',
    'footer',
    'form',
    'button',
    'select',
  ]) {
    s = s.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi'), ' ');
  }
  s = s.replace(/<(div|section|aside)\b[^>]*(cookie|consent|banner|popup|modal)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|table|br|dt|dd)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<(td|th)\b[^>]*>/gi, ' | ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

export function textHash(text: string): string {
  return sha256(text.replace(/\s+/g, ' ').trim());
}
