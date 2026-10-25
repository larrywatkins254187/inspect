import Image from 'next/image';
import Link from 'next/link';
import type { Faq, LicenceRecord, Sentence, ShownFact } from '@/domain/broker-view';
import type { HistoryEntry } from '@/domain/history';
import type { PageDates } from '@/domain/read';
import { formatDate } from '@/lib/time';
import { ExternalLink, NotVerified, Status } from './primitives';

/** Inline evidence link to the exact fact anchor on the profile. */
export function FactRef({
  slug,
  fact,
  children,
  base = '/brokers',
}: {
  slug: string;
  fact: Pick<ShownFact, 'anchor'>;
  children?: React.ReactNode;
  base?: string;
}) {
  return <Link href={`${base}/${slug}#${fact.anchor}`}>{children ?? 'evidence'}</Link>;
}

export function SentenceText({
  s,
  slug,
  facts,
  base = '/brokers',
}: {
  s: Sentence;
  slug: string;
  facts: ShownFact[];
  base?: string;
}) {
  const refs = s.factIds.map((id) => facts.find((f) => f.factId === id)).filter(Boolean) as ShownFact[];
  return (
    <p>
      {s.text}
      {refs.length ? (
        <span className="small">
          {' '}
          [
          {refs.slice(0, 8).map((f, i) => (
            <span key={f.factId}>
              {i ? ', ' : ''}
              <a href={`${base}/${slug}#${f.anchor}`}>fact {f.factId}</a>
            </span>
          ))}
          {refs.length > 8 ? `, +${refs.length - 8} more` : ''}]
        </span>
      ) : null}
    </p>
  );
}

export function FactCard({ fact, children }: { fact: ShownFact; children?: React.ReactNode }) {
  return (
    <li className="fact" id={fact.anchor}>
      <div className="row spread">
        <span className="fact-value">{fact.display}</span>
        <Status kind="ok">Verified</Status>
      </div>
      {fact.scopeNotes.length ? (
        <ul className="chips" aria-label="Scope">
          {fact.scopeNotes.map((n) => (
            <li key={n} className="chip">
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          No account, entity or jurisdiction scope is stated next to this value.
        </p>
      )}
      <dl className="fact-meta">
        <div>
          <dt className="visually-hidden">Source</dt>
          <dd style={{ margin: 0 }}>
            Source: <ExternalLink href={fact.sourceUrl}>{fact.sourceHost}</ExternalLink> ({fact.locator})
          </dd>
        </div>
        <div>
          <dt className="visually-hidden">Observed</dt>
          <dd style={{ margin: 0 }}>Observed {formatDate(fact.lastObservedAt)}</dd>
        </div>
        {fact.effectiveAt ? (
          <div>
            <dt className="visually-hidden">Effective</dt>
            <dd style={{ margin: 0 }}>Effective {formatDate(fact.effectiveAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="visually-hidden">Verified</dt>
          <dd style={{ margin: 0 }}>Verified {formatDate(fact.verifiedAt)}</dd>
        </div>
        <div>
          <dt className="visually-hidden">Valid until</dt>
          <dd style={{ margin: 0 }}>Re-check due {formatDate(fact.validUntil)}</dd>
        </div>
        <div>
          <dt className="visually-hidden">Fact ID</dt>
          <dd style={{ margin: 0 }}>Fact {fact.factId}</dd>
        </div>
      </dl>
      {children}
    </li>
  );
}

export function EvidencePanel({
  dates,
  revisionNo,
  factCount,
  sourceCount,
  indexable,
}: {
  dates: PageDates;
  revisionNo: number;
  factCount: number;
  sourceCount: number;
  indexable?: boolean;
}) {
  return (
    <aside className="panel" aria-label="Evidence and revision">
      <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Evidence and revision</h2>
      <dl style={{ margin: 0, display: 'grid', gap: 6 }} className="small">
        <div>
          <dt className="muted">First published</dt>
          <dd style={{ margin: 0 }}>{formatDate(dates.firstPublished)}</dd>
        </div>
        <div>
          <dt className="muted">Substantively updated</dt>
          <dd style={{ margin: 0 }}>{formatDate(dates.materialUpdated)}</dd>
        </div>
        <div>
          <dt className="muted">Evidence last verified</dt>
          <dd style={{ margin: 0 }}>{formatDate(dates.lastVerified)}</dd>
        </div>
        <div>
          <dt className="muted">Revision</dt>
          <dd style={{ margin: 0 }}>
            {revisionNo} · {factCount} facts from {sourceCount} official source{sourceCount === 1 ? '' : 's'}
          </dd>
        </div>
      </dl>
      {indexable === false ? (
        <p className="small" style={{ marginTop: 12 }}>
          <Status kind="warn">Limited evidence</Status> Fewer than two core topics are verified, so this page
          is not offered to search engines.
        </p>
      ) : null}
      <p className="small" style={{ margin: '12px 0 0' }}>
        <Link href="/methodology">How we verify</Link> · <Link href="/corrections">Report an error</Link>
      </p>
    </aside>
  );
}

export function GlanceCell({
  cell,
}: {
  cell: { facts: { display: string; anchor: string; notes: string[]; factId: number }[] };
}) {
  if (!cell.facts.length) return <NotVerified />;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {cell.facts.map((f) => (
        <li key={f.factId}>
          <a href={`#${f.anchor}`}>{f.display}</a>
          {f.notes.length ? <span className="small muted"> ({f.notes.join('; ')})</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function EntitySection({
  name,
  named,
  operators,
  licences,
  slug,
  base = '/brokers',
}: {
  name: string;
  named: ShownFact[];
  operators: ShownFact[];
  licences: LicenceRecord[];
  slug: string;
  base?: string;
}) {
  return (
    <div className="stack">
      <p className="reading">
        A brand, the companies it names, the company that operates its website and any regulatory licence are
        different things. ForexInspect keeps them separate and never infers a licence from a company name.
      </p>
      <h3>Companies named on the official website</h3>
      {named.length ? (
        <ul>
          {named.map((f) => (
            <li key={f.factId}>
              <strong>{f.valueText}</strong> — <Status kind="info">Named by broker</Status>{' '}
              <FactRef slug={slug} fact={f} base={base} />
              {f.scope.jurisdiction ? (
                <span className="small muted"> · Jurisdiction stated: {f.scope.jurisdiction}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <NotVerified>No company name has been verified on {name}’s official pages.</NotVerified>
        </p>
      )}
      <h3>Website operator</h3>
      {operators.length ? (
        <ul>
          {operators.map((f) => (
            <li key={f.factId}>
              <strong>{f.valueText}</strong> — <Status kind="ok">Operator statement verified</Status>{' '}
              <FactRef slug={slug} fact={f} base={base} />
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <NotVerified>
            The company operating this website has not been verified (it needs literal “operated by” wording
            on an official page).
          </NotVerified>
        </p>
      )}
      <h3>Licences matched in official registers</h3>
      {licences.length ? (
        <ul>
          {licences.map((l) => (
            <li key={`${l.regulatorCode}-${l.licenceNumber}`}>
              {l.regulatorName} ({l.regulatorCode}) licence {l.licenceNumber} for {l.legalName}: status “
              {l.status}” in the register snapshot dated {formatDate(l.statusAsOf)}.{' '}
              <ExternalLink href={l.registerUrl}>Check the register</ExternalLink>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <NotVerified>No licence has been independently matched to a company shown here.</NotVerified> Check
          the regulator’s own register before relying on any claim of authorisation.
        </p>
      )}
    </div>
  );
}

export function FaqList({
  faqs,
  slug,
  facts,
  base = '/brokers',
}: {
  faqs: Faq[];
  slug: string;
  facts: ShownFact[];
  base?: string;
}) {
  return (
    <dl className="faq">
      {faqs.map((f) => (
        <div key={f.question}>
          <dt>{f.question}</dt>
          <dd>
            {f.answer.map((s, i) => (
              <SentenceText key={i} s={s} slug={slug} facts={facts} base={base} />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SourceList({
  sources,
}: {
  sources: { url: string; host: string; lastObservedAt: string; factCount: number }[];
}) {
  return (
    <ul>
      {sources.map((s) => (
        <li key={s.url}>
          <ExternalLink href={s.url}>{s.url.replace(/^https:\/\//, '')}</ExternalLink> — {s.factCount} fact
          {s.factCount === 1 ? '' : 's'}, last observed {formatDate(s.lastObservedAt)}
        </li>
      ))}
    </ul>
  );
}

export function HistoryList({ history }: { history: { entries: HistoryEntry[]; total: number } }) {
  return (
    <>
      <ol style={{ paddingLeft: '1.2em' }}>
        {history.entries.map((e) => (
          <li key={e.revisionNo} style={{ marginBottom: 12 }}>
            <strong>{formatDate(e.publishedAt)}</strong> — revision {e.revisionNo}:{' '}
            {e.kind === 'FIRST_PUBLICATION'
              ? 'first publication'
              : e.kind === 'REVERIFIED'
                ? 're-verification; no trading condition changed'
                : e.kind === 'ROLLBACK'
                  ? 'restored an earlier revision'
                  : 'evidence changed'}
            {e.kind === 'CHANGED' || e.kind === 'ROLLBACK' ? (
              <ul className="small">
                {e.added.map((a) => (
                  <li key={`a${a}`}>Added: {a}</li>
                ))}
                {e.changed.map((a) => (
                  <li key={`c${a}`}>Changed: {a}</li>
                ))}
                {e.removed.map((a) => (
                  <li key={`r${a}`}>Removed: {a}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      {history.total > history.entries.length ? (
        <p className="small muted">
          Showing the latest {history.entries.length} of {history.total} published revisions.
        </p>
      ) : null}
    </>
  );
}

export function LogoOrText({
  name,
  logo,
}: {
  name: string;
  logo: { src: string; width: number; height: number } | null;
}) {
  if (logo) {
    // Approved, unaltered official mark from the permission-gated asset route;
    // the image optimizer only accepts local /asset-file/** paths (next.config.ts).
    return (
      <Image
        src={logo.src}
        alt={`${name} logo`}
        width={logo.width}
        height={logo.height}
        style={{ height: 56, width: 'auto' }}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="logo-fallback" aria-hidden="true">
      {initials}
    </span>
  );
}
