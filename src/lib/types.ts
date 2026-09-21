export type Direction = "long" | "short" | "neutral";
export type Interval = "5m" | "15m" | "1h" | "4h";
export const INTERVAL_MS: Record<Interval, number> = {
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
};
export interface Candle {
  time: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Market {
  coin: string;
  szDecimals: number;
  mark: number;
  mid: number | null;
  change24h: number | null;
  volume24h: number | null;
  openInterestUsd: number | null;
  openInterestBase?: number | null;
  fundingHourly: number | null;
  capped: boolean | null;
}
export interface MarketSnapshot {
  markets: Market[];
  receivedAt: number;
  venue: "Hyperliquid";
  capStatusKnown: boolean;
}
export interface Book {
  coin: string;
  time: number;
  receivedAt: number;
  bid: number;
  ask: number;
  spreadBps: number;
  bidDepth10bps: number;
  askDepth10bps: number;
}
export interface Gate {
  id: string;
  label: string;
  status: "pass" | "wait" | "fail";
  detail: string;
}
export interface CostSettings {
  entryFeeBps: number;
  exitFeeBps: number;
  slippageBps: number;
  fundingBps: number;
}
export const DEFAULT_COSTS: CostSettings = {
  entryFeeBps: 1.5,
  exitFeeBps: 4.5,
  slippageBps: 2,
  fundingBps: 0,
};
export interface TradeMath {
  valid: boolean;
  error?: string;
  risk: number;
  reward: number;
  grossRR: number;
  costAtTarget: number;
  costAtStop: number;
  netReward: number;
  netLoss: number;
  netRR: number;
  breakEven: number;
}
export interface Plan {
  maxHoldMs?: number;
  id: string;
  direction: "long" | "short";
  entry: number;
  stop: number;
  target: number;
  gapLow: number;
  gapHigh: number;
  formedAt: number;
  expiresAt: number;
  sweepLevel: number;
  sweepExtreme: number;
  triggerLevel: number;
  obstacle: number;
  rangeLow: number;
  rangeHigh: number;
  netRR: number;
  grossRR: number;
  costs: CostSettings;
}
export interface Analysis {
  coin: string;
  direction: Direction;
  stage: string;
  summary: string;
  score: number;
  gates: Gate[];
  plan: Plan | null;
  book: Book | null;
  evaluatedAt: number;
  lastClosedBar: number | null;
  liquid: boolean;
  ready: boolean;
  session: Session;
  research?: ResearchModel[];
}
export type ResearchModelId = "continuation" | "reversal" | "breakout";
export interface ResearchModel {
  id: ResearchModelId;
  label: string;
  direction: Direction;
  status:
    | "watching"
    | "approaching"
    | "candidate"
    | "filtered"
    | "passed"
    | "expired"
    | "blocked";
  watchLevel?: number;
  regime?: string;
  summary: string;
  trigger: string;
  context: string;
  gates: Gate[];
  plan: Plan | null;
}
export interface Session {
  open: boolean;
  label: string;
  nyTime: string;
  key: string;
}
export interface ScanSnapshot {
  analyses: Analysis[];
  receivedAt: number;
  universeCount: number;
  analyzedCount: number;
  strategyVersion: string;
  researchVersion?: string;
  errors: string[];
}
export interface JournalTrade {
  id: string;
  coin: string;
  direction: "long" | "short";
  openedAt: string;
  closedAt: string;
  entry: number;
  stop: number;
  exit: number;
  quantity: number;
  fees: number;
  funding: number;
  notes: string;
}
