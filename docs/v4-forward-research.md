# V4 forward research desk

## Account planning

Default reference equity is $1,000, with 0.25% planned risk ($2.50).
Account settings are shared between model sizing and the risk calculator and
persist only in this browser. They do not read or alter a wallet. Risk stays
within 1%, quantities round down, and a 1× notional cap reserves modeled costs.

## Frozen hypotheses

1. **Intraday pullback:** confirmed 15M swing trend; displaced break of the
   latest same-direction 15M swing; pullback within six closed 5M bars; level
   holds within 0.3 pre-break ATR; a subsequent impulse within three bars
   breaks the recent pullback high/low. Entry is the first retest of that local
   break. Stop is beyond the observed pullback with the existing tick/ATR buffer.
2. **Failed-breakout scalp:** existing 15M sweep/reclaim and subsequent 5M
   reversal displacement. Entry is the first retest of the pre-sweep local
   swing; stop is beyond the sweep. A known opposite range boundary must exist,
   and the target is capped before the range midpoint.

Both require complete closed 4H/15M/5M candles, fresh quotes, existing liquidity
safeguards and at least 2R net after modeled costs. Nearest untouched 15M and
4H obstructions constrain targets; no targets are extended to manufacture RR.
Continuation follows 15M direction even when 4H opposes it. Scalp entry lasts
15 minutes; continuation lasts 30. Maximum paper holds are 30 and 120 minutes.
The older V2.1 checklist remains a separate baseline. V3 engine tests are
retained for regression coverage, but live scans and public replay use V4.

## Forward recorder

`/api/cron/record` requires a server-only `CRON_SECRET` bearer token. It takes
a database lease, records model state changes and qualifying forward signals,
and advances open paper observations from closed 5M candles. Stable IDs prevent
duplicate signals; conditional updates prevent outcomes moving backward.
Plans, gates, market context and book checks are frozen at observation.

Paper activation is the next full 5M bar after persistence; a retest before
activation is marked missed. Entries require one-tick penetration. A gap
through a stop uses the worse opening price, with modeled exit costs added.
Both stop and target in one candle use stop-first. Entry and target in one
candle without a stop are ambiguous and excluded. Missing bars withhold the
outcome. Time exits close at the final allowed bar's close, with costs.

Funding is a frozen holding-period estimate, not a funding-history ledger.
Paper fills do not model exchange queue position, account liquidation, rejected
orders or a funded portfolio. Independent scenarios can overlap. Reported mean
R, profit factor and cumulative-R drawdown are sample descriptors, not proven
expectancy, win probabilities or account returns. The UI reports the latest
1,000 V4 signals and 100 state changes; historical replay is separate.

## Provisioning and activation

The project originally had no database. Until a dedicated database and scheduler
secret are configured, `/api/forward` explicitly returns `configured: false`;
the UI must not claim recording is active.

After approval to provision a dedicated free-tier Neon database:

1. Connect only this trading project and environment; do not reuse unrelated databases.
2. Load `DATABASE_URL` and run:
   `node --env-file=.env.local --import tsx scripts/init-forward-store.ts`
3. Set a fresh random `CRON_SECRET` in production without printing it.
4. Add `{"path":"/api/cron/record","schedule":"* * * * *"}` to the
   `crons` array in `vercel.json` and deploy. The existing Vercel team is Pro.
5. Invoke one authorized run, verify persisted transitions, duplicate handling,
   and a successful heartbeat. Then verify a later unattended scheduled run.

Minute scheduling is best effort; delays may miss a short-lived setup. No
browser push, messaging integration, wallet or order execution is enabled.
