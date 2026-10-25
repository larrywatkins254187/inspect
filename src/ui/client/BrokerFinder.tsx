'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';

export interface FinderEntry {
  slug: string;
  name: string;
  platforms: string[];
  regulatorCodes: string[];
  deposit: 'VERIFIED' | 'NOT_VERIFIED';
  leverage: 'VERIFIED' | 'NOT_VERIFIED';
  covered: string[];
  missing: string[];
  hasFees: boolean;
  hasAccounts: boolean;
}

type Presence = 'any' | 'VERIFIED' | 'NOT_VERIFIED';

/** Evidence filters only — not a suitability assessment. State stays in memory (no indexable filter URLs). */
export function BrokerFinder({ entries, headingLevel = 2 }: { entries: FinderEntry[]; headingLevel?: 2 | 3 }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [reg, setReg] = useState('any');
  const [plat, setPlat] = useState('any');
  const [dep, setDep] = useState<Presence>('any');
  const [lev, setLev] = useState<Presence>('any');
  const regs = useMemo(() => [...new Set(entries.flatMap((e) => e.regulatorCodes))].sort(), [entries]);
  const plats = useMemo(() => [...new Set(entries.flatMap((e) => e.platforms))].sort(), [entries]);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    return entries.filter((e) => {
      const hay = [e.name, ...e.platforms, ...e.regulatorCodes].join(' ').toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
      if (reg !== 'any' && !e.regulatorCodes.includes(reg)) return false;
      if (plat !== 'any' && !e.platforms.includes(plat)) return false;
      if (dep !== 'any' && e.deposit !== dep) return false;
      if (lev !== 'any' && e.leverage !== lev) return false;
      return true;
    });
  }, [entries, q, reg, plat, dep, lev]);
  const filtered = q !== '' || reg !== 'any' || plat !== 'any' || dep !== 'any' || lev !== 'any';
  const reset = () => {
    setQ('');
    setReg('any');
    setPlat('any');
    setDep('any');
    setLev('any');
  };
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="stack">
      <form role="search" aria-label="Find a broker" onSubmit={(e) => e.preventDefault()} className="card card-tight">
        <div className="search-row">
          <div className="field">
            <label htmlFor={`${id}-q`}>Search name, platform or regulator code</label>
            <input id={`${id}-q`} className="input" type="search" value={q} maxLength={80} autoComplete="off" onChange={(e) => setQ(e.target.value)} placeholder="e.g. MT5 ASIC" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-r`}>Regulator record</label>
            <select id={`${id}-r`} className="select" value={reg} onChange={(e) => setReg(e.target.value)}>
              <option value="any">Any</option>
              {regs.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-p`}>Platform</label>
            <select id={`${id}-p`} className="select" value={plat} onChange={(e) => setPlat(e.target.value)}>
              <option value="any">Any</option>
              {plats.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-d`}>Deposit / leverage evidence</label>
            <select
              id={`${id}-d`}
              className="select"
              value={`${dep}|${lev}`}
              onChange={(e) => {
                const [a, b] = e.target.value.split('|') as [Presence, Presence];
                setDep(a);
                setLev(b);
              }}
            >
              <option value="any|any">Any</option>
              <option value="VERIFIED|any">Deposit verified</option>
              <option value="NOT_VERIFIED|any">Deposit not verified</option>
              <option value="any|VERIFIED">Leverage verified</option>
              <option value="any|NOT_VERIFIED">Leverage not verified</option>
            </select>
          </div>
        </div>
        <div className="row spread" style={{ marginTop: 12 }}>
          <p className="small muted" aria-live="polite" style={{ margin: 0 }}>
            {results.length} of {entries.length} published broker{entries.length === 1 ? '' : 's'} shown{filtered ? ' (filtered)' : ''}.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={!filtered}>
            Clear filters
          </button>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Filters check whether evidence exists. They do not rate brokers, compare deposit amounts or show where a broker accepts clients.
        </p>
      </form>
      {results.length === 0 ? (
        <div className="card empty">
          <H style={{ marginTop: 0 }}>No published brokers match</H>
          <p className="muted">Try fewer words, or clear the filters. Unpublished brokers are not searchable.</p>
          <button type="button" className="btn btn-secondary" onClick={reset}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid grid-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {results.map((e) => (
            <li key={e.slug} className="card card-tight">
              <H style={{ margin: 0, fontSize: '1.125rem' }}>
                <Link href={`/brokers/${e.slug}`}>{e.name}</Link>
              </H>
              <p className="small muted" style={{ margin: '6px 0 8px' }}>
                Core topics verified: {e.covered.length} of {e.covered.length + e.missing.length}
                {e.missing.length ? ` · Not verified: ${e.missing.join(', ').toLowerCase()}` : ''}
              </p>
              <ul className="chips" aria-label={`${e.name} evidence`}>
                {e.platforms.map((p) => (
                  <li key={p} className="chip">
                    {p}
                  </li>
                ))}
                {e.regulatorCodes.map((r) => (
                  <li key={r} className="chip">
                    Register match: {r}
                  </li>
                ))}
                {e.hasFees ? (
                  <li>
                    <Link className="chip" href={`/brokers/${e.slug}/fees`}>
                      Fees
                    </Link>
                  </li>
                ) : null}
                {e.hasAccounts ? (
                  <li>
                    <Link className="chip" href={`/brokers/${e.slug}/accounts`}>
                      Accounts
                    </Link>
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
