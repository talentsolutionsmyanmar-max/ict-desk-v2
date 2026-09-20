# V3 shadow desk: separate models, explicit evidence

Status: implemented for research comparison, not promoted to a proven or autonomous trading system. V2.1 is unchanged as a baseline. No orders, notifications, historical OI backfill, durable collector, or exchange flow integration is implied.

## The observed mismatch

Hyperliquid candleSnapshot was queried for BTC, ETH and SOL. Measurement window: September 19, 2026 00:00 to September 20 09:45 Myanmar (UTC+06:30), or September 18 17:30 to September 20 03:15 UTC. Each market contained 405 contiguous closed 5m bars. Warm-up history was retrieved separately for confirmed 15m and 4h pivots. Forming candles were excluded.

| Market | Window-open → last close | Maximum chronological close-to-close drawdown | Peak close / Myanmar time | Trough close / Myanmar time |
| --- | ---: | ---: | --- | --- |
| BTC | −0.6178% | −2.0644% | 81,959 / Sep 19 22:15 | 80,267 / Sep 20 09:45 |
| ETH | −0.6943% | −3.0772% | 2,655 / Sep 19 15:55 | 2,573.3 / Sep 20 09:30 |
| SOL | −4.0970% | −5.7583% | 114.27 / Sep 19 02:30 | 107.69 / Sep 20 09:30 |

The baseline's confirmed 4h structure was bullish at each listed peak and trough. All listed peaks were outside its weekday New York windows. Only 12 of the 405 evaluation times fell inside an allowed baseline window. Thus the engine was not designed to offer those countertrend shorts, regardless of how attractive the later decline looks.

These are hindsight drawdowns, **not fills, signal returns, or lost obtainable profit**. No historical book, spread, depth, OI delta, position or account snapshots were recorded. Full historical eligibility cannot be reconstructed from candles alone. This event motivated broader hypotheses; it is not a holdout test of them.

Reproduce the descriptive calculation (while this window remains within the venue's most recent 5,000-candle retention):

```sh
npx tsx scripts/audit-market-window.ts 2026-09-19T00:00:00+06:30 2026-09-20T03:15:00Z /private/tmp/ict-market-audit-20260920.json
```

The script preserves non-secret exact requests, raw parsed OHLCV, source and capture time in the optional output. Drawdown walks chronologically through closes, updating a running peak and retaining the largest subsequent percentage decline. A running peak cannot use a later bar.

## Three hypotheses, not ten votes

1. **Trend continuation:** a closed 5m displacement through a pre-existing confirmed 15m pivot in the confirmed 4h direction. Entry hypothesis: first retest of that broken pivot.
2. **Sweep reversal:** a ≥0.1 pre-sweep ATR excursion through the latest untouched confirmed 15m pivot, reclaim within three bars, then a directional displacement break of the frozen pre-sweep 5m opposing swing within the next three bars. Entry hypothesis: first retest of the broken 5m swing. The 4h direction is context, not a veto.
3. **Break & retest:** the same confirmed 15m break when not aligned with the 4h trend, covering countertrend pullbacks and mixed higher-timeframe regimes. These events are not duplicated into continuation.

Displacement means body ≥0.8 pre-break Wilder ATR(14), body/range ≥60%, directional close at least 0.1 ATR beyond the frozen level. Confirmed swings use strict two-left/two-right pivots. V3 has no FVG, premium/discount-half, or weekday/hour requirement. These constants are initial research specifications, **not fitted optima**.

Stop: beyond the pre-break 5m opposing swing/impulse extreme for breaks, or the sweep-to-break extreme for reversals, plus max(2 ticks, 0.15 pre-event ATR). Entry and stop are conservatively tick-rounded. Prices are frozen from formation-time information, not relocated to follow a later quote. The most recent event per model is shown; an old event is never substituted merely because it has a more appealing RR.

Target: before the nearest confirmed, untouched opposing 15m swing known at formation, less the buffer, and no farther than 4R gross. Unknown room fails closed; it is not infinite target space. Net RR must be ≥2 after assumed 1.5 bps passive entry fee, 4.5 bps exit fee, 2 bps exit slippage, and two hours of current adverse funding. Maker execution is not guaranteed. A favorable change in fee/funding estimates is not a new entry event.

All models require complete current 4h/15m/5m data, a ≤5s quote and the existing volume/OI-level/spread/depth/funding/OI-cap safeguards. Live client checks additionally require a current scan and current forming 5m observation. A candidate expires 30 minutes after confirmation. Any observed first retest during that lifetime removes the fresh-entry offer; a candle or quote touch is not a fill. At most the latest 90 minutes of events are searched. There is no durable signal ledger.

The $100, 0.25% risk illustration is separate from signal qualification and uses existing conservative quantity/minimum-notional/capital checks. Reference equity is not a connected balance, portfolio check or margin approval. No leverage is increased to manufacture an order meeting the minimum.

## Context has provenance, not invented conviction

- **Open interest:** activeAssetCtx reports base units; current USD notional is base OI × mark. ΔOI compares base units so price movement alone cannot create a positioning change. 5m/15m values require a corresponding observed baseline; excessive gaps clear the history. No positive/negative interpretation is inferred as a fact about who opened positions.
- **Trade flow:** public trades are deduplicated by (time, coin, tid). Displayed flow is observed B-side minus A-side price × size over a rolling 5m window, only after five continuous connected minutes with fresh context. Pre-connection snapshot trades are excluded. Malformed records and overflow withhold the aggregate. This is an observed signed-flow measure, not attributed exchange deposits/withdrawals or evidence of open versus closed positions. The stream does not provide an independently verified completeness sequence.
- **Funding and premium:** venue-reported hourly funding and mark premium, displayed independently. Funding cost assumptions remain visible in risk planning.
- **Depth:** current returned L2 notional within 10 bps, up to 20 levels per side. Cancelable resting orders are not guaranteed fills, total depth or a liquidation heatmap.
- **Unavailable:** historical OI before connection, exchange-wallet inflows/outflows, modeled liquidation clusters and cross-venue aggregation. No synthetic proxy is silently substituted. A CoinGlass liquidation heatmap is itself a model based on market/leverage data, not an observed resting-order book.

Selected-market observation resets on reconnect, including coin/timeframe changes. Hidden tabs pause the feed. This is not an always-on collector or alert service. Context is explanatory; it does not yet weight or veto the models because its predictive value has not been established.

## Promotion criteria

Evaluate all frozen model definitions on venue-matched chronological history; do not optimize on the September 19–20 episode. Compare each model separately with V2.1, session ablations and simple momentum baselines. Use walk-forward train/validation splits, an untouched holdout, conservative fills and stop/target same-bar ambiguity handling, missed/partial maker fills, actual fee tiers, funding, 1.5×/2× costs and correlated exposure constraints. Report sample size, net expectancy per trade and per day, fill rate, drawdown, loss streak, and uncertainty; no unsupported universal minimum sample or win rate suffices. Add durable timestamped decision recording before unattended forward testing. Define capital/risk limits outside the signal score. Software tests are not profit validation.

## Verification of this revision

- 64 deterministic tests passed (48 existing + 16 new), including countertrend long/short symmetry, weekend eligibility, causal confirmation, stale/incomplete data, target-room rejection, first-touch preservation, expiry and OI/flow parsing.
- TypeScript and the optimized production build passed. `git diff --check` passed.
- Local production preview: `http://127.0.0.1:3020`. Health returned both `2.1-research` and `3.0-shadow`; live scan returned 12 analyzed markets, 36 model assessments and no request errors in the inspected scan.
- Browser checked at its normal 942px width and at 390×844. Three-column comparison on desktop; stacked readable cards on mobile, with document width equal to viewport width. No console errors observed during the bounded review.
- Real public-data warm-up produced a 5m OI change and signed-flow value after five minutes; 15m remained unknown because that coverage had not elapsed. Switching BTC→SOL reset warm-up instead of carrying BTC data across.
- BTC and SOL historical/expired scenario imports preserved Entry/SL/TP, short direction, $100 reference equity and 0.25% risk in the calculator. SOL displayed 0.26 units / $28.52 notional for the inspected historical scenario; this is a sizing check, not a fill or recommendation. Updated model-specific guidance was verified in the rendered Risk Lab.
- No commit, push, remote preview, production deployment, order or alert was performed for this revision. Live profitability, unattended operation, persistence and notification delivery remain unverified/unimplemented as described above.

## Primary sources

- [Hyperliquid candles and L2 book](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Hyperliquid perpetual asset contexts](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Hyperliquid public WebSocket streams and trade identity](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)
- [CoinGlass liquidation heatmap model description](https://docs.coinglass.com/reference/liquidation-aggregate-heatmap-model2)
