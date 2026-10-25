import { isDecimalString, normalizeDecimal } from '@/lib/decimal';
import { cleanLabel, normalizeAccountLabel, scopeKey, toScope, type Scope } from './scope';

export const FIELD_KEYS = [
  'account_type',
  'minimum_deposit',
  'minimum_lot_size',
  'demo_account',
  'islamic_account',
  'eurusd_spread',
  'trading_commission',
  'maximum_leverage',
  'mt4_supported',
  'mt5_supported',
  'ctrader_supported',
  'tradingview_supported',
  'copy_trading',
  'legal_entity_name',
  'operating_entity',
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type Topic = 'accounts' | 'costs' | 'leverage' | 'platforms' | 'entity';
export type CoreTopic =
  | 'minimum_deposit'
  | 'forex_spread'
  | 'trading_commission'
  | 'maximum_leverage'
  | 'account_types'
  | 'legal_entity';

export interface FieldDef {
  key: FieldKey;
  label: string;
  topic: Topic;
  ttlHours: number;
  core: CoreTopic | null;
  kind: 'decimal' | 'boolean' | 'text' | 'ratio' | 'entity';
}

/** Mirrors migrations/0002 (a test asserts they agree). */
export const FIELDS: Record<FieldKey, FieldDef> = {
  account_type: {
    key: 'account_type',
    label: 'Account type',
    topic: 'accounts',
    ttlHours: 168,
    core: 'account_types',
    kind: 'text',
  },
  minimum_deposit: {
    key: 'minimum_deposit',
    label: 'Minimum deposit',
    topic: 'accounts',
    ttlHours: 168,
    core: 'minimum_deposit',
    kind: 'decimal',
  },
  minimum_lot_size: {
    key: 'minimum_lot_size',
    label: 'Minimum trade size',
    topic: 'accounts',
    ttlHours: 168,
    core: null,
    kind: 'decimal',
  },
  demo_account: {
    key: 'demo_account',
    label: 'Demo account',
    topic: 'accounts',
    ttlHours: 720,
    core: null,
    kind: 'boolean',
  },
  islamic_account: {
    key: 'islamic_account',
    label: 'Swap-free (Islamic) account',
    topic: 'accounts',
    ttlHours: 720,
    core: null,
    kind: 'boolean',
  },
  eurusd_spread: {
    key: 'eurusd_spread',
    label: 'EUR/USD spread',
    topic: 'costs',
    ttlHours: 168,
    core: 'forex_spread',
    kind: 'decimal',
  },
  trading_commission: {
    key: 'trading_commission',
    label: 'Trading commission',
    topic: 'costs',
    ttlHours: 168,
    core: 'trading_commission',
    kind: 'decimal',
  },
  maximum_leverage: {
    key: 'maximum_leverage',
    label: 'Maximum leverage',
    topic: 'leverage',
    ttlHours: 168,
    core: 'maximum_leverage',
    kind: 'ratio',
  },
  mt4_supported: {
    key: 'mt4_supported',
    label: 'MetaTrader 4',
    topic: 'platforms',
    ttlHours: 720,
    core: null,
    kind: 'boolean',
  },
  mt5_supported: {
    key: 'mt5_supported',
    label: 'MetaTrader 5',
    topic: 'platforms',
    ttlHours: 720,
    core: null,
    kind: 'boolean',
  },
  ctrader_supported: {
    key: 'ctrader_supported',
    label: 'cTrader',
    topic: 'platforms',
    ttlHours: 720,
    core: null,
    kind: 'boolean',
  },
  tradingview_supported: {
    key: 'tradingview_supported',
    label: 'TradingView',
    topic: 'platforms',
    ttlHours: 720,
    core: null,
    kind: 'boolean',
  },
  copy_trading: {
    key: 'copy_trading',
    label: 'Copy trading',
    topic: 'platforms',
    ttlHours: 720,
    core: null,
    kind: 'boolean',
  },
  legal_entity_name: {
    key: 'legal_entity_name',
    label: 'Named company',
    topic: 'entity',
    ttlHours: 168,
    core: 'legal_entity',
    kind: 'entity',
  },
  operating_entity: {
    key: 'operating_entity',
    label: 'Website operator',
    topic: 'entity',
    ttlHours: 168,
    core: 'legal_entity',
    kind: 'entity',
  },
};

export const CORE_TOPICS: { key: CoreTopic; label: string }[] = [
  { key: 'minimum_deposit', label: 'Minimum deposit' },
  { key: 'forex_spread', label: 'Forex spread' },
  { key: 'trading_commission', label: 'Trading commission' },
  { key: 'maximum_leverage', label: 'Maximum leverage' },
  { key: 'account_types', label: 'Account types' },
  { key: 'legal_entity', label: 'Legal entity' },
];

export const TOPIC_LABELS: Record<Topic, string> = {
  accounts: 'Accounts and deposits',
  costs: 'Trading costs',
  leverage: 'Leverage',
  platforms: 'Platforms and features',
  entity: 'Companies and regulation',
};

/** Fields a model or extractor may never establish (PRD §3.6, §12.2). */
export const FORBIDDEN_MODEL_FIELDS = new Set([
  'regulatory_licence',
  'licence_number',
  'regulator',
  'licence_status',
  'client_protection',
  'eligibility',
  'country_availability',
]);

/** A raw reading proposed by an extractor pass. Untrusted until validated. */
export interface Reading {
  field: string;
  value: string;
  unit?: string | null;
  currency?: string | null;
  scope?: Partial<Scope>;
  quote: string;
  locator: string;
  effectiveDate?: string | null;
}

export interface ValidatedReading {
  field: FieldKey;
  valueText: string;
  normalizedValue: string;
  unit: string | null;
  currency: string | null;
  scope: Scope;
  scopeKey: string;
  quote: string;
  locator: string;
  effectiveDate: string | null;
  operatorWording?: 'OPERATED_BY' | 'SERVICES_PROVIDED_BY' | 'TRADING_NAME_OF';
}

export type ValidationResult = { ok: true; reading: ValidatedReading } | { ok: false; problems: string[] };

const ISO_CURRENCIES = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'CAD',
  'NZD',
  'SGD',
  'HKD',
  'ZAR',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'MXN',
  'AED',
  'THB',
  'MYR',
  'IDR',
  'INR',
  'CNY',
  'CNH',
  'BRL',
  'TRY',
  'ILS',
  'KES',
  'NGN',
  'PHP',
  'VND',
]);

/** Unambiguous currency markers. A bare "$" is deliberately absent. */
const CURRENCY_MARKERS: [RegExp, string][] = [
  [/US\$/, 'USD'],
  [/A\$|AU\$/, 'AUD'],
  [/C\$|CA\$/, 'CAD'],
  [/NZ\$/, 'NZD'],
  [/S\$|SG\$/, 'SGD'],
  [/HK\$/, 'HKD'],
  [/€/, 'EUR'],
  [/£/, 'GBP'],
];

/** Collapse whitespace and typographic variants for literal comparison. */
export function normalizeForLiteral(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Literal evidence check: the quote must occur in the document text. */
export function quoteInDocument(quote: string, documentText: string): boolean {
  const q = normalizeForLiteral(quote);
  return q.length >= 3 && normalizeForLiteral(documentText).includes(q);
}

/** Numeric tokens in a quote, thousands separators removed, normalized. */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d{1,3}(?:[,   ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    const t = m[0].replace(/[,   ]/g, '');
    if (isDecimalString(t.replace(/^0+(?=\d)/, '') || '0'))
      out.push(normalizeDecimal(t.replace(/^0+(?=\d)/, '') || '0'));
  }
  return out;
}

export function currencyEvidence(quote: string): { codes: Set<string>; bareDollar: boolean } {
  const codes = new Set<string>();
  for (const m of quote.toUpperCase().matchAll(/\b[A-Z]{3}\b/g))
    if (ISO_CURRENCIES.has(m[0])) codes.add(m[0]);
  let stripped = quote;
  for (const [re, code] of CURRENCY_MARKERS) {
    if (re.test(stripped)) {
      codes.add(code);
      stripped = stripped.replace(new RegExp(re.source, 'g'), ' ');
    }
  }
  return { codes, bareDollar: /\$/.test(stripped) };
}

const LEGAL_FORM =
  /\b(ltd|limited|pty|proprietary|llc|l\.l\.c\.|plc|p\.l\.c\.|inc|incorporated|corp|corporation|gmbh|ag|s\.a\.|sa|a\/s|as|b\.v\.|bv|n\.v\.|nv|llp|lp|pte|sdn bhd|sarl|s\.r\.l\.|srl|kg|ab|oy|spa|s\.p\.a\.)\b\.?$/i;

/** Legal-name normalization: case/space/punctuation/legal-form variants (PRD §12.2). */
export function normalizeLegalName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bpublic limited company\b/g, 'plc')
    .replace(/\bproprietary\b/g, 'pty')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\bincorporated\b/g, 'inc')
    .replace(/\bcorporation\b/g, 'corp')
    .replace(/\bl\.l\.c\.?/g, 'llc')
    .replace(/\bp\.l\.c\.?/g, 'plc')
    .replace(/[.,'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasLegalForm(name: string): boolean {
  return LEGAL_FORM.test(name.trim().replace(/[)\s]+$/, ''));
}

const OPERATOR_PATTERNS: [RegExp, ValidatedReading['operatorWording']][] = [
  [/\b(is|are)\s+operated\s+by\b|\boperated\s+by\b/i, 'OPERATED_BY'],
  [/\bservices\s+(are\s+)?(provided|offered)\s+by\b/i, 'SERVICES_PROVIDED_BY'],
  [/\b(is\s+)?(a\s+)?trading\s+name\s+of\b/i, 'TRADING_NAME_OF'],
];

const PLATFORM_WORDS: Partial<Record<FieldKey, RegExp>> = {
  mt4_supported: /\bmt4\b|metatrader\s*4/i,
  mt5_supported: /\bmt5\b|metatrader\s*5/i,
  ctrader_supported: /\bc-?trader\b/i,
  tradingview_supported: /\btrading\s?view\b/i,
  copy_trading: /\bcopy[\s-]?trad/i,
  demo_account: /\bdemo\b/i,
  islamic_account: /\bislamic\b|\bswap[\s-]?free\b/i,
};

const NEGATION = /\b(not|no|unavailable|n\/a|does not|doesn't|isn't)\b/i;

const normalizeInstrument = (s: string | null): string | null => {
  if (!s) return null;
  const t = s.toUpperCase().replace(/[\s/._-]/g, '');
  return t === 'EURUSD' ? 'EUR/USD' : s;
};

/**
 * Deterministic validation of one reading against its own document text.
 * Every problem is recorded; any problem blocks promotion.
 */
export function validateReading(r: Reading, documentText: string): ValidationResult {
  const problems: string[] = [];
  if (FORBIDDEN_MODEL_FIELDS.has(r.field)) return { ok: false, problems: ['FIELD_NOT_EXTRACTABLE'] };
  if (!(FIELD_KEYS as readonly string[]).includes(r.field)) return { ok: false, problems: ['UNKNOWN_FIELD'] };
  const field = r.field as FieldKey;
  const def = FIELDS[field];
  const quote = typeof r.quote === 'string' ? r.quote : '';
  const value = typeof r.value === 'string' ? r.value.trim() : '';
  if (quote.length > 600) problems.push('QUOTE_TOO_LONG');
  if (!quoteInDocument(quote, documentText)) problems.push('QUOTE_NOT_IN_DOCUMENT');
  if (!r.locator || r.locator.length > 300) problems.push('LOCATOR_INVALID');
  let scope = toScope(r.scope ?? {});
  let unit: string | null = r.unit ? r.unit.trim().toLowerCase() : null;
  let currency: string | null = r.currency ? r.currency.trim().toUpperCase() : null;
  let normalizedValue = value;
  let valueText = value;
  let operatorWording: ValidatedReading['operatorWording'];
  const nums = numbersIn(quote);
  const lq = quote.toLowerCase();

  const requireCurrency = (allowZeroPhrase: boolean) => {
    const ev = currencyEvidence(quote);
    if (currency === null) {
      if (allowZeroPhrase && normalizedValue === '0' && /\bno minimum\b/i.test(quote)) return;
      problems.push(ev.bareDollar ? 'AMBIGUOUS_CURRENCY' : 'CURRENCY_MISSING');
      return;
    }
    if (!ISO_CURRENCIES.has(currency)) problems.push('CURRENCY_INVALID');
    else if (!ev.codes.has(currency))
      problems.push(ev.bareDollar ? 'AMBIGUOUS_CURRENCY' : 'CURRENCY_NOT_IN_QUOTE');
  };
  const requireDecimal = (min: 'zero' | 'positive') => {
    if (!isDecimalString(value)) {
      problems.push('VALUE_NOT_EXACT_DECIMAL');
      return;
    }
    normalizedValue = normalizeDecimal(value);
    if (normalizedValue.startsWith('-')) problems.push('VALUE_NEGATIVE');
    if (min === 'positive' && normalizedValue === '0') problems.push('VALUE_NOT_POSITIVE');
    const zeroPhrase =
      normalizedValue === '0' && /\b(no minimum|zero|free|no commission|commission-free)\b/i.test(quote);
    if (!nums.includes(normalizedValue) && !zeroPhrase) problems.push('VALUE_NOT_IN_QUOTE');
  };

  switch (def.kind) {
    case 'decimal':
      if (field === 'minimum_deposit') {
        requireDecimal('zero');
        requireCurrency(true);
        unit = null;
      } else if (field === 'eurusd_spread') {
        requireDecimal('zero');
        currency = null;
        scope = { ...scope, instrument: normalizeInstrument(scope.instrument) };
        if (scope.instrument !== 'EUR/USD') problems.push('INSTRUMENT_NOT_EURUSD');
        if (!/eur\s*\/?\s*usd/i.test(quote)) problems.push('INSTRUMENT_NOT_IN_QUOTE');
        if (unit === 'pip') unit = 'pips';
        if (unit === 'point') unit = 'points';
        if (unit !== 'pips' && unit !== 'points') problems.push('SPREAD_UNIT_INVALID');
      } else if (field === 'trading_commission') {
        requireDecimal('zero');
        requireCurrency(false);
        unit = null;
        if (
          scope.commissionSide === 'PER_SIDE' &&
          !/\b(per|each)\s+side\b|\bper\s+trade\s+side\b|\bone[\s-]way\b/i.test(quote)
        )
          problems.push('COMMISSION_SIDE_NOT_IN_QUOTE');
        if (
          scope.commissionSide === 'ROUND_TURN' &&
          !/\bround[\s-]?turn\b|\bround[\s-]?trip\b|\bopen and close\b/i.test(quote)
        )
          problems.push('COMMISSION_SIDE_NOT_IN_QUOTE');
        if (scope.commissionSide && !['PER_SIDE', 'ROUND_TURN'].includes(scope.commissionSide))
          problems.push('COMMISSION_SIDE_INVALID');
        if (scope.commissionVolume && !lq.includes(scope.commissionVolume.toLowerCase()))
          problems.push('COMMISSION_VOLUME_NOT_IN_QUOTE');
      } else if (field === 'minimum_lot_size') {
        requireDecimal('positive');
        currency = null;
        if (unit !== 'lots' && unit !== 'lot') problems.push('LOT_UNIT_INVALID');
        unit = 'lots';
      }
      break;
    case 'ratio': {
      currency = null;
      unit = 'ratio';
      const m = /^1:(\d{1,5})$/.exec(value);
      if (!m) problems.push('LEVERAGE_FORMAT_INVALID');
      else {
        normalizedValue = String(Number(m[1]));
        valueText = `1:${normalizedValue}`;
        const literal = new RegExp(`1\\s*:\\s*${m[1]}\\b|\\b${m[1]}\\s*:\\s*1\\b`);
        if (!literal.test(quote)) problems.push('LEVERAGE_NOT_IN_QUOTE');
        if (Number(m[1]) < 1) problems.push('LEVERAGE_INVALID');
      }
      break;
    }
    case 'boolean': {
      currency = null;
      unit = null;
      if (value !== 'true' && value !== 'false') problems.push('BOOLEAN_INVALID');
      normalizedValue = value;
      const word = PLATFORM_WORDS[field];
      if (word && !word.test(quote)) problems.push('FEATURE_NOT_IN_QUOTE');
      if (value === 'false' && !NEGATION.test(quote)) problems.push('EXPLICIT_FALSE_NEEDS_NEGATION');
      break;
    }
    case 'text': {
      currency = null;
      unit = null;
      const label = cleanLabel(value);
      if (!label || label.length > 80) problems.push('ACCOUNT_LABEL_INVALID');
      else {
        valueText = label;
        normalizedValue = normalizeAccountLabel(label) ?? label.toLowerCase();
        if (!lq.includes(label.toLowerCase())) problems.push('ACCOUNT_LABEL_NOT_IN_QUOTE');
        scope = { ...scope, account: label };
      }
      break;
    }
    case 'entity': {
      currency = null;
      unit = null;
      const name = cleanLabel(value);
      if (!name || name.length > 160) problems.push('ENTITY_NAME_INVALID');
      else {
        valueText = name;
        normalizedValue = normalizeLegalName(name);
        if (!hasLegalForm(name)) problems.push('LEGAL_FORM_MISSING');
        if (!normalizeForLiteral(quote).includes(normalizeForLiteral(name)))
          problems.push('ENTITY_NOT_IN_QUOTE');
        if (field === 'operating_entity') {
          const hit = OPERATOR_PATTERNS.find(([re]) => re.test(quote));
          if (!hit) problems.push('OPERATOR_WORDING_MISSING');
          else operatorWording = hit[1];
        }
        // An entity reading is scoped to itself; account/platform scope is never inferred.
        scope = { ...scope, entity: name };
      }
      break;
    }
  }
  if (r.effectiveDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(r.effectiveDate))
    problems.push('EFFECTIVE_DATE_INVALID');
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    reading: {
      field,
      valueText,
      normalizedValue,
      unit,
      currency,
      scope,
      scopeKey: scopeKey(scope),
      quote,
      locator: r.locator,
      effectiveDate: r.effectiveDate ?? null,
      ...(operatorWording ? { operatorWording } : {}),
    },
  };
}

/** Display text for a value with unit/currency, e.g. "200 USD", "0.8 pips", "1:500". */
export function displayValue(f: {
  field_key: string;
  value_text: string;
  unit: string | null;
  currency: string | null;
}): string {
  const def = FIELDS[f.field_key as FieldKey];
  if (!def) return f.value_text;
  if (def.kind === 'boolean') return f.value_text === 'true' ? 'Available' : 'Not offered (stated)';
  if (f.field_key === 'minimum_deposit' && f.value_text === '0' && !f.currency) return 'No minimum (stated)';
  const parts = [f.value_text];
  if (f.currency) parts.push(f.currency);
  if (f.unit && f.unit !== 'ratio') parts.push(f.unit);
  return parts.join(' ');
}
