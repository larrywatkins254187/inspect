import { describe, expect, it } from 'vitest';
import { CALCULATORS, calculatorBySlug, defaultValues } from '@/calculators/defs';
import { CURRENCIES, INSTRUMENTS } from '@/markets/instruments';
import type { CalcOutput } from '@/calculators/core';

const run = (slug: string, over: Record<string, string>, ctx = {}) => {
  const c = calculatorBySlug(slug)!;
  return c.compute({ ...defaultValues(c), ...over }, ctx);
};
const val = (o: CalcOutput, label: string) => {
  if (!o.ok) throw new Error(`errors: ${JSON.stringify(o.errors)}`);
  const r = o.results.find((x) => x.label === label);
  if (!r) throw new Error(`no result ${label}: ${o.results.map((x) => x.label).join(', ')}`);
  return r.value;
};
const errs = (o: CalcOutput) => (o.ok ? {} : o.errors);

describe('registry', () => {
  it('has exactly 15 calculators, 20 instruments and 8 currencies', () => {
    expect(CALCULATORS).toHaveLength(15);
    expect(new Set(CALCULATORS.map((c) => c.slug)).size).toBe(15);
    expect(INSTRUMENTS).toHaveLength(20);
    expect(INSTRUMENTS.filter((i) => i.cls === 'FX')).toHaveLength(10);
    expect(CURRENCIES).toEqual(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD']);
    expect(INSTRUMENTS.find((i) => i.symbol === 'USD/JPY')!.pipSize).toBe('0.01');
    expect(INSTRUMENTS.find((i) => i.symbol === 'GER40')!.quote).toBe('EUR');
    expect(INSTRUMENTS.find((i) => i.symbol === 'XRP/USD')!.pipSize).toBe('0.0001');
  });

  it('every calculator produces a result with its defaults (except manual converter)', () => {
    for (const c of CALCULATORS) {
      const o = c.compute(defaultValues(c), { eurRates: { USD: '1.1193' } });
      expect(o.ok, c.slug).toBe(true);
    }
  });

  it('rejects malformed and non-finite inputs everywhere, never NaN/Infinity', () => {
    for (const c of CALCULATORS) {
      for (const f of c.fields.filter((x) => x.kind === 'decimal' || x.kind === 'integer')) {
        for (const bad of ['', 'abc', '1e5', 'NaN', 'Infinity', '1,000', '--1']) {
          const o = c.compute({ ...defaultValues(c), [f.name]: bad }, { eurRates: { USD: '1.1193' } });
          if (o.ok) {
            // Only acceptable when the field is hidden for the current mode.
            expect(f.showWhen, `${c.slug}.${f.name}=${bad}`).toBeDefined();
          } else expect(JSON.stringify(o)).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });
});

describe('independent worked examples', () => {
  it('pip value', () => {
    expect(val(run('pip-calculator', {}), 'Pip value (account currency)')).toBe('10.00');
    const jpy = run('pip-calculator', { instrument: 'USD/JPY', pipSize: '0.01', rate: '0.0066' });
    expect(val(jpy, 'Pip value (quote currency)')).toBe('1000.0000');
    expect(val(jpy, 'Pip value (account currency)')).toBe('6.60');
    expect(
      val(run('pip-calculator', { accountCurrency: 'JPY', rate: '150.25' }), 'Pip value (account currency)'),
    ).toBe('1503');
  });

  it('position size rounds down and explains below-minimum', () => {
    expect(val(run('position-size-calculator', {}), 'Position size (rounded down)')).toBe('0.50');
    expect(val(run('position-size-calculator', { stopPips: '30' }), 'Position size (rounded down)')).toBe(
      '0.33',
    );
    const tiny = run('position-size-calculator', { balance: '100', stopPips: '50' });
    expect(val(tiny, 'Position size (rounded down)')).toBe('0.00');
    expect(tiny.ok && tiny.notes[0]).toMatch(/below the minimum lot/);
    expect(errs(run('position-size-calculator', { riskPercent: '0' })).riskPercent).toBeDefined();
  });

  it('margin and leverage', () => {
    expect(val(run('margin-calculator', { price: '1.1' }), 'Required margin')).toBe('3666.67');
    expect(val(run('leverage-calculator', { price: '1.1' }), 'Effective leverage')).toBe('11.00 : 1');
    expect(
      val(run('leverage-calculator', { mode: 'max', price: '1.1' }), 'Maximum position (rounded down)'),
    ).toBe('2.72');
  });

  it('profit/loss by direction', () => {
    expect(val(run('profit-calculator', {}), 'Profit')).toBe('500.00');
    expect(val(run('profit-calculator', { direction: 'sell' }), 'Loss')).toBe('−500.00');
    expect(val(run('profit-calculator', {}), 'Movement in your favour')).toBe('50.0');
  });

  it('risk/reward validates sides', () => {
    expect(val(run('risk-reward-calculator', {}), 'Reward : risk')).toBe('2.00 : 1');
    expect(errs(run('risk-reward-calculator', { stop: '1.101' })).stop).toMatch(/below the entry/);
    expect(errs(run('risk-reward-calculator', { direction: 'sell' })).stop).toMatch(/above the entry/);
  });

  it('stop-loss / take-profit from pips and money', () => {
    const o = run('stop-loss-take-profit-calculator', {});
    expect(val(o, 'Stop-loss price')).toBe('1.09800');
    expect(val(o, 'Take-profit price')).toBe('1.10400');
    const m = run('stop-loss-take-profit-calculator', {
      mode: 'money',
      stopDistance: '200',
      targetDistance: '400',
    });
    expect(val(m, 'Stop-loss price')).toBe('1.09800');
    expect(val(run('stop-loss-take-profit-calculator', { direction: 'sell' }), 'Stop-loss price')).toBe(
      '1.10200',
    );
  });

  it('swap with sign and triple night', () => {
    expect(val(run('swap-calculator', { tripleSwap: 'true' }), 'Total swap charged')).toBe('−25.00');
    expect(val(run('swap-calculator', { swapRate: '0.2' }), 'Total swap credited')).toBe('6.00');
  });

  it('spread cost', () => {
    expect(val(run('spread-cost-calculator', {}), 'Estimated spread cost')).toBe('10.00');
  });

  it('pivot methods against textbook values', () => {
    const base = { high: '110', low: '100', close: '105', precision: '4' };
    const classic = run('pivot-point-calculator', base);
    expect(['R3', 'R2', 'R1', 'Pivot (P)', 'S1', 'S2', 'S3'].map((l) => val(classic, l))).toEqual([
      '120.0000',
      '115.0000',
      '110.0000',
      '105.0000',
      '100.0000',
      '95.0000',
      '90.0000',
    ]);
    const woodie = run('pivot-point-calculator', { ...base, method: 'woodie', close: '108' });
    expect([val(woodie, 'Pivot (P)'), val(woodie, 'R1'), val(woodie, 'S1')]).toEqual([
      '106.5000',
      '113.0000',
      '103.0000',
    ]);
    const cam = run('pivot-point-calculator', { ...base, method: 'camarilla' });
    expect([val(cam, 'R4'), val(cam, 'R3'), val(cam, 'R2'), val(cam, 'R1'), val(cam, 'S4')]).toEqual([
      '110.5000',
      '107.7500',
      '106.8333',
      '105.9167',
      '99.5000',
    ]);
    const fib = run('pivot-point-calculator', { ...base, method: 'fibonacci' });
    expect([val(fib, 'R1'), val(fib, 'R2'), val(fib, 'R3'), val(fib, 'S1')]).toEqual([
      '108.8200',
      '111.1800',
      '115.0000',
      '101.1800',
    ]);
    const dm = run('pivot-point-calculator', { ...base, method: 'demark', open: '104' });
    expect([val(dm, 'Pivot (P)'), val(dm, 'R1'), val(dm, 'S1')]).toEqual([
      '106.2500',
      '112.5000',
      '102.5000',
    ]);
    expect(errs(run('pivot-point-calculator', { ...base, close: '111' })).close).toBeDefined();
    expect(errs(run('pivot-point-calculator', { ...base, high: '99' })).high).toBeDefined();
  });

  it('fibonacci up and down', () => {
    const up = run('fibonacci-calculator', {});
    const rows = up.ok ? up.table!.rows : [];
    expect(rows.find((r) => r[0] === 'Retracement' && r[1] === '61.8%')![2]).toBe('1.10764');
    expect(rows.find((r) => r[0] === 'Extension' && r[1] === '161.8%')![2]).toBe('1.13236');
    const down = run('fibonacci-calculator', { direction: 'down' });
    const d = down.ok ? down.table!.rows : [];
    expect(d.find((r) => r[1] === '61.8%')![2]).toBe('1.11236');
    expect(d.find((r) => r[1] === '161.8%')![2]).toBe('1.08764');
  });

  it('currency converter via EUR cross rates; missing rates need manual input', () => {
    const ctx = { eurRates: { USD: '1.1193', GBP: '0.83728', JPY: '175.51' }, rateDate: '2026-10-23' };
    expect(val(run('currency-converter', { from: 'USD', to: 'GBP' }, ctx), 'USD → GBP')).toBe('748.04');
    expect(val(run('currency-converter', { from: 'EUR', to: 'USD' }, ctx), 'EUR → USD')).toBe('1119.30');
    expect(val(run('currency-converter', { from: 'USD', to: 'JPY' }, ctx), 'USD → JPY')).toBe('156803');
    const missing = run('currency-converter', { from: 'USD', to: 'CHF' }, ctx);
    expect(missing.ok).toBe(false);
    expect(val(run('currency-converter', { rateMode: 'manual', manualRate: '0.9' }), 'USD → EUR')).toBe(
      '900.00',
    );
  });

  it('compounding matches the closed form', () => {
    expect(val(run('compounding-calculator', {}), 'Final balance')).toBe('11268.25');
    expect(val(run('compounding-calculator', { deposit: '100' }), 'Final balance')).toBe('12536.50');
    expect(errs(run('compounding-calculator', { periods: '601' })).periods).toBeDefined();
    expect(errs(run('compounding-calculator', { ratePct: '-100' })).ratePct).toBeDefined();
    expect(errs(run('compounding-calculator', { periods: '2.5' })).periods).toBeDefined();
  });

  it('drawdown and break-even', () => {
    expect(val(run('drawdown-calculator', {}), 'Gain required to recover')).toBe('25.00');
    expect(val(run('drawdown-calculator', { loss: '50' }), 'Gain required to recover')).toBe('100.00');
    expect(errs(run('drawdown-calculator', { loss: '100' })).loss).toBeDefined();
    expect(val(run('break-even-calculator', {}), 'Break-even win rate')).toBe('36.67');
    expect(errs(run('break-even-calculator', { rr: '1', cost: '1' })).cost).toMatch(/no win rate/);
  });
});
