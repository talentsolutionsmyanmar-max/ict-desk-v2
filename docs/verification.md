# Verification log

This file records implementation checks, not strategy performance.

## Local checks — September 19, 2026

- TypeScript strict checking, all 39 deterministic tests and the production build passed before publication.
- Deterministic unit tests cover fee-aware RR, direction validity, quantity/tick rounding, accounting units, stop losses beyond 1R, pivot confirmation, tied pivots, Wilder ATR, bar completeness, quote age, DST sessions, retest chronology, marketable limits, missing-data failures and venue parsers.
- The public live feed was observed returning 178 active native perpetual markets. A bounded 12-market scan completed without venue errors. Market counts and liquidity qualification are dynamic observations, not fixed assertions.
- Real-time mid-price, executable spread, observed depth and candle updates were observed in the browser. Zero complete entries during the weekend session is expected.
- Responsive inspection at 390 × 844 found and corrected a screen-reader-only table label causing horizontal document overflow.
- Risk calculator UI checked with a synthetic long scenario: entry 100, stop 99, target 103. Default costs reduce gross 3R to approximately 2.70 net RR; binary break-even is approximately 27.0%. This is a calculation fixture, not a BTC price or trade recommendation.
- A complete synthetic long sequence and its mirrored short sequence both pass all ten engine gates in unit tests; a subsequent forming-bar touch removes the candidate. These fixtures are never used as live data.
- The journal UI saved a clearly marked `TEST` record on localhost only: entry 100, stop 99, exit 103, quantity 2, fees 0.20, funding 0.10. It correctly displayed $5.70 net P&L and 2.85R. No production journal record or financial order was created.
- Search and coin switching were checked in the mobile layout. Document width equals the 390px viewport; the dense radar table scrolls inside its own container.

## Not established

These checks do not establish profitability, a backtested win rate, a globally optimal strategy, guaranteed execution, stress-load capacity, continuous uptime or suitability for a particular account. Live candidate chronology has not been exhaustively backtested. No orders are placed and no exchange account is connected.
