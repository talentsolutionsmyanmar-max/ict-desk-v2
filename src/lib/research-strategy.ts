import {
  atrSeries,
  closedCandles,
  completeSeries,
  pivots,
  quoteFresh,
  RULES,
  structure,
} from "./strategy";
import { roundTick, tickSize, tradeMath } from "./math";
import {
  Book,
  Candle,
  Direction,
  Gate,
  INTERVAL_MS,
  Market,
  Plan,
  ResearchModel,
  ResearchModelId,
} from "./types";

export const RESEARCH_VERSION = "3.0-shadow";
export const RESEARCH_MODELS = [
  { id: "continuation", label: "Trend continuation" },
  { id: "reversal", label: "Sweep reversal" },
  { id: "breakout", label: "Break & retest" },
] as const;
export interface ResearchInput {
  five: Candle[];
  fifteen: Candle[];
  fourHour: Candle[];
  book: Book | null;
}
export interface ResearchEvent {
  model: ResearchModelId;
  direction: "long" | "short";
  formedAt: number;
  trigger: number;
  extreme: number;
  swept: number;
  atr: number;
}

// Events depend exclusively on information available at each closed bar.
// No session filter, FVG requirement, OI direction inference, or fitted score.
export function researchEvents(
  input: Omit<ResearchInput, "book">,
  now: number,
): ResearchEvent[] {
  const five = closedCandles(input.five, now);
  const fifteen = closedCandles(input.fifteen, now);
  const four = closedCandles(input.fourHour, now);
  const atrs = atrSeries(five);
  const events: ResearchEvent[] = [];
  const strong = (c: Candle, atr: number, long: boolean) =>
    c.high > c.low &&
    Math.abs(c.close - c.open) >= 0.8 * atr &&
    Math.abs(c.close - c.open) / (c.high - c.low) >= 0.6 &&
    (long ? c.close > c.open : c.close < c.open);
  for (let i = Math.max(22, five.length - 18); i < five.length; i++) {
    const c = five[i],
      atr = atrs[i - 1];
    if (!atr || atr <= 0) continue;
    const known15 = pivots(fifteen, c.time);
    const known5 = pivots(five, c.time);
    for (const direction of ["long", "short"] as const) {
      const long = direction === "long";
      const trend = structure(four, c.time);
      const breakLevel = known15
        .filter((p) => p.kind === (long ? "high" : "low"))
        .at(-1);
      const stopPivot = known5
        .filter((p) => p.kind === (long ? "low" : "high"))
        .at(-1);
      if (breakLevel && stopPivot && strong(c, atr, long)) {
        const preceding = [...fifteen, ...five].filter(
          (b) => b.time > breakLevel.confirmedAt && b.closeTime < c.time,
        );
        const unbroken = preceding.every((b) =>
          long ? b.close <= breakLevel.price : b.close >= breakLevel.price,
        );
        const crossed = long
          ? five[i - 1].close <= breakLevel.price &&
            c.close > breakLevel.price + 0.1 * atr
          : five[i - 1].close >= breakLevel.price &&
            c.close < breakLevel.price - 0.1 * atr;
        if (unbroken && crossed)
          events.push({
            model: trend === direction ? "continuation" : "breakout",
            direction,
            formedAt: c.closeTime + 1,
            trigger: breakLevel.price,
            extreme: long
              ? Math.min(stopPivot.price, c.low)
              : Math.max(stopPivot.price, c.high),
            swept: breakLevel.price,
            atr,
          });
      }
      // A reversal is a sweep/reclaim followed by a local structure break;
      // neither a wick alone nor the final chart's later-confirmed pivots qualifies.
      const swept = known15
        .filter((p) => p.kind === (long ? "low" : "high"))
        .at(-1);
      const trigger = known5
        .filter((p) => p.kind === (long ? "high" : "low"))
        .at(-1);
      if (!swept || !trigger) continue;
      const prior = [...fifteen, ...five].filter(
        (b) => b.time > swept.confirmedAt && b.closeTime < c.time,
      );
      if (
        !prior.every((b) => (long ? b.low > swept.price : b.high < swept.price))
      )
        continue;
      if (
        !(long
          ? c.low < swept.price - 0.1 * atr
          : c.high > swept.price + 0.1 * atr)
      )
        continue;
      const reclaimed = five.findIndex(
        (b, j) =>
          j >= i &&
          j <= i + 2 &&
          (long ? b.close > swept.price : b.close < swept.price),
      );
      if (reclaimed < 0) continue;
      for (
        let d = reclaimed + 1;
        d <= Math.min(reclaimed + 3, five.length - 1);
        d++
      ) {
        const impulse = five[d];
        if (
          !strong(impulse, atrs[d - 1] ?? atr, long) ||
          !(long
            ? impulse.close > trigger.price + 0.1 * atr
            : impulse.close < trigger.price - 0.1 * atr)
        )
          continue;
        events.push({
          model: "reversal",
          direction,
          formedAt: impulse.closeTime + 1,
          trigger: trigger.price,
          swept: swept.price,
          atr,
          extreme: long
            ? Math.min(...five.slice(i, d + 1).map((b) => b.low))
            : Math.max(...five.slice(i, d + 1).map((b) => b.high)),
        });
        break;
      }
    }
  }
  return events.sort((a, b) => b.formedAt - a.formedAt);
}

export function researchLifecycle(
  plan: Plan,
  candles: Candle[],
  book: Book | null,
  now: number,
): "fresh" | "passed" | "expired" {
  const later = candles.filter(
    (c) => c.time >= plan.formedAt && c.time < Math.min(now, plan.expiresAt),
  );
  // A prior observed touch must never disappear merely because price moved away.
  if (
    later.some((c) =>
      plan.direction === "long" ? c.low <= plan.entry : c.high >= plan.entry,
    ) ||
    (now < plan.expiresAt &&
      book &&
      (plan.direction === "long"
        ? book.bid <= plan.entry
        : book.ask >= plan.entry))
  )
    return "passed";
  if (now >= plan.expiresAt) return "expired";
  return "fresh";
}

export function researchPlan(
  event: ResearchEvent,
  market: Market,
  input: ResearchInput,
): Plan | null {
  const long = event.direction === "long";
  const tick = tickSize(event.trigger, market.szDecimals);
  const buffer = Math.max(2 * tick, 0.15 * event.atr);
  const entry = roundTick(event.trigger, tick, long ? "down" : "up");
  const stopRaw = event.extreme + (long ? -buffer : buffer);
  if (stopRaw <= 0) return null;
  const stop = roundTick(
    stopRaw,
    tickSize(stopRaw, market.szDecimals),
    long ? "down" : "up",
  );
  if (long ? stop >= entry : stop <= entry) return null;
  const fifteen = closedCandles(input.fifteen, event.formedAt);
  const five = closedCandles(input.five, event.formedAt);
  const obstacles = pivots(fifteen, event.formedAt)
    .filter(
      (p) =>
        p.kind === (long ? "high" : "low") &&
        (long ? p.price > entry + buffer : p.price < entry - buffer),
    )
    .filter((p) =>
      [...fifteen, ...five]
        .filter((c) => c.time > p.confirmedAt && c.closeTime < event.formedAt)
        .every((c) => (long ? c.high < p.price : c.low > p.price)),
    )
    .sort((a, b) => (long ? a.price - b.price : b.price - a.price));
  const obstacle = obstacles[0]?.price;
  if (obstacle === undefined) return null; // Unknown target room is not infinite room.
  const distance = Math.abs(entry - stop);
  const targetRaw = long
    ? Math.min(obstacle - buffer, entry + 4 * distance)
    : Math.max(obstacle + buffer, entry - 4 * distance);
  if (targetRaw <= 0) return null;
  const target = roundTick(
    targetRaw,
    tickSize(targetRaw, market.szDecimals),
    long ? "down" : "up",
  );
  const costs = {
    entryFeeBps: 1.5,
    exitFeeBps: 4.5,
    slippageBps: 2,
    fundingBps: Math.max(
      0,
      (market.fundingHourly ?? 0) * (long ? 1 : -1) * 2 * 10000,
    ),
  };
  const math = tradeMath(entry, stop, target, event.direction, costs);
  if (!math.valid) return null;
  return {
    id: `${RESEARCH_VERSION}:${market.coin}:${event.model}:${event.direction}:${event.formedAt}`,
    direction: event.direction,
    entry,
    stop,
    target,
    gapLow: entry - buffer,
    gapHigh: entry + buffer,
    formedAt: event.formedAt,
    expiresAt: event.formedAt + 6 * INTERVAL_MS["5m"],
    sweepLevel: event.swept,
    sweepExtreme: event.extreme,
    triggerLevel: event.trigger,
    obstacle,
    rangeLow: Math.min(stop, target),
    rangeHigh: Math.max(stop, target),
    netRR: math.netRR,
    grossRR: math.grossRR,
    costs,
  };
}

export function analyzeResearch(
  market: Market,
  input: ResearchInput,
  now: number,
): ResearchModel[] {
  const dataOK =
    completeSeries(input.five, INTERVAL_MS["5m"], now, 80) &&
    completeSeries(input.fifteen, INTERVAL_MS["15m"], now, 100) &&
    completeSeries(input.fourHour, INTERVAL_MS["4h"], now, 60) &&
    quoteFresh(input.book, now);
  const b = input.book;
  const liquid =
    (market.volume24h ?? -1) >= RULES.minVolume &&
    (market.openInterestUsd ?? -1) >= RULES.minOI &&
    market.capped === false &&
    market.fundingHourly !== null &&
    Number.isFinite(market.fundingHourly) &&
    Math.abs(market.fundingHourly) <= RULES.maxFunding &&
    !!b &&
    b.spreadBps <= RULES.maxSpreadBps &&
    Math.min(b.bidDepth10bps, b.askDepth10bps) >= RULES.minDepth;
  const events = dataOK ? researchEvents(input, now) : [];
  const trend: Direction = structure(closedCandles(input.fourHour, now), now);
  return RESEARCH_MODELS.map(({ id, label }) => {
    const event = events.find((e) => e.model === id);
    const plan = event ? researchPlan(event, market, input) : null;
    const lifecycle = plan ? researchLifecycle(plan, input.five, b, now) : null;
    const netOK = !!plan && plan.netRR >= RULES.minNetRR;
    const gates: Gate[] = [
      {
        id: "data",
        label: "Current, complete data",
        status: dataOK ? "pass" : "fail",
        detail:
          "Closed, contiguous 4h/15m/5m bars and a quote no more than 5 seconds old.",
      },
      {
        id: "liquidity",
        label: "Execution quality",
        status: liquid ? "pass" : "fail",
        detail:
          "Volume, OI level, spread, depth, funding and OI-cap checks. These remain hard safeguards.",
      },
      {
        id: "trigger",
        label: "Confirmed model trigger",
        status: event ? "pass" : "wait",
        detail:
          "Pre-existing confirmed swing and closed 5m displacement; no forming-bar confirmation.",
      },
      {
        id: "lifecycle",
        label: "Untouched, unexpired retest",
        status: lifecycle === "fresh" ? "pass" : event ? "fail" : "wait",
        detail:
          "First retest at the broken swing, valid 30 minutes on any day. A touch is not evidence of a fill.",
      },
      {
        id: "rr",
        label: "Structural room + net RR ≥ 2",
        status: netOK ? "pass" : event ? "fail" : "wait",
        detail:
          "Target before the nearest known untouched 15m obstacle, capped at 4R gross; fees, slippage and adverse funding deducted.",
      },
    ];
    const status: ResearchModel["status"] =
      !dataOK || !liquid
        ? "blocked"
        : !event
          ? "watching"
          : lifecycle === "passed"
            ? "passed"
            : lifecycle === "expired"
              ? "expired"
              : !netOK
                ? "filtered"
                : "candidate";
    return {
      id,
      label,
      direction: event?.direction ?? "neutral",
      status,
      gates,
      plan,
      context: `4h ${trend === "neutral" ? "mixed" : trend === "long" ? "bullish" : "bearish"} · 24/7 · unvalidated hypothesis`,
      trigger:
        id === "reversal"
          ? "Sweep and reclaim a confirmed 15m swing, then close through the pre-sweep 5m swing with displacement."
          : id === "continuation"
            ? "Displacement through a confirmed 15m swing in the 4h trend direction; wait for its first retest."
            : "Displacement through a confirmed 15m swing against, or without, a 4h trend; wait for its first retest.",
      summary:
        status === "blocked"
          ? "Required market data or execution quality is unavailable."
          : status === "watching"
            ? "No recent closed-bar trigger for this model."
            : status === "passed"
              ? "Retest already observed. No late entry or assumed fill."
              : status === "expired"
                ? "The 30-minute retest window has ended."
                : status === "filtered"
                  ? "Trigger found, but structural target room or cost-adjusted RR is insufficient."
                  : "Untouched retest scenario. Review account sizing; this is not a validated trade recommendation.",
    };
  });
}
