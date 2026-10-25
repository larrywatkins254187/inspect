'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { calculatorBySlug, defaultValues } from '@/calculators/defs';
import { D, type CalcOutput, type Values } from '@/calculators/core';
import { instrumentBySymbol } from '@/markets/instruments';
import { IconAlert } from '../icons';
import { trackEvent } from './Consent';

interface Rates {
  date: string;
  eurRates: Record<string, string>;
  attribution: string;
}

/** Account-currency value of one unit of the quote currency, via EUR reference rates. */
function referenceR(rates: Rates, quote: string, account: string): string | null {
  if (quote === account) return '1';
  const e = (c: string) => (c === 'EUR' ? '1' : rates.eurRates[c]);
  const q = e(quote);
  const a = e(account);
  if (!q || !a) return null;
  return new D(a).div(q).toDecimalPlaces(8).toFixed();
}

export function CalculatorWorkspace({ slug }: { slug: string }) {
  const def = calculatorBySlug(slug)!;
  const initial = useMemo(() => defaultValues(def), [def]);
  const [values, setValues] = useState<Values>(initial);
  const [touched, setTouched] = useState(false);
  const [rates, setRates] = useState<Rates | null>(null);
  const [rateNote, setRateNote] = useState<string | null>(null);
  const tracked = useRef(false);
  const needsRates = def.fields.some((f) => f.role === 'rate') || slug === 'currency-converter';

  useEffect(() => {
    if (!needsRates) return;
    const ctl = new AbortController();
    fetch('/api/reference-rates', { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Rates | null) => j && j.date && setRates(j))
      .catch(() => undefined);
    return () => ctl.abort();
  }, [needsRates]);

  const out: CalcOutput = useMemo(
    () => def.compute(values, { eurRates: rates?.eurRates, rateDate: rates?.date }),
    [def, values, rates],
  );

  useEffect(() => {
    if (touched && out.ok && !tracked.current) {
      tracked.current = true;
      trackEvent('calculator_use');
    }
  }, [out, touched]);
  // Re-keying the result block restarts the short highlight when values change.
  const flashKey = out.ok ? out.results.map((r) => r.value).join('|') : 'invalid';

  const set = (name: string, v: string) => {
    setTouched(true);
    setValues((prev) => {
      const next = { ...prev, [name]: v };
      const field = def.fields.find((f) => f.name === name);
      if (field?.role === 'instrument') {
        const ins = instrumentBySymbol(v);
        if (ins) {
          if ('contractSize' in next) next.contractSize = ins.contractSize;
          if ('pipSize' in next) next.pipSize = ins.pipSize;
          if ('rate' in next) next.rate = ins.quote === next.accountCurrency ? '1' : '';
          if ('price' in next && ins.cls !== 'FX') next.price = '';
          if ('precision' in next)
            next.precision = String(Math.max(2, (ins.pipSize.split('.')[1]?.length ?? 0) + 1));
        }
        setRateNote(null);
      }
      if (field?.role === 'accountCurrency' && 'rate' in next) {
        const ins = instrumentBySymbol(next.instrument ?? '');
        next.rate = ins && ins.quote === v ? '1' : '';
        setRateNote(null);
      }
      return next;
    });
  };

  const applyReference = () => {
    const ins = instrumentBySymbol(values.instrument ?? '');
    if (!ins || !rates) return;
    const r = referenceR(rates, ins.quote, values.accountCurrency ?? 'USD');
    if (!r) {
      setRateNote('No reference rate is available for this currency pair. Enter the rate yourself.');
      return;
    }
    set('rate', r);
    setRateNote(
      `Applied ECB reference rate for ${rates.date}${ins.quote !== 'EUR' && values.accountCurrency !== 'EUR' ? ' (derived via EUR, rounded to 8 decimals)' : ''}. Reference rates are not tradable quotes.`,
    );
  };

  const reset = () => {
    setValues(initial);
    setRateNote(null);
    setTouched(false);
  };

  const errors = out.ok ? {} : out.errors;
  const visible = def.fields.filter(
    (f) => !f.showWhen || f.showWhen.equals.includes(values[f.showWhen.field] ?? ''),
  );
  const ins = instrumentBySymbol(values.instrument ?? '');
  const rateMissing = ins && values.rate === '' && ins.quote !== values.accountCurrency;

  return (
    <div className="calc">
      <form
        className="card"
        aria-labelledby={`${slug}-form-h`}
        onSubmit={(e) => e.preventDefault()}
        noValidate
      >
        <div className="row spread" style={{ marginBottom: 16 }}>
          <h2 id={`${slug}-form-h`} style={{ margin: 0, fontSize: '1.15rem' }}>
            Your assumptions
          </h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
            Reset inputs
          </button>
        </div>
        <div className="calc-fields">
          {visible.map((f) => {
            const id = `${slug}-${f.name}`;
            const err = errors[f.name];
            const describedBy =
              [f.help ? `${id}-help` : null, err ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
            if (f.kind === 'checkbox')
              return (
                <div key={f.name} className="field" style={{ gridColumn: '1 / -1' }}>
                  <label className="checkbox" htmlFor={id}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={values[f.name] === 'true'}
                      onChange={(e) => set(f.name, e.target.checked ? 'true' : 'false')}
                      aria-describedby={describedBy}
                      aria-invalid={err ? true : undefined}
                    />
                    <span>{f.label}</span>
                  </label>
                  {err ? (
                    <p id={`${id}-err`} className="field-error">
                      <IconAlert width={16} height={16} /> {err}
                    </p>
                  ) : null}
                </div>
              );
            return (
              <div
                key={f.name}
                className="field"
                style={f.role === 'rate' || f.role === 'instrument' ? { gridColumn: '1 / -1' } : undefined}
              >
                <label htmlFor={id}>
                  {f.label}
                  {f.unit ? (
                    <span className="muted" style={{ fontWeight: 400 }}>
                      {' '}
                      ({f.unit})
                    </span>
                  ) : null}
                </label>
                {f.kind === 'select' ? (
                  <select
                    id={id}
                    className="select"
                    value={values[f.name] ?? ''}
                    onChange={(e) => set(f.name, e.target.value)}
                    aria-describedby={describedBy}
                    aria-invalid={err ? true : undefined}
                  >
                    {f.options!.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className="input"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={values[f.name] ?? ''}
                    onChange={(e) => set(f.name, e.target.value.slice(0, 24))}
                    aria-describedby={describedBy}
                    aria-invalid={err ? true : undefined}
                  />
                )}
                {f.help ? (
                  <p id={`${id}-help`} className="hint">
                    {f.help}
                  </p>
                ) : null}
                {f.role === 'rate' ? (
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={applyReference}
                      disabled={!rates || !ins || ins.quote === values.accountCurrency}
                    >
                      Apply ECB reference rate
                    </button>
                    <span className="hint">
                      {rates
                        ? `Stored ECB reference date: ${rates.date}`
                        : 'No stored reference rate — enter the rate.'}
                    </span>
                  </div>
                ) : null}
                {f.role === 'rate' && rateNote ? <p className="hint">{rateNote}</p> : null}
                {f.role === 'rate' && rateMissing && !err ? (
                  <p className="hint">
                    Quote currency ({ins!.quote}) differs from the account currency: enter a conversion rate.
                  </p>
                ) : null}
                {err ? (
                  <p id={`${id}-err`} className="field-error">
                    <IconAlert width={16} height={16} /> {err}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {ins ? (
          <p className="small muted" style={{ margin: '16px 0 0' }}>
            Typical defaults for {ins.symbol}: contract {ins.contractSize} {ins.contractUnit}, {ins.pipName}{' '}
            {ins.pipSize}, quoted in {ins.quote}. Actual broker specifications differ.
          </p>
        ) : null}
      </form>
      <section className="card calc-results" aria-labelledby={`${slug}-res-h`}>
        <h2 id={`${slug}-res-h`} style={{ marginTop: 0, fontSize: '1.15rem' }}>
          Result
        </h2>
        {out.ok ? (
          <div key={flashKey} className={touched ? 'result-flash' : undefined}>
            <dl className="result-list">
              {out.results.map((r) => (
                <div key={r.label} className={r.primary ? 'result-primary' : undefined}>
                  <dt>{r.label}</dt>
                  <dd>
                    {r.value}
                    {r.unit ? (
                      <span className="small muted" style={{ fontWeight: 500 }}>
                        {' '}
                        {r.unit}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="visually-hidden" aria-live="polite">
              {out.results
                .filter((r) => r.primary)
                .map((r) => `${r.label}: ${r.value} ${r.unit ?? ''}`)
                .join('. ')}
            </p>
            {out.notes.map((n) => (
              <p key={n} className="small muted" style={{ marginTop: 12 }}>
                {n}
              </p>
            ))}
            {out.table ? (
              <div
                className="table-scroll"
                role="region"
                aria-label={`${out.table.caption} (scrollable)`}
                tabIndex={0}
                style={{ maxHeight: 360, overflowY: 'auto' }}
              >
                <table className="table-compact">
                  <caption>{out.table.caption}</caption>
                  <thead>
                    <tr>
                      {out.table.headers.map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {out.table.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) =>
                          j === 0 ? (
                            <th key={j} scope="row">
                              {c}
                            </th>
                          ) : (
                            <td key={j} className="num">
                              {c}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : (
          <div role="status">
            <p className="field-error">
              <IconAlert width={16} height={16} />{' '}
              {out.formError ??
                'Check the highlighted inputs. No result is shown until every input is valid.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
