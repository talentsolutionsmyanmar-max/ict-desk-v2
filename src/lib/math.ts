import { CostSettings, DEFAULT_COSTS, JournalTrade, TradeMath } from "./types";

export function tradeMath(
  entry: number,
  stop: number,
  target: number,
  direction: "long" | "short",
  costs: CostSettings = DEFAULT_COSTS,
): TradeMath {
  const invalid = (error: string): TradeMath => ({
    valid: false,
    error,
    risk: 0,
    reward: 0,
    grossRR: 0,
    costAtTarget: 0,
    costAtStop: 0,
    netReward: 0,
    netLoss: 0,
    netRR: 0,
    breakEven: 0,
  });
  if (![entry, stop, target].every((n) => Number.isFinite(n) && n > 0))
    return invalid("Enter positive, finite prices.");
  if (
    !Object.values(costs).every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1000,
    )
  )
    return invalid("Cost assumptions must be between 0 and 1,000 bps.");
  const sign = direction === "long" ? 1 : -1;
  const risk = (entry - stop) * sign;
  const reward = (target - entry) * sign;
  if (risk <= 0 || reward <= 0)
    return invalid(
      "The stop must be on the loss side and the target on the profit side.",
    );
  const shared = (entry * (costs.entryFeeBps + costs.fundingBps)) / 10_000;
  // Slippage is an adverse exit allowance. Entry is assumed to be a passive limit.
  const costAtTarget =
    shared + (target * (costs.exitFeeBps + costs.slippageBps)) / 10_000;
  const costAtStop =
    shared + (stop * (costs.exitFeeBps + costs.slippageBps)) / 10_000;
  const netReward = reward - costAtTarget;
  const netLoss = risk + costAtStop;
  return {
    valid: true,
    risk,
    reward,
    grossRR: reward / risk,
    costAtTarget,
    costAtStop,
    netReward,
    netLoss,
    netRR: netReward / netLoss,
    breakEven: netLoss / (netReward + netLoss),
  };
}

export function tickSize(price: number, szDecimals: number): number {
  if (
    !(price > 0) ||
    !Number.isInteger(szDecimals) ||
    szDecimals < 0 ||
    szDecimals > 6
  )
    return NaN;
  // Integer prices are always permitted; otherwise five significant figures, with at most 6 - szDecimals decimals.
  return Number(
    Math.max(
      10 ** -(6 - szDecimals),
      Math.min(1, 10 ** (Math.floor(Math.log10(price)) - 4)),
    ).toPrecision(1),
  );
}
export function roundTick(
  price: number,
  tick: number,
  mode: "up" | "down",
): number {
  if (!(tick > 0) || !Number.isFinite(price)) return NaN;
  return Number(
    (
      (mode === "up"
        ? Math.ceil(price / tick - 1e-9)
        : Math.floor(price / tick + 1e-9)) * tick
    ).toPrecision(12),
  );
}
export function floorQuantity(qty: number, decimals: number): number {
  return Math.floor(Math.max(0, qty) * 10 ** decimals + 1e-10) / 10 ** decimals;
}
export function journalResult(trade: JournalTrade) {
  const values = [
    trade.entry,
    trade.stop,
    trade.exit,
    trade.quantity,
    trade.fees,
    trade.funding,
  ];
  if (
    !values.every(Number.isFinite) ||
    trade.entry <= 0 ||
    trade.stop <= 0 ||
    trade.exit <= 0 ||
    trade.quantity <= 0 ||
    trade.fees < 0
  )
    throw new Error("Invalid trade values.");
  const sign = trade.direction === "long" ? 1 : -1;
  const initialR = (trade.entry - trade.stop) * sign * trade.quantity;
  if (initialR <= 0) throw new Error("Initial stop must be on the loss side.");
  if (
    !Number.isFinite(Date.parse(trade.openedAt)) ||
    !Number.isFinite(Date.parse(trade.closedAt)) ||
    Date.parse(trade.closedAt) < Date.parse(trade.openedAt)
  )
    throw new Error("Close time must not precede open time.");
  const gross = (trade.exit - trade.entry) * sign * trade.quantity;
  const net = gross - trade.fees - trade.funding;
  return {
    gross,
    net,
    initialR,
    netR: net / initialR,
    priceBps: (((trade.exit - trade.entry) * sign) / trade.entry) * 10_000,
  };
}
