import type { Metadata } from 'next';
import { RISK_STATEMENT } from '@/content/site';
import { pageMetadata } from '@/server/seo';
import { InfoPage } from '@/ui/InfoPage';

export const metadata: Metadata = pageMetadata({
  title: 'Risk disclosure',
  description:
    'Trading forex and CFDs with leverage carries a high risk of rapid loss. Read the main risks before trading.',
  path: '/risk-disclosure',
});

export default function Risk() {
  return (
    <InfoPage
      path="/risk-disclosure"
      label="Risk disclosure"
      eyebrow="Legal"
      title="Risk disclosure"
      lead={RISK_STATEMENT}
    >
      <h2>Main risks</h2>
      <ul>
        <li>
          <strong>Leverage</strong> magnifies losses as well as gains; small price moves can consume your
          margin.
        </li>
        <li>
          <strong>Gaps and slippage</strong> can close positions at worse prices than your stop.
        </li>
        <li>
          <strong>Costs</strong> — spreads, commissions, swaps and conversion fees — reduce returns and
          accumulate.
        </li>
        <li>
          <strong>Counterparty and jurisdiction</strong>: protections depend on the entity holding your
          account and local rules.
        </li>
        <li>
          <strong>Liquidity and volatility</strong> can widen spreads sharply around news and market opens.
        </li>
        <li>
          <strong>Technology</strong>: platform, connection or data failures can prevent you from managing
          positions.
        </li>
      </ul>
      <h2>Using this site</h2>
      <p>
        Calculators show arithmetic results for assumptions you enter. They are not forecasts, and historical
        or hypothetical results do not predict future results. Broker facts describe what a broker stated at a
        time; they are not offers and may not apply to you.
      </p>
    </InfoPage>
  );
}
