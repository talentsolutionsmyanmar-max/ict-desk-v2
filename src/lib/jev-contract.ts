// Public types and labels only. Provider credentials never enter this module.
export const JEV_MODEL = "jev-1.13.0";
export const JEV_SCHEMA_VERSION = "context-1.0";
export const JEV_TIMEFRAMES = "4H / 15M / 5M";

export const JEV_LABELS = {
  relevance: {
    direct_asset: "Direct asset reference",
    broad_crypto: "Broad crypto context",
    unrelated: "Unrelated",
    unclear: "Unclear relevance",
  },
  topic: {
    security_incident: "Security incident",
    supply_change: "Supply / token unlock",
    venue_operations: "Exchange operations",
    policy_macro: "Policy / macro",
    adoption: "Adoption / integration",
    market_commentary: "Market commentary",
    other: "Other / unclear",
  },
  evidence: {
    stated_event: "Reported event",
    planned_event: "Future plan",
    speculation: "Speculation / opinion",
    reference_information: "Reference information",
    unclear: "Unclear evidence",
  },
} as const;

export type JevDimension = keyof typeof JEV_LABELS;
export type JevChoice = {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type JevSource = {
  coin: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string | null;
  publicSourceConfirmed: true;
};
export type JevReview = {
  id: string;
  schemaVersion: typeof JEV_SCHEMA_VERSION;
  model: typeof JEV_MODEL;
  timeframes: typeof JEV_TIMEFRAMES;
  language: "en";
  mode: "shadow-context-only";
  sourceVerified: false;
  source: JevSource;
  observedAt: string;
  evaluatedAt: string;
  latencyMs: number;
  inputTokens: number;
  estimatedApiCostUsd: number;
  answers: Record<JevDimension, JevChoice>;
};
export type JevStatus = {
  configured: boolean;
  unlocked: boolean;
  model: typeof JEV_MODEL;
  mode: "shadow-context-only";
};

export function jevLabel(dimension: JevDimension, value: string): string {
  const labels: Record<string, string> = JEV_LABELS[dimension];
  return labels[value] ?? "Unavailable";
}
