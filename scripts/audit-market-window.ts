import { writeFile } from "node:fs/promises";
import { parseCandles } from "../src/lib/market-data";
import { closedCandles, sessionAt, structure } from "../src/lib/strategy";
import { INTERVAL_MS, type Interval } from "../src/lib/types";

// Public venue data only. This is a descriptive audit, NOT a fills backtest.
async function main() {
  const start = Date.parse(process.argv[2] ?? "2026-09-19T00:00:00+06:30");
  const end = Date.parse(process.argv[3] ?? new Date().toISOString());
  if (
    !Number.isFinite(start + end) ||
    end <= start ||
    end - start > 7 * 86400000
  )
    throw new Error("Provide an ISO start/end window of at most seven days.");
  const output = process.argv[4];
  const myanmar = (t: number) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Yangon",
      dateStyle: "short",
      timeStyle: "short",
    }).format(t);
  const records = [];
  for (const coin of ["BTC", "ETH", "SOL"]) {
    const series = await Promise.all(
      (["5m", "15m", "4h"] as Interval[]).map(async (interval) => {
        const body = {
          type: "candleSnapshot",
          req: {
            coin,
            interval,
            startTime:
              start - INTERVAL_MS[interval] * (interval === "4h" ? 140 : 220),
            endTime: end,
          },
        };
        const response = await fetch("https://api.hyperliquid.xyz/info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok)
          throw new Error(`${coin} ${interval}: ${response.status}`);
        const candles = parseCandles(await response.json());
        return { interval, request: body, candles };
      }),
    );
    const five = closedCandles(series[0].candles, end).filter(
      (c) => c.time >= start,
    );
    const four = series[2].candles;
    if (
      !five.length ||
      five[0].time !== start ||
      five.at(-1)!.time !== Math.floor(end / 300000) * 300000 - 300000 ||
      five.some((c, i) => i > 0 && c.time - five[i - 1].time !== 300000)
    )
      throw new Error(`${coin}: incomplete 5m window`);
    let peak = five[0],
      peakAtDrawdown = peak,
      trough = peak,
      drawdown = 0;
    for (const c of five) {
      if (c.close > peak.close) peak = c;
      const drop = (c.close / peak.close - 1) * 100;
      if (drop < drawdown) {
        drawdown = drop;
        peakAtDrawdown = peak;
        trough = c;
      }
    }
    const summary = {
      coin,
      closedBars: five.length,
      startMyanmar: myanmar(five[0].time),
      endMyanmar: myanmar(five.at(-1)!.closeTime + 1),
      openingPrice: five[0].open,
      lastClose: five.at(-1)!.close,
      periodChangePct: (five.at(-1)!.close / five[0].open - 1) * 100,
      maxCloseDrawdownPct: drawdown,
      peakClose: peakAtDrawdown.close,
      troughClose: trough.close,
      peakMyanmar: myanmar(peakAtDrawdown.closeTime + 1),
      troughMyanmar: myanmar(trough.closeTime + 1),
      fourHourDirectionAtPeak: structure(four, peakAtDrawdown.closeTime + 1),
      fourHourDirectionAtTrough: structure(four, trough.closeTime + 1),
      baselineSessionAtPeak: sessionAt(peakAtDrawdown.closeTime + 1),
      baselineAllowedBars: five.filter((c) => sessionAt(c.closeTime + 1).open)
        .length,
    };
    records.push({ summary, series });
    console.log(JSON.stringify(summary));
  }
  if (output)
    await writeFile(
      output,
      JSON.stringify(
        {
          source: "https://api.hyperliquid.xyz/info",
          capturedAt: new Date().toISOString(),
          start,
          end,
          limitations:
            "Close-to-close drawdown is hindsight, not executable profit. No historical order books, OI changes, or fills were reconstructed.",
          records,
        },
        null,
        2,
      ),
    );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
