"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Download,
  Plus,
  Shield,
  X,
} from "lucide-react";
import { JournalTrade } from "@/lib/types";
import { journalResult } from "@/lib/math";
import { money, price } from "@/lib/format";
import {
  clearJournalDraft,
  readJournalDraft,
  type JournalDraft,
} from "@/lib/trade-plan";

const KEY = "ict-edge-journal-v1";
const localTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
export function Journal({ coin }: { coin: string }) {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [draft, setDraft] = useState<JournalDraft | null>(null);
  useEffect(() => {
    const seeded = readJournalDraft();
    if (seeded) {
      setDraft(seeded);
      setOpen(true);
      clearJournalDraft();
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (!Array.isArray(parsed) || parsed.length > 5000)
        throw new Error("Invalid journal data.");
      const valid = parsed.filter((t: JournalTrade) => {
        try {
          journalResult(t);
          return (
            ["long", "short"].includes(t.direction) &&
            typeof t.id === "string" &&
            typeof t.coin === "string" &&
            typeof t.notes === "string"
          );
        } catch {
          return false;
        }
      });
      setTrades(valid);
      if (valid.length !== parsed.length)
        setStorageError(
          "Some stored entries failed validation and are hidden. Export your valid entries before editing this browser's storage.",
        );
    } catch {
      setStorageError(
        "Local storage is unavailable or contains invalid data. Do not rely on this browser as your only journal.",
      );
    }
    setLoaded(true);
  }, []);
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const get = (name: string) => String(data.get(name) ?? "").trim();
      const trade: JournalTrade = {
        id: crypto.randomUUID(),
        coin: get("coin").toUpperCase(),
        direction: get("direction") as "long" | "short",
        openedAt: new Date(get("openedAt")).toISOString(),
        closedAt: new Date(get("closedAt")).toISOString(),
        entry: Number(get("entry")),
        stop: Number(get("stop")),
        exit: Number(get("exit")),
        quantity: Number(get("quantity")),
        fees: Number(get("fees")),
        funding: Number(get("funding")),
        notes: get("notes").slice(0, 2000),
      };
      if (!/^[A-Z0-9._-]{1,24}$/.test(trade.coin))
        throw new Error("Enter a valid market symbol.");
      journalResult(trade);
      const next = [trade, ...trades];
      localStorage.setItem(KEY, JSON.stringify(next));
      setTrades(next);
      setOpen(false);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this trade.");
    }
  };
  const exportCSV = () => {
    const escape = (value: unknown) => {
      const s = String(value);
      return `"${(/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
    };
    const header = [
      "id",
      "coin",
      "side",
      "opened_at",
      "closed_at",
      "entry",
      "initial_stop",
      "exit",
      "quantity",
      "fees_usd",
      "funding_paid_usd",
      "gross_pnl_usd",
      "net_pnl_usd",
      "initial_r_usd",
      "net_r",
      "notes",
    ];
    const rows = trades.map((t) => {
      const r = journalResult(t);
      return [
        t.id,
        t.coin,
        t.direction,
        t.openedAt,
        t.closedAt,
        t.entry,
        t.stop,
        t.exit,
        t.quantity,
        t.fees,
        t.funding,
        r.gross,
        r.net,
        r.initialR,
        r.netR,
        t.notes,
      ]
        .map(escape)
        .join(",");
    });
    const url = URL.createObjectURL(
      new Blob([[header.join(","), ...rows].join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `edge-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const results = trades.map(journalResult);
  const net = results.reduce((sum, t) => sum + t.net, 0);
  const meanR = results.length
    ? results.reduce((sum, t) => sum + t.netR, 0) / results.length
    : null;
  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR EXECUTION, YOUR EVIDENCE</div>
          <h1>
            Trading journal<span className="title-dot">.</span>
          </h1>
          <p>
            Actual fills and costs. No manually assigned wins, losses or
            invented performance.
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={!trades.length}
            onClick={exportCSV}
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            className="button primary"
            onClick={() => {
              setOpen(true);
              setError("");
            }}
          >
            <Plus size={16} /> Log closed trade
          </button>
        </div>
      </div>
      <div className="journal-stats">
        <div className="panel">
          <span>Recorded trades</span>
          <strong>{loaded ? trades.length : "—"}</strong>
        </div>
        <div className="panel">
          <span>Net P&L · after costs</span>
          <strong className={net >= 0 ? "positive" : "negative"}>
            {trades.length
              ? `${net >= 0 ? "+" : "−"}$${money(Math.abs(net))}`
              : "—"}
          </strong>
        </div>
        <div className="panel">
          <span>Mean realized net R</span>
          <strong>
            {meanR === null
              ? "—"
              : `${meanR >= 0 ? "+" : ""}${meanR.toFixed(2)}R`}
          </strong>
        </div>
      </div>
      <div className="local-note">
        <Shield size={14} /> Stored only in this browser. Not synced, not an
        exchange ledger. Export regularly. Manually entered results do not
        validate the strategy.
      </div>
      {storageError && <p className="inline-warning">{storageError}</p>}
      {open && (
        <div className="panel journal-form">
          <div className="panel-heading">
            <h2>
              {draft?.researchOnly
                ? "Finish research journal draft"
                : "Record a completed trade"}
            </h2>
            <button
              className="icon-button"
              aria-label="Close trade form"
              onClick={() => {
                setOpen(false);
                setDraft(null);
              }}
            >
              <X size={18} />
            </button>
          </div>
          {draft?.researchOnly && (
            <p className="field-note">
              Prefills from Trade Plan Analytics. Still not an order — enter
              actual exit, fees and funding after a real closed trade.
            </p>
          )}
          <form key={draft?.seededAt ?? "manual"} onSubmit={save}>
            <div className="form-grid three">
              <label className="form-field">
                <span>Market symbol</span>
                <input
                  name="coin"
                  defaultValue={draft?.coin ?? coin}
                  required
                  maxLength={24}
                />
              </label>
              <label className="form-field">
                <span>Direction</span>
                <select name="direction" defaultValue={draft?.direction ?? "long"}>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <label className="form-field">
                <span>Quantity · base units</span>
                <input
                  name="quantity"
                  required
                  type="number"
                  min="0.00000001"
                  step="any"
                  defaultValue={draft?.quantity ?? ""}
                />
              </label>
              {(
                [
                  ["entry", "Actual entry"],
                  ["stop", "Original stop"],
                  ["exit", "Actual exit"],
                  ["fees", "Total fees · USD"],
                  ["funding", "Funding paid · USD"],
                ] as const
              ).map(([name, label]) => (
                <label key={name} className="form-field">
                  <span>{label}</span>
                  <input
                    name={name}
                    required
                    type="number"
                    min={
                      name === "funding"
                        ? undefined
                        : name === "fees"
                          ? "0"
                          : "0.00000001"
                    }
                    step="any"
                    defaultValue={
                      draft?.[name] ??
                      (name === "fees" || name === "funding" ? "0" : undefined)
                    }
                  />
                </label>
              ))}
              <label className="form-field">
                <span>Opened · your local time</span>
                <input
                  name="openedAt"
                  type="datetime-local"
                  required
                  defaultValue={draft?.openedAt ?? localTime()}
                />
              </label>
              <label className="form-field">
                <span>Closed · your local time</span>
                <input
                  name="closedAt"
                  type="datetime-local"
                  required
                  defaultValue={draft?.closedAt ?? localTime()}
                />
              </label>
            </div>
            <label className="form-field">
              <span>Execution notes</span>
              <textarea
                name="notes"
                rows={2}
                maxLength={2000}
                placeholder="Setup, fill quality, rule deviations…"
                defaultValue={draft?.notes ?? ""}
              />
            </label>
            <p className="field-note">
              Enter negative funding if you received it. One R stays fixed at
              quantity × original entry-to-stop distance. Use average actual
              fills for a fully closed position.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" type="submit">
              Save to this browser <ArrowUpRight size={15} />
            </button>
          </form>
        </div>
      )}
      {trades.length ? (
        <div className="panel table-scroll">
          <table className="journal-table">
            <thead>
              <tr>
                <th>Closed</th>
                <th>Market</th>
                <th>Side</th>
                <th>Entry → exit</th>
                <th>Net P&L</th>
                <th>Realized R</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const r = journalResult(t);
                return (
                  <tr key={t.id}>
                    <td>{new Date(t.closedAt).toLocaleDateString()}</td>
                    <td>
                      <strong>{t.coin}</strong>
                    </td>
                    <td>{t.direction}</td>
                    <td className="mono">
                      {price(t.entry)} → {price(t.exit)}
                    </td>
                    <td
                      className={r.net >= 0 ? "positive mono" : "negative mono"}
                    >
                      ${money(r.net)}
                    </td>
                    <td className="mono">{r.netR.toFixed(2)}R</td>
                    <td className="trade-notes">{t.notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty-state">
          <div className="empty-icon">
            <BookOpen size={28} />
          </div>
          <div className="eyebrow">A CLEAN SLATE</div>
          <h2>Your edge starts with evidence.</h2>
          <p>
            Log your completed paper or live trades with their real fills and
            costs. Your results will appear here, not a hypothetical track
            record.
          </p>
          <button className="button secondary" onClick={() => setOpen(true)}>
            <Plus size={15} /> Record your first trade
          </button>
        </div>
      )}
    </section>
  );
}
