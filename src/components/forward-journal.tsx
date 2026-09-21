"use client";
import { useEffect, useState } from "react";
import { ForwardSignal, paperMetrics } from "@/lib/forward-journal";
import { price } from "@/lib/format";

interface JournalData {
  configured: boolean;
  lastSuccess: string | null;
  lastAttempt: string | null;
  errors: string[];
  signals: ForwardSignal[];
  transitions: {
    coin: string;
    model: string;
    status: string;
    summary: string;
    observedAt: number;
    watchLevel?: number;
  }[];
}
const time = (n: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Yangon",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(n);
export function ForwardJournal() {
  const [data, setData] = useState<JournalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState("all");
  const [now, setNow] = useState(0);
  useEffect(() => {
    let stopped = false,
      busy = false;
    const controller = new AbortController();
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const response = await fetch("/api/forward", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Journal unavailable.");
        if (!stopped) {
          setData(body);
          setError(null);
        }
      } catch {
        if (!stopped)
          setError(
            "Journal refresh failed. Any displayed records may be stale.",
          );
      } finally {
        busy = false;
      }
    };
    void load();
    setNow(Date.now());
    const poll = setInterval(() => void load(), 60000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", load);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  const signals = (data?.signals ?? []).filter(
    (s) => model === "all" || s.model === model,
  );
  const metrics = paperMetrics(signals);
  const fresh =
    !!data?.lastSuccess &&
    now - Date.parse(data.lastSuccess) < 180000 &&
    !error;
  const groups = [...new Set(signals.map((s) => `${s.model} · ${s.regime}`))];
  return (
    <section className="panel forward-journal" aria-labelledby="forward-title">
      <div className="research-heading">
        <div>
          <div className="eyebrow">
            V4 · FORWARD OBSERVATIONS · PAPER EXECUTION
          </div>
          <h2 id="forward-title">Measure the edge</h2>
          <p>
            Signals saved before simulated entry, with frozen levels and
            observed execution checks.
          </p>
        </div>
        <span className={`pill ${fresh ? "green" : "muted"}`}>
          {!data
            ? "Checking recorder"
            : !data.configured
              ? "Recorder not connected"
              : fresh
                ? "Recorder heartbeat current"
                : "Recorder delayed / not started"}
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && !data.configured && (
        <p role="status">
          Always-on recording needs the dedicated database and scheduler
          credentials. No forward results are being collected yet.
        </p>
      )}
      {data?.configured && (
        <>
          <p className="context-note">
            Last successful run:{" "}
            {data.lastSuccess
              ? `${time(Date.parse(data.lastSuccess))} MMT`
              : "None yet"}
            . Minute schedule; delays can miss setups.{" "}
            {data.errors.length > 0
              ? `Feed issues: ${data.errors.join("; ")}`
              : ""}
          </p>
          <label className="form-field">
            <span>Paper playbook</span>
            <select
              aria-label="Paper playbook filter"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="all">All playbooks</option>
              <option>Intraday pullback</option>
              <option>Failed-breakout scalp</option>
            </select>
          </label>
          <div className="context-grid">
            <div>
              <span>Forward candidates</span>
              <strong>{metrics.observations}</strong>
              <small>
                {metrics.settled} resolved · {metrics.unresolved} uncertain
              </small>
            </div>
            <div>
              <span>Mean modeled result</span>
              <strong>
                {metrics.expectancyR === null
                  ? "—"
                  : `${metrics.expectancyR.toFixed(2)}R`}
              </strong>
              <small>Net costs · sample estimate</small>
            </div>
            <div>
              <span>Modeled profit factor</span>
              <strong>
                {metrics.profitFactor === null
                  ? "—"
                  : metrics.profitFactor.toFixed(2)}
              </strong>
              <small>Undefined without recorded losses</small>
            </div>
            <div>
              <span>Cumulative R drawdown</span>
              <strong>
                {metrics.settled ? `${metrics.drawdownR.toFixed(2)}R` : "—"}
              </strong>
              <small>Observation sequence, not account drawdown</small>
            </div>
          </div>
          <p className="context-note">
            Latest 1,000 saved V4 observations. Independent scenarios can
            overlap; this is not a funded portfolio or a validated win rate.
            Paper entries activate on the next full 5M bar and require one-tick
            penetration. Same-bar entry/target ambiguity is excluded;
            simultaneous exits use stop-first. Funding is a frozen estimate.
          </p>
          {groups.length > 0 && (
            <details>
              <summary>Results by playbook and regime</summary>
              <ul>
                {groups.map((group) => {
                  const m = paperMetrics(
                    signals.filter((s) => `${s.model} · ${s.regime}` === group),
                  );
                  return (
                    <li key={group}>
                      {group}: {m.settled} resolved · mean{" "}
                      {m.expectancyR === null
                        ? "—"
                        : `${m.expectancyR.toFixed(2)}R`}{" "}
                      · {m.unresolved} uncertain
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
          {signals.length === 0 ? (
            <p>
              No forward candidates recorded yet. The historical replay is kept
              separate from this sample.
            </p>
          ) : (
            <div className="opportunity-list">
              {signals.slice(0, 60).map((s) => (
                <article key={s.id} className="opportunity-event">
                  <div className="model-title">
                    <h3>
                      {s.coin} · {s.model}
                    </h3>
                    <strong>{s.plan.direction.toUpperCase()}</strong>
                  </div>
                  <p>
                    {s.status} ·{" "}
                    {s.netR === null
                      ? "Unresolved / no fill"
                      : `${s.netR.toFixed(2)}R net`}
                  </p>
                  <small>
                    Observed {time(s.observedAt)} MMT · {s.regime}
                  </small>
                  <dl className="model-prices">
                    <div>
                      <dt>Entry</dt>
                      <dd>{price(s.plan.entry)}</dd>
                    </div>
                    <div>
                      <dt>SL</dt>
                      <dd>{price(s.plan.stop)}</dd>
                    </div>
                    <div>
                      <dt>TP</dt>
                      <dd>{price(s.plan.target)}</dd>
                    </div>
                    <div>
                      <dt>Planned net RR</dt>
                      <dd>{s.plan.netRR.toFixed(2)}R</dd>
                    </div>
                  </dl>
                  <p>{s.note}</p>
                </article>
              ))}
            </div>
          )}
          <details>
            <summary>
              Recent setup state changes ({data.transitions.length})
            </summary>
            <ul className="forward-transitions">
              {data.transitions.map((s, i) => (
                <li key={`${s.coin}:${s.model}:${s.observedAt}:${i}`}>
                  <strong>
                    {time(s.observedAt)} MMT · {s.coin} · {s.model} · {s.status}
                  </strong>
                  <p>
                    {s.summary}
                    {s.watchLevel !== undefined
                      ? ` Zone ${price(s.watchLevel)}.`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
