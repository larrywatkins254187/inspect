import 'server-only';

/** Server-rendered educational content per calculator (PRD §7). Not shipped to the client bundle. */
export interface CalcContent {
  intro: string;
  formula: string;
  example: string[];
  assumptions: string[];
  faqs: { q: string; a: string }[];
  related: string[];
  guide?: string;
}

export const CALC_CONTENT: Record<string, CalcContent> = {
  'pip-calculator': {
    intro: 'Work out what one pip or point is worth for your position size, first in the instrument’s quote currency and then in your account currency. Pip value is the building block for position sizing, stop distances and cost estimates.',
    formula: 'Pip value (quote) = p × C × L\nPip value (account) = p × C × L × R',
    example: ['EUR/USD, 1 lot, contract size 100,000, pip 0.0001, USD account (R = 1):', '0.0001 × 100,000 × 1 × 1 = 10.00 USD per pip.', 'USD/JPY uses a pip of 0.01: 0.01 × 100,000 × 1 = 1,000 JPY per pip; in USD multiply by the USD value of one yen.'],
    assumptions: ['Contract sizes and pip/point sizes are typical defaults — edit them to match your broker’s contract specification.', 'R converts the quote currency into your account currency. Enter it yourself or apply a dated ECB reference rate where available.', 'Results are rounded to the account currency’s usual decimals (0 for JPY, 2 otherwise).'],
    faqs: [
      { q: 'Why does pip value differ between pairs?', a: 'Because pip size, contract size and the quote currency differ. A JPY-quoted pair has a pip of 0.01 and its pip value is in yen before conversion.' },
      { q: 'Is the conversion rate a live price?', a: 'No. Reference rates are daily ECB figures for information. For precise results use the rate your broker applies.' },
    ],
    related: ['position-size-calculator', 'spread-cost-calculator', 'profit-calculator'],
    guide: 'what-is-a-pip',
  },
  'position-size-calculator': {
    intro: 'Find the position size that keeps a loss at your stop to a chosen percentage of your balance. The result is rounded down to your broker’s lot step so the risk never exceeds the target.',
    formula: 'Risk amount = balance × risk% ÷ 100\nLots = risk amount ÷ (stop × p × C × R), rounded down to the lot step',
    example: ['Balance 10,000 USD, risk 1% = 100 USD, stop 20 pips on EUR/USD (10 USD per pip per lot):', '100 ÷ (20 × 10) = 0.50 lots.', 'With a 30-pip stop: 100 ÷ 300 = 0.333… → 0.33 lots (rounded down).'],
    assumptions: ['Minimum lot and lot step vary by broker and instrument; edit them.', 'If the rounded size is below the minimum lot, no position fits the risk and stop — the calculator says so instead of rounding up.', 'Gaps and slippage can make a loss larger than planned. Costs are not included.'],
    faqs: [
      { q: 'Why round down?', a: 'Rounding up would risk more than your chosen percentage.' },
      { q: 'Does this include spread and commission?', a: 'No. Add them separately with the spread cost calculator and the broker’s commission schedule.' },
    ],
    related: ['pip-calculator', 'stop-loss-take-profit-calculator', 'risk-reward-calculator'],
    guide: 'what-is-a-pip',
  },
  'margin-calculator': {
    intro: 'Estimate the margin a broker holds for a position from its notional value and the leverage applied.',
    formula: 'Notional (account) = L × C × price × R\nMargin = notional ÷ leverage',
    example: ['1 lot EUR/USD at 1.1000, contract 100,000, USD account, leverage 1:30:', 'Notional = 110,000 USD; margin = 110,000 ÷ 30 = 3,666.67 USD.'],
    assumptions: ['Brokers may use tiered margin, different rates per instrument, or require more margin around weekends and events.', 'Leverage available to you depends on the entity, jurisdiction and client classification.'],
    faqs: [
      { q: 'Which price should I use?', a: 'Use the current price of the instrument. For a pair like USD/JPY the notional is in yen and R converts it to your account currency.' },
      { q: 'Is margin a fee?', a: 'No. It is collateral held while the position is open; it returns to free margin when you close.' },
    ],
    related: ['leverage-calculator', 'pip-calculator', 'drawdown-calculator'],
    guide: 'forex-leverage-and-margin-explained',
  },
  'profit-calculator': {
    intro: 'Calculate the profit or loss between an opening and a closing price for a long or short position, before trading costs.',
    formula: 'P/L (account) = (close − open) × direction × C × L × R\nPips = (close − open) × direction ÷ p\ndirection: +1 buy, −1 sell',
    example: ['Buy 1 lot EUR/USD at 1.10000, close at 1.10500, USD account:', '(1.10500 − 1.10000) × 1 × 100,000 × 1 = 500.00 USD, a 50-pip move in your favour.'],
    assumptions: ['Spread, commission, swap and slippage are excluded.', 'R is applied at a single rate; in reality the conversion rate at closing may differ.'],
    faqs: [{ q: 'Why is a sell profit shown when the price falls?', a: 'Direction is −1 for a sell, so a falling price produces a positive result.' }],
    related: ['pip-calculator', 'risk-reward-calculator', 'swap-calculator'],
  },
  'risk-reward-calculator': {
    intro: 'Measure the distance to your stop and target and the resulting reward-to-risk ratio. Levels on the wrong side of the entry are rejected.',
    formula: 'Risk = |entry − stop|\nReward = |target − entry|\nRatio = reward ÷ risk',
    example: ['Buy at 1.10000, stop 1.09800, target 1.10400:', 'Risk 0.00200, reward 0.00400, ratio 2.00 : 1.'],
    assumptions: ['For a buy the stop must be below and the target above the entry; the reverse for a sell.', 'The ratio says nothing about how likely either level is to be reached.'],
    faqs: [{ q: 'What ratio is good?', a: 'There is no universal answer. Combine the ratio with a realistic win rate — see the break-even calculator.' }],
    related: ['break-even-calculator', 'stop-loss-take-profit-calculator', 'position-size-calculator'],
  },
  'stop-loss-take-profit-calculator': {
    intro: 'Turn stop and target distances — in pips/points or in account currency — into price levels for a long or short position.',
    formula: 'Stop = entry − direction × stop pips × p\nTarget = entry + direction × target pips × p\nMoney to pips: pips = amount ÷ (p × C × L × R)',
    example: ['Buy EUR/USD at 1.10000 with a 20-pip stop and 40-pip target: stop 1.09800, target 1.10400.', 'In money mode, 200 USD on 1 lot (10 USD per pip) is the same 20 pips.'],
    assumptions: ['Prices are shown to one decimal more than the pip size (fractional pips).', 'Stops are not guaranteed: gaps and fast markets can fill at worse prices.'],
    faqs: [{ q: 'Why use money mode?', a: 'To place a stop at a fixed account-currency loss for a given position size.' }],
    related: ['risk-reward-calculator', 'position-size-calculator', 'pip-calculator'],
  },
  'swap-calculator': {
    intro: 'Estimate overnight financing (swap) from a signed swap rate quoted in pips per lot per night. A negative rate is a charge, a positive rate a credit.',
    formula: 'Per lot per night = swap rate × p × C × R\nTotal = per lot per night × lots × chargeable nights\n(triple-swap night adds two extra nights)',
    example: ['Swap −0.5 pips per lot, 1 lot EUR/USD, 3 nights including the triple-swap night (5 chargeable nights):', '−0.5 × 0.0001 × 100,000 = −5.00 USD per night → −25.00 USD.'],
    assumptions: ['Brokers quote swaps in different conventions (pips, points, money or annual %). This tool expects pips per lot per night; convert other conventions first.', 'Which weekday carries the triple charge depends on the broker and instrument.', 'Swap rates change frequently; enter the current rate from your platform.'],
    faqs: [{ q: 'Why can swap be positive?', a: 'When the interest-rate differential and the broker’s mark-up favour the direction you hold, the broker may pay a credit.' }],
    related: ['pip-calculator', 'spread-cost-calculator', 'profit-calculator'],
  },
  'spread-cost-calculator': {
    intro: 'Estimate the cost of crossing a spread you enter. There is no live spread feed: actual spreads vary by time, liquidity and account.',
    formula: 'Cost = spread × p × C × L × R',
    example: ['A 1.0-pip spread on 1 lot EUR/USD with a USD account: 1.0 × 0.0001 × 100,000 × 1 = 10.00 USD.'],
    assumptions: ['Commission is separate and may be charged per side or round turn.', 'Advertised spreads are often minimums (“from”) or averages, not what every trade pays.'],
    faqs: [{ q: 'Where do I find a broker’s spread?', a: 'On its official pricing pages or in the platform. Verified spread statements appear on ForexInspect broker fee pages, with their scope.' }],
    related: ['pip-calculator', 'swap-calculator', 'profit-calculator'],
    guide: 'what-is-a-pip',
  },
  'leverage-calculator': {
    intro: 'See the effective leverage of a position relative to your equity, or the largest position a leverage limit allows.',
    formula: 'Effective leverage = (L × C × price × R) ÷ equity\nMaximum lots = equity × leverage ÷ (C × price × R), rounded down to the lot step',
    example: ['Equity 10,000 USD, 1 lot EUR/USD at 1.1000: notional 110,000 USD → effective leverage 11.00 : 1.', 'At a 1:30 limit: 10,000 × 30 ÷ 110,000 = 2.727… → 2.72 lots.'],
    assumptions: ['Using maximum leverage leaves no free margin for adverse price moves.', 'Leverage limits depend on the entity, jurisdiction, instrument and client type.'],
    faqs: [{ q: 'Is effective leverage the same as account leverage?', a: 'No. Account leverage is a limit; effective leverage measures how much exposure you actually hold.' }],
    related: ['margin-calculator', 'drawdown-calculator', 'position-size-calculator'],
    guide: 'forex-leverage-and-margin-explained',
  },
  'pivot-point-calculator': {
    intro: 'Calculate support and resistance levels from the previous session’s high, low and close using five common pivot methods.',
    formula:
      'Classic: P=(H+L+C)/3, R1=2P−L, S1=2P−H, R2=P+(H−L), S2=P−(H−L), R3=H+2(P−L), S3=L−2(H−P)\nWoodie: P=(H+L+2C)/4, then the Classic formulas\nCamarilla: C ± (H−L)×1.1 ÷ 12, 6, 4, 2 (R1–R4 / S1–S4); P is Classic\nFibonacci: P ± (H−L)×0.382, 0.618, 1.000\nDeMark: X = H+2L+C if C<O; 2H+L+C if C>O; else H+L+2C. P=X/4, R1=X/2−L, S1=X/2−H',
    example: ['H 110, L 100, C 105 (Classic): P 105, R1 110, S1 100, R2 115, S2 95, R3 120, S3 90.', 'DeMark with O 104 (C > O): X = 425, P 106.25, R1 112.5, S1 102.5.'],
    assumptions: ['Use the high, low and close of the same session; the session cut-off (server time zone) changes the result.', 'The close (and open for DeMark) must lie within the high–low range.', 'Levels are rounded to the decimals you choose.'],
    faqs: [{ q: 'Do pivots predict prices?', a: 'No. They are reference levels derived from past prices.' }],
    related: ['fibonacci-calculator', 'risk-reward-calculator'],
    guide: 'mt4-vs-mt5',
  },
  'fibonacci-calculator': {
    intro: 'Compute Fibonacci retracement (23.6%–78.6%) and extension (127.2%–261.8%) levels between a swing high and low.',
    formula: 'Upward swing: retracement = H − range × level; extension = L + range × level\nDownward swing: retracement = L + range × level; extension = H − range × level\nrange = H − L',
    example: ['Upward swing from 1.10000 to 1.12000 (range 0.02000):', '61.8% retracement = 1.12000 − 0.01236 = 1.10764; 161.8% extension = 1.10000 + 0.03236 = 1.13236.'],
    assumptions: ['The swing points are your choice; different swings give different levels.', 'Fibonacci levels are a charting convention, not predictions.'],
    faqs: [{ q: 'Why is 50% included?', a: 'It is a common midpoint convention, not a Fibonacci ratio.' }],
    related: ['pivot-point-calculator', 'risk-reward-calculator'],
  },
  'currency-converter': {
    intro: 'Convert amounts between USD, EUR, GBP, JPY, CHF, AUD, CAD and NZD using the European Central Bank’s daily euro reference rates, or a rate you enter.',
    formula: 'Cross rate (source → target) = (EUR→target) ÷ (EUR→source)\nConverted = amount × rate',
    example: ['With EUR/USD 1.1193 and EUR/GBP 0.83728: USD→GBP = 0.83728 ÷ 1.1193 = 0.748… so 1,000 USD ≈ 748.04 GBP.'],
    assumptions: ['ECB reference rates are published once per working day for information purposes; they are not tradable quotes and not what a broker or bank will charge.', 'Cross rates not involving EUR are derived and rounded — a modification of the published rates.', 'If no stored rate is available, enter your own.'],
    faqs: [
      { q: 'How often are rates updated?', a: 'ForexInspect checks every ten minutes for a new ECB effective date and stores each date once. Rates change only on ECB publication days.' },
      { q: 'Why does my bank give a different amount?', a: 'Banks and brokers apply their own rates and fees.' },
    ],
    related: ['pip-calculator', 'margin-calculator'],
  },
  'compounding-calculator': {
    intro: 'Show how a balance would grow at a constant rate per period with optional end-of-period deposits. This is arithmetic, not a forecast of trading returns.',
    formula: 'next = previous × (1 + rate ÷ 100) + deposit\n(rate > −100%, 1–600 whole periods)',
    example: ['10,000 at 1% per period for 12 periods: 10,000 × 1.01¹² = 11,268.25.', 'With 100 deposited at the end of each period: 12,536.50.'],
    assumptions: ['Real trading returns vary and can be negative; constant growth is unrealistic.', 'Taxes, fees and withdrawals are not modelled.', 'Values are rounded to 2 decimals for display; calculation uses exact decimals.'],
    faqs: [{ q: 'Can I enter a negative rate?', a: 'Yes, down to just above −100% per period, to see how repeated losses compound.' }],
    related: ['drawdown-calculator', 'break-even-calculator'],
  },
  'drawdown-calculator': {
    intro: 'See the percentage gain needed to recover from a loss. Recovery grows faster than the loss: halving an account needs a 100% gain to recover.',
    formula: 'Recovery % = (1 ÷ (1 − loss ÷ 100) − 1) × 100',
    example: ['A 20% drawdown needs (1 ÷ 0.8 − 1) × 100 = 25.00% to recover.', 'A 50% drawdown needs 100.00%.'],
    assumptions: ['Loss must be below 100%.', 'Costs and deposits are ignored.'],
    faqs: [{ q: 'Why is recovery larger than the loss?', a: 'The gain applies to a smaller balance than the one that suffered the loss.' }],
    related: ['compounding-calculator', 'leverage-calculator'],
    guide: 'forex-leverage-and-margin-explained',
  },
  'break-even-calculator': {
    intro: 'Find the win rate needed to break even for a reward-to-risk ratio, including trading costs expressed in units of risk (R).',
    formula: 'Win rate % = (1 + cost in R) ÷ (1 + reward/risk) × 100',
    example: ['Reward/risk 2, costs 0.1 R per trade: (1.1 ÷ 3) × 100 = 36.67%.'],
    assumptions: ['Every trade is assumed to end at either the target or the stop.', 'Cost in R = average costs per trade ÷ amount risked per trade.', 'If costs are so high that 100% or more would be needed, the result is rejected as impossible.'],
    faqs: [{ q: 'Where does the formula come from?', a: 'Setting expected value to zero: w × (RR − c) − (1 − w) × (1 + c) = 0 gives w = (1 + c) ÷ (1 + RR).' }],
    related: ['risk-reward-calculator', 'spread-cost-calculator'],
  },
};
