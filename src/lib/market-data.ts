import { analyze, blockedAnalysis, STRATEGY_VERSION } from "./strategy";
import { analyzeAdaptive, ADAPTIVE_VERSION } from "./adaptive-strategy";
import { replayResearch } from "./research-replay";
import {
  Book,
  Candle,
  INTERVAL_MS,
  Interval,
  Market,
  MarketSnapshot,
  ScanSnapshot,
} from "./types";

const INFO_URL = "https://api.hyperliquid.xyz/info";
type CacheEntry = { until: number; promise: Promise<unknown> };
const cache = new Map<string, CacheEntry>();
function cached<T>(
  key: string,
  ttl: number,
  work: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing && existing.until > Date.now())
    return existing.promise as Promise<T>;
  if (cache.size > 300)
    for (const [k, v] of cache) if (v.until <= Date.now()) cache.delete(k);
  const promise = work().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { until: Date.now() + ttl, promise });
  return promise;
}
async function info(body: object): Promise<unknown> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Venue rate limit reached. Please wait before refreshing."
        : `Venue feed unavailable (${response.status}).`,
    );
  return response.json();
}
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function parseCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) throw new Error("Invalid candle response.");
  const result = new Map<number, Candle>();
  for (const item of raw) {
    const c = record(item);
    const values = [c.t, c.T, c.o, c.h, c.l, c.c, c.v].map(num);
    if (values.some((x) => x === null))
      throw new Error("Candle has missing or non-finite values.");
    const [time, closeTime, open, high, low, close, volume] =
      values as number[];
    if (
      time < 0 ||
      closeTime <= time ||
      open <= 0 ||
      close <= 0 ||
      low <= 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      volume < 0
    )
      throw new Error("Candle failed OHLC validation.");
    if (result.has(time)) throw new Error("Duplicate candle timestamp.");
    result.set(time, { time, closeTime, open, high, low, close, volume });
  }
  return [...result.values()].sort((a, b) => a.time - b.time);
}
export function parseBook(
  raw: unknown,
  coin: string,
  receivedAt: number,
): Book {
  const data = record(raw);
  if (
    data.coin !== coin ||
    !Array.isArray(data.levels) ||
    !Array.isArray(data.levels[0]) ||
    !Array.isArray(data.levels[1])
  )
    throw new Error("Invalid book response.");
  const bids = data.levels[0].map((v: unknown) => record(v));
  const asks = data.levels[1].map((v: unknown) => record(v));
  const bid = num(bids[0]?.px);
  const ask = num(asks[0]?.px);
  const time = num(data.time);
  if (bid === null || ask === null || time === null || bid <= 0 || ask < bid)
    throw new Error("Missing or crossed quote.");
  const mid = (bid + ask) / 2;
  const depth = (rows: Record<string, unknown>[], side: "bid" | "ask") =>
    rows.reduce((sum, row) => {
      const price = num(row.px);
      const size = num(row.sz);
      if (price === null || size === null || price <= 0 || size < 0)
        throw new Error("Invalid book level.");
      return (
        sum +
        ((side === "bid" ? price >= mid * 0.999 : price <= mid * 1.001)
          ? price * size
          : 0)
      );
    }, 0);
  return {
    coin,
    time,
    receivedAt,
    bid,
    ask,
    spreadBps: ((ask - bid) / mid) * 10_000,
    bidDepth10bps: depth(bids, "bid"),
    askDepth10bps: depth(asks, "ask"),
  };
}
export async function getMarkets(): Promise<MarketSnapshot> {
  return cached("markets", 20_000, async () => {
    const [raw, capsResult] = await Promise.all([
      info({ type: "metaAndAssetCtxs" }),
      info({ type: "perpsAtOpenInterestCap" }).catch(() => null),
    ]);
    if (!Array.isArray(raw) || raw.length < 2)
      throw new Error("Invalid universe response.");
    const meta = record(raw[0]);
    const contexts = raw[1];
    if (
      !Array.isArray(meta.universe) ||
      !Array.isArray(contexts) ||
      meta.universe.length !== contexts.length
    )
      throw new Error("Market metadata is incomplete.");
    const capStatusKnown =
      Array.isArray(capsResult) &&
      capsResult.every((v) => typeof v === "string");
    const caps = new Set(capStatusKnown ? (capsResult as string[]) : []);
    const markets: Market[] = [];
    meta.universe.forEach((item, index) => {
      const asset = record(item);
      const context = record(contexts[index]);
      const coin = asset.name;
      const mark = num(context.markPx);
      const szDecimals = num(asset.szDecimals);
      if (
        typeof coin !== "string" ||
        !/^[A-Za-z0-9._-]{1,24}$/.test(coin) ||
        asset.isDelisted === true ||
        mark === null ||
        mark <= 0 ||
        szDecimals === null ||
        !Number.isInteger(szDecimals) ||
        szDecimals < 0 ||
        szDecimals > 6
      )
        return;
      const previous = num(context.prevDayPx);
      const oi = num(context.openInterest);
      markets.push({
        coin,
        szDecimals,
        mark,
        mid: num(context.midPx),
        volume24h: num(context.dayNtlVlm),
        change24h:
          previous !== null && previous > 0
            ? (mark / previous - 1) * 100
            : null,
        openInterestUsd: oi === null ? null : oi * mark,
        openInterestBase: oi,
        fundingHourly: num(context.funding),
        capped: capStatusKnown ? caps.has(coin) : null,
      });
    });
    return {
      markets: markets.sort(
        (a, b) => (b.volume24h ?? -1) - (a.volume24h ?? -1),
      ),
      receivedAt: Date.now(),
      venue: "Hyperliquid",
      capStatusKnown,
    };
  });
}
export async function getCandles(
  coin: string,
  interval: Interval,
  purpose: "chart" | "scan" | "replay" = "chart",
): Promise<Candle[]> {
  const step = INTERVAL_MS[interval];
  const count =
    purpose === "replay"
      ? interval === "5m"
        ? 700
        : interval === "15m"
          ? 320
          : 140
      : interval === "5m"
        ? 360
        : interval === "15m"
          ? 220
          : 140;
  const boundary = Math.floor(Date.now() / step) * step;
  const ttl =
    interval === "5m"
      ? 8_000
      : purpose === "scan"
        ? step
        : interval === "15m"
          ? 30_000
          : 60_000;
  const cachePurpose =
    purpose === "replay" ? "replay" : interval === "5m" ? "shared" : purpose;
  return cached(
    `candles:${coin}:${interval}:${cachePurpose}:${boundary}`,
    ttl,
    async () =>
      parseCandles(
        await info({
          type: "candleSnapshot",
          req: {
            coin,
            interval,
            startTime: boundary - count * step,
            endTime: Date.now(),
          },
        }),
      ),
  );
}
async function getBook(coin: string) {
  return parseBook(await info({ type: "l2Book", coin }), coin, Date.now());
}
export async function getReplay(market: Market) {
  return cached(
    `replay:${market.coin}:${Math.floor(Date.now() / 300000)}`,
    60_000,
    async () => {
      const [five, fifteen, fourHour] = await Promise.all([
        getCandles(market.coin, "5m", "replay"),
        getCandles(market.coin, "15m", "replay"),
        getCandles(market.coin, "4h", "replay"),
      ]);
      return replayResearch(
        market,
        { five, fifteen, fourHour, book: null },
        Date.now(),
        true,
      );
    },
  );
}
export function scanUniverse(markets: Market[]): Market[] {
  const core = ["BTC", "ETH", "SOL"]
    .map((coin) => markets.find((m) => m.coin === coin))
    .filter((m): m is Market => !!m);
  return [
    ...core,
    ...markets.filter(
      (m) => !core.some((c) => c.coin === m.coin) && m.capped === false,
    ),
  ].slice(0, 12);
}
export async function getScan(): Promise<ScanSnapshot> {
  return cached(
    `scan:${Math.floor(Date.now() / INTERVAL_MS["5m"])}`,
    55_000,
    async () => {
      const snapshot = await getMarkets();
      const universe = scanUniverse(snapshot.markets);
      const errors: string[] = [];
      // Four workers bound request pressure. Full scans are deduplicated and cached.
      let next = 0;
      const analyses = new Array<ReturnType<typeof analyze>>(universe.length);
      await Promise.all(
        Array.from({ length: Math.min(4, universe.length) }, async () => {
          while (next < universe.length) {
            const i = next++;
            const m = universe[i];
            try {
              const [five, fifteen, fourHour] = await Promise.all([
                getCandles(m.coin, "5m", "scan"),
                getCandles(m.coin, "15m", "scan"),
                getCandles(m.coin, "4h", "scan"),
              ]);
              const book = await getBook(m.coin);
              analyses[i] = analyze(
                m,
                { five, fifteen, fourHour, book },
                Date.now(),
              );
              analyses[i].research = analyzeAdaptive(
                m,
                { five, fifteen, fourHour, book },
                analyses[i].evaluatedAt,
              );
            } catch {
              errors.push(m.coin);
              analyses[i] = blockedAnalysis(m.coin, Date.now());
            }
          }
        }),
      );
      return {
        analyses: analyses.sort(
          (a, b) =>
            Number(b.research?.some((m) => m.status === "candidate")) -
              Number(a.research?.some((m) => m.status === "candidate")) ||
            Number(b.ready) - Number(a.ready) ||
            Number(b.liquid) - Number(a.liquid) ||
            b.score - a.score,
        ),
        receivedAt: Date.now(),
        universeCount: snapshot.markets.length,
        analyzedCount: universe.length,
        strategyVersion: STRATEGY_VERSION,
        researchVersion: ADAPTIVE_VERSION,
        errors,
      };
    },
  );
}
