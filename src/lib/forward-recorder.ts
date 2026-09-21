import { getCandles, getMarkets, getScan } from "./market-data";
import { advancePaper, recordCandidate } from "./forward-journal";
import {
  acquireRecorderLease,
  openForwardSignals,
  releaseRecorderLease,
  saveForwardSignal,
  saveModelState,
  updateForwardSignal,
} from "./forward-store";

export async function runForwardRecorder() {
  const owner = await acquireRecorderLease();
  if (!owner) return { skipped: true, reason: "Recorder already running." };
  const errors: string[] = [];
  let success = false;
  try {
    const [scan, markets] = await Promise.all([getScan(), getMarkets()]);
    errors.push(...scan.errors.map((coin) => `${coin}: scan unavailable`));
    for (const analysis of scan.analyses) {
      const market = markets.markets.find((m) => m.coin === analysis.coin);
      if (!market || Date.now() - analysis.evaluatedAt > 80000) continue;
      for (const model of analysis.research ?? []) {
        await saveModelState(analysis.coin, model, analysis.evaluatedAt);
        const signal = recordCandidate(
          analysis.coin,
          model,
          analysis.book,
          analysis.evaluatedAt,
          market.szDecimals,
        );
        if (signal) {
          signal.marketAtObservation = {
            volume24h: market.volume24h,
            openInterestUsd: market.openInterestUsd,
            fundingHourly: market.fundingHourly,
            capped: market.capped,
            szDecimals: market.szDecimals,
          };
          // Never let a delayed scheduled run backdate a simulated entry.
          signal.activeFrom = Math.ceil(Date.now() / 300000) * 300000;
          signal.processedThrough = signal.activeFrom;
          if (signal.activeFrom < signal.plan.expiresAt)
            await saveForwardSignal(signal);
        }
      }
    }
    const open = await openForwardSignals();
    const coins = [...new Set(open.map((s) => s.coin))];
    // Sequential per-coin processing keeps venue pressure bounded and covers
    // open observations even after a symbol leaves today's scan universe.
    for (const coin of coins) {
      try {
        const candles = await getCandles(coin, "5m", "scan");
        for (const before of open.filter((s) => s.coin === coin)) {
          const after = advancePaper(before, candles, Date.now());
          if (
            after.processedThrough !== before.processedThrough ||
            after.status !== before.status
          )
            await updateForwardSignal(before, after);
        }
      } catch {
        errors.push(`${coin}: outcome update unavailable`);
      }
    }
    success = errors.length === 0;
    return {
      skipped: false,
      analyzed: scan.analyzedCount,
      activeObservations: open.length,
      errors,
    };
  } finally {
    await releaseRecorderLease(
      owner,
      success,
      success
        ? []
        : errors.length
          ? errors
          : ["Recorder run failed; retry pending."],
    );
  }
}
