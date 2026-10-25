import Link from 'next/link';

export const metadata = { title: 'Page not found', robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <div className="container section">
      <div className="card empty">
        <span className="eyebrow">404</span>
        <h1>Page not found</h1>
        <p className="muted reading" style={{ marginInline: 'auto' }}>
          This page does not exist, or the evidence behind it is not currently published. Research pages are removed when their sources expire, are withdrawn or no longer pass our checks.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" href="/brokers">
            Broker directory
          </Link>
          <Link className="btn btn-secondary" href="/tools">
            Calculators
          </Link>
          <Link className="btn btn-secondary" href="/methodology">
            How we verify
          </Link>
        </div>
      </div>
    </div>
  );
}
