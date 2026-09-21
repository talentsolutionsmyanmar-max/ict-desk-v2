"use client";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, FlaskConical } from "lucide-react";
import { Book, Candle, Market, Plan, ResearchModel } from "@/lib/types";
import { ContextMetrics } from "@/lib/market-context";
import { researchLifecycle } from "@/lib/research-strategy";
import { quoteFresh, RULES } from "@/lib/strategy";
import { price, pct, compact } from "@/lib/format";
import { tradeMath } from "@/lib/math";
import { sizeScenario, AccountSettings } from "@/lib/sizing";

const label = {
  approaching: "Zone watch · not an entry",
  watching: "Watching",
  candidate: "Research candidate",
  filtered: "Economics filtered",
  passed: "Retest passed",
  expired: "Expired",
  blocked: "Data / execution blocked",
};
const myanmarTime = (time: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(time);

export function ResearchDesk({
  account,
  coin,
  market,
  models,
  context,
  book,
  signalCandle,
  now,
  dataReady,
  onRisk,
}: {
  account: AccountSettings;
  coin: string;
  market?: Market;
  models?: ResearchModel[];
  context: ContextMetrics;
  book: Book | null;
  signalCandle: Candle | null;
  now: number;
  dataReady: boolean;
  onRisk: (plan: Plan) => void;
}) {
  const [touched, setTouched] = useState<string[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertState, setAlertState] = useState<Record<string, string>>({});
  const observed = (models ?? [])
    .filter(
      (m) =>
        book?.coin === coin &&
        m.plan &&
        researchLifecycle(
          m.plan,
          signalCandle ? [signalCandle] : [],
          book,
          now,
        ) === "passed",
    )
    .map((m) => m.plan!.id);
  const touchKey = observed.join("|");
  useEffect(() => {
    if (touchKey)
      setTouched((previous) =>
        [...new Set([...previous, ...touchKey.split("|")])].slice(-300),
      );
  }, [touchKey]);
  const liveData = dataReady && book?.coin === coin && quoteFresh(book, now);
  const liveExecution =
    !!book &&
    book.spreadBps <= RULES.maxSpreadBps &&
    Math.min(book.bidDepth10bps, book.askDepth10bps) >= RULES.minDepth;
  const liveQuality = liveData && liveExecution;
  const enableAlerts = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === "granted");
  };
  useEffect(() => {
    if (!("Notification" in window)) return;
    setAlertsEnabled(Notification.permission === "granted");
  }, []);
  useEffect(() => {
    if (!alertsEnabled || !models?.length) return;
    for (const model of models) {
      const state = model.status === "candidate" || model.status === "approaching"
        ? model.status
        : null;
      if (!state || alertState[model.id] === state) continue;
      const plan = model.plan ?? model.watchPlan;
      if (plan) {
        new Notification(`${coin} ${model.label}: ${state === "candidate" ? "entry ready" : "zone armed"}`, {
          body: `${plan.direction.toUpperCase()} · entry ${price(plan.entry)} · SL ${price(plan.stop)} · TP ${price(plan.target)}`,
          tag: `ict-desk-${coin}-${model.id}`,
        });
      }
      setAlertState((previous) => ({ ...previous, [model.id]: state }));
    }
  }, [alertState, alertsEnabled, coin, models]);
  const depthTotal = book ? book.bidDepth10bps + book.askDepth10bps : 0;
  const bidShare =
    book?.coin === coin && quoteFresh(book, now) && depthTotal > 0
      ? (book!.bidDepth10bps / depthTotal) * 100
      : null;
  return (
    <section className="panel research-desk" aria-labelledby="research-title">
      <div className="research-heading">
        <div>
          <div className="eyebrow">
            V4 · FORWARD RESEARCH · {coin} PERPETUAL
          </div>
          <h2 id="research-title">
            <FlaskConical size={19} /> Two playbooks. Defined execution.
          </h2>
          <p>
            24/7 evaluation. Session and 4h bias are context—not a blanket
            short-entry veto. No calibrated win probability or proven edge.
          </p>
        </div>
        <span className="research-mode">No orders · browser alerts optional</span>
      </div>
      <div className="context-note">
        <button className="button secondary-button" onClick={enableAlerts} disabled={alertsEnabled}>
          {alertsEnabled ? "Browser alerts enabled" : "Enable browser setup alerts"}
        </button>
        <span>Alerts are local to this browser and require this tab to be open.</span>
      </div>
      <div className="context-grid" aria-label="Live positioning context">
        <div>
          <span>Open interest · observed base-unit change</span>
          <strong>
            {context.oiUsd === null ? "—" : `$${compact(context.oiUsd)}`}
          </strong>
          <small>
            5m {pct(context.oiChange5m)} · 15m {pct(context.oiChange15m)}
          </small>
        </div>
        <div>
          <span>Observed signed trade flow · 5m</span>
          <strong>
            {context.signedFlow5m === null
              ? "—"
              : `${context.signedFlow5m >= 0 ? "+" : "−"}$${compact(Math.abs(context.signedFlow5m))}`}
          </strong>
          <small>
            {context.flowIncomplete
              ? "Incomplete tape · value withheld"
              : context.signedFlow5m === null
                ? "Needs 5 uninterrupted minutes in this tab"
                : `${context.observedTrades.toLocaleString()} observed trades · B minus A notional`}
          </small>
        </div>
        <div>
          <span>Funding / hour · mark premium</span>
          <strong>
            {context.funding === null ? "—" : pct(context.funding * 100, 4)}
          </strong>
          <small>
            Premium{" "}
            {context.premium === null ? "—" : pct(context.premium * 100, 3)}
          </small>
        </div>
        <div>
          <span>Observed depth · bid share</span>
          <strong>{bidShare === null ? "—" : `${bidShare.toFixed(1)}%`}</strong>
          <div
            className={`depth-balance ${bidShare === null ? "depth-unavailable" : ""}`}
            role="img"
            aria-label={
              bidShare === null
                ? "Depth unavailable"
                : `Bid ${bidShare.toFixed(1)} percent, ask ${(100 - bidShare).toFixed(1)} percent of observed depth`
            }
          >
            {bidShare !== null && <i style={{ width: `${bidShare}%` }} />}
          </div>
          <small>±10 bps · up to 20 levels/side · cancelable orders</small>
        </div>
      </div>
      <p className="context-note">
        <Activity size={13} /> OI change uses contract/base units, not
        price-driven USD change. These are supporting observations, not extra
        entry gates. Warm-up resets on reconnect; hidden tabs pause observation.
      </p>
      <div className="research-models">
        {models?.length ? (
          models.map((model) => {
            const plan = model.plan;
            const displayPlan = plan ?? (model.status === "approaching" ? model.watchPlan : null);
            const lifecycle = plan
              ? researchLifecycle(
                  plan,
                  signalCandle ? [signalCandle] : [],
                  book,
                  now,
                )
              : null;
            const status = !liveQuality
              ? "blocked"
              : plan && (touched.includes(plan.id) || lifecycle === "passed")
                ? "passed"
                : lifecycle === "expired"
                  ? "expired"
                  : model.status;
            const sizing = displayPlan
              ? sizeScenario({
                  equity: account.equity,
                  riskPercent: account.riskPercent,
                  entry: displayPlan.entry,
                  math: tradeMath(
                    displayPlan.entry,
                    displayPlan.stop,
                    displayPlan.target,
                    displayPlan.direction,
                    displayPlan.costs,
                  ),
                  szDecimals: market?.szDecimals,
                })
              : null;
            const sizeBlocked =
              !!sizing && (!sizing.valid || !sizing.meetsMinimum);
            return (
              <article
                key={model.id}
                className={`research-model ${status === "candidate" && !sizeBlocked ? "research-candidate" : ""}`}
              >
                <div className="model-title">
                  <h3>{model.label}</h3>
                  <span
                    className={
                      model.direction === "short"
                        ? "negative"
                        : model.direction === "long"
                          ? "positive"
                          : "subdued"
                    }
                  >
                    {model.direction === "neutral"
                      ? "—"
                      : model.direction.toUpperCase()}
                  </span>
                </div>
                <strong className="model-state">
                  {status === "candidate" && sizeBlocked
                    ? "Account size blocked"
                    : label[status]}
                </strong>
                <p>{model.trigger}</p>
                <small>{model.context}</small>
                {model.watchLevel !== undefined && (
                  <p className="model-explanation">
                    Watch zone: {price(model.watchLevel)} · armed levels are provisional; confirmation still required
                  </p>
                )}
                <dl className="model-prices">
                  <div>
                    <dt>Retest entry</dt>
                    <dd>{displayPlan ? price(displayPlan.entry) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Invalidation / SL</dt>
                    <dd>{displayPlan ? price(displayPlan.stop) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Structural TP</dt>
                    <dd>{displayPlan ? price(displayPlan.target) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Estimated net RR</dt>
                    <dd>{displayPlan ? `${displayPlan.netRR.toFixed(2)}R` : "—"}</dd>
                  </div>
                </dl>
                <p className="model-explanation">
                  {status === "blocked"
                    ? model.status === "blocked"
                      ? model.summary
                      : "Awaiting current market data and execution checks."
                    : status === "passed"
                      ? "Retest already observed. Do not chase; no fill is assumed."
                      : status === "expired"
                        ? "Retest window ended. Shown levels are a historical scenario."
                        : model.summary}
                </p>
                {displayPlan && (
                  <small>
                    {plan ? "Confirmed" : "Armed"} {myanmarTime(displayPlan.formedAt)} · expires {myanmarTime(displayPlan.expiresAt)} MMT. {plan ? "Frozen scenario, not an order." : "Provisional zone levels; wait for the trigger."}
                  </small>
                )}
                {sizing && (
                  <p className="model-sizing">
                    ${account.equity.toLocaleString()} reference /{" "}
                    {account.riskPercent}% planned risk:{" "}
                    {sizeBlocked
                      ? sizing.reason
                      : `$${sizing.notional.toFixed(2)} notional · $${sizing.estimatedStopLoss.toFixed(2)} modeled loss. Actual loss can exceed this.`}
                  </p>
                )}
                <details>
                  <summary>Why this model is waiting or qualified</summary>
                  <ul>
                    {model.gates.map((g) => (
                      <li key={g.id}>
                        <strong>
                          {g.label}:{" "}
                          {g.id === "data" && !liveData
                            ? "blocked live"
                            : g.id === "liquidity" && !liveExecution
                              ? "blocked live"
                              : g.id === "lifecycle" &&
                                  (status === "passed" || status === "expired")
                                ? status === "passed"
                                  ? "retest passed"
                                  : "expired"
                                : g.status}
                        </strong>
                        <span>{g.detail}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                {displayPlan && (
                  <button
                    className="button secondary-button"
                    onClick={() => onRisk(displayPlan)}
                  >
                    Inspect{" "}
                    {status === "candidate" && !sizeBlocked
                      ? "candidate"
                      : "filtered / historical"}{" "}
                    risk <ArrowRight size={13} />
                  </button>
                )}
              </article>
            );
          })
        ) : (
          <p className="research-empty">
            {models
              ? "No model observations available."
              : "Waiting for the model scan. No setup is inferred from price alone."}
          </p>
        )}
      </div>
      <details className="research-limits">
        <summary>Data coverage and what is not connected</summary>
        <p>
          Public Hyperliquid activeAssetCtx, trades and L2 book only. OI history
          and trade flow start when this selected market connects; they are not
          yesterday’s history. Signed flow is not exchange deposits/withdrawals
          and cannot identify whether positions opened or closed. Book depth is
          not a liquidation heatmap.
        </p>
        <p>
          Liquidation heatmaps, attributed exchange inflow/outflow and push
          alerts are not connected. See the forward journal for recorder
          connection and heartbeat status. Missing data is not treated as
          neutral confirmation. No wallet or trading API is connected.
        </p>
        <a
          href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions"
          target="_blank"
          rel="noreferrer"
        >
          Hyperliquid source and coverage ↗
        </a>
      </details>
    </section>
  );
}
