'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';

export function CompareSearch({ items }: { items: { slug: string; names: string[] }[] }) {
  const id = useId();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => words.every((w) => i.names.join(' ').toLowerCase().includes(w)));
  }, [items, q]);
  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: 480 }}>
        <label htmlFor={id}>Search comparisons by broker name</label>
        <input id={id} className="input" type="search" value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="small muted" aria-live="polite">
        {shown.length} of {items.length} comparisons shown.
        {q ? (
          <>
            {' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQ('')}>
              Clear search
            </button>
          </>
        ) : null}
      </p>
      {shown.length ? (
        <ul className="grid grid-2" style={{ listStyle: 'none', padding: 0 }}>
          {shown.map((i) => (
            <li key={i.slug}>
              <Link className="card card-tight card-link" href={`/compare/${i.slug}`}>
                <span className="card-title">{i.names.join(' vs ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No comparisons match. Try one broker name.</p>
      )}
    </div>
  );
}
