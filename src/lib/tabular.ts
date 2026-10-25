import zlib from 'node:zlib';

export const TABULAR_LIMITS = {
  maxRows: 100_000,
  maxCols: 300,
  maxCell: 10_000,
  maxInflated: 64 * 1024 * 1024,
  maxFile: 32 * 1024 * 1024,
};

/** RFC 4180 CSV parser (quoted fields, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (rows.length > TABULAR_LIMITS.maxRows) throw new Error('too many rows');
    } else cell += c;
    if (cell.length > TABULAR_LIMITS.maxCell) throw new Error('cell too large');
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  size: number;
  offset: number;
}

function zipEntries(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count && i < 10_000; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    out.push({
      name: buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'),
      method,
      compSize,
      size,
      offset,
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

function readEntry(buf: Buffer, e: ZipEntry): string {
  if (e.size > TABULAR_LIMITS.maxInflated) throw new Error('entry too large');
  const lh = e.offset;
  if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('bad local header');
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return data.toString('utf8');
  if (e.method === 8)
    return zlib.inflateRawSync(data, { maxOutputLength: TABULAR_LIMITS.maxInflated }).toString('utf8');
  throw new Error('unsupported zip compression');
}

const xmlText = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
const colIndex = (ref: string) =>
  [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Minimal bounded XLSX reader for the first worksheet (values only, no formulas or macros executed). */
export function parseXlsx(buf: Buffer): string[][] {
  if (buf.length > TABULAR_LIMITS.maxFile) throw new Error('file too large');
  const entries = zipEntries(buf);
  const get = (name: string) => entries.find((e) => e.name === name);
  const shared: string[] = [];
  const ss = get('xl/sharedStrings.xml');
  if (ss)
    for (const m of readEntry(buf, ss).matchAll(/<si>([\s\S]*?)<\/si>/g))
      shared.push(xmlText([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const sheet =
    get('xl/worksheets/sheet1.xml') ?? entries.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
  if (!sheet) throw new Error('no worksheet');
  const rows: string[][] = [];
  for (const rm of readEntry(buf, sheet).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const inner = cm[2] ?? '';
      let v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
      if (type === 's') v = shared[Number(v)] ?? '';
      else if (type === 'inlineStr')
        v = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('');
      v = xmlText(v);
      const idx = ref ? colIndex(ref) : row.length;
      if (idx >= TABULAR_LIMITS.maxCols) continue;
      row[idx] = v.slice(0, TABULAR_LIMITS.maxCell);
    }
    rows.push(Array.from(row, (c) => c ?? ''));
    if (rows.length > TABULAR_LIMITS.maxRows) throw new Error('too many rows');
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
