export function price(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: n >= 100 ? 2 : 2,
    maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 5 : 8,
  }).format(n);
}
export function money(n: number) {
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n)
    : "—";
}
export function compact(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
export function pct(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}
export function age(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`;
}
export const COIN_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  HYPE: "Hyperliquid",
  XRP: "XRP",
  DOGE: "Dogecoin",
  BNB: "BNB",
  SUI: "Sui",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  ADA: "Cardano",
  AAVE: "Aave",
  kPEPE: "Pepe",
  LTC: "Litecoin",
  ZEC: "Zcash",
  TAO: "Bittensor",
  ONDO: "Ondo",
  ENA: "Ethena",
  WIF: "dogwifhat",
  NEAR: "NEAR",
  TRUMP: "Official Trump",
};
