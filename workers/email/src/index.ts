import { notificationText, summarize } from './mime';

interface Env {
  DEST: string;
  TG_TOKEN: string;
  TG_CHAT: string;
}
interface EmailMessage {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream<Uint8Array>;
  rawSize: number;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const ALIASES = [
  'support',
  'corrections',
  'privacy',
  'security',
  'abuse',
  'postmaster',
  'dmarc',
  'tls-rpt',
  'tlsrpt',
];
const READ_LIMIT = 1024 * 1024;

async function readBounded(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < READ_LIMIT) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, READ_LIMIT));
}

async function notify(env: Env, text: string): Promise<void> {
  // The edge Worker calls Telegram's public HTTPS API directly (it cannot reach the VPS loopback Bot API).
  await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
}

const worker = {
  async email(message: EmailMessage, env: Env, ctx: Ctx): Promise<void> {
    const local = message.to.split('@')[0]!.toLowerCase();
    if (!ALIASES.includes(local)) throw new Error('unknown recipient');
    const raw = await readBounded(message.raw).catch(() => '');
    const summary = summarize(raw);
    const subject = message.headers.get('subject') ?? '(no subject)';
    let forwardError: unknown = null;
    try {
      await message.forward(env.DEST);
    } catch (e) {
      forwardError = e;
    }
    const text = notificationText({
      from: message.from,
      to: message.to,
      subject,
      summary,
      forwardFailed: !!forwardError,
    });
    if (forwardError) {
      await notify(env, text).catch(() => undefined);
      throw forwardError; // never silently lose mail
    }
    ctx.waitUntil(notify(env, text).catch(() => undefined));
  },
};

export default worker;
