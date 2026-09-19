import test from "node:test";
import assert from "node:assert/strict";
import {
  floorQuantity,
  journalResult,
  roundTick,
  tickSize,
  tradeMath,
} from "./math";
import { DEFAULT_COSTS, JournalTrade } from "./types";

const zeroCosts = {
  entryFeeBps: 0,
  exitFeeBps: 0,
  slippageBps: 0,
  fundingBps: 0,
};
test("gross 3R becomes less than 3R after outcome-specific execution costs", () => {
  const m = tradeMath(100, 99, 103, "long");
  assert.equal(m.grossRR, 3);
  assert.ok(m.netRR < 3 && m.netRR > 2);
  assert.ok(m.costAtTarget > m.costAtStop);
  assert.equal(m.netLoss, m.risk + m.costAtStop);
});
test("zero-cost long and short scenarios have symmetric 3R and 25% break-even", () => {
  for (const m of [
    tradeMath(100, 99, 103, "long", zeroCosts),
    tradeMath(100, 101, 97, "short", zeroCosts),
  ]) {
    assert.equal(m.netRR, 3);
    assert.equal(m.breakEven, 0.25);
  }
});
test("the audited old ticket is 1.0734 net RR on fee-only assumptions", () => {
  const m = tradeMath(81409.5, 81815, 80873, "short", {
    ...DEFAULT_COSTS,
    slippageBps: 0,
  });
  assert.ok(Math.abs(m.grossRR - 1.32305795314) < 1e-8);
  assert.ok(Math.abs(m.netRR - 1.0734017) < 0.00001);
});
test("invalid sides and non-finite values cannot produce a valid plan", () => {
  for (const m of [
    tradeMath(100, 101, 103, "long"),
    tradeMath(100, 99, 97, "long"),
    tradeMath(NaN, 99, 103, "long"),
    tradeMath(100, 100, 103, "long"),
    tradeMath(0, 99, 103, "long"),
    tradeMath(100, 99, 103, "long", { ...DEFAULT_COSTS, slippageBps: -1 }),
  ])
    assert.equal(m.valid, false);
});
test("costs can make a superficially positive target unprofitable", () => {
  assert.ok(tradeMath(100, 99.99, 100.02, "long").netRR < 0);
});
test("funding is costed only once in both possible exit outcomes", () => {
  const without = tradeMath(100, 99, 103, "long", zeroCosts);
  const withFunding = tradeMath(100, 99, 103, "long", {
    ...zeroCosts,
    fundingBps: 10,
  });
  assert.ok(Math.abs(without.netReward - withFunding.netReward - 0.1) < 1e-9);
  assert.ok(Math.abs(withFunding.netLoss - without.netLoss - 0.1) < 1e-9);
});
test("Hyperliquid tick rules include integer-price exception and size precision", () => {
  assert.equal(tickSize(81409, 5), 1);
  assert.equal(tickSize(123456, 5), 1);
  assert.equal(tickSize(2642, 4), 0.1);
  assert.equal(tickSize(0.19949, 0), 0.00001);
  assert.ok(Number.isNaN(tickSize(-1, 0)));
});
test("rounding is conservative and robust to floating-point boundaries", () => {
  assert.equal(roundTick(100.13, 0.1, "down"), 100.1);
  assert.equal(roundTick(100.13, 0.1, "up"), 100.2);
  assert.equal(roundTick(0.3, 0.1, "up"), 0.3);
  assert.equal(floorQuantity(1.23459, 4), 1.2345);
});
const trade: JournalTrade = {
  id: "fixture-only",
  coin: "BTC",
  direction: "long",
  openedAt: "2026-09-18T14:10:00Z",
  closedAt: "2026-09-18T14:30:00Z",
  entry: 100,
  stop: 99,
  exit: 99,
  quantity: 2,
  fees: 0.1,
  funding: 0.02,
  notes: "Synthetic test fixture, never market data",
};
test("a stopped trade loses more than one initial price-risk R after costs", () => {
  const r = journalResult(trade);
  assert.equal(r.initialR, 2);
  assert.equal(r.gross, -2);
  assert.equal(r.net, -2.12);
  assert.equal(r.netR, -1.06);
  assert.equal(r.priceBps, -100);
});
test("journal R and price bps remain distinct units", () => {
  const r = journalResult({
    ...trade,
    entry: 1000,
    stop: 990,
    exit: 1030,
    fees: 0,
    funding: 0,
  });
  assert.equal(r.netR, 3);
  assert.equal(r.priceBps, 300);
  assert.equal(r.net, 60);
});
test("short P&L and received funding use the correct signs", () => {
  assert.equal(
    journalResult({
      ...trade,
      direction: "short",
      stop: 101,
      exit: 97,
      fees: 0.1,
      funding: -0.2,
    }).net,
    6.1000000000000005,
  );
});
test("journal rejects invalid stops, sizes and chronology", () => {
  assert.throws(() => journalResult({ ...trade, stop: 101 }));
  assert.throws(() => journalResult({ ...trade, quantity: 0 }));
  assert.throws(() => journalResult({ ...trade, fees: -1 }));
  assert.throws(() =>
    journalResult({ ...trade, closedAt: "2026-09-17T00:00:00Z" }),
  );
});
