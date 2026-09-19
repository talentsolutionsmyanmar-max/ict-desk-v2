import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  atrSeries,
  closedCandles,
  completeSeries,
  pivots,
  quoteFresh,
  retestState,
  sessionAt,
  structure,
} from "./strategy";
import { parseBook, parseCandles, scanUniverse } from "./market-data";
import { Book, Candle, Market } from "./types";

const minute = 60_000;
const t = Date.parse("2026-09-18T14:15:00Z"); // Friday, 10:15 New York in DST.
function candle(
  time: number,
  close = 100,
  high = 101,
  low = 99,
  step = 5 * minute,
): Candle {
  return {
    time,
    closeTime: time + step - 1,
    open: 100,
    high,
    low,
    close,
    volume: 100,
  };
}
const book: Book = {
  coin: "BTC",
  time: t,
  receivedAt: t,
  bid: 101.99,
  ask: 102.01,
  spreadBps: 2,
  bidDepth10bps: 50_000,
  askDepth10bps: 50_000,
};
const market: Market = {
  coin: "BTC",
  mark: 102,
  mid: 102,
  szDecimals: 4,
  change24h: 1,
  volume24h: 100_000_000,
  openInterestUsd: 50_000_000,
  fundingHourly: 0.0000125,
  capped: false,
};
const plan = {
  direction: "long" as const,
  entry: 100,
  gapLow: 99,
  gapHigh: 101,
  formedAt: t,
  expiresAt: t + 30 * minute,
};
test("forming candles never count as closed strategy observations", () => {
  const bars = [candle(t - 5 * minute), candle(t)];
  assert.equal(closedCandles(bars, t + minute).length, 1);
});
test("pivot is unknowable until the second right-hand candle closes", () => {
  const bars = [101, 102, 105, 103, 102].map((high, i) =>
    candle(t + i * 5 * minute, 100, high),
  );
  assert.equal(pivots(bars, bars[4].closeTime).length, 0);
  assert.equal(pivots(bars, bars[4].closeTime + 1)[0].price, 105);
  assert.equal(pivots(bars)[0].confirmedAt, bars[4].closeTime);
});
test("tied extrema cannot form a strict pivot", () => {
  assert.equal(
    pivots(
      [101, 105, 105, 103, 102].map((h, i) =>
        candle(t + i * 5 * minute, 100, h),
      ),
    ).length,
    0,
  );
});
test("insufficient structure returns neutral, never guesses direction", () => {
  assert.equal(structure([candle(t)]), "neutral");
});
test("confirmed rising and falling swing sequences determine direction", () => {
  for (const sign of [1, -1]) {
    const bars = Array.from({ length: 60 }, (_, i) => {
      const center = 100 + sign * i * 0.2 + Math.sin((i * Math.PI) / 3) * 3;
      return {
        ...candle(
          t + i * 240 * minute,
          center,
          center + 1,
          center - 1,
          240 * minute,
        ),
        open: center - 0.1,
      };
    });
    assert.equal(structure(bars), sign === 1 ? "long" : "short");
  }
});

function syntheticQualifiedInput() {
  const now = Date.parse("2026-09-18T14:26:00Z");
  const fiveBoundary = Math.floor(now / (5 * minute)) * 5 * minute;
  const fifteenBoundary = Math.floor(now / (15 * minute)) * 15 * minute;
  const fourBoundary = Math.floor(now / (240 * minute)) * 240 * minute;
  const five = Array.from({ length: 361 }, (_, i) => ({
    ...candle(fiveBoundary - (360 - i) * 5 * minute, 101, 101.4, 100.6),
    open: 100.9,
  }));
  const replace = (offset: number, value: Partial<Candle>) => {
    const c = five.find((c) => c.time === fiveBoundary - offset * minute)!;
    Object.assign(c, value);
  };
  replace(35, { high: 102.2 }); // Trigger pivot confirmed before sweep.
  replace(15, { open: 101, close: 100.8, high: 101.2, low: 99.5 });
  replace(10, { open: 100.8, close: 104, high: 104.4, low: 100.7 });
  replace(5, { open: 104, close: 104.5, high: 105, low: 103 });
  replace(0, { open: 104.7, close: 104.8, high: 105.2, low: 104 });
  const fifteen = Array.from({ length: 220 }, (_, i) => ({
    ...candle(
      fifteenBoundary - (220 - i) * 15 * minute,
      104.1,
      106,
      103,
      15 * minute,
    ),
    open: 104,
  }));
  fifteen.find((c) => c.time === fifteenBoundary - 240 * minute)!.low = 100;
  fifteen.find((c) => c.time === fifteenBoundary - 135 * minute)!.high = 120;
  const fourHour = Array.from({ length: 140 }, (_, i) => {
    const center = 80 + i * 0.2 + Math.sin((i * Math.PI) / 3) * 3;
    return {
      ...candle(
        fourBoundary - (140 - i) * 240 * minute,
        center,
        center + 1,
        center - 1,
        240 * minute,
      ),
      open: center - 0.1,
    };
  });
  const quote = {
    ...book,
    time: now,
    receivedAt: now,
    bid: 104.99,
    ask: 105.01,
  };
  return {
    now,
    input: { five, fifteen, fourHour, book: quote },
    market: { ...market, mark: 105 },
  };
}
test("a fully qualifying synthetic sequence reaches a complete candidate without future pivots", () => {
  const f = syntheticQualifiedInput();
  const a = analyze(f.market, f.input, f.now);
  assert.equal(a.direction, "long");
  assert.equal(a.ready, true, JSON.stringify(a.gates));
  assert.equal(a.plan?.entry, 102.1);
  assert.ok(a.plan!.netRR >= 2);
  assert.equal(a.gates.filter((g) => g.status === "pass").length, 10);
});
test("the complete engine removes a candidate after an ongoing-bar first touch", () => {
  const f = syntheticQualifiedInput();
  f.input.five.at(-1)!.low = 102;
  const a = analyze(f.market, f.input, f.now);
  assert.equal(a.ready, false);
  assert.equal(a.plan, null);
  assert.equal(a.stage, "Retracement passed");
});
test("the full candidate model is directionally symmetric for shorts", () => {
  const f = syntheticQualifiedInput();
  const mirror = (bars: Candle[]) =>
    bars.map((c) => ({
      ...c,
      open: 200 - c.open,
      high: 200 - c.low,
      low: 200 - c.high,
      close: 200 - c.close,
    }));
  const a = analyze(
    { ...f.market, mark: 95 },
    {
      five: mirror(f.input.five),
      fifteen: mirror(f.input.fifteen),
      fourHour: mirror(f.input.fourHour),
      book: { ...f.input.book, bid: 94.99, ask: 95.01 },
    },
    f.now,
  );
  assert.equal(a.direction, "short");
  assert.equal(a.ready, true, JSON.stringify(a.gates));
  assert.equal(a.plan?.entry, 97.9);
});
test("a favorable synthetic setup still fails when execution quality is poor", () => {
  const f = syntheticQualifiedInput();
  f.input.book.spreadBps = 10;
  const a = analyze(f.market, f.input, f.now);
  assert.equal(a.ready, false);
  assert.equal(a.stage, "Liquidity filtered");
});
test("Wilder ATR uses a 14-bar mean seed and recursive smoothing", () => {
  const bars = Array.from({ length: 15 }, (_, i) =>
    candle(t + i * 5 * minute, 100, i === 14 ? 104 : 101),
  );
  const a = atrSeries(bars);
  assert.equal(a[12], null);
  assert.equal(a[13], 2);
  assert.equal(a[14], (2 * 13 + 5) / 14);
});
test("freshness rejects missing, stale, future-stamped and crossed quotes", () => {
  assert.equal(quoteFresh(book, t + 4999), true);
  assert.equal(quoteFresh(book, t + 5001), false);
  assert.equal(quoteFresh(null, t), false);
  assert.equal(quoteFresh({ ...book, time: t + 3000 }, t), false);
  assert.equal(quoteFresh({ ...book, bid: 103 }, t), false);
});
test("series validation rejects holes and missing latest closes", () => {
  const bars = Array.from({ length: 100 }, (_, i) =>
    candle(t - (100 - i) * 5 * minute),
  );
  assert.equal(completeSeries(bars, 5 * minute, t + 1000, 80), true);
  assert.equal(
    completeSeries(
      bars.filter((_, i) => i !== 40),
      5 * minute,
      t + 1000,
      80,
    ),
    false,
  );
  assert.equal(
    completeSeries(bars.slice(0, -1), 5 * minute, t + 1000, 80),
    false,
  );
});
test("entry sessions are DST-aware and weekends stay blocked", () => {
  assert.equal(sessionAt(t).open, true);
  assert.equal(sessionAt(Date.parse("2026-09-19T14:15:00Z")).open, false);
  assert.equal(sessionAt(Date.parse("2026-01-16T15:15:00Z")).open, true);
  assert.equal(sessionAt(Date.parse("2026-01-16T14:15:00Z")).open, false);
  assert.equal(sessionAt(Date.parse("2026-09-18T15:00:00Z")).open, false);
});
test("gap formation bars cannot retroactively fill a new midpoint limit", () => {
  assert.equal(
    retestState(plan, [candle(t - 5 * minute, 102, 103, 90)], book, t + minute),
    "fresh",
  );
});
test("the first midpoint touch blocks reuse even when price has recovered", () => {
  assert.equal(
    retestState(plan, [candle(t, 102, 103, 99.5)], book, t + 6 * minute),
    "touched",
  );
});
test("an ongoing candle touch also blocks a new first-retest proposal", () => {
  assert.equal(
    retestState(plan, [candle(t, 102, 103, 100)], book, t + minute),
    "touched",
  );
});
test("a later invalidation cannot erase an earlier observed retest", () => {
  assert.equal(
    retestState(plan, [candle(t, 98, 103, 97)], book, t + 6 * minute),
    "touched",
  );
});
test("six-bar lifetime expires exactly at the deadline", () => {
  assert.equal(retestState(plan, [], book, plan.expiresAt), "expired");
});
test("a gap from a previous session cannot become a fresh candidate", () => {
  assert.equal(
    retestState(
      { ...plan, formedAt: t - 2 * 60 * minute, expiresAt: t + minute },
      [],
      book,
      t,
    ),
    "session-closed",
  );
});
test("a marketable midpoint is rejected instead of assuming a maker fill", () => {
  assert.equal(
    retestState(plan, [], { ...book, bid: 99.9, ask: 100.1 }, t + 1),
    "touched",
  );
});
test("short first-retest rules invert the long rules", () => {
  const p = { ...plan, direction: "short" as const };
  const b = { ...book, bid: 97.99, ask: 98.01 };
  assert.equal(retestState(p, [], b, t + 1), "fresh");
  assert.equal(retestState(p, [candle(t, 98, 100.5, 97)], b, t + 1), "touched");
});
test("missing feeds fail closed in the complete strategy engine", () => {
  const a = analyze(market, { five: [], fifteen: [], fourHour: [], book }, t);
  assert.equal(a.ready, false);
  assert.equal(a.plan, null);
  assert.equal(a.stage, "Data blocked");
});
test("unknown OI-cap and funding are not confirming zero values", () => {
  for (const m of [
    { ...market, capped: null },
    { ...market, fundingHourly: null },
  ])
    assert.equal(
      analyze(m, { five: [], fifteen: [], fourHour: [], book }, t).liquid,
      false,
    );
});
test("book parser uses true best bid/ask and only observed depth inside 10 bps", () => {
  const b = parseBook(
    {
      coin: "BTC",
      time: t,
      levels: [
        [
          { px: "99.99", sz: "100" },
          { px: "99", sz: "9000" },
        ],
        [
          { px: "100.01", sz: "100" },
          { px: "101", sz: "9000" },
        ],
      ],
    },
    "BTC",
    t,
  );
  assert.ok(Math.abs(b.spreadBps - 2) < 1e-8);
  assert.equal(b.bidDepth10bps, 9999);
  assert.equal(b.askDepth10bps, 10001);
});
test("book parser rejects empty, crossed and wrong-symbol books", () => {
  assert.throws(() =>
    parseBook({ coin: "ETH", time: t, levels: [[], []] }, "BTC", t),
  );
  assert.throws(() =>
    parseBook(
      {
        coin: "BTC",
        time: t,
        levels: [[{ px: "101", sz: "10" }], [{ px: "100", sz: "10" }]],
      },
      "BTC",
      t,
    ),
  );
});
test("candle parser rejects missing fields, impossible OHLC and duplicate times", () => {
  const c = { t, T: t + 299999, o: "100", h: "101", l: "99", c: "100", v: "1" };
  assert.equal(parseCandles([c])[0].time, t);
  assert.throws(() => parseCandles([{ ...c, c: null }]));
  assert.throws(() => parseCandles([{ ...c, h: "98" }]));
  assert.throws(() => parseCandles([c, c]));
});
test("scanner keeps the three core markets, caps workload at 12 and excludes capped extras", () => {
  const markets: Market[] = Array.from({ length: 20 }, (_, i) => ({
    ...market,
    coin: `TEST${i}`,
    capped: i === 0,
  }));
  markets.push(...["BTC", "ETH", "SOL"].map((coin) => ({ ...market, coin })));
  const selected = scanUniverse(markets);
  assert.deepEqual(
    selected.slice(0, 3).map((m) => m.coin),
    ["BTC", "ETH", "SOL"],
  );
  assert.equal(selected.length, 12);
  assert.equal(
    selected.some((m) => m.coin === "TEST0"),
    false,
  );
});
