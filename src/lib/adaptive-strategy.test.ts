import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptiveEvents,
  adaptivePlan,
  analyzeAdaptive,
} from "./adaptive-strategy";
import { structure } from "./strategy";
import { Book, Candle, Market } from "./types";

const now = Date.parse("2026-09-21T03:01:00Z");
function bars(count: number, step: number): Candle[] {
  const end = Math.floor(now / step) * step;
  return Array.from({ length: count }, (_, i) => ({
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
  const fifteen = bars(220, 900000);
  fifteen[170].high = 125;
  fifteen[190].low = 90;
  fifteen[195].high = 110;
  fifteen[200].low = 95;
  fifteen[205].high = 112;
  const five = bars(360, 300000).map((c) => ({
    ...c,
    open: 111,
    high: 111.2,
    low: 110.8,
    close: 111,
  }));
  Object.assign(five[354], { open: 111, close: 113, high: 113.1, low: 110.9 });
  Object.assign(five[355], {
    open: 112.3,
    close: 112.2,
    high: 112.4,
    low: 111.9,
  });
  Object.assign(five[356], { open: 112.2, close: 114, high: 114.1, low: 112 });
  for (let i = 357; i < 360; i++)
    Object.assign(five[i], { open: 114, close: 114, high: 114.1, low: 113.9 });
  const fourHour = bars(140, 14400000).map((c, i) => {
    const center = 150 - i * 0.2 + Math.sin((i * Math.PI) / 3) * 3;
    return {
      ...c,
      open: center,
      close: center,
      high: center + 1,
      low: center - 1,
    };
  });
  const book: Book = {
    coin: "BTC",
    time: now,
    receivedAt: now,
    bid: 114,
    ask: 114.01,
    spreadBps: 1,
    bidDepth10bps: 100000,
    askDepth10bps: 100000,
  };
  const market: Market = {
    coin: "BTC",
    mark: 114,
    mid: 114,
    szDecimals: 4,
    volume24h: 100000000,
    openInterestUsd: 50000000,
    fundingHourly: 0.00001,
    capped: false,
    change24h: 1,
  };
  return { market, input: { five, fifteen, fourHour, book } };
}
test("intraday continuation requires pullback plus later confirmation; 4H opposition does not veto", () => {
  const { market, input } = fixture();
  assert.equal(structure(input.fifteen, now), "long");
  assert.equal(structure(input.fourHour, now), "short");
  assert.equal(
    adaptiveEvents(input, input.five[355].closeTime + 1).filter(
      (e) => e.model === "continuation",
    ).length,
    0,
  );
  const event = adaptiveEvents(input, now).find(
    (e) => e.model === "continuation",
  )!;
  assert.ok(event);
  assert.equal(event.trigger, 112.4);
  assert.equal(event.extreme, 111.9);
  const model = analyzeAdaptive(market, input, now)[0];
  assert.equal(model.status, "candidate");
  assert.equal(model.plan?.maxHoldMs, 7200000);
  assert.ok(model.plan!.stop < 111.9);
});
test("failed pullback never confirms and future bars cannot alter an earlier decision", () => {
  const { input } = fixture();
  const before = adaptiveEvents(input, input.five[355].closeTime + 1);
  input.five[356].high = 200;
  input.five[356].close = 199;
  assert.deepEqual(
    adaptiveEvents(input, input.five[355].closeTime + 1),
    before,
  );
  input.five[355].close = 110;
  input.five[355].low = 109.9;
  assert.equal(
    adaptiveEvents(input, now).filter((e) => e.model === "continuation").length,
    0,
  );
});
test("short continuation is directionally symmetric", () => {
  const { market, input } = fixture();
  for (const key of ["five", "fifteen", "fourHour"] as const)
    input[key] = input[key].map((c) => ({
      ...c,
      open: 300 - c.open,
      close: 300 - c.close,
      high: 300 - c.low,
      low: 300 - c.high,
    }));
  input.book.bid = 185.99;
  input.book.ask = 186;
  const event = adaptiveEvents(input, now).find(
    (e) => e.model === "continuation",
  )!;
  assert.equal(event.direction, "short");
  const plan = adaptivePlan(event, market, input)!;
  assert.ok(plan.stop > plan.entry && plan.target < plan.entry);
});
test("scalp has no plan if a pre-existing range midpoint is unavailable", () => {
  const { market, input } = fixture();
  const e = adaptiveEvents(input, now).find((e) => e.model === "continuation")!;
  assert.equal(
    adaptivePlan({ ...e, model: "reversal", swept: 1 }, market, input),
    null,
  );
});
test("scalp target is constrained by the pre-existing midpoint and uses shorter windows", () => {
  const { market, input } = fixture();
  const event = {
    model: "reversal" as const,
    direction: "long" as const,
    formedAt: now - 60000,
    trigger: 100,
    extreme: 94,
    swept: 95,
    atr: 1,
  };
  const plan = adaptivePlan(event, market, input)!;
  assert.ok(plan);
  assert.ok(plan.target < 102.5 && plan.target > 100);
  assert.equal(plan.maxHoldMs, 1800000);
  assert.equal(plan.expiresAt - plan.formedAt, 900000);
});
