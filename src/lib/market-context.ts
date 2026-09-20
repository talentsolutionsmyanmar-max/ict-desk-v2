// Session-local public observations. Never substitute zero for unavailable history.
export interface ContextSample {
  at: number;
  oiBase: number;
  mark: number;
  funding: number;
  premium: number | null;
}
export interface ContextTape {
  coin: string;
  startedAt: number;
  connected: boolean;
  samples: ContextSample[];
  trades: Map<string, { time: number; signedUsd: number }>;
  flowIncomplete: boolean;
}
export function createContextTape(coin: string, now: number): ContextTape {
  return {
    coin,
    startedAt: now,
    connected: true,
    samples: [],
    trades: new Map(),
    flowIncomplete: false,
  };
}
function numeric(x: unknown): number | null {
  if (
    x === null ||
    x === undefined ||
    x === "" ||
    (typeof x !== "number" && typeof x !== "string")
  )
    return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function object(x: unknown): Record<string, unknown> {
  return x !== null && typeof x === "object"
    ? (x as Record<string, unknown>)
    : {};
}
export function recordAssetContext(
  tape: ContextTape,
  raw: unknown,
  now: number,
) {
  const data = object(raw),
    ctx = object(data.ctx);
  if (data.coin !== tape.coin) return;
  const oiBase = numeric(ctx.openInterest),
    mark = numeric(ctx.markPx),
    funding = numeric(ctx.funding);
  if (
    oiBase === null ||
    oiBase < 0 ||
    mark === null ||
    mark <= 0 ||
    funding === null ||
    !Number.isFinite(oiBase * mark)
  )
    return;
  const previous = tape.samples.at(-1);
  if (previous && (now < previous.at || now - previous.at > 30000)) {
    tape.samples = [];
    tape.startedAt = now;
    tape.trades.clear();
    tape.flowIncomplete = false;
  }
  const sample = {
    at: now,
    oiBase,
    mark,
    funding,
    premium: numeric(ctx.premium),
  };
  // Retain one sample per five seconds, plus a fresh latest sample.
  if (
    tape.samples.length > 1 &&
    now - tape.samples[tape.samples.length - 2].at < 5000
  )
    tape.samples[tape.samples.length - 1] = sample;
  else tape.samples.push(sample);
  tape.samples = tape.samples.filter((s) => s.at >= now - 16 * 60000);
}
export function recordTrades(tape: ContextTape, raw: unknown, now: number) {
  if (!Array.isArray(raw)) {
    tape.flowIncomplete = true;
    return;
  }
  for (const item of raw) {
    const t = object(item);
    if (t.coin !== tape.coin) continue;
    const time = numeric(t.time),
      tid = numeric(t.tid),
      px = numeric(t.px),
      sz = numeric(t.sz);
    if (
      time === null ||
      tid === null ||
      !Number.isSafeInteger(tid) ||
      px === null ||
      px <= 0 ||
      sz === null ||
      sz <= 0 ||
      !Number.isFinite(px * sz) ||
      !["B", "A"].includes(String(t.side))
    ) {
      tape.flowIncomplete = true;
      continue;
    }
    if (time < tape.startedAt || time <= now - 300000 || time > now + 2000)
      continue;
    tape.trades.set(`${time}:${tape.coin}:${tid}`, {
      time,
      signedUsd: px * sz * (t.side === "B" ? 1 : -1),
    });
  }
  for (const [key, t] of tape.trades)
    if (t.time <= now - 300000) tape.trades.delete(key);
  if (tape.trades.size > 100000) {
    tape.trades.clear();
    tape.flowIncomplete = true;
  }
}
export function contextMetrics(tape: ContextTape, now: number) {
  const current = tape.samples.at(-1);
  const fresh =
    tape.connected &&
    !!current &&
    now - current.at <= 15000 &&
    now >= current.at;
  const change = (minutes: number) => {
    const target = now - minutes * 60000;
    const baseline = tape.samples.filter((s) => s.at <= target).at(-1);
    if (
      !fresh ||
      !baseline ||
      target - baseline.at > 10000 ||
      baseline.oiBase <= 0
    )
      return null;
    return (current!.oiBase / baseline.oiBase - 1) * 100;
  };
  const flowReady =
    fresh && !tape.flowIncomplete && now - tape.startedAt >= 300000;
  const trades = [...tape.trades.values()].filter(
    (t) => t.time > now - 300000 && t.time <= now,
  );
  return {
    fresh,
    oiBase: fresh ? current!.oiBase : null,
    oiUsd: fresh ? current!.oiBase * current!.mark : null,
    oiChange5m: change(5),
    oiChange15m: change(15),
    funding: fresh ? current!.funding : null,
    premium: fresh ? current!.premium : null,
    signedFlow5m: flowReady
      ? trades.reduce((sum, t) => sum + t.signedUsd, 0)
      : null,
    observedTrades: trades.length,
    flowIncomplete: tape.flowIncomplete,
    coverageSeconds: Math.max(0, Math.floor((now - tape.startedAt) / 1000)),
  };
}
export type ContextMetrics = ReturnType<typeof contextMetrics>;
