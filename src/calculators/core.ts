import Decimal from 'decimal.js';

export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });
export type Dec = InstanceType<typeof D>;

export type FieldKind = 'decimal' | 'integer' | 'select' | 'checkbox';
export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  help?: string;
  unit?: string;
  options?: { value: string; label: string }[];
  defaultValue: string;
  /** Hide unless another field has a given value. */
  showWhen?: { field: string; equals: string[] };
  /** Role for instrument-driven defaults. */
  role?: 'instrument' | 'contract' | 'pip' | 'rate' | 'accountCurrency' | 'quoteCurrency';
}

export interface CalcResult {
  label: string;
  value: string;
  unit?: string;
  primary?: boolean;
}
export interface CalcTable {
  caption: string;
  headers: string[];
  rows: string[][];
}
export type CalcOutput =
  | { ok: true; results: CalcResult[]; notes: string[]; table?: CalcTable }
  | { ok: false; errors: Record<string, string>; formError?: string };

export interface CalcContext {
  /** EUR-based ECB reference rates (exact strings), e.g. { USD: "1.1193" }. */
  eurRates?: Record<string, string>;
  rateDate?: string;
}

export type Values = Record<string, string>;

const NUM = /^-?(\d{1,15}(\.\d{1,12})?|\.\d{1,12})$/;

/** Strict parser: exact decimal text only; never NaN/Infinity/exponents/missing-as-zero. */
export class Parser {
  errors: Record<string, string> = {};
  constructor(private values: Values) {}
  raw(name: string): string {
    return (this.values[name] ?? '').trim();
  }
  num(name: string, opts: { min?: string; max?: string; gt?: string; lt?: string; integer?: boolean; label?: string } = {}): Dec {
    const s = this.raw(name);
    const fail = (m: string) => {
      this.errors[name] ??= m;
      return new D(0);
    };
    if (s === '') return fail('Enter a value.');
    if (!NUM.test(s)) return fail('Use digits with an optional decimal point (no commas, spaces or exponents).');
    const d = new D(s);
    if (!d.isFinite()) return fail('Enter a finite number.');
    if (opts.integer && !d.isInteger()) return fail('Enter a whole number.');
    if (opts.gt !== undefined && !d.gt(opts.gt)) return fail(`Must be greater than ${opts.gt}.`);
    if (opts.lt !== undefined && !d.lt(opts.lt)) return fail(`Must be less than ${opts.lt}.`);
    if (opts.min !== undefined && d.lt(opts.min)) return fail(`Must be at least ${opts.min}.`);
    if (opts.max !== undefined && d.gt(opts.max)) return fail(`Must be at most ${opts.max}.`);
    return d;
  }
  choice<T extends string>(name: string, allowed: readonly T[]): T {
    const s = this.raw(name) as T;
    if (!allowed.includes(s)) {
      this.errors[name] ??= 'Choose an option.';
      return allowed[0]!;
    }
    return s;
  }
  flag(name: string): boolean {
    return this.raw(name) === 'true';
  }
  error(name: string, message: string) {
    this.errors[name] ??= message;
  }
  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }
  fail(formError?: string): CalcOutput {
    return { ok: false, errors: this.errors, ...(formError ? { formError } : {}) };
  }
}

/** Currency decimals for display rounding. */
export const currencyDp = (ccy: string) => (ccy === 'JPY' ? 0 : 2);
export const money = (d: Dec, ccy: string): string => d.toDecimalPlaces(currencyDp(ccy), D.ROUND_HALF_UP).toFixed(currencyDp(ccy));
export const fixed = (d: Dec, dp: number): string => d.toDecimalPlaces(dp, D.ROUND_HALF_UP).toFixed(dp);
/** Round down to a step (position sizing never rounds up). */
export const floorTo = (d: Dec, step: Dec): Dec => d.div(step).floor().mul(step);
export const dpOf = (s: string): number => (s.includes('.') ? s.split('.')[1]!.length : 0);
export const stepDp = (d: Dec): number => Math.max(0, d.decimalPlaces());
export const signed = (s: string) => (s.startsWith('-') ? s.replace('-', '−') : s);
