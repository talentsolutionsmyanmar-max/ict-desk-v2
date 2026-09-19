# Strategy v2.1: implementation contract

Status: unvalidated research candidate. Versioned September 19, 2026. No performance claims.

## Objective

Make the setup observable, causal and cost-aware before testing whether it has an edge. Optimize for robust out-of-sample net expectancy and tolerable drawdown, not the largest displayed RR. The current target is a **3R gross hypothesis**, with a **2.0 net reward / net loss floor** and sufficient structural room.

## Gates

1. **Data:** continuous venue-native 5m, 15m and 4h candles, with the most recently expected closed candle present. Never confirm from a forming bar. An executable quote must be no older than five seconds. Historical bars carry venue open/close times; books carry venue and receipt timestamps.
2. **Liquidity:** at least $25m 24h notional volume, $5m OI, spread no wider than 5 bps and at least $10k _observed_ depth on both sides within 10 bps. Absolute hourly funding must be at most 0.03%; unknown funding or unknown OI-cap state blocks qualification.
3. **Direction:** strict 2-left / 2-right pivots on 4h candles. A pivot is only known after the second right-hand candle closes. Two higher highs and higher lows allow long continuation; two lower highs and lower lows allow short continuation. Otherwise neutral.
4. **Sweep:** use the nearest pre-existing, previously untouched eligible 15m pivot or previous UTC-day extreme in the sweep direction. Require an excursion of `max(2 ticks, 0.05 × pre-sweep Wilder ATR14)` and a reclaim within three closed 5m candles, counting the sweep candle. Freeze the opposite confirmed 5m pivot before the sweep as the trigger.
5. **Displacement:** within three bars after reclaim, close beyond that trigger in the allowed direction. Body must be at least 1.5 times the previous 20-body median and at least 60% of the full range. Zero median/range fails. This must be the middle of a completed three-candle gap at least two ticks wide.
6. **Freshness:** gap midpoint, buy rounded down / sell rounded up. Formation candles cannot retrospectively fill it. Any later candle touch, including the forming candle, or a currently marketable price means the first retracement is no longer offered. This is **not evidence of a fill**. A later cancellation never erases an earlier observed touch. Six-bar lifetime, same active weekday session and no structural invalidation.
7. **Range:** freeze a valid confirmed 15m swing-low-to-subsequent-high range for longs, or swing-high-to-subsequent-low for shorts, at reclaim. Long entry must be in the lower half; short entry in the upper half. Invalid or missing anchors fail.
8. **Stop and target:** stop beyond the sweep extreme plus `max(2 ticks, 2 spreads, 0.15 × confirmation ATR14)` outward buffer. A 3R gross target must sit before the nearest untouched opposing 15m/day liquidity with the same buffer. No obstacle means no complete candidate. Stop placement is not changed merely to manufacture a higher RR.
9. **Costs:** default 1.5 bps passive entry fee, 4.5 bps taker exit fee, 2 bps adverse exit allowance, plus two hours of current adverse funding as an estimate. Future funding is unknown. Compute target and stop costs on their respective exit notionals. Missing funding cannot count as a free confirming input. The calculator allows explicit assumptions.
10. **Session:** weekdays 03–04, 10–11 and 14–15 in America/New_York, using real DST rules. These windows are hypotheses retained for comparability, not proven optimal crypto sessions.

## Exact accounting

For a linear contract per unit, `D = |entry − stop|` and `G = |target − entry|`, with directionally valid stop and target:

```
target_cost = entry × (entry_fee_bps + funding_bps) / 10,000
            + target × (exit_fee_bps + exit_slippage_bps) / 10,000
stop_cost   = entry × (entry_fee_bps + funding_bps) / 10,000
            + stop × (exit_fee_bps + exit_slippage_bps) / 10,000
net_RR      = (G − target_cost) / (D + stop_cost)
quantity    = floor_to_lot(min(risk_budget / (D + stop_cost), equity / (entry + stop_cost)))
```

The second sizing bound keeps entry notional plus modeled stop-side execution costs inside reference equity. It does not promise a fill or verify actual available margin.

### Small-account planning

The calculator defaults to **$100 reference equity and 0.25% planned risk**, an estimated $0.25 risk budget, not a maximum possible loss or a live account balance. All account values remain user-entered scenarios. The strategy gates and 3R hypothesis are unchanged.

Native Hyperliquid perpetual entry notional must be at least **$10**, per the [documented order errors](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses), checked September 19, 2026. Check this minimum **after** quantity rounding; do not round up to manufacture feasibility. Missing venue size precision blocks sizing instead of assuming four decimals. A passing size check is not a trading signal, margin verification, or proof of an edge. Other venues and spot markets require different validation.

The calculator also shows stop loss at the same quantity with `max(input_slippage_bps, 50)` adverse exit bps. The 50 bps stress is an illustrative assumption, not a calibrated percentile or worst-case bound. Actual losses can be larger. Hyperliquid [TP/SL documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl) specifies mark-price triggers, warns that limit stops may not fill, and describes parent-order/partial-fill protection behavior. The dashboard neither creates nor checks protective orders.

Imported Entry / SL / TP values are fixed calculation inputs, not a persistent order or live-updating eligibility check. Recheck all ten gates and freshness on the desk. Below-minimum scenarios retain their hypothetical values for inspection but are explicitly blocked; they are never represented as executable orders.

For completed trades, initial price-risk `1R = quantity × |entry − original stop|`. Net P&L is direction-adjusted exit less entry, multiplied by quantity, minus actual fees and funding paid. Received funding is negative cost. Realized net R uses the original price-risk denominator, not the larger cost-inclusive sizing denominator. A stopped trade can therefore lose more than 1R. R, price basis points and account return are different quantities; the desk never labels R as bps.

## State semantics

- “Liquidity-qualified” means the execution screen passed at the displayed scan time, not a trading recommendation.
- A gate count is progress through rules, not a confidence score or probability of winning.
- Candidate levels are pre-order planning estimates. A new scan may recalculate the buffer before an actual order exists. There is no persisted pending-order state or fill simulation.
- Live retest detection can remove a previously displayed candidate; a current price tick cannot create a strategy setup without a new closed-bar scan.
- Full target, unchanged stop and a two-hour time exit are the baseline _exit hypothesis_. The app does not track open positions or enforce those exits.
- Suggested paper-risk limits are visible guidelines, not account-connected enforcement. The journal stores closed trades only and cannot establish aggregate open exposure.

## Validation still required

Obtain venue-matched multi-regime history and finer execution data. Freeze rules and compare 2R, 3R and 4R variants with chronological walk-forward windows, purged overlapping trades and a final untouched holdout. Measure net R/trade, net R/day, fill rate, drawdown, profit factor, longest losing sequence and cross-coin concentration. Stress costs and missed maker fills. Compare the expanded universe separately from BTC/ETH/SOL and test session-neutral entries separately. Forward paper trading must precede any claim of an edge.

Unit tests establish arithmetic and selected rule invariants—not profitability, complete execution realism, production uptime or an optimized strategy.
