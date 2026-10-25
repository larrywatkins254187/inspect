import Decimal from 'decimal.js';

/** Exact decimal string: optional minus, digits, optional fraction. No exponent, no grouping. */
export const DECIMAL_RE = /^-?(0|[1-9]\d{0,17})(\.\d{1,12})?$/;

export function isDecimalString(s: string): boolean {
  return DECIMAL_RE.test(s);
}

/** Canonical form for equality/keys: "1.50" → "1.5", "-0" → "0". Display keeps the stated text. */
export function normalizeDecimal(s: string): string {
  if (!isDecimalString(s)) throw new Error('not an exact decimal string');
  const d = new Decimal(s);
  return d.isZero() ? '0' : d.toFixed();
}

export function decimalEquals(a: string, b: string): boolean {
  return normalizeDecimal(a) === normalizeDecimal(b);
}

export { Decimal };
