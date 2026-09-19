import {
  Analysis,
  Book,
  Candle,
  Direction,
  Gate,
  INTERVAL_MS,
  Market,
  Plan,
  Session,
} from "./types";
import { roundTick, tickSize, tradeMath } from "./math";

export const STRATEGY_VERSION = "2.1-research";
export const RULES = {
  minVolume: 25_000_000,
  minOI: 5_000_000,
  maxSpreadBps: 5,
  minDepth: 10_000,
  maxFunding: 0.0003,
  quoteMaxAge: 5_000,
  minNetRR: 2,
  targetR: 3,
};
export interface Pivot {
  kind: "high" | "low";
  price: number;
  time: number;
  confirmedAt: number;
}
interface Level {
  price: number;
  knownAt: number;
  id: string;
}

export function closedCandles(candles: Candle[], now: number): Candle[] {
  return candles
    .filter((c) => c.closeTime < now)
    .sort((a, b) => a.time - b.time);
}
export function pivots(candles: Candle[], asOf = Infinity): Pivot[] {
  const result: Pivot[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const confirmedAt = candles[i + 2].closeTime;
    if (confirmedAt >= asOf) continue;
    const neighbors = [
      candles[i - 2],
      candles[i - 1],
      candles[i + 1],
      candles[i + 2],
    ];
    if (neighbors.every((n) => c.high > n.high))
      result.push({ kind: "high", price: c.high, time: c.time, confirmedAt });
    if (neighbors.every((n) => c.low < n.low))
      result.push({ kind: "low", price: c.low, time: c.time, confirmedAt });
  }
  return result;
}
export function structure(candles: Candle[], asOf = Infinity): Direction {
  const ps = pivots(candles, asOf);
  const highs = ps.filter((p) => p.kind === "high").slice(-2);
  const lows = ps.filter((p) => p.kind === "low").slice(-2);
  if (highs.length < 2 || lows.length < 2) return "neutral";
  if (highs[1].price > highs[0].price && lows[1].price > lows[0].price)
    return "long";
  if (highs[1].price < highs[0].price && lows[1].price < lows[0].price)
    return "short";
  return "neutral";
}
export function atrSeries(
  candles: Candle[],
  period = 14,
): Array<number | null> {
  let seed = 0;
  let atr: number | null = null;
  return candles.map((c, i) => {
    const previous = i ? candles[i - 1].close : c.open;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - previous),
      Math.abs(c.low - previous),
    );
    if (i < period) seed += tr;
    if (i === period - 1) atr = seed / period;
    else if (i >= period && atr !== null)
      atr = (atr * (period - 1) + tr) / period;
    return atr;
  });
}
export function sessionAt(now: number): Session {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => p.find((x) => x.type === type)?.value ?? "";
  const hour = Number(part("hour"));
  const weekend = ["Sat", "Sun"].includes(part("weekday"));
  const label =
    hour === 3
      ? "London window"
      : hour === 10
        ? "New York AM"
        : hour === 14
          ? "New York PM"
          : "Outside entry window";
  const open = !weekend && [3, 10, 14].includes(hour);
  return {
    open,
    label: weekend ? "Weekend · observation only" : label,
    nyTime: `${part("hour")}:${part("minute")}`,
    key: `${part("year")}-${part("month")}-${part("day")}/${hour}`,
  };
}
export function quoteFresh(book: Book | null, now: number): boolean {
  return (
    !!book &&
    now - book.time <= RULES.quoteMaxAge &&
    now - book.receivedAt <= RULES.quoteMaxAge &&
    book.time <= now + 2000 &&
    book.bid > 0 &&
    book.ask >= book.bid
  );
}
export function completeSeries(
  candles: Candle[],
  interval: number,
  now: number,
  minimum: number,
): boolean {
  const closed = closedCandles(candles, now);
  if (closed.length < minimum) return false;
  const expectedOpen = Math.floor(now / interval) * interval - interval;
  if (closed.at(-1)?.time !== expectedOpen) return false;
  return closed.every(
    (c, i) =>
      c.time % interval === 0 &&
      c.closeTime >= c.time + interval - 1 &&
      c.closeTime <= c.time + interval &&
      (!i || c.time - closed[i - 1].time === interval),
  );
}
export function retestState(
  plan: {
    direction: "long" | "short";
    entry: number;
    gapLow: number;
    gapHigh: number;
    formedAt: number;
    expiresAt: number;
  },
  candles: Candle[],
  book: Book,
  now: number,
): "fresh" | "touched" | "invalidated" | "expired" | "session-closed" {
  const long = plan.direction === "long";
  const later = candles.filter((c) => c.time >= plan.formedAt && c.time < now);
  // A touch precedes a later close-based cancellation. Never erase it retrospectively.
  if (
    later.some((c) => (long ? c.low <= plan.entry : c.high >= plan.entry)) ||
    (long ? book.bid <= plan.entry : book.ask >= plan.entry)
  )
    return "touched";
  if (
    later.some(
      (c) =>
        c.closeTime < now &&
        (long ? c.close < plan.gapLow : c.close > plan.gapHigh),
    )
  )
    return "invalidated";
  if (now >= plan.expiresAt) return "expired";
  const formedSession = sessionAt(plan.formedAt);
  const session = sessionAt(now);
  if (!formedSession.open || !session.open || formedSession.key !== session.key)
    return "session-closed";
  return "fresh";
}
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
}
function levelsAt(
  candles: Candle[],
  kind: "high" | "low",
  asOf: number,
): Level[] {
  const result: Level[] = pivots(candles, asOf)
    .filter((p) => p.kind === kind)
    .map((p) => ({
      price: p.price,
      knownAt: p.confirmedAt + 1,
      id: `${kind}:${p.time}`,
    }));
  const dayStart = Math.floor(asOf / 86_400_000) * 86_400_000;
  const previous = candles.filter(
    (c) => c.time >= dayStart - 86_400_000 && c.closeTime < dayStart,
  );
  if (previous.length === 96 && previous[0].time === dayStart - 86_400_000)
    result.push({
      price:
        kind === "high"
          ? Math.max(...previous.map((c) => c.high))
          : Math.min(...previous.map((c) => c.low)),
      knownAt: dayStart,
      id: `previous-day-${kind}:${dayStart}`,
    });
  return result;
}
function untouched(
  level: Level,
  kind: "high" | "low",
  five: Candle[],
  fifteen: Candle[],
  until: number,
): boolean {
  // Use complete 15m history for older levels, and 5m candles for the current partial 15m interval.
  return [...fifteen, ...five]
    .filter((c) => c.time >= level.knownAt && c.closeTime < until)
    .every((c) =>
      kind === "high" ? c.high < level.price : c.low > level.price,
    );
}
function localRange(fifteen: Candle[], long: boolean, asOf: number) {
  const ps = pivots(fifteen, asOf);
  const anchor = ps.filter((p) => p.kind === (long ? "low" : "high")).at(-1);
  if (!anchor) return null;
  const other = ps
    .filter((p) => p.kind === (long ? "high" : "low") && p.time > anchor.time)
    .at(-1);
  if (!other) return null;
  const low = long ? anchor.price : other.price;
  const high = long ? other.price : anchor.price;
  if (low >= high) return null;
  if (
    fifteen.some(
      (c) =>
        c.time > other.time &&
        c.closeTime < asOf &&
        (long ? c.close < low : c.close > high),
    )
  )
    return null;
  return { low, high };
}

export function analyze(
  market: Market,
  input: {
    five: Candle[];
    fifteen: Candle[];
    fourHour: Candle[];
    book: Book | null;
  },
  now: number,
): Analysis {
  const { book } = input;
  const five = closedCandles(input.five, now);
  const fifteen = closedCandles(input.fifteen, now);
  const four = closedCandles(input.fourHour, now);
  const session = sessionAt(now);
  const direction = structure(four, now);
  const gates: Gate[] = [];
  const gate = (
    id: string,
    label: string,
    status: Gate["status"],
    detail: string,
  ) => gates.push({ id, label, status, detail });
  const candlesOK =
    completeSeries(input.five, INTERVAL_MS["5m"], now, 80) &&
    completeSeries(input.fifteen, INTERVAL_MS["15m"], now, 100) &&
    completeSeries(input.fourHour, INTERVAL_MS["4h"], now, 60);
  const liquid =
    market.volume24h !== null &&
    market.volume24h >= RULES.minVolume &&
    market.openInterestUsd !== null &&
    market.openInterestUsd >= RULES.minOI &&
    market.capped === false &&
    !!book &&
    book.spreadBps <= RULES.maxSpreadBps &&
    Math.min(book.bidDepth10bps, book.askDepth10bps) >= RULES.minDepth &&
    market.fundingHourly !== null &&
    Math.abs(market.fundingHourly) <= RULES.maxFunding;
  const quoteOK = quoteFresh(book, now);
  gate(
    "data",
    "Complete, current data",
    candlesOK && quoteOK ? "pass" : "fail",
    !candlesOK
      ? "A required closed candle is missing, delayed, or non-contiguous."
      : !quoteOK
        ? "Executable quote must be no more than 5 seconds old."
        : "Closed 4h / 15m / 5m bars; exchange-stamped bid and ask.",
  );
  gate(
    "liquidity",
    "Execution quality",
    liquid ? "pass" : "fail",
    liquid
      ? "Volume ≥ $25m, OI ≥ $5m, spread ≤ 5 bps, both sides ≥ $10k within 10 bps."
      : "One or more volume, OI, spread, observed depth, funding or OI-cap checks did not pass.",
  );
  gate(
    "structure",
    "4-hour structure",
    direction === "neutral" ? "wait" : "pass",
    direction === "neutral"
      ? "Mixed or insufficient confirmed swing structure. No directional entry."
      : `${direction === "long" ? "Higher highs + higher lows" : "Lower highs + lower lows"}; ${direction} continuation only.`,
  );

  let stage =
    direction === "neutral" ? "Mixed structure" : "Watching liquidity";
  let summary =
    direction === "neutral"
      ? "Wait for an unambiguous 4-hour trend."
      : "Waiting for a pre-existing liquidity level to be swept and reclaimed.";
  let plan: Plan | null = null;
  let sweepSeen = false;
  let displacementSeen = false;
  let gapSeen = false;
  let rangeOK = false;
  let targetOK = false;
  let netOK = false;
  let lifecycleReason =
    "No new, confirmed three-candle gap after a qualifying sweep.";

  if (direction !== "neutral" && candlesOK && book) {
    const long = direction === "long";
    const tick = tickSize(market.mark, market.szDecimals);
    const atrs = atrSeries(five);
    // Only recent events can still be inside the six-bar pending lifetime. Every
    // event uses pivots confirmed before its own time, not the final chart's pivots.
    search: for (
      let s = five.length - 1;
      s >= Math.max(22, five.length - 18);
      s--
    ) {
      const sweep = five[s];
      if (structure(four, sweep.time) !== direction) continue;
      const atr = atrs[s - 1];
      if (!atr || !Number.isFinite(tick)) continue;
      const kind = long ? "low" : "high";
      const available = levelsAt(fifteen, kind, sweep.time)
        .filter(
          (l) =>
            (long
              ? l.price < five[s - 1].close
              : l.price > five[s - 1].close) &&
            untouched(l, kind, five, fifteen, sweep.time),
        )
        .sort((a, b) => (long ? b.price - a.price : a.price - b.price));
      const level = available[0];
      if (!level) continue;
      const threshold = Math.max(2 * tick, 0.05 * atr);
      if (
        long
          ? sweep.low > level.price - threshold
          : sweep.high < level.price + threshold
      )
        continue;
      const trigger = pivots(five, sweep.time)
        .filter((p) => p.kind === (long ? "high" : "low"))
        .at(-1);
      if (!trigger) continue;
      let reclaim = -1;
      for (let r = s; r <= Math.min(s + 2, five.length - 1); r++) {
        if (long ? five[r].close > level.price : five[r].close < level.price) {
          reclaim = r;
          break;
        }
      }
      if (reclaim < 0) continue;
      sweepSeen = true;
      stage = "Sweep reclaimed";
      summary =
        "Reclaim confirmed. Waiting for a displacement break and a new gap.";
      const range = localRange(fifteen, long, five[reclaim].closeTime + 1);
      const sweepExtreme = long
        ? Math.min(...five.slice(s, reclaim + 1).map((c) => c.low))
        : Math.max(...five.slice(s, reclaim + 1).map((c) => c.high));
      for (
        let d = reclaim + 1;
        d <= Math.min(reclaim + 3, five.length - 1);
        d++
      ) {
        const c = five[d];
        const body = Math.abs(c.close - c.open);
        const med = median(
          five.slice(d - 20, d).map((x) => Math.abs(x.close - x.open)),
        );
        if (
          !(med > 0) ||
          c.high <= c.low ||
          body < 1.5 * med ||
          body / (c.high - c.low) < 0.6 ||
          !(long
            ? c.close > c.open && c.close > trigger.price
            : c.close < c.open && c.close < trigger.price)
        )
          continue;
        displacementSeen = true;
        stage = "Waiting for gap";
        if (!five[d + 1]) continue;
        const first = five[d - 1];
        const third = five[d + 1];
        const low = long ? first.high : third.high;
        const high = long ? third.low : first.low;
        if (high - low < 2 * tick) continue;
        gapSeen = true;
        const formedAt = third.closeTime + 1;
        const midpoint = (high + low) / 2;
        const entry = roundTick(
          midpoint,
          tickSize(midpoint, market.szDecimals),
          long ? "down" : "up",
        );
        const expiresAt = formedAt + 6 * INTERVAL_MS["5m"];
        const lifecycle = retestState(
          { direction, entry, gapLow: low, gapHigh: high, formedAt, expiresAt },
          input.five,
          book,
          now,
        );
        if (lifecycle !== "fresh") {
          lifecycleReason =
            lifecycle === "touched"
              ? "First retracement already observed; a candle touch is not execution evidence."
              : lifecycle === "invalidated"
                ? "Gap invalidated by a completed close."
                : lifecycle === "expired"
                  ? "The six-bar pending lifetime has ended."
                  : "Gap did not form in the current weekday entry window.";
          stage =
            lifecycle === "touched" ? "Retracement passed" : "No fresh setup";
          summary = lifecycleReason;
          continue;
        }
        rangeOK =
          !!range &&
          (long
            ? entry >= range.low && entry <= (range.high + range.low) / 2
            : entry <= range.high && entry >= (range.high + range.low) / 2);
        const buffer = Math.max(
          2 * tick,
          2 * (book.ask - book.bid),
          0.15 * (atrs[d + 1] ?? atr),
        );
        const stopRaw = sweepExtreme + (long ? -buffer : buffer);
        if (stopRaw <= 0) continue;
        const stop = roundTick(
          stopRaw,
          tickSize(stopRaw, market.szDecimals),
          long ? "down" : "up",
        );
        const distance = Math.abs(entry - stop);
        if (!(distance > 0) || (long ? stop >= entry : stop <= entry)) continue;
        const targetRaw = entry + (long ? 1 : -1) * RULES.targetR * distance;
        if (targetRaw <= 0) continue;
        const target = roundTick(
          targetRaw,
          tickSize(targetRaw, market.szDecimals),
          long ? "down" : "up",
        );
        const opposingKind = long ? "high" : "low";
        const obstacles = levelsAt(fifteen, opposingKind, formedAt)
          .filter(
            (l) =>
              (long ? l.price > entry : l.price < entry) &&
              untouched(l, opposingKind, five, fifteen, now),
          )
          .sort((a, b) => (long ? a.price - b.price : b.price - a.price));
        const obstacle = obstacles[0]?.price;
        targetOK =
          obstacle !== undefined &&
          (long ? target <= obstacle - buffer : target >= obstacle + buffer);
        const costs = {
          entryFeeBps: 1.5,
          exitFeeBps: 4.5,
          slippageBps: 2,
          fundingBps: Math.max(
            0,
            (market.fundingHourly ?? 0) * (long ? 1 : -1) * 2 * 10_000,
          ),
        };
        const math = tradeMath(entry, stop, target, direction, costs);
        netOK = math.valid && math.netRR >= RULES.minNetRR;
        lifecycleReason =
          "First midpoint retracement remains ahead; never a guaranteed limit fill.";
        summary = !rangeOK
          ? "Fresh gap is outside the required half of the frozen local range."
          : !targetOK
            ? "There is not enough room before opposing liquidity for a 3R target."
            : !netOK
              ? "Estimated costs reduce the reward/risk below the 2.0 minimum."
              : "Research candidate only. Review live execution, portfolio risk and fill conditions.";
        stage = rangeOK && targetOK && netOK ? "Fresh setup" : "Setup filtered";
        if (range && obstacle !== undefined)
          plan = {
            id: `${market.coin}:${direction}:${formedAt}`,
            direction,
            entry,
            stop,
            target,
            gapLow: low,
            gapHigh: high,
            formedAt,
            expiresAt,
            sweepLevel: level.price,
            sweepExtreme,
            triggerLevel: trigger.price,
            obstacle,
            rangeLow: range.low,
            rangeHigh: range.high,
            netRR: math.netRR,
            grossRR: math.grossRR,
            costs,
          };
        break search;
      }
    }
  }
  gate(
    "sweep",
    "Liquidity sweep + reclaim",
    sweepSeen ? "pass" : "wait",
    sweepSeen
      ? "A pre-existing level was reclaimed within three closed 5m bars."
      : "Requires a ≥ 2-tick / 0.05 ATR excursion and a timely reclaim.",
  );
  gate(
    "displacement",
    "Displacement + break",
    displacementSeen ? "pass" : "wait",
    "Close beyond the pre-sweep swing; body ≥ 1.5× prior median and ≥ 60% of range.",
  );
  gate(
    "gap",
    "Fresh first retracement",
    plan ? "pass" : gapSeen ? "fail" : "wait",
    lifecycleReason,
  );
  gate(
    "range",
    "Local range alignment",
    rangeOK ? "pass" : "wait",
    "Long entry in the lower half; short entry in the upper half of the frozen 15m range.",
  );
  gate(
    "room",
    "Structural target room",
    targetOK ? "pass" : "wait",
    "A 3R target must sit before the nearest untouched opposing liquidity, with a buffer.",
  );
  gate(
    "rr",
    "Net reward / risk ≥ 2.0",
    netOK ? "pass" : "wait",
    plan
      ? `${plan.netRR.toFixed(2)} net after assumed fees, exit slippage and two hours of adverse funding.`
      : "Calculated only for an actual candidate, with the stop at structural invalidation.",
  );
  gate(
    "session",
    "Weekday entry window",
    session.open ? "pass" : "fail",
    `${session.label}. New York 03–04, 10–11 or 14–15; DST-aware.`,
  );
  const ready = gates.every((g) => g.status === "pass") && plan !== null;
  if (!candlesOK || !quoteOK) {
    stage = "Data blocked";
    summary = "A required feed is incomplete or stale. No actionable setup.";
  } else if (!liquid) {
    stage = "Liquidity filtered";
    summary =
      "Market is visible, but it did not pass every execution-quality gate.";
  } else if (!session.open && stage === "Fresh setup") stage = "Window closed";
  return {
    coin: market.coin,
    direction,
    stage,
    summary,
    gates,
    plan,
    book,
    evaluatedAt: now,
    lastClosedBar: five.at(-1)?.closeTime ?? null,
    liquid,
    ready,
    score: gates.filter((g) => g.status === "pass").length,
    session,
  };
}

export function blockedAnalysis(coin: string, now: number): Analysis {
  return {
    coin,
    direction: "neutral",
    stage: "Data unavailable",
    summary:
      "The venue did not return complete data. Refresh to retry; no cached price is treated as live.",
    score: 0,
    gates: [
      {
        id: "data",
        label: "Market data",
        status: "fail",
        detail: "Venue request failed or returned invalid data.",
      },
    ],
    plan: null,
    book: null,
    evaluatedAt: now,
    lastClosedBar: null,
    liquid: false,
    ready: false,
    session: sessionAt(now),
  };
}
