import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeResearch,
  researchEvents,
  researchLifecycle,
  selectResearchObservation,
} from "./research-strategy";
import { replayResearch } from "./research-replay";
import { analyze, sessionAt, structure } from "./strategy";
import { Book, Candle, Market } from "./types";

const now = Date.parse("2026-09-20T03:01:00Z");
const boundary = Math.floor(now / 300000) * 300000;
function bars(count: number, step: number, forming = false): Candle[] {
  const end = Math.floor(now / step) * step;
  return Array.from({ length: count + Number(forming) }, (_, i) => ({
    time: end - (count - i) * step,
    closeTime: end - (count - i - 1) * step - 1,
    open: 105.1,
    close: 105,
    high: 105.3,
    low: 104.7,
    volume: 100,
  }));
}
function fixture() {
  const five = bars(360, 300000, true);
  const fifteen = bars(220, 900000);
  fifteen[198].low = 80; // Pre-existing opposing liquidity, still untouched.
  fifteen[210].low = 100; // Pre-existing support to break.
  five[355].high = 106; // Confirmed pre-break 5m stop anchor.
  Object.assign(five[359], { open: 104.8, close: 99, high: 105, low: 98.8 });
  Object.assign(five[360], { open: 99, close: 98.6, high: 99, low: 98.5 });
  const fourHour = bars(140, 14400000).map((c, i) => {
    const center = 80 + i * 0.2 + Math.sin((i * Math.PI) / 3) * 3;
    return {
      ...c,
      open: center - 0.1,
      close: center,
      high: center + 1,
      low: center - 1,
    };
  });
  const book: Book = {
    coin: "BTC",
    time: now,
    receivedAt: now,
    bid: 98.5,
    ask: 98.51,
    spreadBps: 1.1,
    bidDepth10bps: 100000,
    askDepth10bps: 100000,
  };
  const market: Market = {
    coin: "BTC",
    mark: 98.5,
    mid: 98.5,
    szDecimals: 4,
    volume24h: 100000000,
    openInterestUsd: 50000000,
    fundingHourly: 0.00001,
    change24h: -3,
    capped: false,
  };
  return { market, input: { five, fifteen, fourHour, book } };
}
test("a weekend countertrend breakdown can qualify without FVG or ten baseline gates", () => {
  const { market, input } = fixture();
  assert.equal(sessionAt(now).open, false);
  assert.equal(structure(input.fourHour, now), "long");
  assert.equal(analyze(market, input, now).ready, false);
  const model = analyzeResearch(market, input, now).find(
    (m) => m.id === "breakout",
  )!;
  assert.equal(model.status, "candidate");
  assert.equal(model.direction, "short");
  assert.equal(model.plan?.entry, 100);
  assert.ok(model.plan!.stop > 106);
  assert.ok(model.plan!.target > 80);
  assert.ok(model.plan!.grossRR <= 4);
  assert.ok(model.plan!.netRR >= 2);
});
test("the same aligned break is routed to continuation, not duplicated in breakout", () => {
  const { market, input } = fixture();
  input.fourHour = input.fourHour.map((c) => ({
    ...c,
    open: 200 - c.open,
    close: 200 - c.close,
    high: 200 - c.low,
    low: 200 - c.high,
  }));
  const models = analyzeResearch(market, input, now);
  assert.equal(
    models.find((m) => m.id === "continuation")?.status,
    "candidate",
  );
  assert.equal(models.find((m) => m.id === "breakout")?.status, "watching");
});
test("countertrend long break is symmetric when higher timeframe is bearish", () => {
  const { market, input } = fixture();
  const mirror = (cs: Candle[]) =>
    cs.map((c) => ({
      ...c,
      open: 200 - c.open,
      close: 200 - c.close,
      high: 200 - c.low,
      low: 200 - c.high,
    }));
  input.five = mirror(input.five);
  input.fifteen = mirror(input.fifteen);
  input.fourHour = mirror(input.fourHour);
  market.mark = 101.5;
  input.book.bid = 101.49;
  input.book.ask = 101.5;
  const model = analyzeResearch(market, input, now).find(
    (m) => m.id === "breakout",
  )!;
  assert.equal(model.status, "candidate");
  assert.equal(model.direction, "long");
  assert.equal(model.plan!.entry, 100);
  assert.ok(model.plan!.stop < 94);
  assert.ok(model.plan!.target > 115);
});
test("forming break candle cannot create an event; future candles cannot change the past", () => {
  const { input } = fixture();
  assert.equal(
    researchEvents(input, boundary - 1).filter((e) => e.model === "breakout")
      .length,
    0,
  );
  const events = researchEvents(input, now);
  const future = {
    ...input.five[360],
    time: boundary + 300000,
    closeTime: boundary + 599999,
    high: 200,
    low: 1,
  };
  assert.deepEqual(
    researchEvents({ ...input, five: [...input.five, future] }, now),
    events,
  );
});
test("reversal requires a reclaimed 15m sweep AND a later displacement break", () => {
  const { market, input } = fixture();
  input.fifteen[210].low = 104.7;
  input.fifteen[210].high = 107;
  input.five[354].low = 104;
  Object.assign(input.five[358], {
    open: 105,
    high: 108,
    low: 104.8,
    close: 105,
  });
  Object.assign(input.five[359], {
    open: 105,
    high: 105.1,
    low: 101.8,
    close: 102,
  });
  const model = analyzeResearch(market, input, now).find(
    (m) => m.id === "reversal",
  )!;
  assert.equal(model.direction, "short");
  assert.equal(model.status, "candidate");
  assert.equal(model.plan?.entry, 104);
  assert.equal(
    researchEvents(input, boundary - 300000 + 1).filter(
      (e) => e.model === "reversal",
    ).length,
    0,
  );
});
test("stale quotes, gaps, unknown funding and poor liquidity still block all models", () => {
  for (const problem of ["quote", "gap", "funding", "depth", "cap"] as const) {
    const { market, input } = fixture();
    if (problem === "quote") input.book.time = now - 6000;
    if (problem === "gap") input.five.splice(340, 1);
    if (problem === "funding") market.fundingHourly = null;
    if (problem === "depth") input.book.askDepth10bps = 1;
    if (problem === "cap") market.capped = null;
    assert.ok(
      analyzeResearch(market, input, now).every((m) => m.status === "blocked"),
      problem,
    );
  }
});
test("unknown target room and insufficient cost-adjusted room cannot qualify", () => {
  for (const low of [104.7, 96]) {
    const { market, input } = fixture();
    input.fifteen[198].low = low;
    const m = analyzeResearch(market, input, now).find(
      (m) => m.id === "breakout",
    )!;
    assert.equal(m.status, "filtered");
  }
});
test("forming-bar touch removes candidate; later price recovery never restores it", () => {
  const { market, input } = fixture();
  input.five[360].high = 100;
  const m = analyzeResearch(market, input, now).find(
    (m) => m.id === "breakout",
  )!;
  assert.equal(m.status, "passed");
  assert.equal(
    researchLifecycle(m.plan!, input.five, { ...input.book, ask: 98 }, now),
    "passed",
  );
});
test("expiry applies 24/7 and an after-expiry touch is not a valid retest", () => {
  const { market, input } = fixture();
  const p = analyzeResearch(market, input, now).find(
    (m) => m.id === "breakout",
  )!.plan!;
  const late = {
    ...input.five[360],
    time: p.expiresAt,
    closeTime: p.expiresAt + 299999,
    high: 101,
  };
  assert.equal(
    researchLifecycle(
      p,
      [late],
      { ...input.book, ask: 101 },
      p.expiresAt + 1000,
    ),
    "expired",
  );
});
test("entry, stop and target do not drift with subsequent quotes or current mark", () => {
  const { market, input } = fixture();
  const get = () =>
    analyzeResearch(market, input, now).find((m) => m.id === "breakout")!.plan!;
  const first = get();
  market.mark = 98;
  input.book.bid = 98;
  input.book.ask = 98.01;
  const second = get();
  assert.deepEqual(
    [first.id, first.entry, first.stop, first.target],
    [second.id, second.entry, second.stop, second.target],
  );
});

test("a newer low-RR trigger cannot mask an older untouched qualifying retest", () => {
  const { market, input } = fixture();
  const older = researchEvents(input, now).find((e) => e.model === "breakout")!;
  const newer = { ...older, formedAt: older.formedAt + 1, extreme: 120 };
  assert.equal(
    selectResearchObservation([newer, older], market, input, now)?.event,
    older,
  );
  input.five[360].high = 100;
  assert.equal(
    selectResearchObservation([newer, older], market, input, now)?.event,
    newer,
  );
});

test("replay reports low RR and retest together without claiming historical eligibility", () => {
  const { market, input } = fixture();
  input.fifteen[198].low = 96;
  input.five[360].high = 100;
  // Close the retest bar; no forming-bar information is used by replay.
  const replay = replayResearch(market, input, boundary + 300000);
  const event = replay.events.find((e) => e.model === "breakout")!;
  assert.ok(event.reasons.includes("Net RR below 2R"));
  assert.ok(event.reasons.includes("Retest observed; fill unverified"));
  assert.ok(event.reasons.includes("Historical execution quality unavailable"));
  assert.equal(replay.complete, false);
  assert.equal(replay.expectedBars, 576);
});

test("48h replay retains triggers beyond the live 90-minute lookback", () => {
  const { market, input } = fixture();
  const later = boundary + 2 * 3600000;
  for (const [key, step] of [
    ["five", 300000],
    ["fifteen", 900000],
    ["fourHour", 14400000],
  ] as const) {
    const series = input[key];
    for (let t = series.at(-1)!.closeTime + 1; t < later; t += step)
      series.push({
        time: t,
        closeTime: t + step - 1,
        open: 99,
        high: 99.1,
        low: 98.5,
        close: 99,
        volume: 100,
      });
  }
  assert.equal(
    researchEvents(input, later).some((e) => e.formedAt === boundary),
    false,
  );
  const result = replayResearch(market, input, later);
  const event = result.events.find((e) => e.formedAt === boundary)!;
  assert.ok(event);
  assert.equal(event.lifecycle, "expired");
  const before = replayResearch(market, input, boundary);
  input.five.push({
    ...input.five.at(-1)!,
    time: later,
    closeTime: later + 299999,
    high: 300,
    low: 1,
  });
  assert.deepEqual(replayResearch(market, input, boundary), before);
});

test("replay does not use current funding or book as historical evidence", () => {
  const { market, input } = fixture();
  const before = replayResearch(market, input, now);
  market.fundingHourly = 0.02;
  input.book.ask = 200;
  input.book.askDepth10bps = 0;
  assert.deepEqual(replayResearch(market, input, now), before);
});

test("replay verifies full 48-hour coverage and flags a missing historical bar", () => {
  const { market } = fixture();
  const input = {
    five: bars(700, 300000),
    fifteen: bars(320, 900000),
    fourHour: bars(140, 14400000),
    book: null,
  };
  assert.equal(replayResearch(market, input, now).complete, true);
  input.five.splice(500, 1);
  const partial = replayResearch(market, input, now);
  assert.equal(partial.complete, false);
  assert.ok(partial.evaluatedBars < 576);
});

test("clock skew is explained instead of silently appearing as no trigger", () => {
  const { market, input } = fixture();
  input.book.time = now + 3000;
  const model = analyzeResearch(market, input, now)[0];
  assert.equal(model.status, "blocked");
  assert.match(model.summary, /clock synchronization/);
});
