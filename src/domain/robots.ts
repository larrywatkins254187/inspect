/**
 * Minimal RFC 9309 robots.txt evaluation: group selection by most specific
 * user-agent token, longest-match allow/disallow with `*` and `$`.
 */
interface Rule {
  allow: boolean;
  pattern: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/).slice(0, 5000)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (key === 'disallow' && value === '') continue;
      current.rules.push({ allow: key === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    '^' +
      body
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      (anchored ? '$' : ''),
  );
  return re.test(path);
}

/** Product token of our user agent, e.g. "ForexInspectBot/2.0 (+url)" → "forexinspectbot". */
export function productToken(userAgent: string): string {
  return (userAgent.split(/[\s/]/)[0] ?? '').toLowerCase();
}

export function isAllowed(robotsText: string, userAgent: string, path: string): boolean {
  const groups = parseRobots(robotsText);
  const token = productToken(userAgent);
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.startsWith(a)));
  const selected = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = selected.flatMap((g) => g.rules);
  let best: Rule | null = null;
  for (const r of rules) {
    if (!patternMatches(r.pattern, path)) continue;
    if (
      !best ||
      r.pattern.length > best.pattern.length ||
      (r.pattern.length === best.pattern.length && r.allow)
    )
      best = r;
  }
  return best ? best.allow : true;
}
