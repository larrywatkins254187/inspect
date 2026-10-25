/**
 * Educational guides (PRD §8). General explanations only: no broker-specific
 * numbers, no invented authors, no artificial freshness. CONTENT_DATE is the
 * date this text was written for the rebuild and changes only with substantive edits.
 */
export type Block = string | { list: string[] } | { formula: string } | { table: { caption: string; headers: string[]; rows: string[][] } };

export interface Guide {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: { id: string; heading: string; blocks: Block[] }[];
  faqs: { q: string; a: string }[];
  related: { href: string; label: string }[];
  contentDate: string;
}

const CONTENT_DATE = '2026-10-25';

export const GUIDES: Guide[] = [
  {
    slug: 'what-is-a-pip',
    title: 'What is a pip? Pips, points and pip value explained',
    description: 'How pips, fractional pips and points work, why JPY pairs differ, and how to calculate pip value for any position size.',
    intro:
      'A pip is the standard unit for describing a price change in a currency pair. Spreads, stop distances and swap rates are usually quoted in pips, so knowing what one pip is worth for your position is the starting point for sizing trades and comparing costs.',
    contentDate: CONTENT_DATE,
    sections: [
      {
        id: 'definition',
        heading: 'The pip and its decimal convention',
        blocks: [
          'For most currency pairs a pip is a move of 0.0001 in the price — the fourth decimal place. If EUR/USD moves from 1.1000 to 1.1001, it has moved one pip.',
          'Pairs quoted in Japanese yen are the main exception. Because their prices are around 100 times larger, a pip is 0.01 — the second decimal place. A move in USD/JPY from 150.00 to 150.01 is one pip.',
          {
            table: {
              caption: 'Typical pip sizes',
              headers: ['Pair type', 'Example quote', 'One pip', 'Fractional pip (pipette)'],
              rows: [
                ['Most pairs', 'EUR/USD 1.10253', '0.0001', '0.00001'],
                ['JPY quote pairs', 'USD/JPY 150.253', '0.01', '0.001'],
              ],
            },
          },
        ],
      },
      {
        id: 'fractional',
        heading: 'Fractional pips and “points”',
        blocks: [
          'Many platforms show one extra decimal place: 1.10253 instead of 1.1025. That last digit is a fractional pip, often called a pipette, worth one tenth of a pip.',
          'The word “point” is used inconsistently. On some platforms a point is the smallest price increment shown (a pipette for five-digit FX quotes); for indices, metals, shares and crypto it usually means a whole unit or the instrument’s minimum price step. Always check whether a quoted spread or stop is in pips or points, and which point size the platform uses.',
        ],
      },
      {
        id: 'pip-value',
        heading: 'Calculating pip value',
        blocks: [
          'Pip value is the money gained or lost when the price moves one pip. It depends on the pip size, the contract size, the number of lots and, when your account currency differs from the quote currency, a conversion rate.',
          { formula: 'pip value (quote currency) = pip size × contract size × lots\npip value (account currency) = pip value (quote currency) × quote-to-account rate' },
          'Example with typical assumptions: one standard lot of EUR/USD is often 100,000 euros. 0.0001 × 100,000 × 1 = 10 US dollars per pip. With a USD account the conversion rate is 1, so a 20-pip stop risks about 200 US dollars before costs.',
          'For USD/JPY the pip size is 0.01, so 0.01 × 100,000 × 1 = 1,000 yen per pip. In a USD account you multiply by the USD value of one yen.',
          'Contract sizes, lot steps and point sizes vary between brokers and instruments. The calculators on this site use typical defaults that you can edit; they are assumptions, not broker specifications.',
        ],
      },
      {
        id: 'why-it-matters',
        heading: 'Why pips matter for costs',
        blocks: [
          'An advertised spread such as “from 0.8 pips” is a minimum or average under stated conditions, not a guaranteed live price. Multiplying the spread by pip value gives an estimate of the cost of opening a position; commission, swap and conversion fees are separate.',
          { list: ['Check whether the spread is quoted in pips or points.', 'Check which account and instrument the figure applies to.', 'Check whether commission is charged per side or round turn, and per lot or per amount traded.'] },
        ],
      },
    ],
    faqs: [
      { q: 'Is a pip always 0.0001?', a: 'No. It is 0.0001 for most currency pairs but 0.01 for pairs quoted in Japanese yen. Non-FX instruments usually use points defined by the platform.' },
      { q: 'What is a pipette?', a: 'A fractional pip: one tenth of a pip, shown as the fifth decimal on most pairs or the third on JPY pairs.' },
      { q: 'Does pip value change?', a: 'In your account currency it can, because the conversion rate between the quote currency and your account currency changes.' },
    ],
    related: [
      { href: '/tools/pip-calculator', label: 'Pip value calculator' },
      { href: '/tools/spread-cost-calculator', label: 'Spread cost calculator' },
      { href: '/tools/position-size-calculator', label: 'Position size calculator' },
      { href: '/guides/forex-leverage-and-margin-explained', label: 'Leverage and margin explained' },
    ],
  },
  {
    slug: 'forex-leverage-and-margin-explained',
    title: 'Forex leverage and margin explained',
    description: 'What leverage ratios mean, how margin, equity and free margin relate, and why leverage amplifies losses as well as gains.',
    intro:
      'Leverage lets you control a position larger than the money in your account. The broker holds part of your balance as margin while the position is open. Leverage does not change how much the market moves — it changes how much that movement affects your account.',
    contentDate: CONTENT_DATE,
    sections: [
      {
        id: 'ratios',
        heading: 'Leverage ratios',
        blocks: [
          'A leverage ratio such as 1:30 means a position can be up to 30 times the margin set aside for it. Equivalently, the margin requirement is 1/30 ≈ 3.33% of the position’s notional value.',
          { formula: 'required margin = position notional ÷ leverage\nposition notional = lots × contract size × price (converted to account currency)' },
          'Example: one lot of EUR/USD at 1.1000 with a contract size of 100,000 is a notional of 110,000 US dollars. At 1:30 the margin is about 3,667 US dollars; at 1:100 it is 1,100 US dollars.',
          'Maximum leverage depends on the legal entity that holds the account, the jurisdiction, the instrument and the client classification. A “maximum leverage” figure on a broker website is not an offer that applies to every reader.',
        ],
      },
      {
        id: 'margin-terms',
        heading: 'Balance, equity, margin and free margin',
        blocks: [
          {
            list: [
              'Balance: deposits plus closed profits, minus closed losses and charges.',
              'Equity: balance plus or minus the profit or loss on open positions.',
              'Used margin: the amount held for open positions.',
              'Free margin: equity minus used margin — what is available for new positions or to absorb losses.',
              'Margin level: equity ÷ used margin × 100%.',
            ],
          },
          'When losses reduce equity, the margin level falls. Brokers set margin-call and stop-out levels at which they warn you or start closing positions. These levels differ between brokers and entities and are set out in the account terms.',
        ],
      },
      {
        id: 'amplified',
        heading: 'Leverage amplifies losses',
        blocks: [
          'With higher leverage the same price move is a larger share of your equity. If you use your full margin capacity at 1:100, a 1% adverse move in the instrument erases roughly the whole margin committed to that position.',
          'Effective leverage — total position notional divided by equity — is a more useful measure of risk than the maximum leverage an account allows. You can keep effective leverage low even on an account with a high maximum.',
          'Fast markets and price gaps can close positions at worse prices than a stop order. Whether losses can exceed your deposit depends on the entity’s terms and local rules on negative balance protection; check the account documents rather than assuming.',
        ],
      },
    ],
    faqs: [
      { q: 'Is higher leverage better?', a: 'No. It lowers the margin needed but increases how quickly losses consume equity. Many traders deliberately use far less leverage than the maximum allowed.' },
      { q: 'Why do brokers show different maximum leverage?', a: 'Limits depend on the regulating entity, jurisdiction, instrument and client classification. A figure on one page may not apply to your account.' },
      { q: 'What is a stop-out?', a: 'An automatic closure of positions when the margin level falls to a threshold set in the account terms.' },
    ],
    related: [
      { href: '/tools/margin-calculator', label: 'Margin calculator' },
      { href: '/tools/leverage-calculator', label: 'Leverage calculator' },
      { href: '/tools/drawdown-calculator', label: 'Drawdown recovery calculator' },
      { href: '/risk-disclosure', label: 'Risk disclosure' },
    ],
  },
  {
    slug: 'mt4-vs-mt5',
    title: 'MT4 vs MT5: differences between MetaTrader 4 and MetaTrader 5',
    description: 'How MetaTrader 4 and MetaTrader 5 differ in timeframes, order types, position accounting and MQL programs, and what to check with your broker.',
    intro:
      'MetaTrader 4 (MT4) and MetaTrader 5 (MT5) are trading platforms made by MetaQuotes and licensed to brokers. They look similar, but MT5 is a separate platform rather than an upgrade, and programs written for one do not run unchanged on the other.',
    contentDate: CONTENT_DATE,
    sections: [
      {
        id: 'overview',
        heading: 'Platform concepts',
        blocks: [
          'Both platforms provide charting, indicators, order entry and automated trading through Expert Advisors (EAs). Which instruments, account types and server locations you get depends on the broker’s set-up, not on the platform alone.',
          'MetaQuotes continues to change both products, and brokers choose which features to enable. Check the vendor documentation and your broker’s platform page for current capabilities.',
        ],
      },
      {
        id: 'differences',
        heading: 'Main differences',
        blocks: [
          {
            table: {
              caption: 'MT4 and MT5 compared (vendor features; broker configuration varies)',
              headers: ['Area', 'MT4', 'MT5'],
              rows: [
                ['Chart timeframes', '9', '21'],
                ['Pending order types', 'Buy/Sell Limit, Buy/Sell Stop', 'Adds Buy Stop Limit and Sell Stop Limit'],
                ['Position accounting', 'Hedging (several positions per symbol)', 'Netting or hedging, chosen by account'],
                ['Programming language', 'MQL4', 'MQL5'],
                ['Strategy tester', 'Single-symbol testing', 'Multi-symbol, multi-threaded testing'],
                ['Market depth', 'Not built in', 'Depth of market where the broker provides it'],
              ],
            },
          },
          'MT5 was designed for multiple asset classes, including exchange-traded instruments where netting accounting is common. On a netting account all trades in one symbol combine into a single position; on a hedging account they stay separate.',
        ],
      },
      {
        id: 'mql',
        heading: 'MQL compatibility',
        blocks: [
          'MQL4 programs (.mq4/.ex4) do not run on MT5, and MQL5 programs (.mq5/.ex5) do not run on MT4. Moving an EA or indicator between platforms means rewriting or porting it, and testing it again on the new platform.',
          'If you depend on a specific EA, indicator or copy-trading service, confirm which platform it supports before choosing an account.',
        ],
      },
      {
        id: 'choosing',
        heading: 'What to check with a broker',
        blocks: [
          {
            list: [
              'Which account types are offered on each platform, and whether costs differ between them.',
              'Whether the account uses netting or hedging (MT5).',
              'Which instruments are available on each platform.',
              'Server time zone, which affects daily candles and session-based levels such as pivots.',
            ],
          },
        ],
      },
    ],
    faqs: [
      { q: 'Can I use my MT4 Expert Advisor on MT5?', a: 'Not directly. MQL4 and MQL5 are different languages; the program has to be ported to MQL5 and retested.' },
      { q: 'Is MT5 just a newer MT4?', a: 'No. It is a separate platform with a different architecture, more timeframes and order types, and optional netting accounting.' },
      { q: 'Does the platform determine my costs?', a: 'Costs are set by the broker and account type. The same broker may price MT4 and MT5 accounts differently.' },
    ],
    related: [
      { href: '/brokers', label: 'Broker directory (platform evidence)' },
      { href: '/tools/pivot-point-calculator', label: 'Pivot point calculator' },
      { href: '/guides/how-to-choose-a-forex-broker', label: 'How to choose a forex broker' },
    ],
  },
  {
    slug: 'how-to-choose-a-forex-broker',
    title: 'How to choose a forex broker: a checklist based on evidence',
    description: 'Check the legal entity, its register entry, account-specific costs, platforms and funding terms using primary sources rather than marketing claims.',
    intro:
      'A broker brand often operates through several companies in different countries, each with its own licence, rules and account terms. Choosing a broker means checking which company would hold your account and what that company actually offers you — using primary sources, not rankings.',
    contentDate: CONTENT_DATE,
    sections: [
      {
        id: 'entity',
        heading: '1. Identify the company that would hold your account',
        blocks: [
          'Find the legal entity named in the account opening documents and client agreement for your country. A brand name, a logo strip of regulators or a group-company list does not tell you which entity serves you.',
          'Note the company’s exact legal name, registration number and the country it is incorporated in. A company registration number is not a financial-services licence.',
        ],
      },
      {
        id: 'register',
        heading: '2. Check the regulator’s own register',
        blocks: [
          'Search the regulator’s official public register yourself, using the exact legal name or licence number. Confirm the status is current and that the authorisation covers the services and clients you need.',
          'Be cautious if the register entry names a different company, a different website, or shows a warning. Many regulators also publish warning lists of unauthorised firms.',
          'Protections such as compensation schemes or negative balance protection depend on the entity and jurisdiction. Read them in the entity’s own documents.',
        ],
      },
      {
        id: 'costs',
        heading: '3. Read costs for the specific account',
        blocks: [
          {
            list: [
              'Spread: is it a minimum (“from”), an average, or typical? For which instrument and account?',
              'Commission: per side or round turn? Per lot, per 100,000 traded, or per million? In which currency?',
              'Swap / overnight financing and any swap-free terms.',
              'Non-trading fees: deposit, withdrawal, inactivity and currency conversion.',
            ],
          },
          'Advertised spreads are not live execution prices. Use calculators with your own assumptions to estimate costs, and treat partial cost information as partial.',
        ],
      },
      {
        id: 'platforms',
        heading: '4. Platforms, instruments and execution',
        blocks: [
          'Confirm the platform you need is offered on the account type you want, which instruments it carries, and the contract specifications (contract size, minimum trade size, margin requirements).',
        ],
      },
      {
        id: 'funding',
        heading: '5. Funding and withdrawals',
        blocks: [
          'Check accepted payment methods in your country, processing times, fees and the name of the company receiving your money. Be wary of bonuses with withdrawal conditions.',
          'Some traders start with a small deposit and a test withdrawal before committing more.',
        ],
      },
      {
        id: 'sources',
        heading: '6. Keep the sources',
        blocks: [
          'Save the dated pages and documents you relied on. Terms change; a dated copy shows what applied when you decided. On ForexInspect every fact links to its official source with observation and expiry dates, and anything we could not verify is labelled as such.',
        ],
      },
    ],
    faqs: [
      { q: 'Is a broker with many regulators safer?', a: 'Not automatically. What matters is the licence of the specific entity that would hold your account and the rules that apply to you.' },
      { q: 'Does ForexInspect recommend brokers?', a: 'No. ForexInspect publishes no ratings, rankings or recommendations. It shows dated evidence so you can check claims yourself.' },
      { q: 'Should I rely on review scores?', a: 'Scores compress many factors into a number and may be commercially influenced. Primary documents and the regulator’s register are more reliable.' },
    ],
    related: [
      { href: '/methodology', label: 'How ForexInspect verifies evidence' },
      { href: '/brokers', label: 'Broker directory' },
      { href: '/tools/spread-cost-calculator', label: 'Spread cost calculator' },
      { href: '/warnings', label: 'Warnings' },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
