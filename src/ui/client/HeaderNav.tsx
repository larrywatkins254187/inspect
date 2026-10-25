'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IconMenu, IconX } from '../icons';

interface NavItem {
  href: string;
  label: string;
}

function Pending() {
  const { pending } = useLinkStatus();
  return <span className="pending-dot" data-pending={pending ? 'true' : 'false'} aria-hidden="true" />;
}

const isCurrent = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** Links are server-rendered; this island adds current state, pending feedback and the mobile menu. */
export function HeaderNav({ items }: { items: readonly NavItem[] }) {
  const path = usePathname() ?? '/';
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links = (mobile: boolean) =>
    items.map((it) => {
      const cur = isCurrent(path, it.href);
      return (
        <li key={it.href}>
          <Link className="nav-link" href={it.href} aria-current={cur ? 'page' : undefined} tabIndex={mobile && !open ? -1 : undefined}>
            {it.label}
            <Pending />
          </Link>
        </li>
      );
    });

  return (
    <>
      <nav aria-label="Primary">
        <ul className="nav-list">{links(false)}</ul>
      </nav>
      <button
        ref={button}
        type="button"
        className="btn btn-ghost icon-btn menu-button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <IconX /> : <IconMenu />}
        <span className="visually-hidden">{open ? 'Close menu' : 'Open menu'}</span>
      </button>
      <div id="mobile-menu" ref={panel} className="mobile-panel" data-open={open ? 'true' : 'false'} style={{ position: 'absolute', left: 0, right: 0, top: '100%' }}>
        <div className="container">
          <nav aria-label="Mobile">
            <ul>{links(true)}</ul>
          </nav>
        </div>
      </div>
    </>
  );
}
