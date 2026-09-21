"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crosshair,
  ExternalLink,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  LoaderCircle,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Target,
  TriangleAlert,
  X,
} from "lucide-react";
import { Analysis, Gate, INTERVAL_MS, Interval, Plan } from "@/lib/types";
import { age, COIN_NAMES, compact, pct, price } from "@/lib/format";
import { quoteFresh, RULES, sessionAt } from "@/lib/strategy";
import { useDeskFeed } from "./use-desk-feed";
import { ResearchDesk } from "./research-desk";
import { OpportunityReview } from "./opportunity-review";
import { JevContext } from "./jev-context";
import { AccountControls } from "./account-settings";
import { ForwardJournal } from "./forward-journal";
import { AccountSettings, DEFAULT_ACCOUNT, validAccount } from "@/lib/sizing";
const MarketChart = dynamic(
  () => import("./market-chart").then((m) => m.MarketChart),
  {
    ssr: false,
    loading: () => (
      <div className="chart-area chart-module-loading">
        <LoaderCircle className="spin" size={22} />
        <span>Loading chart workspace…</span>
      </div>
    ),
  },
);
const RiskLab = dynamic(() => import("./risk-lab").then((m) => m.RiskLab));
const Journal = dynamic(() => import("./journal").then((m) => m.Journal));
const Playbook = dynamic(() => import("./playbook").then((m) => m.Playbook));

type View = "desk" | "watchlist" | "journal" | "playbook" | "risk";
const navItems = [
  { id: "desk", label: "Market desk", icon: LayoutDashboard },
  { id: "watchlist", label: "Watchlist", icon: Star },
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "playbook", label: "Playbook", icon: GitBranch },
  { id: "risk", label: "Risk lab", icon: ShieldCheck },
] as const;
const coinMarks: Record<string, string> = {
  BTC: "₿",
  ETH: "Ξ",
  SOL: "S",
  HYPE: "H",
  DOGE: "Ð",
  XRP: "X",
};
function CoinIcon({ coin, small = false }: { coin: string; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`coin-icon coin-${coin.toLowerCase()} ${small ? "small" : ""}`}
    >
      {coinMarks[coin] ?? coin.slice(0, 1)}
    </span>
  );
}
function DirectionBadge({ direction }: { direction: Analysis["direction"] }) {
  return (
    <span className={`direction ${direction}`}>
      {direction === "long" ? (
        <ArrowUpRight size={12} />
      ) : direction === "short" ? (
        <ArrowDownRight size={12} />
      ) : (
        <span className="dash">—</span>
      )}
      {direction === "neutral"
        ? "Mixed"
        : direction === "long"
          ? "Bullish"
          : "Bearish"}
    </span>
  );
}

export function TradingDesk() {
  const [account, setAccount] = useState<AccountSettings>(DEFAULT_ACCOUNT);
  const [view, setView] = useState<View>("desk");
  const [coin, setCoin] = useState("BTC");
  const [interval, setInterval] = useState<Interval>("5m");
  const [watchlist, setWatchlist] = useState<string[]>(["BTC", "ETH", "SOL"]);
  const [storageWarning, setStorageWarning] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("quality");
  const [expandedGate, setExpandedGate] = useState<string | null>(null);
  const [riskPlan, setRiskPlan] = useState<Plan | null>(null);
  const [notice, setNotice] = useState(true);
  const searchInput = useRef<HTMLInputElement>(null);
  const feed = useDeskFeed(coin, interval);
  const { now, markets, scan } = feed;
  useEffect(() => {
    try {
      const storedAccount = JSON.parse(
        localStorage.getItem("ict-edge-account-v1") ?? "null",
      );
      if (storedAccount && validAccount(storedAccount))
        setAccount(storedAccount);
      const saved = JSON.parse(
        localStorage.getItem("ict-edge-watchlist-v1") ?? "null",
      );
      if (Array.isArray(saved))
        setWatchlist(
          saved
            .filter(
              (s) => typeof s === "string" && /^[A-Za-z0-9._-]{1,24}$/.test(s),
            )
            .slice(0, 100),
        );
    } catch {
      setStorageWarning(
        "Browser storage is unavailable. Watchlist changes may not persist.",
      );
    }
    const keyboard = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        setView("desk");
        setTimeout(() => searchInput.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  const updateAccount = (value: AccountSettings) => {
    setAccount(value);
    if (validAccount(value)) {
      try {
        localStorage.setItem("ict-edge-account-v1", JSON.stringify(value));
      } catch {
        setStorageWarning(
          "Account settings could not be saved on this device.",
        );
      }
    }
  };
  const toggleWatch = (symbol: string) => {
    const next = watchlist.includes(symbol)
      ? watchlist.filter((s) => s !== symbol)
      : [...watchlist, symbol];
    setWatchlist(next);
    try {
      localStorage.setItem("ict-edge-watchlist-v1", JSON.stringify(next));
    } catch {
      setStorageWarning("Watchlist could not be saved to this browser.");
    }
  };
  const market = markets?.markets.find((m) => m.coin === coin);
  const analysis = scan?.analyses.find((a) => a.coin === coin);
  const marketStale = !markets || now - markets.receivedAt > 90_000;
  const scanStale = !scan || now - scan.receivedAt > 80_000;
  const live = feed.status === "live";
  const currentPrice = live ? (feed.mids[coin] ?? market?.mark) : market?.mark;
  const book = feed.book;
  const freshQuote = quoteFresh(book, now);
  const currentSession = now
    ? sessionAt(now)
    : { open: false, label: "Checking session", nyTime: "—", key: "" };
  const rawPlan = analysis?.plan ?? null;
  const liveRetest =
    !!rawPlan &&
    ((!!feed.signalCandle &&
      feed.signalCandle.time >= rawPlan.formedAt &&
      (rawPlan.direction === "long"
        ? feed.signalCandle.low <= rawPlan.entry
        : feed.signalCandle.high >= rawPlan.entry)) ||
      (!!book &&
        (rawPlan.direction === "long"
          ? book.bid <= rawPlan.entry
          : book.ask >= rawPlan.entry)));
  const planExpired =
    !!rawPlan && (now >= rawPlan.expiresAt || !currentSession.open);
  const plan = liveRetest || planExpired ? null : rawPlan;
  const currentBar =
    !!analysis?.lastClosedBar &&
    Math.floor((analysis.lastClosedBar + 1) / INTERVAL_MS["5m"]) ===
      Math.floor(now / INTERVAL_MS["5m"]);
  const liveTriggerBar =
    !!feed.signalCandle &&
    feed.signalCandle.time ===
      Math.floor(now / INTERVAL_MS["5m"]) * INTERVAL_MS["5m"];
  const currentDepth =
    !!book &&
    book.spreadBps <= RULES.maxSpreadBps &&
    Math.min(book.bidDepth10bps, book.askDepth10bps) >= RULES.minDepth;
  const gates: Gate[] = (analysis?.gates ?? []).map((g) => {
    if (
      g.id === "data" &&
      (!freshQuote ||
        scanStale ||
        marketStale ||
        !currentBar ||
        (rawPlan && !liveTriggerBar) ||
        feed.error)
    )
      return {
        ...g,
        status: "fail",
        detail: !currentBar
          ? "Awaiting a scan of the latest closed 5m bar. Live price alone does not refresh a setup."
          : "Required snapshot or executable quote is stale/unavailable. New entries are blocked.",
      };
    if (g.id === "liquidity" && !currentDepth)
      return {
        ...g,
        status: "fail",
        detail:
          "The current live spread or observed depth does not pass the execution gate.",
      };
    if (g.id === "gap" && (liveRetest || planExpired))
      return {
        ...g,
        status: "fail",
        detail: liveRetest
          ? "A retest has now been observed. This is not proof of a fill; the first-retest opportunity is no longer offered."
          : "Candidate lifetime or entry window has ended.",
      };
    if (g.id === "session")
      return {
        ...g,
        status: currentSession.open ? "pass" : "fail",
        detail: `${currentSession.label}. New entries only 03–04, 10–11, 14–15 New York on weekdays.`,
      };
    return g;
  });
  const eligible =
    !!plan && gates.length === 10 && gates.every((g) => g.status === "pass");
  const stage =
    !analysis && scan
      ? "Outside scanned universe"
      : liveRetest
        ? "Retracement passed"
        : scanStale || !freshQuote || !currentBar
          ? "Waiting for fresh data"
          : (analysis?.stage ?? "Analyzing structure");
  const setupSummary =
    !analysis && scan
      ? "Chart-only market. The strategy scanner covers BTC, ETH, SOL and the nine most active eligible markets. No setup is inferred outside that universe."
      : liveRetest
        ? "The first retest has been observed. No new entry is offered, and no fill is assumed."
        : stage === "Waiting for fresh data"
          ? "Waiting for complete closed-bar context and a fresh executable quote. Live price alone cannot confirm a setup."
          : (analysis?.summary ??
            "Loading confirmed structure, liquidity and cost-aware setup conditions.");
  const rows = useMemo(() => {
    const matched = (scan?.analyses ?? [])
      .map((a) => ({
        analysis: a,
        market: markets?.markets.find((m) => m.coin === a.coin),
      }))
      .filter((row) => row.market);
    let result = matched.filter(
      (r) =>
        (view !== "watchlist" || watchlist.includes(r.analysis.coin)) &&
        `${r.analysis.coin} ${COIN_NAMES[r.analysis.coin] ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "all" ||
          (filter === "liquid" && r.analysis.liquid) ||
          (filter === "trend" && r.analysis.direction !== "neutral")),
    );
    if (sort === "volume")
      result = result.sort(
        (a, b) => (b.market?.volume24h ?? 0) - (a.market?.volume24h ?? 0),
      );
    if (sort === "change")
      result = result.sort(
        (a, b) =>
          (b.market?.change24h ?? -Infinity) -
          (a.market?.change24h ?? -Infinity),
      );
    if (sort === "quality")
      result = result.sort(
        (a, b) =>
          Number(b.analysis.research?.some((m) => m.status === "candidate")) -
            Number(
              a.analysis.research?.some((m) => m.status === "candidate"),
            ) ||
          Number(b.analysis.liquid) - Number(a.analysis.liquid) ||
          (b.market?.volume24h ?? 0) - (a.market?.volume24h ?? 0),
      );
    return result;
  }, [scan, markets, search, filter, sort, view, watchlist]);
  const liquidCount = scan?.analyses.filter((a) => a.liquid).length ?? 0;
  const directional =
    scan?.analyses.filter((a) => a.direction !== "neutral").length ?? 0;
  const scopedVolume =
    scan?.analyses.reduce(
      (sum, a) =>
        sum + (markets?.markets.find((m) => m.coin === a.coin)?.volume24h ?? 0),
      0,
    ) ?? 0;
  const selectCoin = (symbol: string) => {
    setCoin(symbol);
    setExpandedGate(null);
    if (view === "watchlist") setView("desk");
    requestAnimationFrame(() =>
      document
        .querySelector(".price-panel")
        ?.scrollIntoView({ block: "start", behavior: "auto" }),
    );
  };
  const openRisk = (p: Plan | null = null) => {
    setRiskPlan(p);
    setView("risk");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const selectedLabel = navItems.find((n) => n.id === view)?.label;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="ICT Edge home">
          <span className="brand-glyph">
            <i />
            <i />
            <i />
          </span>
          <span className="brand-text">
            edge<span>ICT RESEARCH DESK</span>
          </span>
        </a>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Workspace">
          {navItems.map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              title={item.label}
              onClick={() => {
                setView(item.id);
                window.scrollTo({ top: 0, behavior: "instant" });
                if (item.id === "risk") setRiskPlan(null);
              }}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "watchlist" && <small>{watchlist.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="research-badge">
            <FlaskConical size={17} />
            <div>
              Research mode<span>No order execution</span>
            </div>
          </div>
          <a
            className="source-button"
            href="https://github.com/talentsolutionsmyanmar-max/ict-desk-v2"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={15} /> View source <ExternalLink size={12} />
          </a>
          <div className="sidebar-version">
            <span className="status-dot" /> V4 forward<span>V2.1 BASELINE</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{selectedLabel}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection-badge ${live ? "connected" : ""}`}>
              <span className="status-dot" />
              {live
                ? "Live feed"
                : feed.status === "paused"
                  ? "Feed paused"
                  : "Connecting"}
            </span>
            <span className="ny-clock">
              <Clock3 size={13} />
              {currentSession.nyTime} <span>NY</span>
            </span>
            <button
              className="button small secondary"
              aria-label="Risk controls"
              onClick={() => openRisk()}
            >
              <SlidersHorizontal size={14} />
              <span>Risk controls</span>
            </button>
          </div>
        </header>
        <main id="main-content">
          {storageWarning && (
            <div className="banner warning">
              <TriangleAlert size={15} />
              <span>{storageWarning}</span>
              <button
                aria-label="Dismiss storage warning"
                className="icon-button"
                onClick={() => setStorageWarning("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {feed.error && (
            <div className="banner warning" role="alert">
              <TriangleAlert size={16} />
              <span>
                {feed.error} Previously received values may remain visible;
                setup eligibility is blocked.
              </span>
              <button
                className="text-button"
                onClick={() => void feed.refresh()}
              >
                Retry
              </button>
            </div>
          )}
          {(view === "desk" || view === "watchlist") && (
            <>
              <section className="section-heading desk-heading">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-square" /> PRECISION OVER PREDICTION
                  </div>
                  <h1>
                    {view === "watchlist"
                      ? "Your watchlist"
                      : "The market, in focus"}
                    <span className="title-dot">.</span>
                  </h1>
                  <p>
                    {view === "watchlist"
                      ? "Your saved markets. Local to this browser, with the same uncompromising setup gates."
                      : "Find liquid markets. Wait for confirmation. Know your risk."}
                  </p>
                </div>
                <div className="heading-meta">
                  <span className="venue-badge">
                    <span className="venue-symbol">≋</span> Hyperliquid{" "}
                    <span>PERPETUALS</span>
                  </span>
                  <span className="updated-label">
                    {scan
                      ? `Scan ${age(now - scan.receivedAt)}`
                      : "Building the first scan…"}
                    <button
                      aria-label="Refresh market scan"
                      title="Refresh snapshot (venue data is cached up to 60 seconds)"
                      className="icon-button"
                      onClick={() => void feed.refresh()}
                      disabled={feed.refreshing}
                    >
                      <RefreshCw
                        size={12}
                        className={feed.refreshing ? "spin" : ""}
                      />
                    </button>
                  </span>
                </div>
              </section>
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-label">
                    Markets analyzed <Crosshair size={15} />
                  </span>
                  <div className="stat-value">
                    {scan?.analyzedCount ?? "—"}
                    <span>/ {scan?.universeCount ?? "—"} active</span>
                  </div>
                  <span className="stat-foot">
                    Core majors + highest-volume markets
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">
                    Liquidity-qualified <Activity size={15} />
                  </span>
                  <div className="stat-value">
                    {scan ? String(liquidCount).padStart(2, "0") : "—"}
                    <span className="positive">
                      {scan
                        ? `${Math.round((liquidCount / scan.analyzedCount) * 100)}% of scan`
                        : ""}
                    </span>
                  </div>
                  <span className="stat-foot">
                    All execution-quality gates passed at scan
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">
                    Directional structure <GitBranch size={15} />
                  </span>
                  <div className="stat-value">
                    {scan ? String(directional).padStart(2, "0") : "—"}
                    <span>4h confirmed</span>
                  </div>
                  <span className="stat-foot">
                    Trend context, not an entry signal
                  </span>
                </div>
                <div className="stat-card accent-stat">
                  <span className="stat-label">
                    Scanned 24h volume <ArrowUpRight size={15} />
                  </span>
                  <div className="stat-value">
                    {scan ? `$${compact(scopedVolume)}` : "—"}
                  </div>
                  <span className="stat-foot">
                    <span className="status-dot" />
                    Venue-reported · analyzed markets only
                  </span>
                </div>
              </div>
              {notice && (
                <div className="session-notice">
                  <div className="notice-icon">
                    <Clock3 size={16} />
                  </div>
                  <div>
                    <strong>24/7 models are evaluated independently</strong>
                    <span>
                      V4 uses two execution playbooks with 15M regime context.
                      V2.1 remains below as the weekday-only comparison
                      baseline.
                    </span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setView("playbook");
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                  >
                    View rules <ArrowUpRight size={12} />
                  </button>
                  <button
                    className="icon-button dismiss"
                    onClick={() => setNotice(false)}
                    aria-label="Dismiss session notice"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {view === "desk" && (
                <AccountControls account={account} onChange={updateAccount} />
              )}
              {view === "desk" && (
                <ResearchDesk
                  account={account}
                  coin={coin}
                  market={market}
                  models={analysis?.research}
                  context={feed.context}
                  book={book}
                  signalCandle={feed.signalCandle}
                  now={now}
                  dataReady={
                    !scanStale &&
                    !marketStale &&
                    currentBar &&
                    liveTriggerBar &&
                    !feed.error
                  }
                  onRisk={openRisk}
                />
              )}
              {view === "desk" && (
                <OpportunityReview key={`review:${coin}`} coin={coin} />
              )}
              {view === "desk" && <ForwardJournal />}
              {view === "desk" && <JevContext key={coin} coin={coin} />}
              {view === "desk" && (
                <div className="trading-grid">
                  <section className="panel price-panel">
                    <div className="instrument-header">
                      <div className="instrument-title">
                        <CoinIcon coin={coin} />
                        <label className="coin-selector">
                          <span className="sr-only">Selected market</span>
                          <select
                            value={coin}
                            onChange={(e) => selectCoin(e.target.value)}
                          >
                            {(
                              markets?.markets ?? [
                                { coin: "BTC" },
                                { coin: "ETH" },
                                { coin: "SOL" },
                              ]
                            ).map((m) => (
                              <option key={m.coin} value={m.coin}>
                                {m.coin} / USD
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} />
                          <small>{COIN_NAMES[coin] ?? coin} perpetual</small>
                        </label>
                        <button
                          className={`icon-button watch-button ${watchlist.includes(coin) ? "starred" : ""}`}
                          aria-label={`${watchlist.includes(coin) ? "Remove" : "Add"} ${coin} ${watchlist.includes(coin) ? "from" : "to"} watchlist`}
                          onClick={() => toggleWatch(coin)}
                        >
                          <Star
                            size={15}
                            fill={
                              watchlist.includes(coin) ? "currentColor" : "none"
                            }
                          />
                        </button>
                      </div>
                      <div className="instrument-price">
                        <strong>{price(currentPrice)}</strong>
                        <span
                          className={
                            (market?.change24h ?? 0) >= 0
                              ? "positive"
                              : "negative"
                          }
                        >
                          {pct(market?.change24h)}{" "}
                          <small>
                            24h ·{" "}
                            {live && feed.mids[coin] ? "mid" : "last mark"}
                          </small>
                        </span>
                      </div>
                      <div className="instrument-mini">
                        <span>24h volume</span>
                        <strong>${compact(market?.volume24h)}</strong>
                      </div>
                      <div className="instrument-mini">
                        <span>Funding / hr</span>
                        <strong>
                          {market?.fundingHourly == null
                            ? "—"
                            : pct(market.fundingHourly * 100, 4)}
                        </strong>
                      </div>
                    </div>
                    <MarketChart
                      coin={coin}
                      candles={feed.candles}
                      interval={interval}
                      onInterval={setInterval}
                      plan={plan}
                      error={feed.chartError}
                    />
                    <div className="execution-strip">
                      <span>
                        <span
                          className={`status-dot ${freshQuote ? "" : "amber-dot"}`}
                        />{" "}
                        {freshQuote
                          ? "Live executable quote"
                          : "Waiting for fresh quote"}
                      </span>
                      <span>
                        Spread{" "}
                        <b>{book ? `${book.spreadBps.toFixed(2)} bps` : "—"}</b>
                      </span>
                      <span>
                        Bid depth{" "}
                        <b>{book ? `$${compact(book.bidDepth10bps)}` : "—"}</b>
                      </span>
                      <span>
                        Ask depth{" "}
                        <b>{book ? `$${compact(book.askDepth10bps)}` : "—"}</b>
                      </span>
                      <span
                        className="depth-info"
                        title="Observed notional within 10 bps of midpoint, from at most 20 price levels per side."
                      >
                        <CircleHelp size={12} /> ±10 bps
                      </span>
                    </div>
                  </section>
                  <aside className="panel setup-panel">
                    <div className="panel-heading">
                      <h2>
                        <Crosshair size={16} /> Baseline comparison
                      </h2>
                      <span className="version-tag">V2.1</span>
                    </div>
                    <div className="setup-context">
                      <span>4H DIRECTION</span>
                      <DirectionBadge
                        direction={analysis?.direction ?? "neutral"}
                      />
                    </div>
                    <div
                      className={`setup-state ${eligible ? "is-ready" : ""}`}
                    >
                      <span className="eyebrow">
                        {eligible
                          ? "RESEARCH CANDIDATE"
                          : "PATIENCE IS A POSITION"}
                      </span>
                      <h3>{stage}</h3>
                      <p>{setupSummary}</p>
                    </div>
                    <div className="gate-heading">
                      <span>V2.1 RULE COMPLETENESS · NOT WIN ODDS</span>
                      <strong>
                        {gates.filter((g) => g.status === "pass").length}
                        <span> / {gates.length || 10}</span>
                      </strong>
                    </div>
                    <div className="setup-gates">
                      {gates.length ? (
                        gates.map((g) => (
                          <div className="gate-item" key={g.id}>
                            <button
                              onClick={() =>
                                setExpandedGate(
                                  expandedGate === g.id ? null : g.id,
                                )
                              }
                              aria-expanded={expandedGate === g.id}
                              aria-label={`${g.label}: ${g.status === "pass" ? "passed" : g.status === "fail" ? "blocked" : "waiting"}`}
                              className="gate-button"
                            >
                              <span className={`gate-icon ${g.status}`}>
                                {g.status === "pass" ? (
                                  <Check size={11} />
                                ) : g.status === "fail" ? (
                                  <X size={10} />
                                ) : (
                                  <span />
                                )}
                              </span>
                              <span>{g.label}</span>
                              <ChevronDown
                                size={12}
                                className={
                                  expandedGate === g.id ? "rotated" : ""
                                }
                              />
                            </button>
                            {expandedGate === g.id && <p>{g.detail}</p>}
                          </div>
                        ))
                      ) : (
                        <div className="setup-loading">
                          {scan ? (
                            <Crosshair size={18} />
                          ) : (
                            <LoaderCircle className="spin" size={18} />
                          )}
                          <span>
                            {scan
                              ? "Chart available · strategy not evaluated"
                              : "Evaluating closed candles…"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="setup-plan">
                      <div>
                        <span>Entry</span>
                        <strong>{plan ? price(plan.entry) : "—"}</strong>
                      </div>
                      <div>
                        <span>Stop loss</span>
                        <strong>{plan ? price(plan.stop) : "—"}</strong>
                      </div>
                      <div>
                        <span>Take profit · 3R gross</span>
                        <strong>{plan ? price(plan.target) : "—"}</strong>
                      </div>
                      <div>
                        <span>Net RR</span>
                        <strong className={plan ? "positive" : ""}>
                          {plan ? `${plan.netRR.toFixed(2)}R` : "—"}
                        </strong>
                      </div>
                    </div>
                    <button
                      className="button setup-cta"
                      onClick={() => openRisk(plan)}
                    >
                      <ShieldCheck size={15} />
                      {plan
                        ? eligible
                          ? "Review candidate risk"
                          : "Inspect filtered scenario"
                        : "Open risk calculator"}
                      <ArrowRight size={15} />
                    </button>
                    <p className="setup-footnote">
                      {eligible
                        ? "Not an order. Portfolio risk and actual fill conditions require your review."
                        : "No complete setup, no suggested trade."}
                    </p>
                  </aside>
                </div>
              )}
              <section className="panel scanner-panel">
                <div className="scanner-heading">
                  <div>
                    <div className="eyebrow">QUALITY OVER QUANTITY</div>
                    <h2>
                      {view === "watchlist"
                        ? "Saved market radar"
                        : "Opportunity radar"}
                      <span>{rows.length}</span>
                    </h2>
                    <p>
                      Ranked by fresh model candidates at scan, execution
                      quality, then volume. Playbooks are independent, not
                      combined checks that must all pass. Inspect the selected
                      market for live validity.
                    </p>
                  </div>
                  <div className="scanner-search">
                    <Search size={15} />
                    <input
                      ref={searchInput}
                      aria-label="Search analyzed markets"
                      placeholder="Search markets…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <kbd>/</kbd>
                  </div>
                </div>
                <div className="scanner-controls">
                  <div
                    className="filter-tabs"
                    role="group"
                    aria-label="Market filter"
                  >
                    {[
                      ["all", "All markets"],
                      ["liquid", "Liquidity-qualified"],
                      ["trend", "Directional"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={filter === id ? "active" : ""}
                        aria-pressed={filter === id}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                        {id === "liquid" && <span>{liquidCount}</span>}
                      </button>
                    ))}
                  </div>
                  <label className="sort-select">
                    <SlidersHorizontal size={12} />
                    <span className="sr-only">Sort markets</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="quality">Setup progress</option>
                      <option value="volume">24h volume</option>
                      <option value="change">24h change</option>
                    </select>
                    <ChevronDown size={12} />
                  </label>
                </div>
                <div className="table-scroll">
                  <table className="market-table">
                    <thead>
                      <tr>
                        <th>
                          <span className="sr-only">Watchlist</span>
                        </th>
                        <th>Market</th>
                        <th>
                          Price <span>USD</span>
                        </th>
                        <th>24h change</th>
                        <th className="optional-column">24h volume</th>
                        <th className="optional-column">Funding / hr</th>
                        <th>4h structure</th>
                        <th>24/7 model observations</th>
                        <th className="optional-column">Net RR</th>
                        <th>
                          <span className="sr-only">Select</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ analysis: a, market: m }) => {
                        if (!m) return null;
                        const selected = a.coin === coin;
                        const candidate = a.research?.find(
                          (r) =>
                            r.status === "candidate" &&
                            r.plan &&
                            now < r.plan.expiresAt,
                        );
                        return (
                          <tr
                            key={a.coin}
                            className={selected ? "selected-row" : ""}
                          >
                            <td>
                              <button
                                className={`icon-button star-button ${watchlist.includes(a.coin) ? "starred" : ""}`}
                                aria-label={`${watchlist.includes(a.coin) ? "Remove" : "Add"} ${a.coin} ${watchlist.includes(a.coin) ? "from" : "to"} watchlist`}
                                onClick={() => toggleWatch(a.coin)}
                              >
                                <Star
                                  size={13}
                                  fill={
                                    watchlist.includes(a.coin)
                                      ? "currentColor"
                                      : "none"
                                  }
                                />
                              </button>
                            </td>
                            <td>
                              <button
                                className="market-name"
                                onClick={() => selectCoin(a.coin)}
                              >
                                <CoinIcon coin={a.coin} small />
                                <span>
                                  <strong>
                                    {a.coin}
                                    <small>PERP</small>
                                  </strong>
                                  <span>{COIN_NAMES[a.coin] ?? a.coin}</span>
                                </span>
                              </button>
                            </td>
                            <td className="mono price-cell">
                              {price(
                                live ? (feed.mids[a.coin] ?? m.mark) : m.mark,
                              )}
                            </td>
                            <td
                              className={`mono ${(m.change24h ?? 0) >= 0 ? "positive" : "negative"}`}
                            >
                              {pct(m.change24h)}
                            </td>
                            <td className="optional-column mono">
                              ${compact(m.volume24h)}
                            </td>
                            <td className="optional-column mono subdued">
                              {m.fundingHourly === null
                                ? "—"
                                : pct(m.fundingHourly * 100, 4)}
                            </td>
                            <td>
                              <DirectionBadge direction={a.direction} />
                            </td>
                            <td>
                              <span
                                className={`table-stage ${a.liquid ? "quality" : ""}`}
                              >
                                <span className="status-dot" />
                                {scanStale
                                  ? "Scan stale"
                                  : candidate
                                    ? `${candidate.direction.toUpperCase()} · ${candidate.label}`
                                    : a.liquid
                                      ? "No fresh candidate"
                                      : "Liquidity filtered"}
                              </span>
                              <div className="model-radar-status">
                                {(a.research ?? []).map((r) => (
                                  <span
                                    key={r.id}
                                    title={`${r.label}: ${r.status}. ${r.summary}`}
                                  >
                                    {r.id === "continuation"
                                      ? "Trend"
                                      : r.id === "reversal"
                                        ? "Sweep"
                                        : "Break"}
                                    :{" "}
                                    {scanStale
                                      ? "stale"
                                      : r.plan &&
                                          now >= r.plan.expiresAt &&
                                          r.status === "candidate"
                                        ? "expired"
                                        : r.status}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="optional-column mono">
                              {candidate?.plan && !scanStale
                                ? `${candidate.plan.netRR.toFixed(2)}R*`
                                : "—"}
                            </td>
                            <td>
                              <button
                                className="icon-button row-arrow"
                                onClick={() => selectCoin(a.coin)}
                                aria-label={`Inspect ${a.coin}`}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!scan && (
                  <div className="scanner-empty">
                    <LoaderCircle className="spin" size={22} />
                    <strong>Scanning the market</strong>
                    <span>
                      Validating liquidity and three timeframes for each pair.
                      First scan can take up to a minute.
                    </span>
                  </div>
                )}
                {scan && rows.length === 0 && (
                  <div className="scanner-empty">
                    <Search size={22} />
                    <strong>No markets match this view</strong>
                    <span>
                      {view === "watchlist"
                        ? "Star a scanned market to save it here. The scanner covers the core majors and most active pairs."
                        : "Try another symbol or remove a filter. Search covers the analyzed universe."}
                    </span>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Reset filters
                    </button>
                  </div>
                )}
                <div className="scanner-footer">
                  <span>
                    <span className="status-dot" />
                    {scan
                      ? `${scan.analyzedCount} markets analyzed · refreshes every 60s`
                      : "Connecting to public venue data"}
                  </span>
                  <span>
                    Model status ≠ win probability · * at-scan estimate
                  </span>
                </div>
              </section>
              <div className="desk-bottom-note">
                <ShieldCheck size={15} />
                <p>
                  <strong>Protect your capital.</strong> Liquidity-qualified
                  does not mean a valid trade. Wait for every gate, review
                  costs, and paper-test before risking funds.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setView("playbook");
                    window.scrollTo({ top: 0, behavior: "instant" });
                  }}
                >
                  Explore the strategy <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}
          {view === "risk" && (
            <RiskLab
              account={account}
              onAccountChange={updateAccount}
              key={`${coin}:${riskPlan?.id ?? "manual"}`}
              market={market}
              plan={riskPlan}
            />
          )}
          {view === "journal" && <Journal coin={coin} />}
          {view === "playbook" && <Playbook />}
        </main>
        <footer className="workspace-footer">
          <div>
            <span className="footer-brand">edge</span>
            <span>Built for discipline. Designed for clarity.</span>
          </div>
          <div>
            <span className="research-disclaimer">
              Experimental research · no proven edge · no order execution
            </span>
            <a
              href="https://hyperliquid.gitbook.io/hyperliquid-docs"
              target="_blank"
              rel="noreferrer"
            >
              Data source <ExternalLink size={11} />
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
