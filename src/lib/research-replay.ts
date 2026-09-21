import {
  researchEvents,
  researchLifecycle,
  researchPlan,
  ResearchInput,
} from "./research-strategy";
import { closedCandles, completeSeries, RULES } from "./strategy";
import { INTERVAL_MS, Market, Plan, ResearchModelId } from "./types";

export interface ReplayEvent {
  id: string;
  model: ResearchModelId;
  direction: "long" | "short";
  formedAt: number;
  plan: Plan | null;
  reasons: string[];
  lifecycle: "fresh" | "passed" | "expired" | null;
}
export interface ResearchReplay {
  coin: string;
  from: number;
  to: number;
  evaluatedBars: number;
  expectedBars: number;
  complete: boolean;
  events: ReplayEvent[];
}

// Candle reconstruction only: never substitute today's book, OI or funding
// for historical execution evidence. Funding is an explicit zero assumption.
export function replayResearch(
  market: Market,
  input: ResearchInput,
  now: number,
): ResearchReplay {
  const step = INTERVAL_MS["5m"];
  const to = Math.floor(now / step) * step;
  const from = to - 48 * 60 * 60 * 1000;
  const five = closedCandles(input.five, to);
  const validAt = (time: number) =>
    completeSeries(input.five, step, time, 80) &&
    completeSeries(input.fifteen, INTERVAL_MS["15m"], time, 100) &&
    completeSeries(input.fourHour, INTERVAL_MS["4h"], time, 60);
  const evaluated = new Set(
    five
      .filter(
        (c) =>
          c.closeTime + 1 > from &&
          c.closeTime + 1 <= to &&
          validAt(c.closeTime + 1),
      )
      .map((c) => c.closeTime + 1),
  );
  const events = researchEvents(input, to, 582)
    .filter(
      (event) =>
        event.formedAt > from &&
        event.formedAt <= to &&
        evaluated.has(event.formedAt),
    )
    .map((event): ReplayEvent => {
      const plan = researchPlan(event, { ...market, fundingHourly: 0 }, input);
      const lifecycle = plan ? researchLifecycle(plan, five, null, to) : null;
      const reasons: string[] = [];
      if (!plan) reasons.push("No valid structural target / stop");
      else if (plan.netRR < RULES.minNetRR) reasons.push("Net RR below 2R");
      if (lifecycle === "passed")
        reasons.push("Retest observed; fill unverified");
      if (lifecycle === "expired") reasons.push("Expired without retest");
      if (lifecycle === "fresh")
        reasons.push("Retest pending at review cutoff");
      reasons.push("Historical execution quality unavailable");
      return {
        id: `${market.coin}:${event.model}:${event.direction}:${event.formedAt}`,
        model: event.model,
        direction: event.direction,
        formedAt: event.formedAt,
        plan,
        lifecycle,
        reasons,
      };
    });
  return {
    coin: market.coin,
    from,
    to,
    evaluatedBars: evaluated.size,
    expectedBars: 576,
    complete: evaluated.size === 576,
    events,
  };
}
