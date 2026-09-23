"use client";
import { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Download,
  FlaskConical,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react";
import { price, money } from "@/lib/format";
import {
  TradePlanView,
  downloadTradePlanSnapshot,
  seedJournalDraft,
} from "@/lib/trade-plan";

export function TradePlanCard({
  view,
  onOpenJournal,
  onOpenRisk,
}: {
  view: TradePlanView;
  onOpenJournal?: () => void;
  onOpenRisk?: () => void;
}) {
  const [notice, setNotice] = useState("");
  const DirIcon =
    view.direction === "long"
      ? ArrowUpRight
      : view.direction === "short"
        ? ArrowDownRight
        : Target;

  const seed = () => {
    const result = seedJournalDraft(view);
    setNotice(result.message);
    if (result.ok) onOpenJournal?.();
  };

  return (
    <div className={`trade-plan-card ${view.ready ? "is-ready" : "is-blocked"}`}>
      <div className="trade-plan-banner">
        <FlaskConical size={14} />
        <div>
          <strong>Research mode</strong>
          <span>
            Trade Plan Analytics ≠ ARMED ≠ live order. Packaging only — no
            wallet, no exchange write.
          </span>
        </div>
      </div>

      <div className="trade-plan-header">
        <div>
          <span className="eyebrow">TRADE PLAN</span>
          <h3>
            {view.coin}{" "}
            <span className={`direction ${view.direction}`}>
              <DirIcon size={12} />
              {view.direction === "neutral"
                ? "Mixed"
                : view.direction === "long"
                  ? "Long"
                  : "Short"}
            </span>
          </h3>
        </div>
        <span className="version-tag">{view.strategyVersion}</span>
      </div>

      <div className={`trade-plan-status ${view.ready ? "ok" : "blocked"}`}>
        {view.ready ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
        <div>
          <strong>{view.ready ? "Research candidate" : "Blocked / incomplete"}</strong>
          <span>{view.stage}</span>
        </div>
      </div>

      <p className="trade-plan-summary">{view.summary}</p>

      <div className="trade-plan-meta">
        <div>
          <span>Session</span>
          <strong>
            {view.session.open ? "Open" : "Closed"} · {view.session.label}
          </strong>
          <small>{view.session.nyTime} NY</small>
        </div>
        <div>
          <span>Structure</span>
          <strong className={`direction ${view.direction}`}>
            {view.direction === "neutral"
              ? "No directional bias"
              : `${view.direction} continuation`}
          </strong>
          <small>Freshness · {view.freshness}</small>
        </div>
      </div>

      <div className="trade-plan-levels">
        <div>
          <span>Entry</span>
          <strong>{price(view.entry)}</strong>
        </div>
        <div>
          <span>Stop loss</span>
          <strong>{price(view.stop)}</strong>
        </div>
        <div>
          <span>Take profit · 3R gross</span>
          <strong>{price(view.target)}</strong>
        </div>
        <div>
          <span>Gross / net RR</span>
          <strong className={view.netRR != null ? "positive" : ""}>
            {view.grossRR != null ? `${view.grossRR.toFixed(2)}R` : "—"}
            {" / "}
            {view.netRR != null ? `${view.netRR.toFixed(2)}R` : "—"}
          </strong>
        </div>
      </div>

      <div className="trade-plan-size">
        <span>
          Size · ${view.equityDefault} @ {view.riskPercentDefault}% risk
        </span>
        {view.size?.valid ? (
          <strong>
            {view.size.quantity} units · ${money(view.size.notional)} notional
            {view.size.meetsMinimum ? "" : " · below $10 min"}
          </strong>
        ) : (
          <strong className="subdued">
            {view.size?.reason ?? "No size until candidate levels exist."}
          </strong>
        )}
      </div>

      {(view.checklistFails.length > 0 || view.blockedReasons.length > 0) && (
        <div className="trade-plan-blocks">
          <span className="eyebrow">CHECKLIST FAILS</span>
          <ul>
            {(view.checklistFails.length
              ? view.checklistFails.map(
                  (g) => `${g.label} (${g.status}): ${g.detail}`,
                )
              : view.blockedReasons
            )
              .slice(0, 8)
              .map((reason) => (
                <li key={reason.slice(0, 80)}>{reason}</li>
              ))}
          </ul>
        </div>
      )}

      <div className="trade-plan-invalidation">
        <span className="eyebrow">INVALIDATION</span>
        <p>{view.invalidation}</p>
      </div>

      <div className="trade-plan-actions">
        <button
          type="button"
          className="button secondary small"
          disabled={!view.hasCandidateLevels}
          onClick={seed}
        >
          <BookOpen size={14} /> Seed journal draft
        </button>
        <button
          type="button"
          className="button secondary small"
          onClick={() => downloadTradePlanSnapshot(view, "json")}
        >
          <Download size={14} /> JSON
        </button>
        <button
          type="button"
          className="button secondary small"
          onClick={() => downloadTradePlanSnapshot(view, "csv")}
        >
          <Download size={14} /> CSV
        </button>
        {onOpenRisk && (
          <button
            type="button"
            className="button small setup-cta-inline"
            onClick={onOpenRisk}
          >
            <ShieldCheck size={14} />
            {view.hasCandidateLevels
              ? view.ready
                ? "Review candidate risk"
                : "Inspect filtered scenario"
              : "Open risk calculator"}
          </button>
        )}
      </div>
      {notice && <p className="trade-plan-notice">{notice}</p>}
      <p className="setup-footnote">
        {view.ready
          ? "Not an order. Portfolio risk and actual fill conditions require your review."
          : "No complete setup, no suggested trade — blocked reasons stay visible for research."}
      </p>
    </div>
  );
}
