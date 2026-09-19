import test from "node:test";
import assert from "node:assert/strict";
import { tradeMath } from "./math";
import { sizeScenario } from "./sizing";
import { DEFAULT_COSTS } from "./types";

// Synthetic scenarios test arithmetic, not real signals or historical returns.
const scenario = {
  equity: 100,
  riskPercent: 0.25,
  entry: 100,
  math: tradeMath(100, 99, 103, "long"),
  szDecimals: 4,
};

test("a $100 account at 0.25% budgets at most $0.25 including estimated costs", () => {
  const size = sizeScenario(scenario);
  assert.ok(size.valid && size.meetsMinimum);
  // Independent arithmetic: per-unit stop cost = 100*.00015 + 99*.00065.
  assert.equal(size.quantity, Math.floor((0.25 / 1.07935) * 10000) / 10000);
  assert.ok(size.estimatedStopLoss <= 0.25);
  assert.ok(size.notional + size.estimatedStopCosts <= 100);
  assert.ok(size.estimatedTargetPnl > 0.6 && size.estimatedTargetPnl < 0.7);
});

test("the capital cap leaves room for modeled execution costs", () => {
  const size = sizeScenario({
    ...scenario,
    math: tradeMath(100, 99.99, 100.03, "long"),
  });
  assert.ok(size.notional < 100);
  assert.ok(size.notional + size.estimatedStopCosts <= 100);
  assert.ok(size.estimatedStopLoss <= 0.25);
});

test("below-minimum size stays below minimum; it is never increased", () => {
  const size = sizeScenario({
    ...scenario,
    math: tradeMath(100, 95, 115, "long"),
  });
  assert.ok(size.valid);
  assert.equal(size.meetsMinimum, false);
  assert.ok(size.notional < 10);
  assert.ok(size.estimatedStopLoss <= 0.25);
  assert.match(size.reason, /Skip this scenario/);
});

test("whole-unit lots can make a small account infeasible", () => {
  const size = sizeScenario({ ...scenario, szDecimals: 0 });
  assert.equal(size.quantity, 0);
  assert.equal(size.meetsMinimum, false);
});

test("documented $10 minimum is checked after lot rounding", () => {
  const costs = {
    entryFeeBps: 0,
    exitFeeBps: 0,
    slippageBps: 0,
    fundingBps: 0,
  };
  const exact = {
    ...scenario,
    entry: 10,
    math: tradeMath(10, 9.75, 10.75, "long", costs),
    szDecimals: 2,
  };
  assert.equal(sizeScenario(exact).notional, 10);
  assert.equal(sizeScenario(exact).meetsMinimum, true);
  assert.equal(sizeScenario({ ...exact, riskPercent: 0.249 }).notional, 9.9);
  assert.equal(
    sizeScenario({ ...exact, riskPercent: 0.249 }).meetsMinimum,
    false,
  );
});

test("unknown precision and invalid account inputs never get a fallback size", () => {
  for (const override of [
    { equity: 0 },
    { equity: NaN },
    { equity: Infinity },
    { riskPercent: 1.01 },
    { riskPercent: 0 },
    { riskPercent: Infinity },
    { entry: Infinity },
    { entry: -100 },
    { szDecimals: undefined },
    { szDecimals: -1 },
    { szDecimals: 1.5 },
    { szDecimals: 7 },
    { math: tradeMath(100, 101, 103, "long") },
  ]) {
    const size = sizeScenario({ ...scenario, ...override });
    assert.equal(size.valid, false);
    assert.equal(size.quantity, 0);
    assert.equal(size.meetsMinimum, false);
  }
});

test("short sizing uses the higher stop-side exit notional", () => {
  const size = sizeScenario({
    ...scenario,
    math: tradeMath(100, 101, 97, "short"),
  });
  assert.equal(size.quantity, Math.floor((0.25 / 1.08065) * 10000) / 10000);
  assert.ok(size.estimatedStopLoss <= 0.25);
});

test("non-finite intermediate math cannot produce a displayed size", () => {
  for (const override of [
    { netLoss: Infinity },
    { netLoss: NaN },
    { netReward: Infinity },
    { costAtStop: Infinity },
  ]) {
    const size = sizeScenario({
      ...scenario,
      math: { ...scenario.math, ...override },
    });
    assert.equal(size.valid, false);
    assert.equal(size.quantity, 0);
  }
});

test("a slippage stress can exceed the planned risk without resizing the original scenario", () => {
  const size = sizeScenario(scenario);
  const stress = tradeMath(100, 99, 103, "long", {
    ...DEFAULT_COSTS,
    slippageBps: 50,
  });
  assert.ok(stress.netLoss * size.quantity > 0.25);
});
