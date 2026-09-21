import { atrSeries, closedCandles, pivots, structure, RULES } from "./strategy";
import {
  analyzeResearch,
  researchEvents,
  researchLifecycle,
  researchPlan,
  ResearchEvent,
  ResearchInput,
} from "./research-strategy";
import { roundTick, tickSize, tradeMath } from "./math";
import { Candle, Market, Plan, ResearchModel } from "./types";

export const ADAPTIVE_VERSION = "4.0-forward";
export const ADAPTIVE_MODELS = [
  { id: "continuation", label: "Intraday pullback" },
  { id: "reversal", label: "Failed-breakout scalp" },
] as const;

function impulse(c: Candle, atr: number, long: boolean) {
  return (
    c.high > c.low &&
    Math.abs(c.close - c.open) >= 0.8 * atr &&
    Math.abs(c.close - c.open) / (c.high - c.low) >= 0.6 &&
    (long ? c.close > c.open : c.close < c.open)
  );
}

export function adaptiveEvents(
  input: ResearchInput,
  now: number,
  lookbackBars = 30,
): ResearchEvent[] {
  const five = closedCandles(input.five, now);
  const fifteen = closedCandles(input.fifteen, now);
  const atrs = atrSeries(five);
  const events = researchEvents(input, now, lookbackBars).filter(
    (e) => e.model === "reversal",
  );
  for (
    let i = Math.max(22, five.length - lookbackBars - 9);
    i < five.length;
    i++
  ) {
    const c = five[i],
      atr = atrs[i - 1];
    const trend = structure(fifteen, c.time);
    if (!atr || trend === "neutral") continue;
    const long = trend === "long";
    const level = pivots(fifteen, c.time)
      .filter((p) => p.kind === (long ? "high" : "low"))
      .at(-1);
    if (!level || !impulse(c, atr, long)) continue;
    const crossed = long
      ? five[i - 1].close <= level.price && c.close > level.price + 0.1 * atr
      : five[i - 1].close >= level.price && c.close < level.price - 0.1 * atr;
    if (!crossed) continue;
    const prior = five.filter(
      (b) => b.time > level.confirmedAt && b.closeTime < c.time,
    );
    if (
      !prior.every((b) =>
        long ? b.close <= level.price : b.close >= level.price,
      )
    )
      continue;
    let touched = -1;
    for (let j = i + 1; j <= Math.min(i + 6, five.length - 1); j++) {
      const b = five[j];
      if (
        long
          ? b.close < level.price - 0.3 * atr
          : b.close > level.price + 0.3 * atr
      )
        break;
      if (
        long
          ? b.low <= level.price + 0.3 * atr
          : b.high >= level.price - 0.3 * atr
      ) {
        touched = j;
        break;
      }
    }
    if (touched < 0) continue;
    for (
      let j = touched + 1;
      j <= Math.min(touched + 3, five.length - 1);
      j++
    ) {
      const b = five[j];
      if (
        long
          ? b.close < level.price - 0.3 * atr
          : b.close > level.price + 0.3 * atr
      )
        break;
      const recent = five.slice(Math.max(touched, j - 2), j);
      const trigger = long
        ? Math.max(...recent.map((v) => v.high))
        : Math.min(...recent.map((v) => v.low));
      if (
        !impulse(b, atrs[j - 1] ?? atr, long) ||
        !(long ? b.close > trigger + 0.1 * atr : b.close < trigger - 0.1 * atr)
      )
        continue;
      if (structure(fifteen, b.time) !== trend) break;
      const pullback = five.slice(touched, j + 1);
      events.push({
        model: "continuation",
        direction: trend,
        formedAt: b.closeTime + 1,
        trigger,
        extreme: long
          ? Math.min(...pullback.map((v) => v.low))
          : Math.max(...pullback.map((v) => v.high)),
        swept: level.price,
        atr: atrs[j - 1] ?? atr,
      });
      break;
    }
  }
  return [
    ...new Map(
      events.map((e) => [`${e.model}:${e.direction}:${e.formedAt}`, e]),
    ).values(),
  ].sort((a, b) => b.formedAt - a.formedAt);
}

export function adaptivePlan(
  event: ResearchEvent,
  market: Market,
  input: ResearchInput,
): Plan | null {
  const plan = researchPlan(event, market, input);
  if (!plan) return null;
  const long = event.direction === "long";
  const buffer = Math.max(
    2 * tickSize(event.trigger, market.szDecimals),
    0.15 * event.atr,
  );
  const targets = [plan.target];
  // Higher-timeframe levels constrain countertrend target room without vetoing direction.
  const four = closedCandles(input.fourHour, event.formedAt);
  const five = closedCandles(input.five, event.formedAt);
  for (const p of pivots(four, event.formedAt)) {
    if (
      p.kind !== (long ? "high" : "low") ||
      !(long ? p.price > plan.entry + buffer : p.price < plan.entry - buffer)
    )
      continue;
    if (
      ![...four, ...five]
        .filter((c) => c.time > p.confirmedAt)
        .every((c) => (long ? c.high < p.price : c.low > p.price))
    )
      continue;
    targets.push(p.price + (long ? -buffer : buffer));
  }
  if (event.model === "reversal") {
    // Range boundaries must be known before the sweep, never inferred afterwards.
    const ps = pivots(
      closedCandles(input.fifteen, event.formedAt),
      event.formedAt,
    );
    const swept = ps
      .filter(
        (p) => p.price === event.swept && p.kind === (long ? "low" : "high"),
      )
      .at(-1);
    if (!swept) return null;
    const opposite = ps
      .filter(
        (p) =>
          p.kind === (long ? "high" : "low") &&
          p.confirmedAt <= swept.confirmedAt,
      )
      .at(-1);
    if (!opposite) return null;
    const midpoint = (event.swept + opposite.price) / 2;
    if (
      !(long ? midpoint > plan.entry + buffer : midpoint < plan.entry - buffer)
    )
      return null;
    targets.push(midpoint + (long ? -buffer : buffer));
  }
  const raw = long ? Math.min(...targets) : Math.max(...targets);
  const target = roundTick(
    raw,
    tickSize(raw, market.szDecimals),
    long ? "down" : "up",
  );
  const maxHoldMs = event.model === "reversal" ? 30 * 60000 : 120 * 60000;
  const costs = {
    ...plan.costs,
    fundingBps: Math.max(
      0,
      (market.fundingHourly ?? 0) *
        (long ? 1 : -1) *
        Math.ceil(maxHoldMs / 3600000) *
        10000,
    ),
  };
  const math = tradeMath(plan.entry, plan.stop, target, event.direction, costs);
  if (!math.valid) return null;
  return {
    ...plan,
    id: `${ADAPTIVE_VERSION}:${market.coin}:${event.model}:${event.direction}:${event.formedAt}`,
    target,
    rangeLow: Math.min(plan.stop, target),
    rangeHigh: Math.max(plan.stop, target),
    netRR: math.netRR,
    grossRR: math.grossRR,
    costs,
    maxHoldMs,
    expiresAt: event.formedAt + (event.model === "reversal" ? 3 : 6) * 300000,
  };
}

export function analyzeAdaptive(
  market: Market,
  input: ResearchInput,
  now: number,
): ResearchModel[] {
  const quality = analyzeResearch(market, input, now)[0].gates.filter(
    (g) => g.id === "data" || g.id === "liquidity",
  );
  const dataOK = quality.every((g) => g.status === "pass");
  const five = closedCandles(input.five, now);
  const fifteen = closedCandles(input.fifteen, now);
  const intraday = structure(fifteen, now);
  const higher = structure(closedCandles(input.fourHour, now), now);
  const regime =
    intraday === "neutral"
      ? "15M mixed / transition"
      : `15M ${intraday === "long" ? "uptrend" : "downtrend"}`;
  const events = quality[0].status === "pass" ? adaptiveEvents(input, now) : [];
  return ADAPTIVE_MODELS.map(({ id, label }) => {
    const observations = events
      .filter((e) => e.model === id)
      .map((event) => ({ event, plan: adaptivePlan(event, market, input) }));
    const selected =
      observations.find(
        ({ plan }) =>
          plan &&
          plan.netRR >= RULES.minNetRR &&
          researchLifecycle(plan, input.five, input.book, now) === "fresh",
      ) ?? observations[0];
    const plan = selected?.plan ?? null;
    const lifecycle = plan
      ? researchLifecycle(plan, input.five, input.book, now)
      : null;
    const atr = atrSeries(five).at(-1);
    const last = five.at(-1);
    const levels = pivots(fifteen, now)
      .filter(
        (p) =>
          id === "reversal" ||
          (intraday !== "neutral" &&
            p.kind === (intraday === "long" ? "high" : "low")),
      )
      .slice(-4);
    const nearby =
      last && atr
        ? levels.find((p) => Math.abs(last.close - p.price) <= 0.5 * atr)
        : undefined;
    const status: ResearchModel["status"] = !dataOK
      ? "blocked"
      : !selected
        ? nearby
          ? "approaching"
          : "watching"
        : lifecycle === "passed"
          ? "passed"
          : lifecycle === "expired"
            ? "expired"
            : !plan || plan.netRR < RULES.minNetRR
              ? "filtered"
              : "candidate";
    const summary =
      status === "blocked"
        ? quality
            .filter((g) => g.status !== "pass")
            .map((g) => g.detail)
            .join("; ")
        : status === "approaching"
          ? "Price is near a known zone. Watch only: no confirmed entry, stop or target yet."
          : status === "watching"
            ? "Waiting for this playbook's closed-bar sequence."
            : status === "passed"
              ? "Entry retest already observed; no late entry or assumed fill."
              : status === "expired"
                ? "The entry window ended."
                : status === "filtered"
                  ? "Confirmed sequence, but structural room or net RR is insufficient."
                  : "Confirmed sequence; first retest pending. Check live validity and account sizing.";
    return {
      id,
      label,
      direction: selected?.event.direction ?? "neutral",
      status,
      plan,
      regime,
      watchLevel: !selected && nearby ? nearby.price : undefined,
      summary,
      context: `${regime} · 4H ${higher === "neutral" ? "mixed" : higher === "long" ? "bullish" : "bearish"} · 24/7`,
      trigger:
        id === "continuation"
          ? "15M trend → displaced break → pullback holds → closed 5M continuation → first retest. Stop beyond the pullback."
          : "15M swing sweep → reclaim → closed 5M reversal break → first retest. Stop beyond the sweep; target capped at range midpoint.",
      gates: [
        ...quality,
        {
          id: "trigger",
          label: "Playbook sequence",
          status: selected ? "pass" : "wait",
          detail: summary,
        },
        {
          id: "lifecycle",
          label: "First retest window",
          status: lifecycle === "fresh" ? "pass" : selected ? "fail" : "wait",
          detail: `${id === "reversal" ? 15 : 30} minutes to enter; ${id === "reversal" ? 30 : 120} minute maximum paper holding period.`,
        },
        {
          id: "rr",
          label: "Structural target + net RR ≥ 2",
          status: plan && plan.netRR >= 2 ? "pass" : selected ? "fail" : "wait",
          detail:
            "Nearest untouched 15M / 4H obstruction; scalp also capped at range midpoint. Maker entry, taker exit and modeled costs.",
        },
      ],
    };
  });
}
