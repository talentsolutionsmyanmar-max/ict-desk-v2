"use client";
import { useEffect, useRef, useState } from "react";
import type { ResearchReplay } from "@/lib/research-replay";
import { price } from "@/lib/format";

const names = {
  continuation: "Trend continuation",
  reversal: "Sweep reversal",
  breakout: "Break & retest",
};
const time = (value: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);

export function OpportunityReview({ coin }: { coin: string }) {
  const [result, setResult] = useState<ResearchReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const timeout = setTimeout(() => request.abort(), 55_000);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/replay?coin=${encodeURIComponent(coin)}`,
        { signal: request.signal },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Review unavailable.");
      setResult(body);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "AbortError"
          ? e.message
          : "Review timed out. Please retry.",
      );
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }
  return (
    <section
      className="panel opportunity-review"
      aria-labelledby="opportunity-title"
    >
      <div className="research-heading">
        <div>
          <div className="eyebrow">{coin} · LAST 48 HOURS · 5M EXECUTION</div>
          <h2 id="opportunity-title">Why no eligible setup?</h2>
          <p>
            A live scan describes now. Review past triggers to see retests,
            expired windows and insufficient target room.
          </p>
        </div>
        <button
          className="button secondary-button"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading
            ? "Reviewing candles…"
            : result
              ? "Refresh 48h review"
              : "Review last 48 hours"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p role="status">
            <strong>{result.events.length} model triggers</strong> ·{" "}
            {result.evaluatedBars}/{result.expectedBars} bars evaluated ·{" "}
            {result.complete
              ? "Full candle coverage"
              : "Partial coverage — missing bars or warm-up"}
          </p>
          <p className="context-note">
            {time(result.from)} – {time(result.to)} MMT. Reconstructed from
            closed candles. Historical spread, depth, OI and funding are
            unavailable; these are not verified eligible trades or missed
            profits. RR assumes zero funding plus modeled fees and slippage.
          </p>
          {result.events.length === 0 ? (
            <p>
              {result.complete
                ? "No confirmed trigger under these three models in this window."
                : "No triggers in the evaluable bars. Incomplete coverage prevents a conclusion for the full 48 hours."}
            </p>
          ) : (
            <div className="opportunity-list">
              {result.events.map((event) => (
                <article key={event.id} className="opportunity-event">
                  <div className="model-title">
                    <h3>{names[event.model]}</h3>
                    <strong
                      className={
                        event.direction === "long" ? "positive" : "negative"
                      }
                    >
                      {event.direction.toUpperCase()}
                    </strong>
                  </div>
                  <small>Confirmed {time(event.formedAt)} MMT</small>
                  <dl className="model-prices">
                    <div>
                      <dt>Historical entry</dt>
                      <dd>{event.plan ? price(event.plan.entry) : "—"}</dd>
                    </div>
                    <div>
                      <dt>SL</dt>
                      <dd>{event.plan ? price(event.plan.stop) : "—"}</dd>
                    </div>
                    <div>
                      <dt>TP</dt>
                      <dd>{event.plan ? price(event.plan.target) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Modeled net RR</dt>
                      <dd>
                        {event.plan ? `${event.plan.netRR.toFixed(2)}R` : "—"}
                      </dd>
                    </div>
                  </dl>
                  <ul>
                    {event.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
