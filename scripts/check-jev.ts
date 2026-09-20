// Deliberate live check: at most one paid inference; never part of npm test/CI.
// Usage: node --env-file=.env.local --import tsx scripts/check-jev.ts
import { JEV_MODEL, type JevReview } from "../src/lib/jev-contract";

let phase = "local configuration";
async function check() {
  const origin = new URL(process.argv[2] ?? "http://127.0.0.1:3020");
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Use a plain loopback HTTP origin only.");
  }
  const token = process.env.JEV_DESK_TOKEN?.trim();
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("Private desk configuration is missing.");
  const headers = { "Content-Type": "application/json", Origin: origin.origin };
  const send = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, origin), {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  phase = "server configuration";
  const statusResponse = await send("/api/ai/session");
  const status = await statusResponse.json();
  if (!statusResponse.ok || !status.configured || status.model !== JEV_MODEL)
    throw new Error(
      "The local server is not configured for the pinned Jev model.",
    );
  phase = "anonymous access protection";
  const denied = await send("/api/ai/review", {
    method: "POST",
    headers,
    body: "{}",
  });
  await denied.body?.cancel();
  if (denied.status !== 401)
    throw new Error("Anonymous review protection did not pass.");
  phase = "operator unlock";
  const unlocked = await send("/api/ai/session", {
    method: "POST",
    headers,
    body: JSON.stringify({ token }),
  });
  const cookie = unlocked.headers.get("set-cookie")?.split(";")[0];
  await unlocked.body?.cancel();
  if (!unlocked.ok || !cookie)
    throw new Error("The operator session could not be established.");
  const source = {
    coin: "BTC",
    title: "Hyperliquid fee schedule",
    url: "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees",
    excerpt:
      "Hyperliquid publishes separate fee schedules for perpetuals and spot. The base Tier 0 perpetual rates are 0.045% for takers and 0.015% for makers. These are fee terms, not a price forecast.",
    publishedAt: null,
    publicSourceConfirmed: true,
  };
  try {
    phase = "provider review";
    const response = await send("/api/ai/review", {
      method: "POST",
      headers: { ...headers, Cookie: cookie },
      body: JSON.stringify(source),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      const safeCode =
        typeof result?.code === "string" && /^[a-z_]{1,40}$/.test(result.code)
          ? result.code
          : "unknown";
      console.error(
        JSON.stringify({
          check: "Jev live review",
          passed: false,
          httpStatus: response.status,
          code: safeCode,
          automaticRetries: 0,
        }),
      );
      process.exitCode = 1;
      return;
    }
    const { review, cached } = (await response.json()) as {
      review: JevReview;
      cached: boolean;
    };
    if (
      review.model !== JEV_MODEL ||
      review.mode !== "shadow-context-only" ||
      review.sourceVerified !== false
    )
      throw new Error("The review contract did not pass.");
    console.log(
      JSON.stringify(
        {
          check: "Jev live review",
          passed: true,
          anonymousHttpStatus: denied.status,
          reviewHttpStatus: response.status,
          model: review.model,
          cached,
          timeframes: review.timeframes,
          mode: review.mode,
          labels: Object.fromEntries(
            Object.entries(review.answers).map(([key, answer]) => [
              key,
              answer.choice,
            ]),
          ),
          inputTokens: review.inputTokens,
          estimatedApiCostUsd: review.estimatedApiCostUsd,
          latencyMs: review.latencyMs,
          automaticRetries: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    // Clear this check's cookie. There is no browser token or session to persist.
    const locked = await send("/api/ai/session", {
      method: "DELETE",
      headers: { ...headers, Cookie: cookie },
    }).catch(() => null);
    await locked?.body?.cancel();
  }
}

check().catch(() => {
  // Do not echo raw exceptions: network libraries can include request details.
  console.error(
    JSON.stringify({
      check: "Jev live review",
      passed: false,
      phase,
      automaticRetries: 0,
    }),
  );
  process.exitCode = 1;
});
