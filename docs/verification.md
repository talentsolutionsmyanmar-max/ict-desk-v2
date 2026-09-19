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

## Small-account revision — September 20, 2026 (Myanmar time)

- Prepared and locally verified on `feat/small-account-planning`. The owner subsequently approved publication to the existing `ict-edge-desk` project. The prior production commit `aedf4436b4f4f1e1caef563158b387c2092fb101`, deployment `dpl_DLMUFGTKsLetDsrPHQBWdHwkr2CX`, is the recorded rollback target. Publication must be independently checked against the merged GitHub revision.
- Added deterministic sizing checks for a $100 reference account, cost reserves, the post-rounding $10 minimum, whole-unit lots, missing precision, invalid inputs and short-side costs. These are synthetic calculations, not strategy performance.
- Final local TypeScript checking, all 48 deterministic tests and the production build passed. Blank fee inputs remove RR and size estimates instead of silently treating missing fees as zero. A 100 bps user-entered slippage assumption was retained by the stress display rather than reduced to 50 bps.
- Production-build browser check on localhost: a synthetic entry 100 / stop 99 / target 103 with $100 equity, 0.25% risk and native BTC size precision displayed 0.23162 units, $23.16 notional, $0.25 estimated stop loss and $0.68 estimated target P&L. The same quantity with 50 bps exit slippage displayed $0.36 estimated stop loss.
- Widening the synthetic stop to 95 and target to 115 displayed $4.92 entry notional and an explicit “Size blocked” minimum warning. The calculator did not round up. Risk above 1% removed quantity and monetary estimates.
- Mobile layout checked at 390 × 844 and desktop at the normal 942px viewport: no document overflow. No error overlay or browser console errors were observed during these checks.
- Entry / Stop loss / Take profit / Net RR are now explicit numeric fields on the setup panel. Weekend empty-state values stay blank; no real candidate or order was manufactured for verification.
- Cleared all synthetic browser scenarios after testing and left the localhost preview on the default $100 calculator with stop and target unset. No account, notification service or trading API was connected.
