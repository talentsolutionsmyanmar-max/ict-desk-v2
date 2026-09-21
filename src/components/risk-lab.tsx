"use client";
import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  CircleHelp,
  ShieldCheck,
} from "lucide-react";
import { tradeMath } from "@/lib/math";
import { MIN_PERP_NOTIONAL, AccountSettings, sizeScenario } from "@/lib/sizing";
import { Market, Plan } from "@/lib/types";
import { money } from "@/lib/format";

const readNumber = (value: string) => (value.trim() ? Number(value) : NaN);

export function RiskLab({
  account,
  onAccountChange,
  market,
  plan,
}: {
  account: AccountSettings;
  onAccountChange: (value: AccountSettings) => void;
  market: Market | undefined;
  plan: Plan | null;
}) {
  const initial = plan?.entry ?? market?.mark ?? 0;
  const [direction, setDirection] = useState<"long" | "short">(
    plan?.direction ?? "long",
  );
  const [values, setValues] = useState({
    entry: initial ? String(initial) : "",
    stop: plan ? String(plan.stop) : "",
    target: plan ? String(plan.target) : "",
    entryFee: String(plan?.costs.entryFeeBps ?? 1.5),
    exitFee: String(plan?.costs.exitFeeBps ?? 4.5),
    slippage: String(plan?.costs.slippageBps ?? 2),
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
  const costs = {
    entryFeeBps: readNumber(values.entryFee),
    exitFeeBps: readNumber(values.exitFee),
    slippageBps: readNumber(values.slippage),
    fundingBps: readNumber(values.funding),
  };
  const math = tradeMath(
    readNumber(values.entry),
    readNumber(values.stop),
    readNumber(values.target),
    direction,
    costs,
  );
  const equity = account.equity;
  const riskPercent = account.riskPercent;
  const settingsValid =
    Number.isFinite(equity) &&
    equity > 0 &&
    Number.isFinite(riskPercent) &&
    riskPercent > 0 &&
    riskPercent <= 1 &&
    Object.values(values).every((v) => v.trim() !== "");
  const budget = (equity * riskPercent) / 100;
  const sizing = sizeScenario({
    equity: settingsValid ? equity : NaN,
    riskPercent,
    entry: readNumber(values.entry),
    math,
    szDecimals: market?.szDecimals,
  });
  const quantity = sizing.quantity;
  const stressBps = Math.max(50, costs.slippageBps);
  const stress = tradeMath(
    readNumber(values.entry),
    readNumber(values.stop),
    readNumber(values.target),
    direction,
    { ...costs, slippageBps: stressBps },
  );
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
            <p className="field-note account-context">
              Uses the same account settings as the market desk. Default: $1,000
              equity and 0.25% planned risk ($2.50). No wallet balance is
              connected.
            </p>
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
              <label className="form-field">
                <span>Reference equity · USD</span>
                <input
                  aria-label="Risk lab equity"
                  type="number"
                  min="1"
                  step="any"
                  value={Number.isFinite(equity) ? equity : ""}
                  onChange={(e) =>
                    onAccountChange({
                      ...account,
                      equity: readNumber(e.target.value),
                    })
                  }
                />
              </label>
              <label className="form-field">
                <span>Planned risk · % · max 1</span>
                <input
                  aria-label="Risk lab risk percent"
                  type="number"
                  min="0.01"
                  max="1"
                  step="0.05"
                  value={Number.isFinite(riskPercent) ? riskPercent : ""}
                  onChange={(e) =>
                    onAccountChange({
                      ...account,
                      riskPercent: readNumber(e.target.value),
                    })
                  }
                />
              </label>
              {field("entry", "Entry price", "USD")}
              {field("stop", "Initial stop", "USD")}
              {field("target", "Target price", "USD")}
            </div>
            {plan && (
              <p className="field-note">
                Imported levels are a fixed snapshot, not a live order. Recheck
                the originating model’s conditions, live freshness and account
                risk on the market desk before use. V4 playbooks are
                independent; the ten-gate checklist belongs only to the V2.1
                baseline.
              </p>
            )}
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
            <p className="field-note">
              Hyperliquid native perpetuals only. A limit order is not
              necessarily a maker fill; use post-only or budget your actual
              taker fee. Minimum entry notional: ${MIN_PERP_NOTIONAL}.{" "}
              <a
                href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses"
                target="_blank"
                rel="noreferrer"
              >
                Venue rules ↗
              </a>
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
            {settingsValid && math.valid && (
              <p
                className={`sizing-status ${sizing.meetsMinimum ? "" : "negative"}`}
                role="status"
              >
                <strong>
                  {sizing.meetsMinimum
                    ? "Minimum-size check passes"
                    : "Size blocked"}
                </strong>
                {sizing.reason}
              </p>
            )}
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
                <span>Hypothetical quantity · rounded down</span>
                <strong>
                  {quantity > 0
                    ? `${quantity} ${market?.coin ?? "units"}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>Notional · 1× cap with cost reserve</span>
                <strong>
                  {quantity > 0 ? `$${money(sizing.notional)}` : "—"}
                </strong>
              </div>
              <div>
                <span>Estimated target P&L</span>
                <strong
                  className={
                    sizing.estimatedTargetPnl >= 0 ? "positive" : "negative"
                  }
                >
                  {quantity > 0 ? `$${money(sizing.estimatedTargetPnl)}` : "—"}
                </strong>
              </div>
              <div>
                <span>Estimated stop loss</span>
                <strong className="negative">
                  {quantity > 0 ? `−$${money(sizing.estimatedStopLoss)}` : "—"}
                </strong>
              </div>
              <div>
                <span>
                  Stop loss with {Number.isFinite(stressBps) ? stressBps : "—"}{" "}
                  bps exit slippage
                </span>
                <strong className="negative">
                  {quantity > 0 && stress.valid
                    ? `−$${money(stress.netLoss * quantity)}`
                    : "—"}
                </strong>
              </div>
            </div>
            <p className="field-note">
              Slippage stress uses the same quantity and at least 50 bps (0.5%)
              adverse exit slippage. It is an illustrative scenario, not a
              forecast or worst-case loss. Actual losses can be larger.
            </p>
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
                These are estimates, not maximum possible losses. Stops can slip
                or fail to fill. Quantity is rounded down, with modeled costs
                reserved inside a 1× capital cap. A minimum-size pass does not
                check actual margin, live eligibility or profitability.
                Protective orders must be managed on your exchange; this desk
                does not place them. Break-even assumes only full target or full
                stop outcomes, not a measured win rate.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
