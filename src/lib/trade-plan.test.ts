import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTradePlanView,
  journalDraftFromPlan,
  serializeTradePlanCsv,
  serializeTradePlanJson,
  tradePlanSnapshot,
} from "./trade-plan";
import { STRATEGY_VERSION } from "./strategy";
import { Analysis, Gate, Plan, Session } from "./types";

const session: Session = {
  open: true,
  label: "New York AM",
  nyTime: "10:15",
  key: "2026-09-18/10",
};

const costs = {
  entryFeeBps: 1.5,
  exitFeeBps: 4.5,
  slippageBps: 2,
  fundingBps: 0.25,
};

const passGates: Gate[] = [
  "data",
  "liquidity",
  "structure",
  "sweep",
  "displacement",
  "gap",
  "range",
  "room",
  "rr",
  "session",
].map((id) => ({
  id,
  label: id,
  status: "pass" as const,
  detail: "ok",
}));

const plan: Plan = {
  id: "BTC:long:1",
  direction: "long",
  entry: 100,
  stop: 99,
  target: 103,
  gapLow: 99.5,
  gapHigh: 100.5,
  formedAt: Date.parse("2026-09-18T14:10:00Z"),
  expiresAt: Date.parse("2026-09-18T14:40:00Z"),
  sweepLevel: 99.2,
  sweepExtreme: 99.0,
  triggerLevel: 100.8,
  obstacle: 104,
  rangeLow: 98,
  rangeHigh: 102,
  netRR: 2.5,
  grossRR: 3,
  costs,
};

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    coin: "BTC",
    direction: "long",
    stage: "Fresh setup",
    summary: "Research candidate only.",
    score: 10,
    gates: passGates,
    plan,
    book: null,
    evaluatedAt: Date.parse("2026-09-18T14:15:00Z"),
    lastClosedBar: Date.parse("2026-09-18T14:14:59Z"),
    liquid: true,
    ready: true,
    session,
    ...overrides,
  };
}

test("pass fixture: packages levels, RR, default $100 / 0.25% size, ready", () => {
  const view = buildTradePlanView({
    analysis: analysis(),
    szDecimals: 4,
  });
  assert.equal(view.strategyVersion, STRATEGY_VERSION);
  assert.equal(view.ready, true);
  assert.equal(view.hasCandidateLevels, true);
  assert.equal(view.entry, 100);
  assert.equal(view.stop, 99);
  assert.equal(view.target, 103);
  assert.ok(view.grossRR != null && view.grossRR > 2.5);
  assert.ok(view.netRR != null && view.netRR >= 2);
  assert.equal(view.blockedReasons.length, 0);
  assert.ok(view.size?.valid);
  assert.ok((view.size?.quantity ?? 0) > 0);
  assert.equal(view.equityDefault, 100);
  assert.equal(view.riskPercentDefault, 0.25);
  assert.match(view.invalidation, /gap low/i);
  assert.equal(view.freshness, "fresh");
});

test("fail fixture: blockedReasons lists non-passing gates and ready is false", () => {
  const gates: Gate[] = passGates.map((g) =>
    g.id === "session"
      ? {
          ...g,
          status: "fail",
          detail: "Weekend · observation only",
        }
      : g.id === "rr"
        ? { ...g, status: "wait", detail: "Net RR below floor." }
        : g,
  );
  const view = buildTradePlanView({
    analysis: analysis({
      ready: false,
      stage: "Window closed",
      gates,
      plan,
    }),
    gates,
    szDecimals: 4,
  });
  assert.equal(view.ready, false);
  assert.ok(view.blockedReasons.some((r) => /session/i.test(r)));
  assert.ok(view.blockedReasons.some((r) => /rr/i.test(r)));
  assert.equal(view.checklistFails.length, 2);
  assert.equal(view.hasCandidateLevels, true);
  assert.equal(view.entry, 100);
});

test("no analysis yields empty packaging with blocked reason", () => {
  const view = buildTradePlanView({ analysis: null });
  assert.equal(view.ready, false);
  assert.equal(view.hasCandidateLevels, false);
  assert.equal(view.entry, null);
  assert.ok(view.blockedReasons.length >= 1);
  assert.equal(view.freshness, "none");
});

test("live desk can null the plan after retest while preserving blocked gap reason", () => {
  const gates: Gate[] = passGates.map((g) =>
    g.id === "gap"
      ? {
          ...g,
          status: "fail",
          detail: "A retest has now been observed.",
        }
      : g,
  );
  const view = buildTradePlanView({
    analysis: analysis(),
    plan: null,
    gates,
    freshness: "touched",
    szDecimals: 4,
  });
  assert.equal(view.ready, false);
  assert.equal(view.hasCandidateLevels, false);
  assert.equal(view.freshness, "touched");
  assert.ok(view.blockedReasons.some((r) => /retest/i.test(r)));
});

test("journal draft seeds from candidate levels only", () => {
  const ok = journalDraftFromPlan(
    buildTradePlanView({ analysis: analysis(), szDecimals: 4 }),
  );
  assert.ok(ok);
  assert.equal(ok?.coin, "BTC");
  assert.equal(ok?.direction, "long");
  assert.equal(ok?.entry, "100");
  assert.equal(ok?.researchOnly, true);
  assert.match(ok?.notes ?? "", /Research draft/);

  const blocked = journalDraftFromPlan(
    buildTradePlanView({ analysis: analysis({ plan: null, ready: false }) }),
  );
  assert.equal(blocked, null);
});

test("export snapshot marks researchOnly and never armed/liveOrder", () => {
  const view = buildTradePlanView({ analysis: analysis(), szDecimals: 4 });
  const snap = tradePlanSnapshot(view);
  assert.equal(snap.researchOnly, true);
  assert.equal(snap.armed, false);
  assert.equal(snap.liveOrder, false);
  const json = serializeTradePlanJson(view);
  assert.match(json, /"armed": false/);
  const csv = serializeTradePlanCsv(view);
  assert.match(csv, /armed,"false"/);
  assert.match(csv, /BTC/);
});

test("missing szDecimals blocks size without inventing lots", () => {
  const view = buildTradePlanView({ analysis: analysis() });
  assert.equal(view.size?.valid, false);
  assert.equal(view.size?.quantity, 0);
});
