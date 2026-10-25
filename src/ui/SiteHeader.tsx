import Link from 'next/link';
import { PRIMARY_NAV, SITE_NAME } from '@/content/site';
import { HeaderNav } from './client/HeaderNav';
import { IconSearch, Logo } from './icons';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-row" style={{ position: 'relative' }}>
        <Link href="/" className="brand">
          <Logo />
          <span>{SITE_NAME}</span>
        </Link>
        <div className="header-actions">
          <HeaderNav items={PRIMARY_NAV} />
          <Link href="/brokers#finder" className="btn btn-secondary btn-sm">
            <IconSearch width={16} height={16} />
            <span>Find a broker</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
