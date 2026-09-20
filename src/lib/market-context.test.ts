import test from "node:test";
import assert from "node:assert/strict";
import {
  contextMetrics,
  createContextTape,
  recordAssetContext,
  recordTrades,
} from "./market-context";
const start = 1000000;
function context(oi = 100, mark = 100) {
  return {
    coin: "BTC",
    ctx: {
      openInterest: String(oi),
      markPx: String(mark),
      funding: "0.00001",
      premium: "0.001",
    },
  };
}
function warmed() {
  const t = createContextTape("BTC", start);
  for (let i = 0; i <= 180; i++)
    recordAssetContext(t, context(), start + i * 5000);
  return t;
}
test("missing or warming OI history is null, never an invented zero", () => {
  const t = createContextTape("BTC", start);
  assert.equal(contextMetrics(t, start).oiUsd, null);
  recordAssetContext(t, context(), start);
  assert.equal(contextMetrics(t, start).oiChange5m, null);
  assert.equal(contextMetrics(t, start).signedFlow5m, null);
});
test("price-only OI USD change does not masquerade as position change", () => {
  const t = warmed(),
    now = start + 900000;
  recordAssetContext(t, context(100, 80), now);
  const m = contextMetrics(t, now);
  assert.equal(m.oiChange5m, 0);
  assert.equal(m.oiChange15m, 0);
  assert.equal(m.oiUsd, 8000);
  recordAssetContext(t, context(110, 80), now);
  assert.ok(Math.abs(contextMetrics(t, now).oiChange5m! - 10) < 1e-9);
});
test("disconnected, stale or discontinuous context is withheld", () => {
  const t = warmed(),
    now = start + 900000;
  t.connected = false;
  assert.equal(contextMetrics(t, now).oiUsd, null);
  t.connected = true;
  assert.equal(contextMetrics(t, now + 20000).oiChange5m, null);
  recordAssetContext(t, context(), now + 31000);
  assert.equal(contextMetrics(t, now + 31000).oiChange5m, null);
  assert.equal(contextMetrics(t, now + 31000).signedFlow5m, null);
});
test("trade flow deduplicates venue identity and excludes pre-connection/wrong-coin rows", () => {
  const t = warmed(),
    now = start + 900000;
  const buy = {
    coin: "BTC",
    time: now - 1000,
    tid: 1,
    side: "B",
    px: "100",
    sz: "2",
  };
  const sell = { ...buy, tid: 2, side: "A", sz: "1" };
  recordTrades(
    t,
    [
      buy,
      buy,
      sell,
      { ...buy, coin: "ETH" },
      { ...buy, time: start - 1 },
      { ...buy, time: now + 10000 },
    ],
    now,
  );
  assert.equal(contextMetrics(t, now).signedFlow5m, 100);
  assert.equal(contextMetrics(t, now).observedTrades, 2);
  recordTrades(t, [buy], now);
  assert.equal(contextMetrics(t, now).signedFlow5m, 100);
});
test("malformed flow is visibly incomplete rather than a trusted partial sum", () => {
  const t = warmed(),
    now = start + 900000;
  recordTrades(
    t,
    [{ coin: "BTC", time: now, tid: 1, side: "?", px: "100", sz: "1" }],
    now,
  );
  assert.equal(contextMetrics(t, now).signedFlow5m, null);
  assert.equal(contextMetrics(t, now).flowIncomplete, true);
});
test("wrong-coin and nonfinite context never replace the selected market", () => {
  const t = createContextTape("BTC", start);
  recordAssetContext(t, { ...context(), coin: "ETH" }, start);
  recordAssetContext(t, context(NaN), start);
  assert.equal(t.samples.length, 0);
});
