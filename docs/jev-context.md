# Jev context review

This optional panel adds English text classification alongside the existing **4H / 15M / 5M** research system. It is a shadow feature: neither Jev labels nor its confidence can approve a trade, change Entry / SL / TP, alter position size, or overrule a strategy gate. No trading edge or profit improvement has been demonstrated.

## Local configuration

Keep both values in the Git-ignored `.env.local`, with owner-only file permissions:

```dotenv
TYPESAFE_API_KEY=<replacement-provider-key>
JEV_DESK_TOKEN=<separate-random-64-character-lowercase-hex-token>
```

Never reuse the provider key as the desk token, prefix either secret with `NEXT_PUBLIC_`, or put real values in `.env.example`. The provider key is read only by a `server-only` module and sent only to the fixed TypeSafe API endpoint. Restart the local server after changing configuration. If a key was disclosed, revoke it in TypeSafe; saving a replacement does not itself revoke the original.

Open **Jev context review** on the Desk and unlock with `JEV_DESK_TOKEN`, not the provider key. The token is not persisted in browser storage. Successful unlock creates a signed, one-hour, HttpOnly / SameSite=Strict cookie (Secure on HTTPS). Lock clears that browser cookie; rotating the desk token and restarting the server invalidates existing signed sessions. This is single-operator access, not a multi-user identity system.

## What is submitted and returned

Select the intended market, provide a public source title, clean HTTPS citation and English excerpt, and explicitly confirm transmission. Only the selected asset, title and excerpt are sent to TypeSafe with the fixed classification rubric. Publication time is optional; missing dates remain unknown. The server **does not fetch the source URL** or verify the publisher or event.

The pinned `jev-1.13.0` model classifies three dimensions:

- Asset relevance: direct, broader crypto context, unrelated, or unclear.
- Topic: security, supply, venue operations, policy/macro, adoption, market commentary, or other.
- Claim wording: stated event, planned event, speculation, reference information, or unclear. A stated event is not a verified event.

The result retains the submitted source, observation/evaluation timestamps, schema/model version, full label distributions, provider input-token count, latency and estimated API cost. **Model certainty is not trade win probability.** The price-based strategy runs independently when Jev is locked, unavailable, rate-limited or wrong.

Only the currently selected market's result is shown. Switching markets or leaving the page discards the in-memory review; export its JSON first. There is no durable research log, automatic news ingestion, exchange-flow data, liquidation heatmap or AI alert delivery in this feature.

## Cost and failure boundaries

No AI request is made by market polling, page refresh or candle updates. A new review needs an explicit operator action. Identical submissions are cached for ten minutes in the serving process. Additional process-local controls allow one in-flight request, a ten-second interval, 20 attempts per rolling hour and 100 per rolling 24 hours. Failed or ambiguous requests count toward these allowances; there are no automatic retries.

These are **not account-wide billing caps**: processes can restart or scale independently. The cost estimate uses the published $0.042 per million input tokens, checked 2026-09-20; it is not a billing receipt. Configure any required hard spending restriction at the provider before public deployment. Do not treat browser cancellation as proof a submitted request incurred no charge.

The API rejects unauthorized/cross-origin calls, oversized bodies, credentials detected in excerpts and invalid provider output. Upstream errors are sanitized. The model endpoint, version, fields and output labels cannot be selected by the client. Source URLs are citations only, never server-side fetch targets. Classification can still be mistaken or influenced by hostile text; it grants no tools or trading authority.

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Unit tests use mock providers and do not load real credentials. For a deliberately paid, one-request live check, start the local production build on port 3020, then run:

```sh
node --env-file=.env.local --import tsx scripts/check-jev.ts
```

The script accepts only a loopback HTTP origin, verifies the anonymous request is blocked, unlocks through the normal session endpoint and submits a short public fee-documentation excerpt once. It prints only non-secret connection/assessment metadata. It is a connectivity check, not a forecast-quality or profitability test. It does not retry a failed inference or place an order.

## Sources

- [TypeSafe HTTP contract](https://docs.typesafe.ai/api)
- [Models, version pinning, English support and price](https://docs.typesafe.ai/models)
- [Meaning of model confidence](https://docs.typesafe.ai/confidence)
- [Hyperliquid fee documentation used by the connectivity check](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees)
