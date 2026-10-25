# HTTP smoke and acceptance report

Generated 2026-10-25T22:45:48.708Z. Main: `http://127.0.0.1:3417` (safe base: publication/integrations off). E2E: `http://127.0.0.1:3418` (isolated synthetic fixture database, publication on; fictional brokers, never production).

**555 / 555 checks passed.**

## main (publication off)

| Check | Result | Detail |
| --- | --- | --- |
| / → 200 | PASS | got 200 |
| / one h1 | PASS | 1 h1 |
| / title | PASS | ForexInspect — evidence-first forex broker research |
| / canonical self (https) | PASS | https://forexinspect.com |
| / main before footer | PASS |  |
| / JSON-LD parses | PASS | Organization |
| / no rating schema | PASS |  |
| / indexable | PASS | index, follow |
| / SSR contains “Broker research is in preparation” | PASS |  |
| / SSR contains “How a claim reaches a page” | PASS |  |
| / does not contain “challenges.cloudflare.com/turnstile” | PASS |  |
| / does not contain “googletagmanager.com” | PASS |  |
| / does not contain “Published brokers</dt>” | PASS |  |
| / JSON-LD Organization | PASS | Organization |
| / og/twitter | PASS |  |
| security headers | PASS |  |
| no x-powered-by | PASS |  |
| /brokers → 200 | PASS | got 200 |
| /brokers one h1 | PASS | 1 h1 |
| /brokers title | PASS | Forex broker directory: verified evidence by topic \| ForexInspect |
| /brokers canonical self (https) | PASS | https://forexinspect.com/brokers |
| /brokers main before footer | PASS |  |
| /brokers JSON-LD parses | PASS | BreadcrumbList |
| /brokers no rating schema | PASS |  |
| /brokers noindex | PASS | noindex, follow |
| /brokers SSR contains “No broker profiles are published yet” | PASS |  |
| /brokers og/twitter | PASS |  |
| /compare → 200 | PASS | got 200 |
| /compare one h1 | PASS | 1 h1 |
| /compare title | PASS | Forex broker comparisons from verified evidence \| ForexInspect |
| /compare canonical self (https) | PASS | https://forexinspect.com/compare |
| /compare main before footer | PASS |  |
| /compare JSON-LD parses | PASS | BreadcrumbList |
| /compare no rating schema | PASS |  |
| /compare noindex | PASS | noindex, follow |
| /compare og/twitter | PASS |  |
| /sources → 200 | PASS | got 200 |
| /sources one h1 | PASS | 1 h1 |
| /sources title | PASS | Sources: official pages cited by ForexInspect \| ForexInspect |
| /sources canonical self (https) | PASS | https://forexinspect.com/sources |
| /sources main before footer | PASS |  |
| /sources JSON-LD parses | PASS | BreadcrumbList |
| /sources no rating schema | PASS |  |
| /sources noindex | PASS | noindex, follow |
| /sources SSR contains “European Central Bank” | PASS |  |
| /sources og/twitter | PASS |  |
| /brokers/pepperstone → 404 | PASS | got 404 |
| /brokers/pepperstone 404 is noindex | PASS | noindex |
| /brokers/pepperstone/fees → 404 | PASS | got 404 |
| /brokers/pepperstone/fees 404 is noindex | PASS | noindex |
| /compare/fxpro-vs-pepperstone → 404 | PASS | got 404 |
| /compare/fxpro-vs-pepperstone 404 is noindex | PASS | noindex |
| /tools/not-a-tool → 404 | PASS | got 404 |
| /tools/not-a-tool 404 is noindex | PASS | noindex |
| /tools → 200 | PASS | got 200 |
| /tools one h1 | PASS | 1 h1 |
| /tools title | PASS | Forex calculators: pip, position size, margin and more \| ForexInspect |
| /tools canonical self (https) | PASS | https://forexinspect.com/tools |
| /tools main before footer | PASS |  |
| /tools JSON-LD parses | PASS | BreadcrumbList, ItemList |
| /tools no rating schema | PASS |  |
| /tools indexable | PASS | index, follow |
| /tools SSR contains “Trade sizing” | PASS |  |
| /tools JSON-LD ItemList | PASS | BreadcrumbList, ItemList |
| /tools JSON-LD BreadcrumbList | PASS | BreadcrumbList, ItemList |
| /tools og/twitter | PASS |  |
| /tools/pip-calculator → 200 | PASS | got 200 |
| /tools/pip-calculator one h1 | PASS | 1 h1 |
| /tools/pip-calculator title | PASS | Pip Value Calculator \| ForexInspect |
| /tools/pip-calculator canonical self (https) | PASS | https://forexinspect.com/tools/pip-calculator |
| /tools/pip-calculator main before footer | PASS |  |
| /tools/pip-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/pip-calculator no rating schema | PASS |  |
| /tools/pip-calculator indexable | PASS | index, follow |
| /tools/pip-calculator SSR contains “Formula” | PASS |  |
| /tools/pip-calculator SSR contains “Worked example” | PASS |  |
| /tools/pip-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/pip-calculator SSR contains “Result” | PASS |  |
| /tools/pip-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/pip-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/pip-calculator og/twitter | PASS |  |
| /tools/position-size-calculator → 200 | PASS | got 200 |
| /tools/position-size-calculator one h1 | PASS | 1 h1 |
| /tools/position-size-calculator title | PASS | Position Size Calculator \| ForexInspect |
| /tools/position-size-calculator canonical self (https) | PASS | https://forexinspect.com/tools/position-size-calculator |
| /tools/position-size-calculator main before footer | PASS |  |
| /tools/position-size-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/position-size-calculator no rating schema | PASS |  |
| /tools/position-size-calculator indexable | PASS | index, follow |
| /tools/position-size-calculator SSR contains “Formula” | PASS |  |
| /tools/position-size-calculator SSR contains “Worked example” | PASS |  |
| /tools/position-size-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/position-size-calculator SSR contains “Result” | PASS |  |
| /tools/position-size-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/position-size-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/position-size-calculator og/twitter | PASS |  |
| /tools/margin-calculator → 200 | PASS | got 200 |
| /tools/margin-calculator one h1 | PASS | 1 h1 |
| /tools/margin-calculator title | PASS | Margin Calculator \| ForexInspect |
| /tools/margin-calculator canonical self (https) | PASS | https://forexinspect.com/tools/margin-calculator |
| /tools/margin-calculator main before footer | PASS |  |
| /tools/margin-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/margin-calculator no rating schema | PASS |  |
| /tools/margin-calculator indexable | PASS | index, follow |
| /tools/margin-calculator SSR contains “Formula” | PASS |  |
| /tools/margin-calculator SSR contains “Worked example” | PASS |  |
| /tools/margin-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/margin-calculator SSR contains “Result” | PASS |  |
| /tools/margin-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/margin-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/margin-calculator og/twitter | PASS |  |
| /tools/profit-calculator → 200 | PASS | got 200 |
| /tools/profit-calculator one h1 | PASS | 1 h1 |
| /tools/profit-calculator title | PASS | Profit and Loss Calculator \| ForexInspect |
| /tools/profit-calculator canonical self (https) | PASS | https://forexinspect.com/tools/profit-calculator |
| /tools/profit-calculator main before footer | PASS |  |
| /tools/profit-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/profit-calculator no rating schema | PASS |  |
| /tools/profit-calculator indexable | PASS | index, follow |
| /tools/profit-calculator SSR contains “Formula” | PASS |  |
| /tools/profit-calculator SSR contains “Worked example” | PASS |  |
| /tools/profit-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/profit-calculator SSR contains “Result” | PASS |  |
| /tools/profit-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/profit-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/profit-calculator og/twitter | PASS |  |
| /tools/risk-reward-calculator → 200 | PASS | got 200 |
| /tools/risk-reward-calculator one h1 | PASS | 1 h1 |
| /tools/risk-reward-calculator title | PASS | Risk/Reward Ratio Calculator \| ForexInspect |
| /tools/risk-reward-calculator canonical self (https) | PASS | https://forexinspect.com/tools/risk-reward-calculator |
| /tools/risk-reward-calculator main before footer | PASS |  |
| /tools/risk-reward-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/risk-reward-calculator no rating schema | PASS |  |
| /tools/risk-reward-calculator indexable | PASS | index, follow |
| /tools/risk-reward-calculator SSR contains “Formula” | PASS |  |
| /tools/risk-reward-calculator SSR contains “Worked example” | PASS |  |
| /tools/risk-reward-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/risk-reward-calculator SSR contains “Result” | PASS |  |
| /tools/risk-reward-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/risk-reward-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/risk-reward-calculator og/twitter | PASS |  |
| /tools/stop-loss-take-profit-calculator → 200 | PASS | got 200 |
| /tools/stop-loss-take-profit-calculator one h1 | PASS | 1 h1 |
| /tools/stop-loss-take-profit-calculator title | PASS | Stop-Loss and Take-Profit Calculator \| ForexInspect |
| /tools/stop-loss-take-profit-calculator canonical self (https) | PASS | https://forexinspect.com/tools/stop-loss-take-profit-calculator |
| /tools/stop-loss-take-profit-calculator main before footer | PASS |  |
| /tools/stop-loss-take-profit-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/stop-loss-take-profit-calculator no rating schema | PASS |  |
| /tools/stop-loss-take-profit-calculator indexable | PASS | index, follow |
| /tools/stop-loss-take-profit-calculator SSR contains “Formula” | PASS |  |
| /tools/stop-loss-take-profit-calculator SSR contains “Worked example” | PASS |  |
| /tools/stop-loss-take-profit-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/stop-loss-take-profit-calculator SSR contains “Result” | PASS |  |
| /tools/stop-loss-take-profit-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/stop-loss-take-profit-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/stop-loss-take-profit-calculator og/twitter | PASS |  |
| /tools/swap-calculator → 200 | PASS | got 200 |
| /tools/swap-calculator one h1 | PASS | 1 h1 |
| /tools/swap-calculator title | PASS | Swap (Overnight Financing) Calculator \| ForexInspect |
| /tools/swap-calculator canonical self (https) | PASS | https://forexinspect.com/tools/swap-calculator |
| /tools/swap-calculator main before footer | PASS |  |
| /tools/swap-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/swap-calculator no rating schema | PASS |  |
| /tools/swap-calculator indexable | PASS | index, follow |
| /tools/swap-calculator SSR contains “Formula” | PASS |  |
| /tools/swap-calculator SSR contains “Worked example” | PASS |  |
| /tools/swap-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/swap-calculator SSR contains “Result” | PASS |  |
| /tools/swap-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/swap-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/swap-calculator og/twitter | PASS |  |
| /tools/spread-cost-calculator → 200 | PASS | got 200 |
| /tools/spread-cost-calculator one h1 | PASS | 1 h1 |
| /tools/spread-cost-calculator title | PASS | Spread Cost Calculator \| ForexInspect |
| /tools/spread-cost-calculator canonical self (https) | PASS | https://forexinspect.com/tools/spread-cost-calculator |
| /tools/spread-cost-calculator main before footer | PASS |  |
| /tools/spread-cost-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/spread-cost-calculator no rating schema | PASS |  |
| /tools/spread-cost-calculator indexable | PASS | index, follow |
| /tools/spread-cost-calculator SSR contains “Formula” | PASS |  |
| /tools/spread-cost-calculator SSR contains “Worked example” | PASS |  |
| /tools/spread-cost-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/spread-cost-calculator SSR contains “Result” | PASS |  |
| /tools/spread-cost-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/spread-cost-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/spread-cost-calculator og/twitter | PASS |  |
| /tools/leverage-calculator → 200 | PASS | got 200 |
| /tools/leverage-calculator one h1 | PASS | 1 h1 |
| /tools/leverage-calculator title | PASS | Leverage Calculator \| ForexInspect |
| /tools/leverage-calculator canonical self (https) | PASS | https://forexinspect.com/tools/leverage-calculator |
| /tools/leverage-calculator main before footer | PASS |  |
| /tools/leverage-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/leverage-calculator no rating schema | PASS |  |
| /tools/leverage-calculator indexable | PASS | index, follow |
| /tools/leverage-calculator SSR contains “Formula” | PASS |  |
| /tools/leverage-calculator SSR contains “Worked example” | PASS |  |
| /tools/leverage-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/leverage-calculator SSR contains “Result” | PASS |  |
| /tools/leverage-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/leverage-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/leverage-calculator og/twitter | PASS |  |
| /tools/pivot-point-calculator → 200 | PASS | got 200 |
| /tools/pivot-point-calculator one h1 | PASS | 1 h1 |
| /tools/pivot-point-calculator title | PASS | Pivot Point Calculator \| ForexInspect |
| /tools/pivot-point-calculator canonical self (https) | PASS | https://forexinspect.com/tools/pivot-point-calculator |
| /tools/pivot-point-calculator main before footer | PASS |  |
| /tools/pivot-point-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/pivot-point-calculator no rating schema | PASS |  |
| /tools/pivot-point-calculator indexable | PASS | index, follow |
| /tools/pivot-point-calculator SSR contains “Formula” | PASS |  |
| /tools/pivot-point-calculator SSR contains “Worked example” | PASS |  |
| /tools/pivot-point-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/pivot-point-calculator SSR contains “Result” | PASS |  |
| /tools/pivot-point-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/pivot-point-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/pivot-point-calculator og/twitter | PASS |  |
| /tools/fibonacci-calculator → 200 | PASS | got 200 |
| /tools/fibonacci-calculator one h1 | PASS | 1 h1 |
| /tools/fibonacci-calculator title | PASS | Fibonacci Retracement and Extension Calculator \| ForexInspect |
| /tools/fibonacci-calculator canonical self (https) | PASS | https://forexinspect.com/tools/fibonacci-calculator |
| /tools/fibonacci-calculator main before footer | PASS |  |
| /tools/fibonacci-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/fibonacci-calculator no rating schema | PASS |  |
| /tools/fibonacci-calculator indexable | PASS | index, follow |
| /tools/fibonacci-calculator SSR contains “Formula” | PASS |  |
| /tools/fibonacci-calculator SSR contains “Worked example” | PASS |  |
| /tools/fibonacci-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/fibonacci-calculator SSR contains “Result” | PASS |  |
| /tools/fibonacci-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/fibonacci-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/fibonacci-calculator og/twitter | PASS |  |
| /tools/currency-converter → 200 | PASS | got 200 |
| /tools/currency-converter one h1 | PASS | 1 h1 |
| /tools/currency-converter title | PASS | Currency Converter (ECB Reference Rates) \| ForexInspect |
| /tools/currency-converter canonical self (https) | PASS | https://forexinspect.com/tools/currency-converter |
| /tools/currency-converter main before footer | PASS |  |
| /tools/currency-converter JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/currency-converter no rating schema | PASS |  |
| /tools/currency-converter indexable | PASS | index, follow |
| /tools/currency-converter SSR contains “Formula” | PASS |  |
| /tools/currency-converter SSR contains “Worked example” | PASS |  |
| /tools/currency-converter SSR contains “Reset inputs” | PASS |  |
| /tools/currency-converter SSR contains “Result” | PASS |  |
| /tools/currency-converter JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/currency-converter JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/currency-converter og/twitter | PASS |  |
| /tools/compounding-calculator → 200 | PASS | got 200 |
| /tools/compounding-calculator one h1 | PASS | 1 h1 |
| /tools/compounding-calculator title | PASS | Compounding Calculator \| ForexInspect |
| /tools/compounding-calculator canonical self (https) | PASS | https://forexinspect.com/tools/compounding-calculator |
| /tools/compounding-calculator main before footer | PASS |  |
| /tools/compounding-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/compounding-calculator no rating schema | PASS |  |
| /tools/compounding-calculator indexable | PASS | index, follow |
| /tools/compounding-calculator SSR contains “Formula” | PASS |  |
| /tools/compounding-calculator SSR contains “Worked example” | PASS |  |
| /tools/compounding-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/compounding-calculator SSR contains “Result” | PASS |  |
| /tools/compounding-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/compounding-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/compounding-calculator og/twitter | PASS |  |
| /tools/drawdown-calculator → 200 | PASS | got 200 |
| /tools/drawdown-calculator one h1 | PASS | 1 h1 |
| /tools/drawdown-calculator title | PASS | Drawdown Recovery Calculator \| ForexInspect |
| /tools/drawdown-calculator canonical self (https) | PASS | https://forexinspect.com/tools/drawdown-calculator |
| /tools/drawdown-calculator main before footer | PASS |  |
| /tools/drawdown-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/drawdown-calculator no rating schema | PASS |  |
| /tools/drawdown-calculator indexable | PASS | index, follow |
| /tools/drawdown-calculator SSR contains “Formula” | PASS |  |
| /tools/drawdown-calculator SSR contains “Worked example” | PASS |  |
| /tools/drawdown-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/drawdown-calculator SSR contains “Result” | PASS |  |
| /tools/drawdown-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/drawdown-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/drawdown-calculator og/twitter | PASS |  |
| /tools/break-even-calculator → 200 | PASS | got 200 |
| /tools/break-even-calculator one h1 | PASS | 1 h1 |
| /tools/break-even-calculator title | PASS | Break-Even Win Rate Calculator \| ForexInspect |
| /tools/break-even-calculator canonical self (https) | PASS | https://forexinspect.com/tools/break-even-calculator |
| /tools/break-even-calculator main before footer | PASS |  |
| /tools/break-even-calculator JSON-LD parses | PASS | BreadcrumbList, WebApplication |
| /tools/break-even-calculator no rating schema | PASS |  |
| /tools/break-even-calculator indexable | PASS | index, follow |
| /tools/break-even-calculator SSR contains “Formula” | PASS |  |
| /tools/break-even-calculator SSR contains “Worked example” | PASS |  |
| /tools/break-even-calculator SSR contains “Reset inputs” | PASS |  |
| /tools/break-even-calculator SSR contains “Result” | PASS |  |
| /tools/break-even-calculator JSON-LD WebApplication | PASS | BreadcrumbList, WebApplication |
| /tools/break-even-calculator JSON-LD BreadcrumbList | PASS | BreadcrumbList, WebApplication |
| /tools/break-even-calculator og/twitter | PASS |  |
| /guides → 200 | PASS | got 200 |
| /guides one h1 | PASS | 1 h1 |
| /guides title | PASS | Forex guides: pips, leverage, MT4 vs MT5 \| ForexInspect |
| /guides canonical self (https) | PASS | https://forexinspect.com/guides |
| /guides main before footer | PASS |  |
| /guides JSON-LD parses | PASS | BreadcrumbList |
| /guides no rating schema | PASS |  |
| /guides indexable | PASS | index, follow |
| /guides og/twitter | PASS |  |
| /guides/what-is-a-pip → 200 | PASS | got 200 |
| /guides/what-is-a-pip one h1 | PASS | 1 h1 |
| /guides/what-is-a-pip title | PASS | What is a pip? Pips, points and pip value explained \| ForexInspect |
| /guides/what-is-a-pip canonical self (https) | PASS | https://forexinspect.com/guides/what-is-a-pip |
| /guides/what-is-a-pip main before footer | PASS |  |
| /guides/what-is-a-pip JSON-LD parses | PASS | BreadcrumbList, Article |
| /guides/what-is-a-pip no rating schema | PASS |  |
| /guides/what-is-a-pip indexable | PASS | index, follow |
| /guides/what-is-a-pip SSR contains “The pip and its decimal convention” | PASS |  |
| /guides/what-is-a-pip JSON-LD Article | PASS | BreadcrumbList, Article |
| /guides/what-is-a-pip JSON-LD BreadcrumbList | PASS | BreadcrumbList, Article |
| /guides/what-is-a-pip og/twitter | PASS |  |
| /guides/forex-leverage-and-margin-explained → 200 | PASS | got 200 |
| /guides/forex-leverage-and-margin-explained one h1 | PASS | 1 h1 |
| /guides/forex-leverage-and-margin-explained title | PASS | Forex leverage and margin explained \| ForexInspect |
| /guides/forex-leverage-and-margin-explained canonical self (https) | PASS | https://forexinspect.com/guides/forex-leverage-and-margin-explained |
| /guides/forex-leverage-and-margin-explained main before footer | PASS |  |
| /guides/forex-leverage-and-margin-explained JSON-LD parses | PASS | BreadcrumbList, Article |
| /guides/forex-leverage-and-margin-explained no rating schema | PASS |  |
| /guides/forex-leverage-and-margin-explained indexable | PASS | index, follow |
| /guides/forex-leverage-and-margin-explained SSR contains “Leverage ratios” | PASS |  |
| /guides/forex-leverage-and-margin-explained JSON-LD Article | PASS | BreadcrumbList, Article |
| /guides/forex-leverage-and-margin-explained JSON-LD BreadcrumbList | PASS | BreadcrumbList, Article |
| /guides/forex-leverage-and-margin-explained og/twitter | PASS |  |
| /guides/mt4-vs-mt5 → 200 | PASS | got 200 |
| /guides/mt4-vs-mt5 one h1 | PASS | 1 h1 |
| /guides/mt4-vs-mt5 title | PASS | MT4 vs MT5: differences between MetaTrader 4 and 5 \| ForexInspect |
| /guides/mt4-vs-mt5 canonical self (https) | PASS | https://forexinspect.com/guides/mt4-vs-mt5 |
| /guides/mt4-vs-mt5 main before footer | PASS |  |
| /guides/mt4-vs-mt5 JSON-LD parses | PASS | BreadcrumbList, Article |
| /guides/mt4-vs-mt5 no rating schema | PASS |  |
| /guides/mt4-vs-mt5 indexable | PASS | index, follow |
| /guides/mt4-vs-mt5 SSR contains “Platform concepts” | PASS |  |
| /guides/mt4-vs-mt5 JSON-LD Article | PASS | BreadcrumbList, Article |
| /guides/mt4-vs-mt5 JSON-LD BreadcrumbList | PASS | BreadcrumbList, Article |
| /guides/mt4-vs-mt5 og/twitter | PASS |  |
| /guides/how-to-choose-a-forex-broker → 200 | PASS | got 200 |
| /guides/how-to-choose-a-forex-broker one h1 | PASS | 1 h1 |
| /guides/how-to-choose-a-forex-broker title | PASS | How to choose a forex broker: an evidence checklist \| ForexInspect |
| /guides/how-to-choose-a-forex-broker canonical self (https) | PASS | https://forexinspect.com/guides/how-to-choose-a-forex-broker |
| /guides/how-to-choose-a-forex-broker main before footer | PASS |  |
| /guides/how-to-choose-a-forex-broker JSON-LD parses | PASS | BreadcrumbList, Article |
| /guides/how-to-choose-a-forex-broker no rating schema | PASS |  |
| /guides/how-to-choose-a-forex-broker indexable | PASS | index, follow |
| /guides/how-to-choose-a-forex-broker SSR contains “1. Identify the company that would hold ” | PASS |  |
| /guides/how-to-choose-a-forex-broker JSON-LD Article | PASS | BreadcrumbList, Article |
| /guides/how-to-choose-a-forex-broker JSON-LD BreadcrumbList | PASS | BreadcrumbList, Article |
| /guides/how-to-choose-a-forex-broker og/twitter | PASS |  |
| /methodology → 200 | PASS | got 200 |
| /methodology one h1 | PASS | 1 h1 |
| /methodology title | PASS | Methodology: how ForexInspect verifies broker evidence \| ForexInspect |
| /methodology canonical self (https) | PASS | https://forexinspect.com/methodology |
| /methodology main before footer | PASS |  |
| /methodology JSON-LD parses | PASS | BreadcrumbList |
| /methodology no rating schema | PASS |  |
| /methodology indexable | PASS | index, follow |
| /methodology og/twitter | PASS |  |
| /about → 200 | PASS | got 200 |
| /about one h1 | PASS | 1 h1 |
| /about title | PASS | About ForexInspect \| ForexInspect |
| /about canonical self (https) | PASS | https://forexinspect.com/about |
| /about main before footer | PASS |  |
| /about JSON-LD parses | PASS | BreadcrumbList |
| /about no rating schema | PASS |  |
| /about indexable | PASS | index, follow |
| /about og/twitter | PASS |  |
| /contact → 200 | PASS | got 200 |
| /contact one h1 | PASS | 1 h1 |
| /contact title | PASS | Contact ForexInspect \| ForexInspect |
| /contact canonical self (https) | PASS | https://forexinspect.com/contact |
| /contact main before footer | PASS |  |
| /contact JSON-LD parses | PASS | BreadcrumbList |
| /contact no rating schema | PASS |  |
| /contact indexable | PASS | index, follow |
| /contact og/twitter | PASS |  |
| /corrections → 200 | PASS | got 200 |
| /corrections one h1 | PASS | 1 h1 |
| /corrections title | PASS | Corrections \| ForexInspect |
| /corrections canonical self (https) | PASS | https://forexinspect.com/corrections |
| /corrections main before footer | PASS |  |
| /corrections JSON-LD parses | PASS | BreadcrumbList |
| /corrections no rating schema | PASS |  |
| /corrections indexable | PASS | index, follow |
| /corrections og/twitter | PASS |  |
| /ai-policy → 200 | PASS | got 200 |
| /ai-policy one h1 | PASS | 1 h1 |
| /ai-policy title | PASS | AI policy: where models are used and their limits \| ForexInspect |
| /ai-policy canonical self (https) | PASS | https://forexinspect.com/ai-policy |
| /ai-policy main before footer | PASS |  |
| /ai-policy JSON-LD parses | PASS | BreadcrumbList |
| /ai-policy no rating schema | PASS |  |
| /ai-policy indexable | PASS | index, follow |
| /ai-policy og/twitter | PASS |  |
| /affiliate-disclosure → 200 | PASS | got 200 |
| /affiliate-disclosure one h1 | PASS | 1 h1 |
| /affiliate-disclosure title | PASS | Commercial and affiliate disclosure \| ForexInspect |
| /affiliate-disclosure canonical self (https) | PASS | https://forexinspect.com/affiliate-disclosure |
| /affiliate-disclosure main before footer | PASS |  |
| /affiliate-disclosure JSON-LD parses | PASS | BreadcrumbList |
| /affiliate-disclosure no rating schema | PASS |  |
| /affiliate-disclosure indexable | PASS | index, follow |
| /affiliate-disclosure og/twitter | PASS |  |
| /privacy → 200 | PASS | got 200 |
| /privacy one h1 | PASS | 1 h1 |
| /privacy title | PASS | Privacy notice \| ForexInspect |
| /privacy canonical self (https) | PASS | https://forexinspect.com/privacy |
| /privacy main before footer | PASS |  |
| /privacy JSON-LD parses | PASS | BreadcrumbList |
| /privacy no rating schema | PASS |  |
| /privacy indexable | PASS | index, follow |
| /privacy og/twitter | PASS |  |
| /risk-disclosure → 200 | PASS | got 200 |
| /risk-disclosure one h1 | PASS | 1 h1 |
| /risk-disclosure title | PASS | Risk disclosure \| ForexInspect |
| /risk-disclosure canonical self (https) | PASS | https://forexinspect.com/risk-disclosure |
| /risk-disclosure main before footer | PASS |  |
| /risk-disclosure JSON-LD parses | PASS | BreadcrumbList |
| /risk-disclosure no rating schema | PASS |  |
| /risk-disclosure indexable | PASS | index, follow |
| /risk-disclosure og/twitter | PASS |  |
| /disclaimer → 200 | PASS | got 200 |
| /disclaimer one h1 | PASS | 1 h1 |
| /disclaimer title | PASS | Disclaimer \| ForexInspect |
| /disclaimer canonical self (https) | PASS | https://forexinspect.com/disclaimer |
| /disclaimer main before footer | PASS |  |
| /disclaimer JSON-LD parses | PASS | BreadcrumbList |
| /disclaimer no rating schema | PASS |  |
| /disclaimer indexable | PASS | index, follow |
| /disclaimer og/twitter | PASS |  |
| /warnings → 200 | PASS | got 200 |
| /warnings one h1 | PASS | 1 h1 |
| /warnings title | PASS | Warnings: common forex broker red flags \| ForexInspect |
| /warnings canonical self (https) | PASS | https://forexinspect.com/warnings |
| /warnings main before footer | PASS |  |
| /warnings JSON-LD parses | PASS | BreadcrumbList |
| /warnings no rating schema | PASS |  |
| /warnings indexable | PASS | index, follow |
| /warnings og/twitter | PASS |  |
| trailing slash → 308 | PASS | 308 /brokers |
| /admin unauthorized → 404 noindex no-store | PASS | 404 noindex, nofollow no-store |
| /admin/assets unauthorized → 404 noindex no-store | PASS | 404 noindex, nofollow no-store |
| /preview unauthorized → 404 noindex no-store | PASS | 404 noindex, nofollow no-store |
| /preview/brokers/example-markets-fixture unauthorized → 404 noindex no-store | PASS | 404 noindex, nofollow no-store |
| /admin with wrong bearer → 404 | PASS |  |
| /admin with valid bearer → 200, noindex, no-store | PASS | 200 |
| authenticated synthetic preview renders through the profile template | PASS | 200 |
| asset audit lists text-fallback state | PASS | 200 |
| login page exists only when ADMIN_TOKEN configured, noindex | PASS |  |
| cross-origin login POST rejected (CSRF) | PASS |  |
| same-origin login sets HttpOnly SameSite=Strict session | PASS |  |
| session cookie authorizes admin | PASS |  |
| public pages never show synthetic fixtures | PASS |  |
| POST /api/ask with gates off → 404 no-store | PASS | 404 |
| /api/reference-rates dated, no-store | PASS | {"date":"2026-10-23","fetchedAt":"2026-10-25T22:15:27.259Z","eurRates":{"USD":"1 |
| /health ok, no-store, publication off | PASS |  |
| robots.txt disallows private routes + sitemap | PASS |  |
| sitemap excludes empty directories and private routes | PASS | 32 urls |
| sitemap has 15 tools + 4 guides | PASS |  |
| sitemap lastmod on every url | PASS |  |
| llms.txt navigation | PASS |  |

## e2e synthetic (publication on)

| Check | Result | Detail |
| --- | --- | --- |
| /brokers/alpha-fixture-markets → 200 | PASS | got 200 |
| /brokers/alpha-fixture-markets one h1 | PASS | 1 h1 |
| /brokers/alpha-fixture-markets title | PASS | Alpha Fixture Markets: verified broker evidence \| ForexInspect |
| /brokers/alpha-fixture-markets canonical self (https) | PASS | https://forexinspect.com/brokers/alpha-fixture-markets |
| /brokers/alpha-fixture-markets main before footer | PASS |  |
| /brokers/alpha-fixture-markets JSON-LD parses | PASS | BreadcrumbList, Article |
| /brokers/alpha-fixture-markets no rating schema | PASS |  |
| /brokers/alpha-fixture-markets indexable | PASS | index, follow |
| /brokers/alpha-fixture-markets SSR contains “100 USD” | PASS |  |
| /brokers/alpha-fixture-markets SSR contains “id="fact-” | PASS |  |
| /brokers/alpha-fixture-markets SSR contains “www.alpha-fixture-markets.invalid” | PASS |  |
| /brokers/alpha-fixture-markets SSR contains “What we could not verify” | PASS |  |
| /brokers/alpha-fixture-markets SSR contains “Not verified” | PASS |  |
| /brokers/alpha-fixture-markets SSR contains “Revision history” | PASS |  |
| /brokers/alpha-fixture-markets SSR contains “Named by broker” | PASS |  |
| /brokers/alpha-fixture-markets SSR contains “No licence has been independently matche” | PASS |  |
| /brokers/alpha-fixture-markets JSON-LD Article | PASS | BreadcrumbList, Article |
| /brokers/alpha-fixture-markets JSON-LD BreadcrumbList | PASS | BreadcrumbList, Article |
| /brokers/alpha-fixture-markets og/twitter | PASS |  |
| profile fact anchors are stable fact-<observationId> | PASS |  |
| profile shows distinct observed/verified/re-check dates | PASS |  |
| /brokers/alpha-fixture-markets/fees → 200 | PASS | got 200 |
| /brokers/alpha-fixture-markets/fees one h1 | PASS | 1 h1 |
| /brokers/alpha-fixture-markets/fees title | PASS | Alpha Fixture Markets spreads and commissions \| ForexInspect |
| /brokers/alpha-fixture-markets/fees canonical self (https) | PASS | https://forexinspect.com/brokers/alpha-fixture-markets/fees |
| /brokers/alpha-fixture-markets/fees main before footer | PASS |  |
| /brokers/alpha-fixture-markets/fees JSON-LD parses | PASS | BreadcrumbList |
| /brokers/alpha-fixture-markets/fees no rating schema | PASS |  |
| /brokers/alpha-fixture-markets/fees indexable | PASS | index, follow |
| /brokers/alpha-fixture-markets/fees SSR contains “EUR/USD spreads” | PASS |  |
| /brokers/alpha-fixture-markets/fees SSR contains “Complete cost basis” | PASS |  |
| /brokers/alpha-fixture-markets/fees SSR contains “Fees not verified” | PASS |  |
| /brokers/alpha-fixture-markets/fees og/twitter | PASS |  |
| /brokers/alpha-fixture-markets/accounts → 200 | PASS | got 200 |
| /brokers/alpha-fixture-markets/accounts one h1 | PASS | 1 h1 |
| /brokers/alpha-fixture-markets/accounts title | PASS | Alpha Fixture Markets account types compared \| ForexInspect |
| /brokers/alpha-fixture-markets/accounts canonical self (https) | PASS | https://forexinspect.com/brokers/alpha-fixture-markets/accounts |
| /brokers/alpha-fixture-markets/accounts main before footer | PASS |  |
| /brokers/alpha-fixture-markets/accounts JSON-LD parses | PASS | BreadcrumbList |
| /brokers/alpha-fixture-markets/accounts no rating schema | PASS |  |
| /brokers/alpha-fixture-markets/accounts indexable | PASS | index, follow |
| /brokers/alpha-fixture-markets/accounts SSR contains “Conditions by account” | PASS |  |
| /brokers/alpha-fixture-markets/accounts SSR contains “Standard versus Raw” | PASS |  |
| /brokers/alpha-fixture-markets/accounts og/twitter | PASS |  |
| /brokers → 200 | PASS | got 200 |
| /brokers one h1 | PASS | 1 h1 |
| /brokers title | PASS | Forex broker directory: verified evidence by topic \| ForexInspect |
| /brokers canonical self (https) | PASS | https://forexinspect.com/brokers |
| /brokers main before footer | PASS |  |
| /brokers JSON-LD parses | PASS | BreadcrumbList, ItemList |
| /brokers no rating schema | PASS |  |
| /brokers indexable | PASS | index, follow |
| /brokers SSR contains “Alpha Fixture Markets” | PASS |  |
| /brokers SSR contains “Core topic coverage” | PASS |  |
| /brokers JSON-LD ItemList | PASS | BreadcrumbList, ItemList |
| /brokers og/twitter | PASS |  |
| directory ItemList order = visible alphabetical order | PASS |  |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets → 200 | PASS | got 200 |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets one h1 | PASS | 1 h1 |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets title | PASS | Alpha Fixture Markets vs Beta Fixture Markets: verified evidence \| ForexInspect |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets canonical self (https) | PASS | https://forexinspect.com/compare/alpha-fixture-markets-vs-beta-fixture-markets |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets main before footer | PASS |  |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets JSON-LD parses | PASS | BreadcrumbList, Article |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets no rating schema | PASS |  |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets indexable | PASS | index, follow |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets SSR contains “Shared verified fields” | PASS |  |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets SSR contains “names no winner” | PASS |  |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets JSON-LD Article | PASS | BreadcrumbList, Article |
| /compare/alpha-fixture-markets-vs-beta-fixture-markets og/twitter | PASS |  |
| reversed comparison → 308 canonical | PASS | 308 /compare/alpha-fixture-markets-vs-beta-fixture-markets |
| comparison share image PNG | PASS | 200 image/png |
| / → 200 | PASS | got 200 |
| / one h1 | PASS | 1 h1 |
| / title | PASS | ForexInspect — evidence-first forex broker research |
| / canonical self (https) | PASS | https://forexinspect.com |
| / main before footer | PASS |  |
| / JSON-LD parses | PASS | Organization |
| / no rating schema | PASS |  |
| / SSR contains “Published brokers” | PASS |  |
| / SSR contains “Find a broker” | PASS |  |
| / og/twitter | PASS |  |
| home stats derived from snapshots | PASS |  |
| /sources → 200 | PASS | got 200 |
| /sources one h1 | PASS | 1 h1 |
| /sources title | PASS | Sources: official pages cited by ForexInspect \| ForexInspect |
| /sources canonical self (https) | PASS | https://forexinspect.com/sources |
| /sources main before footer | PASS |  |
| /sources JSON-LD parses | PASS | BreadcrumbList |
| /sources no rating schema | PASS |  |
| /sources indexable | PASS | index, follow |
| /sources SSR contains “www.alpha-fixture-markets.invalid” | PASS |  |
| /sources og/twitter | PASS |  |
| sitemap includes eligible profile/child/comparison pages | PASS |  |
| approved asset served with bounded cache | PASS |  |
| image optimizer rejects remote URLs | PASS | 400 |
