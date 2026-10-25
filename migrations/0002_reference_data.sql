-- Reference data: extraction field contract (extract-v4 / operator-v1),
-- platform codes and regulator directory entries. Directory entries do not
-- establish any broker licence or operational API (PRD §12.2).
INSERT INTO fact_definitions (field_key, label, topic, value_type, ttl_hours, core_topic, contract_version) VALUES
 ('account_type',          'Account type',              'accounts',  'text',    168, 'account_types',    'extract-v4'),
 ('minimum_deposit',       'Minimum deposit',           'accounts',  'decimal', 168, 'minimum_deposit',  'extract-v4'),
 ('minimum_lot_size',      'Minimum trade size',        'accounts',  'decimal', 168, NULL,               'extract-v4'),
 ('demo_account',          'Demo account',              'accounts',  'boolean', 720, NULL,               'extract-v4'),
 ('islamic_account',       'Swap-free (Islamic) account','accounts', 'boolean', 720, NULL,               'extract-v4'),
 ('eurusd_spread',         'EUR/USD spread',            'costs',     'decimal', 168, 'forex_spread',     'extract-v4'),
 ('trading_commission',    'Trading commission',        'costs',     'decimal', 168, 'trading_commission','extract-v4'),
 ('maximum_leverage',      'Maximum leverage',          'leverage',  'ratio',   168, 'maximum_leverage', 'extract-v4'),
 ('mt4_supported',         'MetaTrader 4',              'platforms', 'boolean', 720, NULL,               'extract-v4'),
 ('mt5_supported',         'MetaTrader 5',              'platforms', 'boolean', 720, NULL,               'extract-v4'),
 ('ctrader_supported',     'cTrader',                   'platforms', 'boolean', 720, NULL,               'extract-v4'),
 ('tradingview_supported', 'TradingView',               'platforms', 'boolean', 720, NULL,               'extract-v4'),
 ('copy_trading',          'Copy trading',              'platforms', 'boolean', 720, NULL,               'extract-v4'),
 ('legal_entity_name',     'Named company',             'entity',    'entity',  168, 'legal_entity',     'extract-v4'),
 ('operating_entity',      'Website operator',          'entity',    'entity',  168, 'legal_entity',     'operator-v1');

INSERT INTO platforms (code, name) VALUES
 ('MT4','MetaTrader 4'), ('MT5','MetaTrader 5'), ('CTRADER','cTrader'), ('TRADINGVIEW','TradingView');

INSERT INTO regulators (code, name, country, register_url, intake) VALUES
 ('ASIC', 'Australian Securities and Investments Commission', 'Australia', 'https://asic.gov.au/online-services/search-asic-s-registers/', 'APPROVED_FILE'),
 ('FCA', 'Financial Conduct Authority', 'United Kingdom', 'https://register.fca.org.uk/', 'CONDITIONAL_API'),
 ('CYSEC', 'Cyprus Securities and Exchange Commission', 'Cyprus', 'https://www.cysec.gov.cy/en-GB/entities/', 'DIRECTORY_ONLY'),
 ('FSCA', 'Financial Sector Conduct Authority', 'South Africa', 'https://www.fsca.co.za/Fais/Search_FSP.htm', 'DIRECTORY_ONLY'),
 ('DFSA', 'Dubai Financial Services Authority', 'United Arab Emirates', 'https://www.dfsa.ae/public-register', 'DIRECTORY_ONLY'),
 ('FSA_SC', 'Financial Services Authority (Seychelles)', 'Seychelles', 'https://fsaseychelles.sc/', 'DIRECTORY_ONLY');
