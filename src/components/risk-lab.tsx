"use client";
import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CircleHelp,
  ShieldCheck,
} from "lucide-react";
import { floorQuantity, tradeMath } from "@/lib/math";
import { Market, Plan } from "@/lib/types";
import { money } from "@/lib/format";

export function RiskLab({
  market,
  plan,
}: {
  market: Market | undefined;
  plan: Plan | null;
}) {
  const initial = plan?.entry ?? market?.mark ?? 0;
  const [direction, setDirection] = useState<"long" | "short">(
    plan?.direction ?? "long",
  );
  const [values, setValues] = useState({
    equity: "10000",
    risk: "0.25",
    entry: initial ? String(initial) : "",
    stop: plan ? String(plan.stop) : "",
    target: plan ? String(plan.target) : "",
    entryFee: "1.5",
    exitFee: "4.5",
    slippage: "2",
    funding: String(plan?.costs.fundingBps ?? 0),
  });
  const field = (key: keyof typeof values, label: string, hint?: string) => (
    <label className="form-field" htmlFor={`risk-${key}`}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input
        id={`risk-${key}`}
        inputMode="decimal"
        type="number"
        min="0"
        step="any"
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </label>
  );
  const math = tradeMath(
    Number(values.entry),
    Number(values.stop),
    Number(values.target),
    direction,
    {
      entryFeeBps: Number(values.entryFee),
      exitFeeBps: Number(values.exitFee),
      slippageBps: Number(values.slippage),
      fundingBps: Number(values.funding),
    },
  );
  const equity = Number(values.equity);
  const riskPercent = Number(values.risk);
  const settingsValid =
    Number.isFinite(equity) &&
    equity > 0 &&
    riskPercent > 0 &&
    riskPercent <= 1 &&
    Object.values(values).every((v) => v.trim() !== "");
  const budget = (equity * riskPercent) / 100;
  const quantity =
    settingsValid && math.valid
      ? floorQuantity(
          Math.min(budget / math.netLoss, equity / Number(values.entry)),
          market?.szDecimals ?? 4,
        )
      : 0;
  const qualifies = math.valid && math.netRR >= 2;
  const example = () => {
    const entry = market?.mark ?? initial;
    const sign = direction === "long" ? 1 : -1;
    if (entry > 0)
      setValues((v) => ({
        ...v,
        entry: String(entry),
        stop: String(Number((entry * (1 - sign * 0.008)).toPrecision(7))),
        target: String(Number((entry * (1 + sign * 0.024)).toPrecision(7))),
      }));
  };
  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">PLAN THE RISK FIRST</div>
          <h1>
            Risk laboratory<span className="title-dot">.</span>
          </h1>
          <p>
            Understand the cost of being wrong before thinking about the upside.
          </p>
        </div>
        <span className="pill muted">
          <Calculator size={13} /> Scenario calculator
        </span>
      </div>
      <div className="risk-layout">
        <div className="panel risk-inputs">
          <div className="panel-heading">
            <h2>
              Build a scenario <span>{market?.coin ?? "Custom"} / USD</span>
            </h2>
          </div>
          <div className="risk-form">
            <div className="segmented">
              <button
                onClick={() => setDirection("long")}
                aria-pressed={direction === "long"}
                className={direction === "long" ? "active" : ""}
              >
                <ArrowUpRight size={15} /> Long
              </button>
              <button
                onClick={() => setDirection("short")}
                aria-pressed={direction === "short"}
                className={direction === "short" ? "active" : ""}
              >
                <ArrowDownRight size={15} /> Short
              </button>
            </div>
            <div className="form-grid">
              {field("equity", "Reference equity", "USD")}
              {field("risk", "Planned risk", "% · max 1")}
              {field("entry", "Entry price", "USD")}
              {field("stop", "Initial stop", "USD")}
              {field("target", "Target price", "USD")}
            </div>
            <button className="text-button" onClick={example}>
              Load an illustrative 3R scenario ↗
            </button>
            <p className="field-note">
              The example uses an arbitrary 0.8% stop. It is not a detected
              setup or a recommended stop.
            </p>
            <div className="form-divider">
              <span>Execution assumptions</span>
              <span>1 bp = 0.01%</span>
            </div>
            <div className="form-grid">
              {field("entryFee", "Entry fee", "bps")}
              {field("exitFee", "Exit fee", "bps")}
              {field("slippage", "Adverse exit slippage", "bps")}
              {field("funding", "Holding-period funding cost", "bps of entry")}
            </div>
            <p className="field-note">
              Defaults: passive maker entry, taker exit, 2 bps adverse exit
              allowance. Use your actual fee tier. Future funding and slippage
              are unknown.
            </p>
          </div>
        </div>
        <div className="risk-output">
          <div className="panel payoff-card">
            <div className="eyebrow">ESTIMATED NET REWARD / RISK</div>
            <div className={`payoff-value ${qualifies ? "positive" : ""}`}>
              {math.valid ? math.netRR.toFixed(2) : "—"}
              <span>: 1</span>
            </div>
            <span className={`pill ${qualifies ? "green" : "muted"}`}>
              {math.valid
                ? qualifies
                  ? "Meets the 2.0 net RR floor"
                  : "Below the research RR floor"
                : "Enter entry, stop and target"}
            </span>
            <div className="risk-results">
              <div>
                <span>Gross reward / risk</span>
                <strong>
                  {math.valid ? `${math.grossRR.toFixed(2)}R` : "—"}
                </strong>
              </div>
              <div>
                <span>
                  Binary break-even win rate <CircleHelp size={12} />
                </span>
                <strong>
                  {math.valid && math.netReward > 0
                    ? `${(math.breakEven * 100).toFixed(1)}%`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Risk budget</span>
                <strong>{settingsValid ? `$${money(budget)}` : "—"}</strong>
              </div>
              <div>
                <span>Risk-sized quantity</span>
                <strong>
                  {quantity > 0
                    ? `${quantity} ${market?.coin ?? "units"}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Notional · capped at 1× equity</span>
                <strong>
                  {quantity > 0
                    ? `$${money(quantity * Number(values.entry))}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Estimated target P&L</span>
                <strong className="positive">
                  {quantity > 0 ? `$${money(math.netReward * quantity)}` : "—"}
                </strong>
              </div>
              <div>
                <span>Estimated stop loss</span>
                <strong className="negative">
                  {quantity > 0 ? `−$${money(math.netLoss * quantity)}` : "—"}
                </strong>
              </div>
            </div>
            {values.stop && values.target && !math.valid && (
              <p className="form-error" role="alert">
                {math.error}
              </p>
            )}
            {!settingsValid && (
              <p className="field-note">
                Complete every input. Reference risk is limited to 1% in this
                research tool.
              </p>
            )}
          </div>
          <div className="research-note">
            <ShieldCheck size={20} />
            <div>
              <strong>A calculator is not a trading signal.</strong>
              <p>
                These are estimates, not maximum possible losses. Stops can
                slip. Quantity is rounded down and capped at unlevered notional;
                check venue minimums and available margin. Break-even assumes
                only full target or full stop outcomes, not a measured win rate.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
