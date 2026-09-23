# Trade Plan Analytics

Status: additive research packaging (September 2026). No order execution.

## What it is

`buildTradePlanView()` in `src/lib/trade-plan.ts` assembles the existing
`analyze()` output, `tradeMath()`, and `sizeScenario()` (default **$100** equity
at **0.25%** risk) into a single `TradePlanView` for the desk card.

The UI lives in `src/components/trade-plan-card.tsx` and is wired as the primary
plan panel on the market desk.

## What it is not

| Concept | Meaning on this desk |
| --- | --- |
| **Trade Plan Analytics** | Packaging of gates, levels, RR, size, invalidation for research review |
| **ARMED** | Not implemented. No arming latch, no order intent state |
| **Live order** | Not implemented. No wallet connect, no order POST, no exchange writes |

A green research candidate still requires human review of portfolio risk and
actual fill conditions. Seeding the journal writes **localStorage only**.
Exporting JSON/CSV is a research snapshot, not proof of a fill.

## Verify locally

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Open the desk, select **BTC**, and inspect the Trade Plan card (candidate or
blocked reasons). Use **Seed journal draft** / **JSON** / **CSV** as needed.
