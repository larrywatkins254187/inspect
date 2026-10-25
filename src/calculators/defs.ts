import { CURRENCIES, INSTRUMENTS } from '@/markets/instruments';
import {
  D,
  Parser,
  fixed,
  floorTo,
  money,
  signed,
  stepDp,
  type CalcContext,
  type CalcOutput,
  type Dec,
  type FieldSpec,
  type Values,
} from './core';

export type CalculatorCategory =
  'Trade sizing' | 'Trade planning' | 'Chart levels' | 'Account and conversion';
export const CATEGORIES: CalculatorCategory[] = [
  'Trade sizing',
  'Trade planning',
  'Chart levels',
  'Account and conversion',
];

export interface CalculatorDef {
  slug: string;
  title: string;
  name: string;
  category: CalculatorCategory;
  summary: string;
  fields: FieldSpec[];
  compute: (v: Values, ctx: CalcContext) => CalcOutput;
}

// ── Shared field builders ─────────────────────────────────────────────
const instrumentField: FieldSpec = {
  name: 'instrument',
  label: 'Instrument',
  kind: 'select',
  role: 'instrument',
  defaultValue: 'EUR/USD',
  options: INSTRUMENTS.map((i) => ({ value: i.symbol, label: i.label })),
  help: 'Selecting an instrument fills typical contract and pip/point sizes. Edit them to match your broker.',
};
const accountCurrency: FieldSpec = {
  name: 'accountCurrency',
  label: 'Account currency',
  kind: 'select',
  role: 'accountCurrency',
  defaultValue: 'USD',
  options: CURRENCIES.map((c) => ({ value: c, label: c })),
};
const lots = (dflt = '1'): FieldSpec => ({
  name: 'lots',
  label: 'Position size',
  kind: 'decimal',
  unit: 'lots',
  defaultValue: dflt,
});
const contract: FieldSpec = {
  name: 'contractSize',
  label: 'Contract size per lot',
  kind: 'decimal',
  role: 'contract',
  unit: 'units',
  defaultValue: '100000',
};
const pip: FieldSpec = {
  name: 'pipSize',
  label: 'Pip / point size',
  kind: 'decimal',
  role: 'pip',
  defaultValue: '0.0001',
  help: 'Price change counted as one pip or point.',
};
const rate: FieldSpec = {
  name: 'rate',
  label: 'Quote-to-account conversion rate',
  kind: 'decimal',
  role: 'rate',
  defaultValue: '1',
  help: 'Account-currency value of one unit of the quote currency. Use 1 when they are the same; otherwise enter a rate or apply a dated ECB reference rate.',
};
const direction: FieldSpec = {
  name: 'direction',
  label: 'Direction',
  kind: 'select',
  defaultValue: 'buy',
  options: [
    { value: 'buy', label: 'Buy (long)' },
    { value: 'sell', label: 'Sell (short)' },
  ],
};
const precision: FieldSpec = {
  name: 'precision',
  label: 'Output decimals',
  kind: 'integer',
  defaultValue: '5',
  help: 'Explicit rounding for displayed levels (0–8).',
};

const dirSign = (d: string) => (d === 'sell' ? new D(-1) : new D(1));
const ccyOf = (p: Parser) => p.choice('accountCurrency', CURRENCIES);
const lotParams = (p: Parser) => ({
  L: p.num('lots', { gt: '0', max: '100000' }),
  C: p.num('contractSize', { gt: '0', max: '100000000' }),
  pip: p.num('pipSize', { gt: '0', max: '100000' }),
  R: p.num('rate', { gt: '0', max: '1000000' }),
});

// ── Calculators ───────────────────────────────────────────────────────
const pipCalc: CalculatorDef = {
  slug: 'pip-calculator',
  title: 'Pip Value Calculator',
  name: 'Pip value',
  category: 'Trade sizing',
  summary: 'Value of one pip or point for a position size, in the quote and account currencies.',
  fields: [instrumentField, accountCurrency, lots(), contract, pip, rate],
  compute(v) {
    const p = new Parser(v);
    const ccy = ccyOf(p);
    const { L, C, pip: ps, R } = lotParams(p);
    if (!p.ok) return p.fail();
    const quoteVal = ps.mul(C).mul(L);
    const acct = quoteVal.mul(R);
    const perLot = ps.mul(C).mul(R);
    return {
      ok: true,
      results: [
        { label: 'Pip value (account currency)', value: money(acct, ccy), unit: ccy, primary: true },
        { label: 'Pip value (quote currency)', value: fixed(quoteVal, 4), unit: 'quote currency' },
        { label: 'Pip value per 1 lot (account currency)', value: money(perLot, ccy), unit: ccy },
      ],
      notes: ['Formula: pip size × contract size × lots × conversion rate.'],
    };
  },
};

const positionSize: CalculatorDef = {
  slug: 'position-size-calculator',
  title: 'Position Size Calculator',
  name: 'Position size',
  category: 'Trade sizing',
  summary: 'Lots for a chosen account risk and stop distance, rounded down to your lot step.',
  fields: [
    instrumentField,
    accountCurrency,
    { name: 'balance', label: 'Account balance', kind: 'decimal', defaultValue: '10000' },
    { name: 'riskPercent', label: 'Risk per trade', kind: 'decimal', unit: '%', defaultValue: '1' },
    {
      name: 'stopPips',
      label: 'Stop-loss distance',
      kind: 'decimal',
      unit: 'pips/points',
      defaultValue: '20',
    },
    contract,
    pip,
    rate,
    { name: 'lotStep', label: 'Lot step', kind: 'decimal', unit: 'lots', defaultValue: '0.01' },
    { name: 'minLot', label: 'Minimum lot', kind: 'decimal', unit: 'lots', defaultValue: '0.01' },
  ],
  compute(v) {
    const p = new Parser(v);
    const ccy = ccyOf(p);
    const bal = p.num('balance', { gt: '0', max: '1000000000000' });
    const risk = p.num('riskPercent', { gt: '0', max: '100' });
    const stop = p.num('stopPips', { gt: '0', max: '1000000' });
    const C = p.num('contractSize', { gt: '0' });
    const ps = p.num('pipSize', { gt: '0' });
    const R = p.num('rate', { gt: '0' });
    const step = p.num('lotStep', { gt: '0', max: '100' });
    const minLot = p.num('minLot', { gt: '0', max: '100' });
    if (!p.ok) return p.fail();
    const riskAmt = bal.mul(risk).div(100);
    const raw = riskAmt.div(stop.mul(ps).mul(C).mul(R));
    const rounded = floorTo(raw, step);
    const below = rounded.lt(minLot);
    const usedLots = below ? new D(0) : rounded;
    const actualRisk = usedLots.mul(stop).mul(ps).mul(C).mul(R);
    const dp = stepDp(step);
    return {
      ok: true,
      results: [
        { label: 'Position size (rounded down)', value: fixed(usedLots, dp), unit: 'lots', primary: true },
        { label: 'Amount at risk (target)', value: money(riskAmt, ccy), unit: ccy },
        { label: 'Unrounded size', value: fixed(raw, Math.max(dp + 3, 4)), unit: 'lots' },
        { label: 'Units', value: fixed(usedLots.mul(C), 2), unit: 'units' },
        { label: 'Risk at rounded size', value: money(actualRisk, ccy), unit: ccy },
      ],
      notes: below
        ? [
            `The calculated size is below the minimum lot of ${minLot.toFixed()}; no position fits this risk and stop. Widen risk or reduce the stop distance.`,
          ]
        : ['Sizes are rounded down to the lot step so the risk does not exceed your target.'],
    };
  },
};

const margin: CalculatorDef = {
  slug: 'margin-calculator',
  title: 'Margin Calculator',
  name: 'Margin',
  category: 'Trade sizing',
  summary: 'Required margin from position notional and leverage.',
  fields: [
    instrumentField,
    accountCurrency,
    lots(),
    contract,
    { name: 'price', label: 'Price', kind: 'decimal', defaultValue: '1.10000' },
    {
      name: 'leverage',
      label: 'Leverage',
      kind: 'decimal',
      unit: ': 1',
      defaultValue: '30',
      help: 'Enter 30 for 1:30.',
    },
    rate,
  ],
  compute(v) {
    const p = new Parser(v);
    const ccy = ccyOf(p);
    const L = p.num('lots', { gt: '0' });
    const C = p.num('contractSize', { gt: '0' });
    const price = p.num('price', { gt: '0' });
    const lev = p.num('leverage', { min: '1', max: '10000' });
    const R = p.num('rate', { gt: '0' });
    if (!p.ok) return p.fail();
    const notional = L.mul(C).mul(price).mul(R);
    return {
      ok: true,
      results: [
        { label: 'Required margin', value: money(notional.div(lev), ccy), unit: ccy, primary: true },
        { label: 'Position notional', value: money(notional, ccy), unit: ccy },
        { label: 'Margin rate', value: fixed(new D(100).div(lev), 2), unit: '%' },
      ],
      notes: [
        'Formula: lots × contract size × price × conversion rate ÷ leverage. Brokers may apply tiered or instrument-specific margin.',
      ],
    };
  },
};

const profit: CalculatorDef = {
  slug: 'profit-calculator',
  title: 'Profit and Loss Calculator',
  name: 'Profit / loss',
  category: 'Trade planning',
  summary: 'Profit or loss between an open and close price, before costs.',
  fields: [
    instrumentField,
    accountCurrency,
    direction,
    { name: 'open', label: 'Open price', kind: 'decimal', defaultValue: '1.10000' },
    { name: 'close', label: 'Close price', kind: 'decimal', defaultValue: '1.10500' },
    lots(),
    contract,
    pip,
    rate,
  ],
  compute(v) {
    const p = new Parser(v);
    const ccy = ccyOf(p);
    const dir = dirSign(p.choice('direction', ['buy', 'sell'] as const));
    const open = p.num('open', { gt: '0' });
    const close = p.num('close', { gt: '0' });
    const { L, C, pip: ps, R } = lotParams(p);
    if (!p.ok) return p.fail();
    const pl = close.minus(open).mul(dir).mul(C).mul(L).mul(R);
    const pips = close.minus(open).mul(dir).div(ps);
    return {
      ok: true,
      results: [
        { label: pl.isNeg() ? 'Loss' : 'Profit', value: signed(money(pl, ccy)), unit: ccy, primary: true },
        { label: 'Movement in your favour', value: signed(fixed(pips, 1)), unit: 'pips/points' },
      ],
      notes: ['Excludes spread, commission, swap and slippage.'],
    };
  },
};

const riskReward: CalculatorDef = {
  slug: 'risk-reward-calculator',
  title: 'Risk/Reward Ratio Calculator',
  name: 'Risk / reward',
  category: 'Trade planning',
  summary: 'Distances to stop and target and the reward-to-risk ratio.',
  fields: [
    direction,
    { name: 'entry', label: 'Entry price', kind: 'decimal', defaultValue: '1.10000' },
    { name: 'stop', label: 'Stop-loss price', kind: 'decimal', defaultValue: '1.09800' },
    { name: 'target', label: 'Take-profit price', kind: 'decimal', defaultValue: '1.10400' },
  ],
  compute(v) {
    const p = new Parser(v);
    const d = p.choice('direction', ['buy', 'sell'] as const);
    const entry = p.num('entry', { gt: '0' });
    const stop = p.num('stop', { gt: '0' });
    const target = p.num('target', { gt: '0' });
    if (!p.ok) return p.fail();
    if (d === 'buy' && !stop.lt(entry)) p.error('stop', 'For a buy, the stop must be below the entry.');
    if (d === 'buy' && !target.gt(entry)) p.error('target', 'For a buy, the target must be above the entry.');
    if (d === 'sell' && !stop.gt(entry)) p.error('stop', 'For a sell, the stop must be above the entry.');
    if (d === 'sell' && !target.lt(entry))
      p.error('target', 'For a sell, the target must be below the entry.');
    if (!p.ok) return p.fail();
    const risk = entry.minus(stop).abs();
    const reward = target.minus(entry).abs();
    const ratio = reward.div(risk);
    const dp = Math.max(entry.decimalPlaces(), stop.decimalPlaces(), target.decimalPlaces());
    return {
      ok: true,
      results: [
        { label: 'Reward : risk', value: `${fixed(ratio, 2)} : 1`, primary: true },
        { label: 'Risk distance', value: fixed(risk, dp), unit: 'price' },
        { label: 'Reward distance', value: fixed(reward, dp), unit: 'price' },
      ],
      notes: ['A ratio alone says nothing about probability of reaching either level.'],
    };
  },
};

const sltp: CalculatorDef = {
  slug: 'stop-loss-take-profit-calculator',
  title: 'Stop-Loss and Take-Profit Calculator',
  name: 'Stop-loss / take-profit',
  category: 'Trade planning',
  summary: 'Stop and target prices from pip or money distances.',
  fields: [
    instrumentField,
    accountCurrency,
    direction,
    { name: 'entry', label: 'Entry price', kind: 'decimal', defaultValue: '1.10000' },
    {
      name: 'mode',
      label: 'Distances in',
      kind: 'select',
      defaultValue: 'pips',
      options: [
        { value: 'pips', label: 'Pips / points' },
        { value: 'money', label: 'Account currency' },
      ],
    },
    { name: 'stopDistance', label: 'Stop distance', kind: 'decimal', defaultValue: '20' },
    { name: 'targetDistance', label: 'Target distance', kind: 'decimal', defaultValue: '40' },
    { ...lots(), showWhen: { field: 'mode', equals: ['money'] } },
    { ...contract, showWhen: { field: 'mode', equals: ['money'] } },
    pip,
    { ...rate, showWhen: { field: 'mode', equals: ['money'] } },
  ],
  compute(v) {
    const p = new Parser(v);
    const dir = dirSign(p.choice('direction', ['buy', 'sell'] as const));
    const mode = p.choice('mode', ['pips', 'money'] as const);
    const ccy = ccyOf(p);
    const entry = p.num('entry', { gt: '0' });
    const sd = p.num('stopDistance', { gt: '0' });
    const td = p.num('targetDistance', { gt: '0' });
    const ps = p.num('pipSize', { gt: '0' });
    let stopPips = sd;
    let targetPips = td;
    if (mode === 'money') {
      const L = p.num('lots', { gt: '0' });
      const C = p.num('contractSize', { gt: '0' });
      const R = p.num('rate', { gt: '0' });
      if (!p.ok) return p.fail();
      const perPip = ps.mul(C).mul(L).mul(R);
      stopPips = sd.div(perPip);
      targetPips = td.div(perPip);
    }
    if (!p.ok) return p.fail();
    const stop = entry.minus(dir.mul(stopPips).mul(ps));
    const target = entry.plus(dir.mul(targetPips).mul(ps));
    if (!stop.gt(0)) p.error('stopDistance', 'This distance puts the stop at or below zero.');
    if (!target.gt(0)) p.error('targetDistance', 'This distance puts the target at or below zero.');
    if (!p.ok) return p.fail();
    const dp = Math.max(stepDp(ps) + 1, entry.decimalPlaces());
    return {
      ok: true,
      results: [
        { label: 'Stop-loss price', value: fixed(stop, dp), primary: true },
        { label: 'Take-profit price', value: fixed(target, dp), primary: true },
        { label: 'Stop distance', value: fixed(stopPips, 1), unit: 'pips/points' },
        { label: 'Target distance', value: fixed(targetPips, 1), unit: 'pips/points' },
        ...(mode === 'money'
          ? [{ label: 'Money distances', value: `${money(sd, ccy)} / ${money(td, ccy)}`, unit: ccy }]
          : []),
      ],
      notes: ['Stops can fill at a worse price during gaps or fast markets.'],
    };
  },
};

const swap: CalculatorDef = {
  slug: 'swap-calculator',
  title: 'Swap (Overnight Financing) Calculator',
  name: 'Swap',
  category: 'Account and conversion',
  summary: 'Overnight financing from a signed swap rate quoted in pips per lot.',
  fields: [
    instrumentField,
    accountCurrency,
    {
      name: 'swapRate',
      label: 'Swap rate (signed)',
      kind: 'decimal',
      unit: 'pips per lot per night',
      defaultValue: '-0.5',
      help: 'Negative = charge, positive = credit, in your broker’s pip convention.',
    },
    lots(),
    { name: 'nights', label: 'Nights held', kind: 'integer', defaultValue: '3' },
    {
      name: 'tripleSwap',
      label: 'Holding period includes the triple-swap night',
      kind: 'checkbox',
      defaultValue: 'false',
    },
    contract,
    pip,
    rate,
  ],
  compute(v) {
    const p = new Parser(v);
    const ccy = ccyOf(p);
    const sr = p.num('swapRate', { min: '-100000', max: '100000' });
    const { L, C, pip: ps, R } = lotParams(p);
    const nights = p.num('nights', { min: '0', max: '3650', integer: true });
    const triple = p.flag('tripleSwap');
    if (triple && nights.lt(1)) p.error('nights', 'A triple-swap night needs at least one night held.');
    if (!p.ok) return p.fail();
    const chargeable = nights.plus(triple ? 2 : 0);
    const perLotNight = sr.mul(ps).mul(C).mul(R);
    const total = perLotNight.mul(L).mul(chargeable);
    return {
      ok: true,
      results: [
        {
          label: total.isNeg() ? 'Total swap charged' : 'Total swap credited',
          value: signed(money(total, ccy)),
          unit: ccy,
          primary: true,
        },
        { label: 'Per lot per night', value: signed(money(perLotNight, ccy)), unit: ccy },
        { label: 'Chargeable nights', value: chargeable.toFixed(0) },
      ],
      notes: [
        'Swap rates are set by the broker and change. A rate quoted as money or as an annual percentage needs a different conversion.',
      ],
    };
  },
};

const spreadCost: CalculatorDef = {
  slug: 'spread-cost-calculator',
  title: 'Spread Cost Calculator',
  name: 'Spread cost',
  category: 'Account and conversion',
  summary: 'Estimated cost of a spread you enter — no live spread feed.',
  fields: [
    instrumentField,
    accountCurrency,
    { name: 'spread', label: 'Spread', kind: 'decimal', unit: 'pips/points', defaultValue: '1.0' },
    lots(),
    contract,
    pip,
    rate,
  ],
  compute(v) {
    const p = new Parser(v);
    const ccy = ccyOf(p);
    const s = p.num('spread', { min: '0', max: '100000' });
    const { L, C, pip: ps, R } = lotParams(p);
    if (!p.ok) return p.fail();
    const cost = s.mul(ps).mul(C).mul(L).mul(R);
    return {
      ok: true,
      results: [
        { label: 'Estimated spread cost', value: money(cost, ccy), unit: ccy, primary: true },
        { label: 'Per lot', value: money(s.mul(ps).mul(C).mul(R), ccy), unit: ccy },
      ],
      notes: [
        'Uses the spread you enter. Actual spreads vary with time, liquidity and account type; commission is separate.',
      ],
    };
  },
};

const leverage: CalculatorDef = {
  slug: 'leverage-calculator',
  title: 'Leverage Calculator',
  name: 'Leverage',
  category: 'Trade sizing',
  summary: 'Effective leverage of a position, or the maximum size under a leverage limit.',
  fields: [
    {
      name: 'mode',
      label: 'Calculate',
      kind: 'select',
      defaultValue: 'effective',
      options: [
        { value: 'effective', label: 'Effective leverage of a position' },
        { value: 'max', label: 'Maximum position for a leverage limit' },
      ],
    },
    instrumentField,
    accountCurrency,
    { name: 'equity', label: 'Account equity', kind: 'decimal', defaultValue: '10000' },
    { ...lots(), showWhen: { field: 'mode', equals: ['effective'] } },
    {
      name: 'limit',
      label: 'Leverage limit',
      kind: 'decimal',
      unit: ': 1',
      defaultValue: '30',
      showWhen: { field: 'mode', equals: ['max'] },
    },
    contract,
    { name: 'price', label: 'Price', kind: 'decimal', defaultValue: '1.10000' },
    rate,
    {
      name: 'lotStep',
      label: 'Lot step',
      kind: 'decimal',
      unit: 'lots',
      defaultValue: '0.01',
      showWhen: { field: 'mode', equals: ['max'] },
    },
  ],
  compute(v) {
    const p = new Parser(v);
    const ccy = ccyOf(p);
    const mode = p.choice('mode', ['effective', 'max'] as const);
    const eq = p.num('equity', { gt: '0' });
    const C = p.num('contractSize', { gt: '0' });
    const price = p.num('price', { gt: '0' });
    const R = p.num('rate', { gt: '0' });
    if (mode === 'effective') {
      const L = p.num('lots', { gt: '0' });
      if (!p.ok) return p.fail();
      const notional = L.mul(C).mul(price).mul(R);
      return {
        ok: true,
        results: [
          { label: 'Effective leverage', value: `${fixed(notional.div(eq), 2)} : 1`, primary: true },
          { label: 'Position notional', value: money(notional, ccy), unit: ccy },
        ],
        notes: ['Effective leverage = account notional ÷ equity.'],
      };
    }
    const lim = p.num('limit', { min: '1', max: '10000' });
    const step = p.num('lotStep', { gt: '0' });
    if (!p.ok) return p.fail();
    const maxLots = floorTo(eq.mul(lim).div(C.mul(price).mul(R)), step);
    return {
      ok: true,
      results: [
        {
          label: 'Maximum position (rounded down)',
          value: fixed(maxLots, stepDp(step)),
          unit: 'lots',
          primary: true,
        },
        { label: 'Maximum notional', value: money(eq.mul(lim), ccy), unit: ccy },
      ],
      notes: ['Using the maximum leaves no free margin for adverse moves.'],
    };
  },
};

const pivots: CalculatorDef = {
  slug: 'pivot-point-calculator',
  title: 'Pivot Point Calculator',
  name: 'Pivot points',
  category: 'Chart levels',
  summary: 'Classic, Woodie, Camarilla, Fibonacci and DeMark pivots from the previous session.',
  fields: [
    {
      name: 'method',
      label: 'Method',
      kind: 'select',
      defaultValue: 'classic',
      options: [
        { value: 'classic', label: 'Classic' },
        { value: 'woodie', label: 'Woodie' },
        { value: 'camarilla', label: 'Camarilla' },
        { value: 'fibonacci', label: 'Fibonacci' },
        { value: 'demark', label: 'DeMark' },
      ],
    },
    { name: 'high', label: 'Previous high', kind: 'decimal', defaultValue: '1.10500' },
    { name: 'low', label: 'Previous low', kind: 'decimal', defaultValue: '1.09500' },
    { name: 'close', label: 'Previous close', kind: 'decimal', defaultValue: '1.10200' },
    {
      name: 'open',
      label: 'Previous open (DeMark)',
      kind: 'decimal',
      defaultValue: '1.10000',
      showWhen: { field: 'method', equals: ['demark'] },
    },
    precision,
  ],
  compute(v) {
    const p = new Parser(v);
    const method = p.choice('method', ['classic', 'woodie', 'camarilla', 'fibonacci', 'demark'] as const);
    const H = p.num('high', { gt: '0' });
    const L = p.num('low', { gt: '0' });
    const C = p.num('close', { gt: '0' });
    const dp = p.num('precision', { min: '0', max: '8', integer: true }).toNumber();
    let O: Dec | null = null;
    if (method === 'demark') O = p.num('open', { gt: '0' });
    if (!p.ok) return p.fail();
    if (H.lt(L)) p.error('high', 'High must be at least the low.');
    if (C.lt(L) || C.gt(H)) p.error('close', 'Close must lie between the low and the high.');
    if (O && (O.lt(L) || O.gt(H))) p.error('open', 'Open must lie between the low and the high.');
    if (!p.ok) return p.fail();
    const range = H.minus(L);
    const f = (d: Dec) => fixed(d, dp);
    let rows: [string, Dec][];
    const classicSet = (P: Dec): [string, Dec][] => [
      ['R3', H.plus(P.minus(L).mul(2))],
      ['R2', P.plus(range)],
      ['R1', P.mul(2).minus(L)],
      ['Pivot (P)', P],
      ['S1', P.mul(2).minus(H)],
      ['S2', P.minus(range)],
      ['S3', L.minus(H.minus(P).mul(2))],
    ];
    if (method === 'classic') rows = classicSet(H.plus(L).plus(C).div(3));
    else if (method === 'woodie') rows = classicSet(H.plus(L).plus(C.mul(2)).div(4));
    else if (method === 'camarilla') {
      const k = range.mul('1.1');
      const P = H.plus(L).plus(C).div(3);
      rows = [
        ['R4', C.plus(k.div(2))],
        ['R3', C.plus(k.div(4))],
        ['R2', C.plus(k.div(6))],
        ['R1', C.plus(k.div(12))],
        ['Pivot (P)', P],
        ['S1', C.minus(k.div(12))],
        ['S2', C.minus(k.div(6))],
        ['S3', C.minus(k.div(4))],
        ['S4', C.minus(k.div(2))],
      ];
    } else if (method === 'fibonacci') {
      const P = H.plus(L).plus(C).div(3);
      rows = [
        ['R3', P.plus(range.mul('1.000'))],
        ['R2', P.plus(range.mul('0.618'))],
        ['R1', P.plus(range.mul('0.382'))],
        ['Pivot (P)', P],
        ['S1', P.minus(range.mul('0.382'))],
        ['S2', P.minus(range.mul('0.618'))],
        ['S3', P.minus(range.mul('1.000'))],
      ];
    } else {
      const X = C.lt(O!)
        ? H.plus(L.mul(2)).plus(C)
        : C.gt(O!)
          ? H.mul(2).plus(L).plus(C)
          : H.plus(L).plus(C.mul(2));
      rows = [
        ['R1', X.div(2).minus(L)],
        ['Pivot (P)', X.div(4)],
        ['S1', X.div(2).minus(H)],
      ];
    }
    return {
      ok: true,
      results: rows.map(([label, d]) => ({ label, value: f(d), primary: label === 'Pivot (P)' })),
      notes: [
        'Levels depend on which session high, low and close you use (time zone and session cut-off). They are reference levels, not predictions.',
      ],
    };
  },
};

const LEVELS = ['0.236', '0.382', '0.5', '0.618', '0.786'];
const EXTENSIONS = ['1.272', '1.618', '2.618'];
const fibonacci: CalculatorDef = {
  slug: 'fibonacci-calculator',
  title: 'Fibonacci Retracement and Extension Calculator',
  name: 'Fibonacci',
  category: 'Chart levels',
  summary: 'Retracement and extension levels between a swing high and low.',
  fields: [
    {
      name: 'direction',
      label: 'Swing direction',
      kind: 'select',
      defaultValue: 'up',
      options: [
        { value: 'up', label: 'Upward swing (low → high)' },
        { value: 'down', label: 'Downward swing (high → low)' },
      ],
    },
    { name: 'high', label: 'Swing high', kind: 'decimal', defaultValue: '1.12000' },
    { name: 'low', label: 'Swing low', kind: 'decimal', defaultValue: '1.10000' },
    precision,
  ],
  compute(v) {
    const p = new Parser(v);
    const dir = p.choice('direction', ['up', 'down'] as const);
    const H = p.num('high', { gt: '0' });
    const L = p.num('low', { gt: '0' });
    const dp = p.num('precision', { min: '0', max: '8', integer: true }).toNumber();
    if (!p.ok) return p.fail();
    if (!H.gt(L)) p.error('high', 'Swing high must be above the swing low.');
    if (!p.ok) return p.fail();
    const range = H.minus(L);
    const pct = (l: string) => `${new D(l).mul(100).toFixed(1).replace(/\.0$/, '')}%`;
    const ret = LEVELS.map(
      (l) => [pct(l), dir === 'up' ? H.minus(range.mul(l)) : L.plus(range.mul(l))] as const,
    );
    const ext = EXTENSIONS.map(
      (l) => [pct(l), dir === 'up' ? L.plus(range.mul(l)) : H.minus(range.mul(l))] as const,
    );
    return {
      ok: true,
      results: [{ label: 'Range', value: fixed(range, dp), primary: true }],
      notes: ['Fibonacci levels are a drawing convention, not price predictions.'],
      table: {
        caption: 'Fibonacci levels',
        headers: ['Type', 'Level', 'Price'],
        rows: [
          ...ret.map(([l, d]) => ['Retracement', l, fixed(d, dp)]),
          ...ext.map(([l, d]) => ['Extension', l, fixed(d, dp)]),
        ],
      },
    };
  },
};

const converter: CalculatorDef = {
  slug: 'currency-converter',
  title: 'Currency Converter (ECB Reference Rates)',
  name: 'Currency converter',
  category: 'Account and conversion',
  summary: 'Convert between eight currencies with dated ECB reference rates or your own rate.',
  fields: [
    { name: 'amount', label: 'Amount', kind: 'decimal', defaultValue: '1000' },
    {
      name: 'from',
      label: 'From',
      kind: 'select',
      defaultValue: 'USD',
      options: CURRENCIES.map((c) => ({ value: c, label: c })),
    },
    {
      name: 'to',
      label: 'To',
      kind: 'select',
      defaultValue: 'EUR',
      options: CURRENCIES.map((c) => ({ value: c, label: c })),
    },
    {
      name: 'rateMode',
      label: 'Rate',
      kind: 'select',
      defaultValue: 'reference',
      options: [
        { value: 'reference', label: 'ECB reference rate (daily)' },
        { value: 'manual', label: 'Enter my own rate' },
      ],
    },
    {
      name: 'manualRate',
      label: 'Your rate (1 From = ? To)',
      kind: 'decimal',
      defaultValue: '',
      showWhen: { field: 'rateMode', equals: ['manual'] },
    },
  ],
  compute(v, ctx) {
    const p = new Parser(v);
    const amount = p.num('amount', { min: '0', max: '1000000000000' });
    const from = p.choice('from', CURRENCIES);
    const to = p.choice('to', CURRENCIES);
    const mode = p.choice('rateMode', ['reference', 'manual'] as const);
    if (!p.ok) return p.fail();
    let r: Dec;
    const notes: string[] = [];
    if (mode === 'manual') {
      r = p.num('manualRate', { gt: '0', max: '1000000' });
      if (!p.ok) return p.fail();
      notes.push('Converted with the rate you entered.');
    } else {
      const eur = (c: string) => (c === 'EUR' ? '1' : ctx.eurRates?.[c]);
      const a = eur(from);
      const b = eur(to);
      if (!a || !b)
        return {
          ok: false,
          errors: { rateMode: 'No stored ECB reference rate is available. Enter your own rate.' },
        };
      r = new D(b).div(a);
      notes.push(
        `ECB euro foreign exchange reference rate${ctx.rateDate ? ` for ${ctx.rateDate}` : ''}, via Frankfurter. Reference rates are for information only and are not tradable quotes.`,
      );
      if (from !== 'EUR' && to !== 'EUR')
        notes.push(
          'Cross rate derived through EUR (EUR/target ÷ EUR/source); this is a modification of the published rates.',
        );
    }
    return {
      ok: true,
      results: [
        { label: `${from} → ${to}`, value: money(amount.mul(r), to), unit: to, primary: true },
        { label: 'Rate used', value: `1 ${from} = ${fixed(r, 6)} ${to}` },
        { label: 'Inverse', value: `1 ${to} = ${fixed(new D(1).div(r), 6)} ${from}` },
      ],
      notes,
    };
  },
};

const compounding: CalculatorDef = {
  slug: 'compounding-calculator',
  title: 'Compounding Calculator',
  name: 'Compounding',
  category: 'Account and conversion',
  summary: 'Arithmetic growth scenario with a fixed rate per period and optional deposits — not a forecast.',
  fields: [
    { name: 'start', label: 'Starting balance', kind: 'decimal', defaultValue: '10000' },
    { name: 'ratePct', label: 'Rate per period', kind: 'decimal', unit: '%', defaultValue: '1' },
    {
      name: 'periods',
      label: 'Number of periods',
      kind: 'integer',
      defaultValue: '12',
      help: 'Whole periods, at most 600.',
    },
    { name: 'deposit', label: 'Deposit at the end of each period', kind: 'decimal', defaultValue: '0' },
  ],
  compute(v) {
    const p = new Parser(v);
    const start = p.num('start', { min: '0', max: '1000000000000' });
    const rp = p.num('ratePct', { gt: '-100', max: '1000' });
    const n = p.num('periods', { min: '1', max: '600', integer: true });
    const dep = p.num('deposit', { min: '0', max: '1000000000000' });
    if (!p.ok) return p.fail();
    let bal = start;
    const g = rp.div(100);
    const rows: string[][] = [];
    for (let i = 1; i <= n.toNumber(); i++) {
      const growth = bal.mul(g);
      const end = bal.plus(growth).plus(dep);
      rows.push([String(i), fixed(bal, 2), fixed(growth, 2), fixed(dep, 2), fixed(end, 2)]);
      bal = end;
    }
    const deposits = dep.mul(n);
    return {
      ok: true,
      results: [
        { label: 'Final balance', value: fixed(bal, 2), primary: true },
        { label: 'Total deposits', value: fixed(deposits, 2) },
        { label: 'Total growth', value: signed(fixed(bal.minus(start).minus(deposits), 2)) },
      ],
      notes: [
        'next = previous × (1 + rate ÷ 100) + deposit. A constant rate is an arithmetic assumption; trading returns are not constant and losses are possible.',
      ],
      table: { caption: 'Balance by period', headers: ['Period', 'Start', 'Growth', 'Deposit', 'End'], rows },
    };
  },
};

const drawdown: CalculatorDef = {
  slug: 'drawdown-calculator',
  title: 'Drawdown Recovery Calculator',
  name: 'Drawdown',
  category: 'Account and conversion',
  summary: 'Gain needed to recover from a percentage loss.',
  fields: [{ name: 'loss', label: 'Loss (drawdown)', kind: 'decimal', unit: '%', defaultValue: '20' }],
  compute(v) {
    const p = new Parser(v);
    const loss = p.num('loss', { min: '0', lt: '100' });
    if (!p.ok) return p.fail();
    const rec = (x: Dec) =>
      new D(1)
        .div(new D(1).minus(x.div(100)))
        .minus(1)
        .mul(100);
    return {
      ok: true,
      results: [{ label: 'Gain required to recover', value: fixed(rec(loss), 2), unit: '%', primary: true }],
      notes: ['Recovery = (1 ÷ (1 − loss fraction) − 1) × 100.'],
      table: {
        caption: 'Reference',
        headers: ['Loss', 'Gain to recover'],
        rows: ['10', '20', '30', '40', '50', '60', '70', '80', '90'].map((l) => [
          `${l}%`,
          `${fixed(rec(new D(l)), 2)}%`,
        ]),
      },
    };
  },
};

const breakEven: CalculatorDef = {
  slug: 'break-even-calculator',
  title: 'Break-Even Win Rate Calculator',
  name: 'Break-even win rate',
  category: 'Trade planning',
  summary: 'Win rate needed to break even for a reward/risk ratio and costs.',
  fields: [
    { name: 'rr', label: 'Reward : risk', kind: 'decimal', unit: ': 1', defaultValue: '2' },
    {
      name: 'cost',
      label: 'Cost per trade in risk units (R)',
      kind: 'decimal',
      defaultValue: '0.1',
      help: 'E.g. 0.1 means costs equal 10% of the amount risked.',
    },
  ],
  compute(v) {
    const p = new Parser(v);
    const rr = p.num('rr', { gt: '0', max: '1000' });
    const c = p.num('cost', { min: '0', max: '1000' });
    if (!p.ok) return p.fail();
    const w = new D(1).plus(c).div(new D(1).plus(rr)).mul(100);
    if (w.gte(100)) {
      p.error('cost', 'With these costs no win rate breaks even (it would need 100% or more).');
      return p.fail();
    }
    return {
      ok: true,
      results: [{ label: 'Break-even win rate', value: fixed(w, 2), unit: '%', primary: true }],
      notes: [
        'Win rate = (1 + cost in R) ÷ (1 + reward/risk) × 100. Assumes every trade hits either the target or the stop.',
      ],
    };
  },
};

export const CALCULATORS: readonly CalculatorDef[] = [
  pipCalc,
  positionSize,
  margin,
  profit,
  riskReward,
  sltp,
  swap,
  spreadCost,
  leverage,
  pivots,
  fibonacci,
  converter,
  compounding,
  drawdown,
  breakEven,
];

export const calculatorBySlug = (slug: string) => CALCULATORS.find((c) => c.slug === slug);
export const defaultValues = (c: CalculatorDef): Values =>
  Object.fromEntries(c.fields.map((f) => [f.name, f.defaultValue]));
