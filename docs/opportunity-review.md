# 48-hour opportunity review

The selected-market review reconstructs the existing three models from closed
Hyperliquid candles. It is loaded on demand through `/api/replay?coin=BTC` and
does not add work to the recurring multi-market live scan.

- Review window: 576 closed 5-minute bars, with 5m/15m/4h warm-up.
- Each event shows confirmation time in MMT, frozen structural levels where
  available, modeled RR, and all applicable rejection/lifecycle reasons.
- Missing or discontinuous candles reduce the displayed coverage. Zero events
  with partial coverage is not a complete 48-hour finding.
- Historical order books, OI, cap status and funding are not reconstructed.
  RR uses the model's fees/slippage and an explicit zero-funding assumption.
  No row establishes historical eligibility, a fill, a win or missed profit.
- Events use only swings confirmed by the trigger time. Later bars are used
  only to describe whether the retest was observed before expiry.

Live selection now prefers an untouched, unexpired plan with sufficient net RR
over a newer rejected event of the same model. All existing data and liquidity
gates still apply. Data failures identify the affected timeframe or quote clock
skew instead of displaying a generic failure.

This review is candle reconstruction, not persistent live signal logging or an
alerting service. It does not change thresholds or establish a profitable edge.
