import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconAlert, IconCheck, IconClock, IconExternal, IconInfo, IconQuestion, IconShield } from './icons';

export function PageHeader({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h1>{title}</h1>
      {lead ? <p className="lead">{lead}</p> : null}
      {children}
    </header>
  );
}

export interface Crumb {
  href: string;
  label: string;
}
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((c, i) =>
          i === items.length - 1 ? (
            <li key={c.href}>
              <span aria-current="page">{c.label}</span>
            </li>
          ) : (
            <li key={c.href}>
              <Link href={c.href}>{c.label}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

export type StatusKind = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
const STATUS_ICON: Record<StatusKind, ReactNode> = {
  ok: <IconCheck />,
  warn: <IconClock />,
  bad: <IconAlert />,
  info: <IconInfo />,
  neutral: <IconQuestion />,
};
/** Status always carries words and an icon; color is never the only signal. */
export function Status({ kind, children }: { kind: StatusKind; children: ReactNode }) {
  return (
    <span className={`status status-${kind}`}>
      {STATUS_ICON[kind]}
      {children}
    </span>
  );
}

export function Notice({ kind = 'info', title, children }: { kind?: 'info' | 'warn' | 'risk'; title?: string; children: ReactNode }) {
  const icon = kind === 'warn' ? <IconAlert /> : kind === 'risk' ? <IconShield /> : <IconInfo />;
  return (
    <div className={`notice notice-${kind}`} role={kind === 'warn' ? 'note' : undefined}>
      {icon}
      <div>
        {title ? <p className="notice-title">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function TableRegion({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-labelledby={id} tabIndex={0}>
      {children}
      <span id={id} className="visually-hidden">
        {label} (scrollable table)
      </span>
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} rel="noopener nofollow" target="_blank">
      {children}
      <IconExternal style={{ marginLeft: 4, verticalAlign: '-2px' }} />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card empty">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="muted reading" style={{ marginInline: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

export function NotVerified({ children = 'Not verified' }: { children?: ReactNode }) {
  return <span className="not-verified">{children}</span>;
}

export function JsonLd({ data }: { data: unknown }) {
  // JSON-LD is built only from visible content; "<" is escaped to keep it inert.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
