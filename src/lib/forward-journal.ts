import { Book, Candle, Plan, ResearchModel, Market, Gate } from "./types";
import { tickSize, tradeMath } from "./math";
import { ADAPTIVE_VERSION } from "./adaptive-strategy";

export type PaperStatus =
  | "pending"
  | "open"
  | "won"
  | "lost"
  | "time-exit"
  | "expired"
  | "missed"
  | "ambiguous"
  | "data-gap";
export interface ForwardSignal {
  gatesAtObservation: Gate[];
  marketAtObservation?: Pick<
    Market,
    "volume24h" | "openInterestUsd" | "fundingHourly" | "capped" | "szDecimals"
  >;
  id: string;
  version: string;
  coin: string;
  model: string;
  regime: string;
  observedAt: number;
  activeFrom: number;
  processedThrough: number;
  plan: Plan;
  entryTick: number;
  status: PaperStatus;
  entryAt: number | null;
  exitAt: number | null;
  exitPrice: number | null;
  netR: number | null;
  note: string;
  bookAtObservation: Pick<
    Book,
    "spreadBps" | "bidDepth10bps" | "askDepth10bps" | "time"
  >;
}

export function recordCandidate(
  coin: string,
  model: ResearchModel,
  book: Book | null,
  observedAt: number,
  szDecimals: number,
): ForwardSignal | null {
  if (
    model.status !== "candidate" ||
    !model.plan ||
    !book ||
    book.coin !== coin ||
    !model.gates.every((g) => g.status === "pass") ||
    !model.plan.id.startsWith(ADAPTIVE_VERSION) ||
    observedAt >= model.plan.expiresAt ||
    observedAt < model.plan.formedAt ||
    book.time > observedAt + 2000 ||
    observedAt - book.time > 5000 ||
    observedAt - book.receivedAt > 5000
  )
    return null;
  const activeFrom = Math.ceil(observedAt / 300000) * 300000;
  if (activeFrom >= model.plan.expiresAt) return null;
  return {
    gatesAtObservation: structuredClone(model.gates),
    id: model.plan.id,
    version: ADAPTIVE_VERSION,
    coin,
    model: model.label,
    regime: model.regime ?? "unknown",
    observedAt,
    activeFrom,
    processedThrough: activeFrom,
    plan: structuredClone(model.plan),
    entryTick: tickSize(model.plan.entry, szDecimals),
    status: "pending",
    entryAt: null,
    exitAt: null,
    exitPrice: null,
    netR: null,
    note: "Paper limit activates on the next full 5M bar after observation; one-tick penetration required. No actual fill.",
    bookAtObservation: {
      time: book.time,
      spreadBps: book.spreadBps,
      bidDepth10bps: book.bidDepth10bps,
      askDepth10bps: book.askDepth10bps,
    },
  };
}

export function advancePaper(
  original: ForwardSignal,
  candles: Candle[],
  now: number,
): ForwardSignal {
  if (!["pending", "open"].includes(original.status)) return original;
  const signal = structuredClone(original),
    p = signal.plan;
  const long = p.direction === "long";
  if (
    signal.status === "pending" &&
    signal.processedThrough === signal.activeFrom
  ) {
    const partial = candles.filter(
      (c) =>
        c.time < signal.activeFrom &&
        c.closeTime >= signal.observedAt &&
        c.time < now,
    );
    if (partial.some((c) => (long ? c.low <= p.entry : c.high >= p.entry))) {
      signal.status = "missed";
      signal.note =
        "Retest observed before paper activation; skipped instead of simulating a second retest.";
      return signal;
    }
  }
  const finish = (
    status: "won" | "lost" | "time-exit",
    exit: number,
    c: Candle,
    note: string,
  ) => {
    const math = tradeMath(p.entry, p.stop, p.target, p.direction, p.costs);
    const cost =
      (p.entry * (p.costs.entryFeeBps + p.costs.fundingBps)) / 10000 +
      (exit * (p.costs.exitFeeBps + p.costs.slippageBps)) / 10000;
    signal.status = status;
    signal.exitAt = c.closeTime + 1;
    signal.exitPrice = exit;
    signal.netR = ((exit - p.entry) * (long ? 1 : -1) - cost) / math.netLoss;
    signal.note = note;
  };
  const closed = candles
    .filter((c) => c.closeTime < now && c.time >= signal.processedThrough)
    .sort((a, b) => a.time - b.time);
  for (const c of closed) {
    if (
      signal.status === "pending" &&
      c.time >= p.expiresAt &&
      signal.processedThrough >= p.expiresAt
    ) {
      signal.status = "expired";
      signal.note = "No modeled fill before entry expiry.";
      break;
    }
    if (
      c.time !== signal.processedThrough ||
      c.closeTime < c.time + 299999 ||
      c.closeTime > c.time + 300000
    ) {
      signal.status = "data-gap";
      signal.note = "Missing or malformed 5M bars; outcome withheld.";
      break;
    }
    signal.processedThrough = c.time + 300000;
    if (signal.status === "pending" && c.time >= p.expiresAt) {
      signal.status = "expired";
      signal.note = "No modeled fill before entry expiry.";
      break;
    }
    let entered = false;
    if (signal.status === "pending") {
      const penetrated = long
        ? c.low <= p.entry - signal.entryTick
        : c.high >= p.entry + signal.entryTick;
      if (!penetrated) continue;
      signal.status = "open";
      signal.entryAt = c.time;
      entered = true;
      signal.note =
        "Modeled limit fill after one-tick penetration; not an exchange execution.";
    }
    const stopHit = long ? c.low <= p.stop : c.high >= p.stop;
    const targetHit = long ? c.high >= p.target : c.low <= p.target;
    if (stopHit) {
      const exit = long ? Math.min(p.stop, c.open) : Math.max(p.stop, c.open);
      finish(
        "lost",
        exit,
        c,
        targetHit
          ? "Both exits touched in one bar: conservative stop-first loss."
          : "Modeled stop exit; adverse gap and exit costs included.",
      );
      break;
    }
    if (targetHit && entered) {
      signal.status = "ambiguous";
      signal.exitAt = c.closeTime + 1;
      signal.note =
        "Entry and target occurred in the same bar; order unknown. Outcome excluded.";
      break;
    }
    if (targetHit) {
      finish(
        "won",
        p.target,
        c,
        "Modeled target exit after entry bar; costs deducted.",
      );
      break;
    }
    if (
      signal.entryAt !== null &&
      c.closeTime + 1 >= signal.entryAt + (p.maxHoldMs ?? 7200000)
    ) {
      finish(
        "time-exit",
        c.close,
        c,
        "Maximum holding period reached; modeled close with costs.",
      );
      break;
    }
  }
  if (
    signal.status === "pending" &&
    now >= p.expiresAt &&
    signal.processedThrough >= p.expiresAt
  ) {
    signal.status = "expired";
    signal.note = "No modeled fill before entry expiry.";
  }
  return signal;
}

export function paperMetrics(signals: ForwardSignal[]) {
  const settled = signals
    .filter((s) => s.netR !== null && Number.isFinite(s.netR))
    .sort(
      (a, b) => (a.exitAt ?? 0) - (b.exitAt ?? 0) || a.id.localeCompare(b.id),
    );
  let sum = 0,
    peak = 0,
    drawdown = 0,
    gains = 0,
    losses = 0;
  for (const s of settled) {
    const r = s.netR!;
    sum += r;
    peak = Math.max(peak, sum);
    drawdown = Math.max(drawdown, peak - sum);
    gains += Math.max(0, r);
    losses += Math.max(0, -r);
  }
  return {
    observations: signals.length,
    settled: settled.length,
    wins: settled.filter((s) => s.netR! > 0).length,
    expectancyR: settled.length ? sum / settled.length : null,
    profitFactor: losses > 0 ? gains / losses : null,
    drawdownR: drawdown,
    unresolved: signals.filter(
      (s) => s.status === "ambiguous" || s.status === "data-gap",
    ).length,
  };
}
