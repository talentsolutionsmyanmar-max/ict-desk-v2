import type { Candle } from "./types";

export type ProfileLocation = "above-value" | "below-value" | "inside-value";

export interface VolumeProfile {
  poc: number;
  vah: number;
  val: number;
  high: number;
  low: number;
  totalVolume: number;
  rows: number;
  start: number;
  end: number;
  location: ProfileLocation;
}

/**
 * Approximate a session volume profile from OHLCV candles. Venue-level
 * trade-at-price data is not available in the public candle endpoint, so each
 * candle's volume is distributed uniformly across the price bins it spans.
 */
export function buildVolumeProfile(
  candles: Candle[],
  now = Date.now(),
  lookbackBars = 288,
  rows = 48,
): VolumeProfile | null {
  const closed = candles
    .filter((c) => c.closeTime <= now)
    .slice(-lookbackBars)
    .filter(
      (c) =>
        Number.isFinite(c.low) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.volume) &&
        c.low > 0 &&
        c.high >= c.low &&
        c.volume >= 0,
    );
  if (closed.length < 20 || !Number.isInteger(rows) || rows < 8) return null;
  const low = Math.min(...closed.map((c) => c.low));
  const high = Math.max(...closed.map((c) => c.high));
  if (!(high > low)) return null;
  const step = (high - low) / rows;
  const buckets = Array.from({ length: rows }, () => 0);
  for (const candle of closed) {
    const first = Math.max(0, Math.floor((candle.low - low) / step));
    const last = Math.min(rows - 1, Math.floor((candle.high - low) / step));
    const count = Math.max(1, last - first + 1);
    const share = candle.volume / count;
    for (let i = first; i <= last; i++) buckets[i] += share;
  }
  const totalVolume = buckets.reduce((sum, value) => sum + value, 0);
  if (!(totalVolume > 0)) return null;
  const pocIndex = buckets.reduce(
    (best, value, index) => (value > buckets[best] ? index : best),
    0,
  );
  const target = totalVolume * 0.7;
  let covered = buckets[pocIndex];
  let left = pocIndex;
  let right = pocIndex;
  while (covered < target && (left > 0 || right < rows - 1)) {
    const nextLeft = left > 0 ? buckets[left - 1] : -1;
    const nextRight = right < rows - 1 ? buckets[right + 1] : -1;
    if (nextRight >= nextLeft) {
      right++;
      covered += buckets[right];
    } else {
      left--;
      covered += buckets[left];
    }
  }
  const midpoint = (value: number) => low + value * step;
  const poc = midpoint(pocIndex + 0.5);
  const val = midpoint(left);
  const vah = midpoint(right + 1);
  const mark = closed.at(-1)!.close;
  return {
    poc,
    vah,
    val,
    high,
    low,
    totalVolume,
    rows,
    start: closed[0].time,
    end: closed.at(-1)!.closeTime,
    location: mark > vah ? "above-value" : mark < val ? "below-value" : "inside-value",
  };
}
