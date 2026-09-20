# Edge — ICT Crypto Research Desk

A live, single-venue crypto research workspace built with Next.js, React, TypeScript and TradingView Lightweight Charts. Public market data comes from Hyperliquid. The market desk needs no wallet, private trading key, login, database or order endpoint. Optional Jev text reviews require separate server-only configuration and operator access.

## What is implemented

- **V3 shadow comparison:** independent 24/7 trend continuation, sweep reversal and break/retest hypotheses. The scanner highlights observations across these models. There is no universal ten-check score and no probability claim. V2.1 remains visible as a comparison baseline, not a veto over V3.
- Selected-market public WebSocket OI, base-unit OI changes over observed 5m/15m windows, signed trade notional over an observed 5m window, funding/premium and cancelable book-depth balance. History warms up in the current tab and resets on reconnect; missing coverage stays unknown. No liquidation heatmap or exchange-flow provider is connected.
- Live WebSocket mid-prices, best bid/ask, observed order-book depth and candlesticks; 5m, 15m, 1h and 4h chart views.
- A bounded scanner: BTC / ETH / SOL plus the most active uncapped native perpetuals, up to 12 markets. The broader active universe is available for chart inspection; **unscanned markets do not receive strategy signals**.
- Execution-quality filters for volume, open interest, spread, observed depth, funding and venue OI caps. Liquidity qualification is distinct from an entry signal.
- Versioned, closed-candle ICT continuation research logic with confirmed pivots, sweep/reclaim, displacement, first-retest freshness, local range alignment, structural target room and cost-adjusted RR.
- A transparent checklist: each gate exposes its reason. Stale quotes, incomplete candles, missing data and closed entry windows block actionable eligibility.
- A cost-aware scenario calculator defaulting to $100 equity and 0.25% planned risk, with explicit fee/slippage/funding assumptions, conservative quantity rounding, a 1× capital cap including modeled costs, a post-rounding $10 native-perpetual minimum check, and an illustrative exit-slippage stress. No account is connected.
- Numeric Entry / Stop loss / Take profit per V3 model, with formation/expiry in Myanmar time and the $100 / 0.25% reference-size check. A displayed level or passing size check is not sufficient. The ten-gate rule applies only to the separately labeled V2.1 baseline beside the chart.
- Browser-local watchlist and manually recorded closed-trade journal. Journal P&L and realized R derive from actual entered prices, quantity and costs, never Win/Loss buttons. CSV export is available.
- Responsive dark trading workspace, accessible input labels, keyboard search (`/`), chart data table and reduced-motion support.
- Optional English-only Jev context reviews alongside the **4H / 15M / 5M** system. An operator explicitly submits a public excerpt; the model classifies asset relevance, topic and claim wording. It does not approve trades, forecast prices, change strategy gates or fetch the linked page. Reviews include source metadata, version, probabilities, estimated cost and JSON export.

## Run and verify

Node.js 22 is recommended.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm test
npm run build
```

The GitHub Actions workflow repeats type checking, deterministic financial/strategy tests and the production build on pushes and pull requests. Tests use clearly synthetic fixtures; production never substitutes fixtures for unavailable market data.

For optional AI configuration, usage, limits and a one-request live connectivity check, read [Jev context review](docs/jev-context.md). Unit tests never call the provider or require a real key.

## Research rules and limitations

Read [the V3 design and market audit](docs/adaptive-research.md), [the baseline implementation notes](docs/strategy-and-data.md) and the in-app Playbook before interpreting a candidate.

This is **an experimental research scanner, not a demonstrated profitable strategy**. No backtest, win rate, optimized parameter, maximum-RR claim or independent investment recommendation is presented. RR alone does not establish positive expectancy. The expanded asset universe has not been validated against this setup model.

The V2.1 comparison baseline preserves weekday New York windows of 03–04, 10–11 and 14–15. V3 evaluates every day, including weekends. None of the models has demonstrated positive expectancy; a trigger is not proof that a trade should be taken.

There is **no order placement, fill simulator, account synchronization, portfolio enforcement, unattended position monitoring or alert delivery**. Candidate price levels are pre-order planning estimates, recalculated from the current snapshot; they are not a frozen broker order. Risk calculator inputs stay fixed while the user edits a scenario. Once a real order is placed, its original risk must be retained in the user's execution system and journal.

Risk-control guidelines in the Playbook are research controls, not a personalized allocation. Stops can gap or slip and losses can exceed estimates. The journal is browser-local, manually entered and not independently verified; export it regularly. Clearing browser data loses local records.

## Data and operational behavior

| Endpoint                             | Purpose                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `/api/markets`                       | Active native perpetual universe, volume, OI, funding and cap status    |
| `/api/scan`                          | Bounded, deduplicated multi-timeframe analysis                          |
| `/api/candles?coin=BTC&interval=15m` | Validated venue candles for an active symbol                            |
| `/api/health`                        | Application liveness and strategy version; not a venue-health guarantee |

The server uses bounded concurrency, request timeouts, in-process single-flight caches and CDN caching. Higher-timeframe scan history is reused until its candle boundary; scans refresh every minute and on new 5m bars. Exchange-native WebSocket data updates the selected market independently. Tab-hidden connections pause and reconnect with backoff. Stale snapshots cannot imply live eligibility.

In-process caching is best-effort across serverless instances, not a globally coordinated rate limiter. Before scaling to many concurrent users, introduce a durable shared data collector/cache and operational alerting. The app must be permitted to reach `https://api.hyperliquid.xyz` and `wss://api.hyperliquid.xyz/ws`. Regional access restrictions, exchange outages and rate limits are possible. Missing feeds produce unavailable/blocked states, not synthetic fallback prices.

Book depth is only the notional visible within 10 bps in the returned top 20 levels per side. It is not total market depth, guaranteed executable size or a liquidation heatmap. Header prices are live mids when available, otherwise last-received mark prices; chart candles are traded prices. They are different measurements on the **same venue**.

## Deploy

Deploy the repository as a Next.js project on Vercel. The public market desk needs no application secrets. Optional AI reviews require server-only `TYPESAFE_API_KEY` and a separate `JEV_DESK_TOKEN` in the target deployment environment; `.env.local` is never deployed or committed. Connect the GitHub repository to the Vercel project with `main` as the production branch, so future reviewed pushes produce deployments. Preview first, verify feeds and behavior, then promote the same artifact.

The previous README-only repository described a different ICT ruleset. This implementation supersedes those rules; it does not claim to reproduce or backtest an unavailable legacy engine.

## Primary sources and attribution

- [Hyperliquid information API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid perpetual metadata](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid WebSocket subscriptions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)
- [Hyperliquid fee schedule](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)
- [Tick and lot sizes](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)
- [Rate limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)
- [TypeSafe API](https://docs.typesafe.ai/api), [versioned models and pricing](https://docs.typesafe.ai/models), and [model confidence](https://docs.typesafe.ai/confidence)
- Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) under Apache 2.0. TradingView attribution is retained in the chart and its caption.

The UI uses DM Sans and IBM Plex Mono, loaded via Google Fonts with system-font fallbacks. Icons are from Lucide.
