/**
 * Exactly 20 instruments and 8 account currencies (PRD §7.2). Contract sizes and
 * increments are *typical, editable* assumptions — actual broker specifications differ.
 */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export type InstrumentClass = 'FX' | 'Metal' | 'Crypto' | 'Index' | 'Stock';

export interface Instrument {
  symbol: string;
  label: string;
  cls: InstrumentClass;
  base: string;
  quote: Currency;
  contractSize: string;
  contractUnit: string;
  pipSize: string;
  pipName: 'pip' | 'point';
}

const fx = (base: string, quote: Currency): Instrument => ({
  symbol: `${base}/${quote}`,
  label: `${base}/${quote}`,
  cls: 'FX',
  base,
  quote,
  contractSize: '100000',
  contractUnit: `${base} units`,
  pipSize: quote === 'JPY' ? '0.01' : '0.0001',
  pipName: 'pip',
});

export const INSTRUMENTS: readonly Instrument[] = [
  fx('EUR', 'USD'),
  fx('GBP', 'USD'),
  fx('USD', 'JPY'),
  fx('USD', 'CHF'),
  fx('AUD', 'USD'),
  fx('USD', 'CAD'),
  fx('NZD', 'USD'),
  fx('EUR', 'GBP'),
  fx('EUR', 'JPY'),
  fx('GBP', 'JPY'),
  { symbol: 'XAU/USD', label: 'XAU/USD (gold)', cls: 'Metal', base: 'XAU', quote: 'USD', contractSize: '100', contractUnit: 'troy oz', pipSize: '0.01', pipName: 'point' },
  { symbol: 'BTC/USD', label: 'BTC/USD', cls: 'Crypto', base: 'BTC', quote: 'USD', contractSize: '1', contractUnit: 'coin', pipSize: '1', pipName: 'point' },
  { symbol: 'ETH/USD', label: 'ETH/USD', cls: 'Crypto', base: 'ETH', quote: 'USD', contractSize: '1', contractUnit: 'coin', pipSize: '0.1', pipName: 'point' },
  { symbol: 'SOL/USD', label: 'SOL/USD', cls: 'Crypto', base: 'SOL', quote: 'USD', contractSize: '1', contractUnit: 'coin', pipSize: '0.01', pipName: 'point' },
  { symbol: 'XRP/USD', label: 'XRP/USD', cls: 'Crypto', base: 'XRP', quote: 'USD', contractSize: '1', contractUnit: 'coin', pipSize: '0.0001', pipName: 'point' },
  { symbol: 'US500', label: 'US500 (index)', cls: 'Index', base: 'US500', quote: 'USD', contractSize: '1', contractUnit: 'per index point', pipSize: '1', pipName: 'point' },
  { symbol: 'NAS100', label: 'NAS100 (index)', cls: 'Index', base: 'NAS100', quote: 'USD', contractSize: '1', contractUnit: 'per index point', pipSize: '1', pipName: 'point' },
  { symbol: 'GER40', label: 'GER40 (index)', cls: 'Index', base: 'GER40', quote: 'EUR', contractSize: '1', contractUnit: 'per index point', pipSize: '1', pipName: 'point' },
  { symbol: 'AAPL', label: 'AAPL (share)', cls: 'Stock', base: 'AAPL', quote: 'USD', contractSize: '1', contractUnit: 'share', pipSize: '0.01', pipName: 'point' },
  { symbol: 'TSLA', label: 'TSLA (share)', cls: 'Stock', base: 'TSLA', quote: 'USD', contractSize: '1', contractUnit: 'share', pipSize: '0.01', pipName: 'point' },
];

export const instrumentBySymbol = (s: string): Instrument | undefined => INSTRUMENTS.find((i) => i.symbol === s);
