import Link from 'next/link';
import type { Metadata } from 'next';
import { ATTRIBUTION } from '@/domain/rates';
import { formatDate } from '@/lib/time';
import { getSources } from '@/server/public';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';
import { ExternalLink, TableRegion } from '@/ui/primitives';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  // Empty directories are kept out of the index until they hold published evidence.
  const list = await getSources();
  return pageMetadata({
    ...{
      title: 'Sources: official pages cited by ForexInspect',
      description:
        'Every official source currently cited by published ForexInspect pages, with observation dates, attribution and reference-data licences.',
      path: '/sources',
    },
    noindex: list.length === 0,
  });
}

export default async function Sources() {
  const sources = await getSources();
  return (
    <InfoPage
      path="/sources"
      label="Sources"
      eyebrow="Trust"
      title="Sources"
      lead="Official pages currently cited by published research, and the reference data used by the calculators."
    >
      <h2>Broker sources</h2>
      {sources.length ? (
        <TableRegion id="src-cap" label="Cited official sources">
          <table className="table-compact">
            <caption>Currently cited sources ({sources.length})</caption>
            <thead>
              <tr>
                <th scope="col">Broker</th>
                <th scope="col">Official page</th>
                <th scope="col">Facts</th>
                <th scope="col">Last observed</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.url}>
                  <th scope="row">
                    <Link href={`/brokers/${s.slug}`}>{s.broker}</Link>
                  </th>
                  <td>
                    <ExternalLink href={s.url}>{s.url.replace(/^https:\/\//, '')}</ExternalLink>
                    {s.attribution ? <div className="small muted">{s.attribution}</div> : null}
                  </td>
                  <td className="num">{s.factCount}</td>
                  <td>{formatDate(s.lastObservedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : (
        <p>
          No broker sources are currently cited: no broker pages are published. Sources appear here as soon as
          a page that cites them is published, and disappear when that evidence expires or is withdrawn.
        </p>
      )}
      <p className="small muted">
        Facts are restated in our own words with a link; source content is not republished. Source use follows
        the policy described in the <Link href="/methodology#sources">methodology</Link>.
      </p>
      <h2>Reference exchange rates</h2>
      <p>
        {ATTRIBUTION} The ECB publishes these rates for information purposes only. Cross rates that do not
        involve the euro are derived by ForexInspect through EUR and rounded, which modifies the published
        data. No other price feed is used; non-FX prices are entered by you.
      </p>
      <h2>Typeface</h2>
      <p>
        Inter, © The Inter Project Authors, under the{' '}
        <a href="/licenses/Inter-OFL.txt">SIL Open Font License 1.1</a>.
      </p>
    </InfoPage>
  );
}
