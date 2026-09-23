import { tradeMath } from "./math";
import {
  DEFAULT_RISK_PERCENT,
  SMALL_ACCOUNT_EQUITY,
  sizeScenario,
} from "./sizing";
import { STRATEGY_VERSION } from "./strategy";
import {
  Analysis,
  Direction,
  Gate,
  Plan,
  Session,
  TradeMath,
} from "./types";

export const JOURNAL_DRAFT_KEY = "ict-edge-journal-draft-v1";

export type SizeScenarioResult = ReturnType<typeof sizeScenario>;

export type Freshness =
  | "fresh"
  | "touched"
  | "invalidated"
  | "expired"
  | "session-closed"
  | "none";

/** Packaged live Trade Plan for research desk display. Not an order. */
export interface TradePlanView {
  coin: string;
  strategyVersion: string;
  ready: boolean;
  direction: Direction;
  stage: string;
  summary: string;
  session: Session;
  blockedReasons: string[];
  gates: Gate[];
  checklistFails: Gate[];
  entry: number | null;
  stop: number | null;
  target: number | null;
  gapLow: number | null;
  gapHigh: number | null;
  grossRR: number | null;
  netRR: number | null;
  math: TradeMath | null;
  size: SizeScenarioResult | null;
  invalidation: string;
  freshness: Freshness;
  planId: string | null;
  formedAt: number | null;
  expiresAt: number | null;
  evaluatedAt: number;
  equityDefault: number;
  riskPercentDefault: number;
  hasCandidateLevels: boolean;
}

export interface JournalDraft {
  coin: string;
  direction: "long" | "short";
  entry: string;
  stop: string;
  exit: string;
  quantity: string;
  fees: string;
  funding: string;
  notes: string;
  openedAt: string;
  closedAt: string;
  seededFromPlanId: string | null;
  seededAt: string;
  researchOnly: true;
}

function sessionFallback(now: number): Session {
  return {
    open: false,
    label: "Session unknown",
    nyTime: "—",
    key: `unknown/${now}`,
  };
}

function blockedFromGates(gates: Gate[]): string[] {
  return gates
    .filter((g) => g.status !== "pass")
    .map((g) => `${g.label}: ${g.detail}`);
}

function invalidationText(
  plan: Plan | null,
  freshness: Freshness,
  session: Session,
): string {
  if (!plan) {
    return "No candidate levels. Invalidation applies only after a fresh gap midpoint is packaged.";
  }
  const structural =
    plan.direction === "long"
      ? `A completed close below gap low ${plan.gapLow} invalidates the long gap.`
      : `A completed close above gap high ${plan.gapHigh} invalidates the short gap.`;
  const lifetime = `Candidate expires at ${new Date(plan.expiresAt).toISOString()} or when the weekday entry window closes (${session.label}).`;
  const retest =
    freshness === "touched"
      ? "First retracement already observed — not evidence of a fill; no new entry is offered."
      : "Any later candle touch of the entry (or a marketable quote through it) ends the first-retest offer.";
  return `${structural} ${lifetime} ${retest}`;
}

/**
 * Pure assembler: packages analyze() + tradeMath + sizeScenario into one
 * TradePlanView. Never writes to an exchange or wallet.
 */
export function buildTradePlanView(input: {
  analysis: Analysis | null | undefined;
  /** Live-adjusted gates from the desk; defaults to analysis.gates. */
  gates?: Gate[];
  /** Live plan after retest/expiry filtering; defaults to analysis.plan. */
  plan?: Plan | null;
  /** Optional explicit freshness override from live desk checks. */
  freshness?: Freshness;
  szDecimals?: number;
  equity?: number;
  riskPercent?: number;
  now?: number;
}): TradePlanView {
  const equity = input.equity ?? SMALL_ACCOUNT_EQUITY;
  const riskPercent = input.riskPercent ?? DEFAULT_RISK_PERCENT;
  const now = input.now ?? Date.now();
  const analysis = input.analysis;

  if (!analysis) {
    const session = sessionFallback(now);
    return {
      coin: "—",
      strategyVersion: STRATEGY_VERSION,
      ready: false,
      direction: "neutral",
      stage: "No analysis",
      summary:
        "Waiting for a scanned analysis. Trade Plan Analytics packages existing gates only — it does not invent setups.",
      session,
      blockedReasons: [
        "No scanned analysis for this market. Chart-only symbols outside the scan universe have no packaged plan.",
      ],
      gates: [],
      checklistFails: [],
      entry: null,
      stop: null,
      target: null,
      gapLow: null,
      gapHigh: null,
      grossRR: null,
      netRR: null,
      math: null,
      size: null,
      invalidation:
        "No candidate levels. Invalidation applies only after a fresh gap midpoint is packaged.",
      freshness: "none",
      planId: null,
      formedAt: null,
      expiresAt: null,
      evaluatedAt: now,
      equityDefault: equity,
      riskPercentDefault: riskPercent,
      hasCandidateLevels: false,
    };
  }

  const gates = input.gates ?? analysis.gates;
  const plan =
    input.plan !== undefined ? input.plan : (analysis.plan ?? null);
  const blockedReasons = blockedFromGates(gates);
  const checklistFails = gates.filter((g) => g.status !== "pass");

  let freshness: Freshness = input.freshness ?? "none";
  if (input.freshness === undefined) {
    if (!plan && analysis.plan) {
      // Desk nulled the plan after live retest / expiry.
      freshness = "touched";
    } else if (plan) {
      freshness = "fresh";
    } else {
      freshness = "none";
    }
  }

  let math: TradeMath | null = null;
  let size: SizeScenarioResult | null = null;
  let grossRR: number | null = null;
  let netRR: number | null = null;

  if (plan) {
    math = tradeMath(
      plan.entry,
      plan.stop,
      plan.target,
      plan.direction,
      plan.costs,
    );
    grossRR = math.valid ? math.grossRR : plan.grossRR;
    netRR = math.valid ? math.netRR : plan.netRR;
    size = sizeScenario({
      equity,
      riskPercent,
      entry: plan.entry,
      math,
      szDecimals: input.szDecimals,
    });
  }

  const ready =
    !!plan && gates.length > 0 && gates.every((g) => g.status === "pass");

  return {
    coin: analysis.coin,
    strategyVersion: STRATEGY_VERSION,
    ready,
    direction: analysis.direction,
    stage: analysis.stage,
    summary: analysis.summary,
    session: analysis.session,
    blockedReasons,
    gates,
    checklistFails,
    entry: plan?.entry ?? null,
    stop: plan?.stop ?? null,
    target: plan?.target ?? null,
    gapLow: plan?.gapLow ?? null,
    gapHigh: plan?.gapHigh ?? null,
    grossRR,
    netRR,
    math,
    size,
    invalidation: invalidationText(plan, freshness, analysis.session),
    freshness,
    planId: plan?.id ?? analysis.plan?.id ?? null,
    formedAt: plan?.formedAt ?? null,
    expiresAt: plan?.expiresAt ?? null,
    evaluatedAt: analysis.evaluatedAt,
    equityDefault: equity,
    riskPercentDefault: riskPercent,
    hasCandidateLevels: !!plan,
  };
}

function localDatetimeValue(ms = Date.now()): string {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

/** Build a local journal form draft from a packaged plan. localStorage only. */
export function journalDraftFromPlan(view: TradePlanView): JournalDraft | null {
  if (
    !view.hasCandidateLevels ||
    view.entry == null ||
    view.stop == null ||
    view.direction === "neutral"
  )
    return null;
  const qty =
    view.size?.valid && view.size.quantity > 0
      ? String(view.size.quantity)
      : "";
  const noteBits = [
    "Research draft seeded from Trade Plan Analytics.",
    `strategyVersion=${view.strategyVersion}`,
    `stage=${view.stage}`,
    view.ready ? "gates=all-pass (research candidate)" : "gates=blocked",
    view.netRR != null ? `netRR≈${view.netRR.toFixed(2)}` : null,
    "NOT an order. Complete exit/fees after a real closed trade.",
  ].filter(Boolean);
  return {
    coin: view.coin,
    direction: view.direction,
    entry: String(view.entry),
    stop: String(view.stop),
    exit: String(view.target ?? view.entry),
    quantity: qty,
    fees: "0",
    funding: "0",
    notes: noteBits.join(" · ").slice(0, 2000),
    openedAt: localDatetimeValue(view.formedAt ?? view.evaluatedAt),
    closedAt: localDatetimeValue(),
    seededFromPlanId: view.planId,
    seededAt: new Date().toISOString(),
    researchOnly: true,
  };
}

export function seedJournalDraft(view: TradePlanView): {
  ok: boolean;
  message: string;
} {
  const draft = journalDraftFromPlan(view);
  if (!draft)
    return {
      ok: false,
      message: "No candidate levels to seed. Wait for a packaged plan.",
    };
  try {
    localStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify(draft));
    return {
      ok: true,
      message:
        "Journal draft saved in this browser. Open Journal to finish the closed-trade record.",
    };
  } catch {
    return {
      ok: false,
      message: "Could not write journal draft to localStorage.",
    };
  }
}

export function readJournalDraft(): JournalDraft | null {
  try {
    const raw = localStorage.getItem(JOURNAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JournalDraft;
    if (
      !parsed ||
      typeof parsed.coin !== "string" ||
      !["long", "short"].includes(parsed.direction)
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearJournalDraft(): void {
  try {
    localStorage.removeItem(JOURNAL_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Serializable snapshot for export (JSON/CSV). No secrets. */
export function tradePlanSnapshot(view: TradePlanView) {
  return {
    kind: "trade-plan-analytics" as const,
    researchOnly: true,
    armed: false,
    liveOrder: false,
    strategyVersion: view.strategyVersion,
    coin: view.coin,
    direction: view.direction,
    stage: view.stage,
    summary: view.summary,
    ready: view.ready,
    sessionOpen: view.session.open,
    sessionLabel: view.session.label,
    sessionNyTime: view.session.nyTime,
    blockedReasons: view.blockedReasons,
    gates: view.gates.map((g) => ({
      id: g.id,
      label: g.label,
      status: g.status,
      detail: g.detail,
    })),
    entry: view.entry,
    stop: view.stop,
    target: view.target,
    gapLow: view.gapLow,
    gapHigh: view.gapHigh,
    grossRR: view.grossRR,
    netRR: view.netRR,
    size: view.size,
    invalidation: view.invalidation,
    freshness: view.freshness,
    planId: view.planId,
    formedAt: view.formedAt,
    expiresAt: view.expiresAt,
    evaluatedAt: view.evaluatedAt,
    equityDefault: view.equityDefault,
    riskPercentDefault: view.riskPercentDefault,
    exportedAt: new Date().toISOString(),
  };
}

export function serializeTradePlanJson(view: TradePlanView): string {
  return `${JSON.stringify(tradePlanSnapshot(view), null, 2)}\n`;
}

export function serializeTradePlanCsv(view: TradePlanView): string {
  const snap = tradePlanSnapshot(view);
  const escape = (value: unknown) => {
    const s = String(value ?? "");
    return `"${(/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
  };
  const rows: Array<[string, unknown]> = [
    ["kind", snap.kind],
    ["researchOnly", snap.researchOnly],
    ["armed", snap.armed],
    ["liveOrder", snap.liveOrder],
    ["strategyVersion", snap.strategyVersion],
    ["coin", snap.coin],
    ["direction", snap.direction],
    ["stage", snap.stage],
    ["ready", snap.ready],
    ["sessionOpen", snap.sessionOpen],
    ["sessionLabel", snap.sessionLabel],
    ["entry", snap.entry],
    ["stop", snap.stop],
    ["target", snap.target],
    ["grossRR", snap.grossRR],
    ["netRR", snap.netRR],
    ["sizeQuantity", snap.size?.quantity ?? ""],
    ["sizeNotional", snap.size?.notional ?? ""],
    ["sizeValid", snap.size?.valid ?? ""],
    ["sizeMeetsMinimum", snap.size?.meetsMinimum ?? ""],
    ["freshness", snap.freshness],
    ["planId", snap.planId],
    ["blockedReasons", snap.blockedReasons.join(" | ")],
    ["invalidation", snap.invalidation],
    ["exportedAt", snap.exportedAt],
  ];
  return ["field,value", ...rows.map(([k, v]) => `${k},${escape(v)}`)].join(
    "\r\n",
  );
}

export function downloadTradePlanSnapshot(
  view: TradePlanView,
  format: "json" | "csv",
): void {
  const body =
    format === "json"
      ? serializeTradePlanJson(view)
      : serializeTradePlanCsv(view);
  const mime =
    format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8";
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `edge-trade-plan-${view.coin}-${stamp}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
