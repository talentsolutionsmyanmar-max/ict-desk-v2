"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Download,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import {
  JEV_MODEL,
  JEV_TIMEFRAMES,
  jevLabel,
  type JevDimension,
  type JevReview,
  type JevSource,
  type JevStatus,
} from "@/lib/jev-contract";

export function JevContext({ coin }: { coin: string }) {
  const [status, setStatus] = useState<JevStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    review: JevReview;
    cached: boolean;
  } | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("AI status is unavailable.");
        return response.json() as Promise<JevStatus>;
      })
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "AI status is unavailable. The price-based strategy is unaffected.",
          );
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, []);

  async function send(path: string, method: string, body?: unknown) {
    const controller = new AbortController();
    pending.current = controller;
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401)
        setStatus((previous) =>
          previous ? { ...previous, unlocked: false } : previous,
        );
      throw new Error(
        typeof data.error === "string" ? data.error : "AI request failed.",
      );
    }
    return data;
  }
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const token = String(new FormData(form).get("deskToken") ?? "");
    form.reset(); // Never persist the operator token in storage or component state.
    setBusy(true);
    setError("");
    try {
      await send("/api/ai/session", "POST", { token });
      setStatus((previous) =>
        previous ? { ...previous, unlocked: true } : previous,
      );
    } catch (e) {
      if (!pending.current?.signal.aborted)
        setError(e instanceof Error ? e.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }
  async function lock() {
    setBusy(true);
    setError("");
    try {
      await send("/api/ai/session", "DELETE");
      setStatus((previous) =>
        previous ? { ...previous, unlocked: false } : previous,
      );
      setResult(null);
    } catch {
      setError("Could not lock this session. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (fields.get("publicSource") !== "on") {
      setError("Confirm the public-source notice before requesting a review.");
      return;
    }
    const source: JevSource = {
      coin,
      title: String(fields.get("title") ?? ""),
      url: String(fields.get("url") ?? ""),
      excerpt: String(fields.get("excerpt") ?? ""),
      publishedAt: String(fields.get("publishedAt") ?? "").trim() || null,
      publicSourceConfirmed: true,
    };
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await send("/api/ai/review", "POST", source));
    } catch (e) {
      if (!pending.current?.signal.aborted)
        setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result.review, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `jev-context-${coin}-${result.review.id.slice(0, 12)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <details className="panel jev-panel">
      <summary>
        <span>
          <Sparkles size={17} /> Jev context review{" "}
          <small>English · manual · {coin}</small>
        </span>
        <span className="jev-status">
          {status === null
            ? "Checking configuration"
            : !status.configured
              ? "Not configured"
              : status.unlocked
                ? "Unlocked"
                : "Locked"}
        </span>
      </summary>
      <div className="jev-body">
        <p className="jev-explainer">
          Optional text classification alongside {JEV_TIMEFRAMES}. No win
          probability, trade approval or changes to entry, SL, TP and sizing. No
          automatic AI calls.
        </p>
        {status && !status.configured ? (
          <p className="jev-message">
            The server needs TYPESAFE_API_KEY and a separate JEV_DESK_TOKEN.
            Keep the provider key out of this browser.
          </p>
        ) : status && !status.unlocked ? (
          <form className="jev-unlock" onSubmit={unlock}>
            <label className="form-field">
              <span>
                Desk access token <small>Not your TypeSafe API key</small>
              </span>
              <input
                name="deskToken"
                type="password"
                required
                minLength={64}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                placeholder="Separate operator token from private server configuration"
                disabled={busy}
              />
            </label>
            <button className="button secondary" type="submit" disabled={busy}>
              <LockKeyhole size={15} /> {busy ? "Unlocking…" : "Unlock reviews"}
            </button>
          </form>
        ) : status?.unlocked ? (
          <>
            <div className="jev-session">
              <span>{JEV_MODEL} · 1-hour operator session</span>
              <button
                className="text-button"
                type="button"
                onClick={lock}
                disabled={busy}
              >
                <LockKeyhole size={13} /> Lock
              </button>
            </div>
            <form className="jev-form" onSubmit={review}>
              <div className="form-grid">
                <label className="form-field">
                  <span>Source title</span>
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={180}
                    placeholder="Title of a public announcement or article"
                    disabled={busy}
                  />
                </label>
                <label className="form-field">
                  <span>Public source URL</span>
                  <input
                    name="url"
                    type="url"
                    required
                    maxLength={600}
                    placeholder="https://… (no query parameters)"
                    disabled={busy}
                  />
                </label>
              </div>
              <label className="form-field">
                <span>
                  English excerpt <small>40–3,500 characters</small>
                </span>
                <textarea
                  name="excerpt"
                  required
                  minLength={40}
                  maxLength={3500}
                  rows={4}
                  placeholder="Paste the relevant public text. Jev sees this excerpt, not the linked page."
                  disabled={busy}
                />
              </label>
              <label className="form-field">
                <span>
                  Publication time{" "}
                  <small>Optional; leave blank if unknown</small>
                </span>
                <input
                  name="publishedAt"
                  maxLength={40}
                  placeholder="2026-09-20T04:00:00Z (ISO timestamp with timezone)"
                  disabled={busy}
                />
              </label>
              <label className="jev-consent">
                <input
                  name="publicSource"
                  type="checkbox"
                  required
                  disabled={busy}
                />
                <span>
                  This is public English text with no credentials or personal
                  data. Send the asset, title and excerpt to TypeSafe for a paid
                  review.
                </span>
              </label>
              <div className="jev-actions">
                <button
                  className="button secondary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {busy ? "Reviewing…" : "Review context"}
                </button>
                <small>
                  One request · no automatic retries · unchanged excerpts cached
                  for 10 minutes
                </small>
              </div>
            </form>
          </>
        ) : null}
        {error ? (
          <p className="jev-message negative" role="alert">
            {error}
          </p>
        ) : null}
        {result ? (
          <section
            className="jev-result"
            aria-label="Jev assessment"
            aria-live="polite"
          >
            <div className="jev-result-heading">
              <div>
                <h3>{result.review.source.title}</h3>
                <p>
                  {result.review.source.coin} ·{" "}
                  {result.cached ? "Cached assessment" : "New assessment"} ·{" "}
                  {new Date(result.review.evaluatedAt).toLocaleString("en-GB")}
                </p>
              </div>
              <button className="text-button" type="button" onClick={download}>
                <Download size={14} /> Export review
              </button>
            </div>
            <div className="jev-dimensions">
              {(Object.keys(result.review.answers) as JevDimension[]).map(
                (dimension) => {
                  const answer = result.review.answers[dimension];
                  return (
                    <div key={dimension}>
                      <span>
                        {dimension === "evidence"
                          ? "Claim wording"
                          : dimension === "topic"
                            ? "Topic"
                            : "Asset relevance"}
                      </span>
                      <strong>{jevLabel(dimension, answer.choice)}</strong>
                      <small>
                        Model certainty {(answer.confidence * 100).toFixed(0)}%
                      </small>
                    </div>
                  );
                },
              )}
            </div>
            <p className="jev-explainer">
              Model certainty is not a trade win rate. The source and claims
              have not been independently verified. This assessment never
              changes the trading checklist.
            </p>
            <details className="jev-evidence">
              <summary>Source, probabilities and cost</summary>
              <a
                href={result.review.source.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                Open supplied source <ExternalLink size={12} />
              </a>
              <p>
                Published: {result.review.source.publishedAt ?? "Unknown"} ·
                Received: {result.review.observedAt}
              </p>
              <blockquote>{result.review.source.excerpt}</blockquote>
              <p>
                {result.review.inputTokens.toLocaleString("en-GB")} input tokens
                · estimated API cost $
                {result.review.estimatedApiCostUsd.toFixed(6)} ·{" "}
                {result.review.latencyMs} ms. Cost uses the published input
                rate; not a billing receipt.
                {result.cached
                  ? " This cached view did not make another provider request."
                  : ""}
              </p>
              {(Object.keys(result.review.answers) as JevDimension[]).map(
                (dimension) => (
                  <div key={dimension} className="jev-probabilities">
                    <h4>{dimension}</h4>
                    {Object.entries(
                      result.review.answers[dimension].probabilities,
                    ).map(([key, value]) => (
                      <span key={key}>
                        {jevLabel(dimension, key)}: {(value * 100).toFixed(1)}%
                      </span>
                    ))}
                  </div>
                ),
              )}
            </details>
          </section>
        ) : null}
        <p className="jev-footnote">
          No automatic news feed or durable research log is connected. Export
          reviews before switching markets or leaving this page. Server-process
          limits are 20 new requests/hour and 100/day; these are not an
          account-wide billing cap.
        </p>
      </div>
    </details>
  );
}
