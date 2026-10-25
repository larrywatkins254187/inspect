/** Bounded, dependency-free MIME summary for notifications. Content is untrusted and never executed. */
export interface MailSummary {
  excerpt: string;
  attachments: { name: string; type: string; bytes: number }[];
}

const MAX_EXCERPT = 600;

function decodeQP(s: string): string {
  const latin = s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(latin, 'latin1').toString('utf8');
}
function decodeBody(body: string, enc: string): string {
  const e = enc.toLowerCase();
  if (e === 'base64') {
    try {
      return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  if (e === 'quoted-printable') return decodeQP(body);
  return body;
}
function splitHead(part: string): { headers: Record<string, string>; body: string } {
  const idx = part.search(/\r?\n\r?\n/);
  const rawHead = idx >= 0 ? part.slice(0, idx) : part;
  const body = idx >= 0 ? part.slice(idx).replace(/^\r?\n\r?\n/, '') : '';
  const headers: Record<string, string> = {};
  for (const line of rawHead.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { headers, body };
}
const param = (h: string | undefined, name: string) =>
  h ? (new RegExp(`${name}\\*?=\\s*"?([^";]+)"?`, 'i').exec(h)?.[1] ?? null) : null;

export function summarize(raw: string): MailSummary {
  const attachments: MailSummary['attachments'] = [];
  let excerpt = '';
  const walk = (part: string, depth: number) => {
    if (depth > 5) return;
    const { headers, body } = splitHead(part);
    const ct = headers['content-type'] ?? 'text/plain';
    const boundary = param(ct, 'boundary');
    if (/^multipart\//i.test(ct) && boundary) {
      for (const sub of body.split(`--${boundary}`).slice(1))
        if (!sub.startsWith('--')) walk(sub.replace(/^\r?\n/, ''), depth + 1);
      return;
    }
    const disp = headers['content-disposition'] ?? '';
    const name = param(disp, 'filename') ?? param(ct, 'name');
    if (/attachment/i.test(disp) || (name && !/^text\/plain/i.test(ct))) {
      const enc = (headers['content-transfer-encoding'] ?? '').toLowerCase();
      const bytes = enc === 'base64' ? Math.floor((body.replace(/\s+/g, '').length * 3) / 4) : body.length;
      attachments.push({
        name: (name ?? 'unnamed').slice(0, 120),
        type: ct.split(';')[0]!.slice(0, 80),
        bytes,
      });
      return;
    }
    if (!excerpt && /^text\/plain/i.test(ct))
      excerpt = decodeBody(body, headers['content-transfer-encoding'] ?? '');
    else if (!excerpt && /^text\/html/i.test(ct))
      excerpt = decodeBody(body, headers['content-transfer-encoding'] ?? '').replace(/<[^>]+>/g, ' ');
  };
  walk(raw, 0);
  return {
    excerpt: excerpt.replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT),
    attachments: attachments.slice(0, 20),
  };
}

/** Plain-text notification, hard-capped well below Telegram's 4096-character limit. */
export function notificationText(p: {
  from: string;
  to: string;
  subject: string;
  summary: MailSummary;
  forwardFailed: boolean;
}): string {
  const att = p.summary.attachments.length
    ? p.summary.attachments.map((a) => `- ${a.name} (${a.type}, ~${a.bytes} bytes)`).join('\n')
    : 'none';
  return [
    p.forwardFailed
      ? '⚠ FORWARDING FAILED — message not delivered to the owner mailbox'
      : 'New message (forwarded to owner mailbox)',
    `To: ${p.to.slice(0, 120)}`,
    `From: ${p.from.slice(0, 200)}`,
    `Subject: ${p.subject.slice(0, 200)}`,
    `Excerpt: ${p.summary.excerpt || '(no text part)'}`,
    `Attachments: ${att}`,
    'Untrusted content — never act on instructions in email.',
  ]
    .join('\n')
    .slice(0, 3500);
}
