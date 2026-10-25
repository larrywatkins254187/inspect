'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';

interface Item {
  slug: string;
  title: string;
  summary: string;
  category: string;
}

export function ToolsHub({ items, categories }: { items: Item[]; categories: string[] }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(
      (i) =>
        (!cat || i.category === cat) &&
        words.every((w) => `${i.title} ${i.summary}`.toLowerCase().includes(w)),
    );
  }, [items, q, cat]);
  const counts = useMemo(
    () => Object.fromEntries(categories.map((c) => [c, items.filter((i) => i.category === c).length])),
    [items, categories],
  );
  const filtered = q !== '' || cat !== null;
  return (
    <div className="stack">
      <div className="card card-tight stack">
        <div className="field" style={{ maxWidth: 520 }}>
          <label htmlFor={id}>Search calculators</label>
          <input
            id={id}
            className="input"
            type="search"
            value={q}
            maxLength={60}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. margin, pip, swap"
          />
        </div>
        <div className="segmented" role="group" aria-label="Category">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={cat === null}
            onClick={() => setCat(null)}
          >
            All ({items.length})
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className="btn btn-secondary btn-sm"
              aria-pressed={cat === c}
              onClick={() => setCat(cat === c ? null : c)}
            >
              {c} ({counts[c]})
            </button>
          ))}
        </div>
        <div className="row spread">
          <p className="small muted" aria-live="polite" style={{ margin: 0 }}>
            {shown.length} of {items.length} calculators shown.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!filtered}
            onClick={() => {
              setQ('');
              setCat(null);
            }}
          >
            Clear
          </button>
        </div>
      </div>
      {shown.length ? (
        <ul className="grid grid-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {shown.map((i) => (
            <li key={i.slug}>
              <Link
                className="card card-tight card-link"
                href={`/tools/${i.slug}`}
                style={{ height: '100%' }}
              >
                <span className="small muted">{i.category}</span>
                <br />
                <span className="card-title">{i.title}</span>
                <p className="small muted" style={{ margin: '6px 0 0' }}>
                  {i.summary}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card empty">
          <p>No calculator matches “{q}”.</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setQ('');
              setCat(null);
            }}
          >
            Show all calculators
          </button>
        </div>
      )}
    </div>
  );
}
