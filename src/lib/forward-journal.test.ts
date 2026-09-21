import test from "node:test";
import assert from "node:assert/strict";
import {
  advancePaper,
  paperMetrics,
  recordCandidate,
  ForwardSignal,
} from "./forward-journal";
import { Book, Candle, Plan, ResearchModel } from "./types";
import { tradeMath } from "./math";

const t = Date.parse("2026-09-21T03:00:00Z");
const costs = {
  entryFeeBps: 1.5,
  exitFeeBps: 4.5,
  slippageBps: 2,
  fundingBps: 0.2,
};
const plan: Plan = {
  id: "4.0-forward:BTC:continuation:long:1",
  direction: "long",
  entry: 100,
  stop: 99,
  target: 104,
  gapLow: 99.9,
  gapHigh: 100.1,
  formedAt: t,
  expiresAt: t + 1800000,
  sweepLevel: 100,
  sweepExtreme: 99,
  triggerLevel: 100,
  obstacle: 105,
  rangeLow: 99,
  rangeHigh: 104,
  netRR: tradeMath(100, 99, 104, "long", costs).netRR,
  grossRR: 4,
  costs,
  maxHoldMs: 600000,
};
const model: ResearchModel = {
  id: "continuation",
  label: "Intraday pullback",
  status: "candidate",
  direction: "long",
  plan,
  regime: "uptrend",
  context: "",
  trigger: "",
  summary: "",
  gates: [{ id: "data", label: "", detail: "", status: "pass" }],
};
const book: Book = {
  coin: "BTC",
  time: t + 1000,
  receivedAt: t + 1000,
  bid: 101,
  ask: 101.01,
  spreadBps: 1,
  bidDepth10bps: 100000,
  askDepth10bps: 100000,
};
const fresh = () => recordCandidate("BTC", model, book, t + 1000, 4)!;
const bar = (slot: number, low = 100.5, high = 102): Candle => ({
  time: t + slot * 300000,
  closeTime: t + (slot + 1) * 300000 - 1,
  open: 101,
  close: 101,
  low,
  high,
  volume: 100,
});

test("only forward observed candidates with fresh evidence enter the paper journal", () => {
  assert.equal(fresh().activeFrom, t + 300000);
  assert.equal(
    recordCandidate("BTC", { ...model, status: "passed" }, book, t + 1000, 4),
    null,
  );
  assert.equal(recordCandidate("BTC", model, book, t + 10000, 4), null);
  const changed = { ...model, plan: { ...plan } };
  const recorded = recordCandidate("BTC", changed, book, t + 1000, 4)!;
  changed.plan.stop = 1;
  assert.equal(recorded.plan.stop, 99);
});
test("pre-observation and forming candles never generate a paper fill", () => {
  const result = advancePaper(fresh(), [bar(-1, 98), bar(1, 99.5)], t + 400000);
  assert.equal(result.status, "pending");
});
test("a retest before paper activation is missed, never reused as a fresh limit", () => {
  const result = advancePaper(
    fresh(),
    [bar(0, 99.5), bar(1, 99.5)],
    t + 600000,
  );
  assert.equal(result.status, "missed");
  assert.equal(result.netR, null);
});
test("exact touch is insufficient; penetration opens and later target closes net of costs", () => {
  assert.equal(
    advancePaper(fresh(), [bar(1, 100)], t + 600000).status,
    "pending",
  );
  const open = advancePaper(fresh(), [bar(1, 99.5)], t + 600000);
  assert.equal(open.status, "open");
  const won = advancePaper(open, [bar(2, 101, 105)], t + 900000);
  assert.equal(won.status, "won");
  assert.equal(won.netR, plan.netRR);
  assert.deepEqual(advancePaper(won, [bar(3, 90)], t + 1200000), won);
});
test("ambiguous entry-target bar is excluded; simultaneous exits count as stop-first", () => {
  const ambiguous = advancePaper(fresh(), [bar(1, 99.5, 105)], t + 600000);
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.netR, null);
  const loss = advancePaper(fresh(), [bar(1, 98, 105)], t + 600000);
  assert.equal(loss.status, "lost");
  assert.equal(loss.netR, -1);
});
test("missing bars withhold outcomes and adverse gaps exceed a modeled 1R stop", () => {
  assert.equal(
    advancePaper(fresh(), [bar(2, 99.5)], t + 900000).status,
    "data-gap",
  );
  const open = advancePaper(fresh(), [bar(1, 99.5)], t + 600000);
  const gap = { ...bar(2, 96, 98), open: 97, close: 97 };
  assert.ok(advancePaper(open, [gap], t + 900000).netR! < -2);
});
test("no-fill expiry and time exits are distinct from winning targets", () => {
  const expired = advancePaper(
    fresh(),
    [1, 2, 3, 4, 5].map((i) => bar(i)),
    t + 1800000,
  );
  assert.equal(expired.status, "expired");
  assert.equal(expired.netR, null);
  const timed = advancePaper(fresh(), [bar(1, 99.5), bar(2)], t + 900000);
  assert.equal(timed.status, "time-exit");
});
test("metrics use resolved net outcomes and expose uncertainty", () => {
  const signals = [
    { ...fresh(), id: "a", status: "won", netR: 2, exitAt: t + 1 },
    { ...fresh(), id: "b", status: "lost", netR: -1, exitAt: t + 2 },
    { ...fresh(), id: "c", status: "ambiguous", netR: null },
  ] as ForwardSignal[];
  const m = paperMetrics(signals);
  assert.equal(m.expectancyR, 0.5);
  assert.equal(m.profitFactor, 2);
  assert.equal(m.drawdownR, 1);
  assert.equal(m.unresolved, 1);
});
