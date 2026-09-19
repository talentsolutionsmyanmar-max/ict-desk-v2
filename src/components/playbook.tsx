import {
  ArrowUpRight,
  FlaskConical,
  GitBranch,
  ShieldCheck,
} from "lucide-react";

const steps = [
  [
    "01",
    "Select the market",
    "One venue. Observable liquidity.",
    "BTC, ETH and SOL plus the most active native Hyperliquid perpetuals, up to 12. Volume ≥ $25m/day, open interest ≥ $5m, spread ≤ 5 bps, and at least $10k observed on each side within 10 bps. OI-capped markets and extreme or unknown funding fail the execution gate.",
  ],
  [
    "02",
    "Establish the direction",
    "Structure before premium or discount.",
    "Two confirmed 4h higher highs and higher lows allow long continuation; lower highs and lower lows allow shorts. Strict 2-left / 2-right pivots become known only after confirmation. Mixed structure means wait.",
  ],
  [
    "03",
    "Wait for the sweep",
    "A known level. A measurable reclaim.",
    "Price must sweep a pre-existing, untouched 15m swing or previous UTC-day extreme by max(2 ticks, 0.05 × pre-sweep ATR). Reclaim must occur within three closed 5m bars. The opposite pre-sweep 5m swing is frozen as the break level.",
  ],
  [
    "04",
    "Confirm displacement",
    "No hindsight. No forming-bar signals.",
    "Within three bars after reclaim: a directional close beyond the frozen swing, a body ≥ 1.5× the prior 20-body median, and a body/range ≥ 60%. This must be the middle candle of a completed three-candle fair value gap at least two ticks wide.",
  ],
  [
    "05",
    "Qualify the first retest",
    "Freshness is a condition, not a label.",
    "Use the gap midpoint, rounded conservatively. Reject already observed retracements, full-gap closing invalidations and candidates older than six bars. Entry must be in the appropriate half of the frozen 15m range. A chart touch is not proof of a fill.",
  ],
  [
    "06",
    "Price the risk honestly",
    "Structural stop. Reachable target.",
    "Stop beyond the sweep with max(2 ticks, 2 spreads, 0.15 ATR) buffer. The 3R gross target must fit before the nearest untouched opposing liquidity. Estimated net reward / net stop loss must be ≥ 2 after fees, exit slippage and adverse two-hour funding.",
  ],
];
export function Playbook() {
  return (
    <section className="workspace-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">THE LOGIC BEHIND THE DESK</div>
          <h1>
            A repeatable process<span className="title-dot">.</span>
          </h1>
          <p>
            Fewer assumptions. Better-defined risk. Every condition visible.
          </p>
        </div>
        <span className="pill muted">
          <GitBranch size={13} /> v2.1 · research
        </span>
      </div>
      <div className="playbook-intro panel">
        <div>
          <span className="eyebrow">CONTINUATION · SWEEP · DISPLACEMENT</span>
          <h2>
            Don’t maximize a ratio.
            <br />
            <span>Build an edge you can measure.</span>
          </h2>
        </div>
        <div>
          <p>
            High RR is not the same as positive expectancy. A 5R target with too
            few winners can lose money. This desk identifies testable
            candidates; it has no validated win rate, profitability claim or
            automatic execution.
          </p>
          <span className="pill amber">
            <FlaskConical size={13} /> Forward research, not a proven system
          </span>
        </div>
      </div>
      <div className="playbook-grid">
        {steps.map(([number, title, subtitle, body]) => (
          <article className="panel playbook-step" key={number}>
            <span className="step-number">{number}</span>
            <h2>{title}</h2>
            <h3>{subtitle}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <div className="playbook-bottom">
        <div className="panel">
          <div className="panel-heading">
            <h2>
              <ShieldCheck size={17} /> Research guardrails
            </h2>
          </div>
          <ul className="rule-list">
            <li>
              Initial session hypothesis: weekdays 03–04, 10–11 and 14–15 New
              York. DST-aware. Weekends are observation only.
            </li>
            <li>
              Paper controls: 0.25% risk per trade, 0.50% aggregate open risk, 3
              entries per day and a 0.75% realized daily loss halt. These are
              guidelines, not portfolio-enforced limits.
            </li>
            <li>
              Baseline exit hypothesis: unchanged stop, full 3R target, or time
              exit after 24 five-minute bars. This desk does not simulate,
              monitor or execute positions.
            </li>
            <li>
              Observe BTC / ETH / SOL separately from expanded-universe
              candidates. Extra markets are unvalidated; liquidity does not
              imply strategy suitability.
            </li>
          </ul>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <h2>
              <FlaskConical size={17} /> What still needs proving
            </h2>
          </div>
          <ul className="rule-list">
            <li>
              Venue-matched historical execution data, chronological
              walk-forward tests and an untouched holdout.
            </li>
            <li>
              Net expectancy, drawdown, missed/partial fills and robustness
              under 1.5× and 2× execution costs.
            </li>
            <li>
              Separate 2R / 3R / 4R exit experiments and a session-neutral
              crypto variant. No optimized setting is claimed.
            </li>
            <li>
              Market timestamps and source coverage matter. Observed book depth
              covers only the returned 20 levels per side, not total liquidity.
            </li>
          </ul>
        </div>
      </div>
      <div className="source-links">
        <span>Primary sources</span>
        <a
          href="https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint"
          target="_blank"
          rel="noreferrer"
        >
          Market-data API <ArrowUpRight size={13} />
        </a>
        <a
          href="https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees"
          target="_blank"
          rel="noreferrer"
        >
          Venue fee schedule <ArrowUpRight size={13} />
        </a>
        <a
          href="https://www.cmegroup.com/education/courses/trading-psychology/the-mathematics-of-trading-success"
          target="_blank"
          rel="noreferrer"
        >
          Expectancy, not just RR <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}
