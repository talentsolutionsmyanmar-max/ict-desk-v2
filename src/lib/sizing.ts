import { floorQuantity } from "./math";
import { TradeMath } from "./types";

// Native Hyperliquid perpetuals only; not a portable rule for other venues.
// https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses
export const MIN_PERP_NOTIONAL = 10;
export const DEFAULT_ACCOUNT_EQUITY = 1000;
export const DEFAULT_RISK_PERCENT = 0.25;
export interface AccountSettings {
  equity: number;
  riskPercent: number;
}
export const DEFAULT_ACCOUNT: AccountSettings = {
  equity: DEFAULT_ACCOUNT_EQUITY,
  riskPercent: DEFAULT_RISK_PERCENT,
};
export function validAccount(value: AccountSettings) {
  return (
    Number.isFinite(value.equity) &&
    value.equity > 0 &&
    Number.isFinite(value.riskPercent) &&
    value.riskPercent > 0 &&
    value.riskPercent <= 1
  );
}

export function sizeScenario({
  equity,
  riskPercent,
  entry,
  math,
  szDecimals,
}: {
  equity: number;
  riskPercent: number;
  entry: number;
  math: TradeMath;
  szDecimals: number | undefined;
}) {
  const blocked = (reason: string) => ({
    valid: false,
    reason,
    quantity: 0,
    notional: 0,
    estimatedStopLoss: 0,
    estimatedTargetPnl: 0,
    estimatedStopCosts: 0,
    meetsMinimum: false,
  });
  if (
    ![equity, riskPercent, entry].every(Number.isFinite) ||
    equity <= 0 ||
    entry <= 0 ||
    riskPercent <= 0 ||
    riskPercent > 1
  )
    return blocked(
      "Enter positive equity and a planned risk no greater than 1%.",
    );
  if (
    szDecimals === undefined ||
    !Number.isInteger(szDecimals) ||
    szDecimals < 0 ||
    szDecimals > 6
  )
    return blocked(
      "Venue quantity precision is unavailable. No size is inferred.",
    );
  if (
    !math.valid ||
    ![math.netLoss, math.netReward, math.costAtStop].every(Number.isFinite) ||
    math.netLoss <= 0 ||
    math.costAtStop < 0
  )
    return blocked("Complete valid entry, stop, target and cost assumptions.");

  const riskBudget = (equity * riskPercent) / 100;
  // Reserve modeled stop-side execution costs inside the unlevered capital cap.
  const maximum = Math.min(
    riskBudget / math.netLoss,
    equity / (entry + math.costAtStop),
  );
  if (!(maximum > 0) || !Number.isFinite(maximum))
    return blocked("The inputs cannot produce a finite positive size.");
  const quantity = floorQuantity(maximum, szDecimals);
  const notional = quantity * entry;
  if (
    ![
      quantity,
      notional,
      quantity * math.netLoss,
      quantity * math.netReward,
      quantity * math.costAtStop,
    ].every(Number.isFinite)
  )
    return blocked("The inputs are outside finite calculation limits.");
  const meetsMinimum = quantity > 0 && notional >= MIN_PERP_NOTIONAL;
  return {
    valid: true,
    reason: meetsMinimum
      ? "Size meets the documented minimum only; this is not an order or margin approval."
      : `Skip this scenario: rounded entry notional is below the $${MIN_PERP_NOTIONAL} venue minimum. Size is never rounded up to force a trade.`,
    quantity,
    notional,
    estimatedStopLoss: quantity * math.netLoss,
    estimatedTargetPnl: quantity * math.netReward,
    estimatedStopCosts: quantity * math.costAtStop,
    meetsMinimum,
  };
}
