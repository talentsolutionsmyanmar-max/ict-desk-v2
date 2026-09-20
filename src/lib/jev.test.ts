import test from "node:test";
import assert from "node:assert/strict";
import {
  JEV_LABELS,
  JEV_MODEL,
  type JevDimension,
  type JevSource,
} from "./jev-contract";
import {
  buildJevRequest,
  evaluateJev,
  JevError,
  parseJevAnswer,
  readBoundedJson,
  validateJevSource,
} from "./jev-core";
import {
  hasJevAccess,
  issueJevSession,
  JEV_COOKIE,
  JEV_SESSION_MS,
  jevConfigured,
  requireJevOrigin,
} from "./jev-access";
import { createJevHandlers } from "./jev-http";
import { JevService } from "./jev-service";

const now = Date.parse("2026-09-20T05:00:00Z");
const config = {
  apiKey: "mock-provider-credential-for-unit-tests",
  deskToken: "a".repeat(64),
};
const source: JevSource = {
  coin: "BTC",
  title: "Public fee documentation",
  url: "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees",
  excerpt:
    "Hyperliquid publishes separate fee schedules for perpetuals and spot. This is standing reference information, not a price forecast.",
  publishedAt: null,
  publicSourceConfirmed: true,
};
function responseBody() {
  return {
    model: JEV_MODEL,
    usage: { input_tokens: 600, output_tokens: 70 },
    answers: Object.fromEntries(
      (Object.keys(JEV_LABELS) as JevDimension[]).map((dimension) => {
        const options = Object.keys(JEV_LABELS[dimension]);
        return [
          dimension,
          {
            type: "choice",
            choice: options[0],
            confidence: 0.9,
            probabilities: Object.fromEntries(
              options.map((key, index) => [key, index === 0 ? 1 : 0]),
            ),
          },
        ];
      }),
    ),
  };
}
const fakeFetch: typeof fetch = async () => Response.json(responseBody());
function request(
  path = "review",
  body: unknown = source,
  headers: Record<string, string> = {},
) {
  return new Request(`https://desk.example/api/ai/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://desk.example",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const operator = { Authorization: `Bearer ${config.deskToken}` };

test("Jev input requires a public source, bounded excerpt and safe citation", () => {
  assert.deepEqual(validateJevSource(source, now), source);
  for (const patch of [
    { publicSourceConfirmed: false },
    { excerpt: "tiny" },
    { excerpt: "x".repeat(3501) },
    { coin: "BTC;fetch" },
    { title: "" },
    { url: "javascript:alert(1)" },
    { url: "https://user:password@example.org/doc" },
    { url: "https://example.org/doc?token=secret" },
    { url: "https://example.org/doc#secret" },
    { url: "https://127.0.0.1/doc" },
    { publishedAt: "2026-09-21T00:00:00Z" },
    { publishedAt: "yesterday" },
    { excerpt: "Here is my TYPESAFE_API_KEY and some unrelated public text." },
  ])
    assert.throws(
      () => validateJevSource({ ...source, ...patch }, now),
      JevError,
    );
});

test("publication dates are metadata, not invented freshness", () => {
  assert.equal(
    validateJevSource({ ...source, publishedAt: "" }, now).publishedAt,
    null,
  );
  assert.equal(
    validateJevSource(
      { ...source, publishedAt: "2026-09-20T10:30:00+06:30" },
      now,
    ).publishedAt,
    "2026-09-20T04:00:00.000Z",
  );
});

test("Jev request is pinned, text-only, and cannot specify orders, prices or a custom provider URL", () => {
  const payload = buildJevRequest(source);
  assert.equal(payload.model, JEV_MODEL);
  assert.deepEqual(Object.keys(payload.questions).sort(), [
    "evidence",
    "relevance",
    "topic",
  ]);
  assert.deepEqual(Object.keys(payload.state).sort(), [
    "asset",
    "excerpt",
    "title",
  ]);
  assert.equal("entry" in payload, false);
  assert.equal(JSON.stringify(payload).includes(source.url), false);
});

test("strict provider validation rejects missing labels, bad distributions and version drift", () => {
  const valid = responseBody();
  assert.equal(parseJevAnswer(valid).inputTokens, 600);
  for (const patch of [
    { model: "jev-latest" },
    { usage: { input_tokens: -1 } },
    { usage: { input_tokens: 3.14 } },
    { answers: {} },
    {
      answers: {
        ...valid.answers,
        relevance: { ...valid.answers.relevance, choice: "buy_now" },
      },
    },
    {
      answers: {
        ...valid.answers,
        relevance: { ...valid.answers.relevance, confidence: 2 },
      },
    },
    {
      answers: {
        ...valid.answers,
        relevance: {
          ...valid.answers.relevance,
          probabilities: { direct_asset: 1 },
        },
      },
    },
    {
      answers: {
        ...valid.answers,
        relevance: {
          ...valid.answers.relevance,
          probabilities: {
            direct_asset: 0.2,
            broad_crypto: 0.2,
            unrelated: 0.2,
            unclear: 0.2,
          },
        },
      },
    },
  ])
    assert.throws(() => parseJevAnswer({ ...valid, ...patch }), JevError);
});

test("bounded JSON enforces streamed bytes as well as content length", async () => {
  assert.deepEqual(await readBoundedJson(new Response('{"ok":true}'), 20), {
    ok: true,
  });
  await assert.rejects(
    readBoundedJson(new Response("x".repeat(21)), 20),
    JevError,
  );
  await assert.rejects(
    readBoundedJson(
      new Response("{}", { headers: { "content-length": "1000" } }),
      20,
    ),
    JevError,
  );
  await assert.rejects(readBoundedJson(new Response("not-json"), 20), JevError);
});

test("inference sends the key only in the provider header, not the result", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer ${config.apiKey}`,
    );
    assert.ok(!String(init?.body).includes(config.apiKey));
    return Response.json({ ...responseBody(), untrustedExtra: config.apiKey });
  };
  const review = await evaluateJev(source, config.apiKey, fetcher, () => now);
  assert.equal(calls, 1);
  assert.equal(review.timeframes, "4H / 15M / 5M");
  assert.equal(review.mode, "shadow-context-only");
  assert.equal(review.sourceVerified, false);
  assert.equal(review.estimatedApiCostUsd, (600 / 1e6) * 0.042);
  assert.ok(!JSON.stringify(review).includes(config.apiKey));
  assert.equal("winProbability" in review, false);
  assert.equal("ready" in review, false);
});

test("provider errors and thrown errors are redacted and never retried", async () => {
  for (const status of [401, 402, 403, 429, 500, 529]) {
    let calls = 0;
    await assert.rejects(
      evaluateJev(source, config.apiKey, async () => {
        calls++;
        return new Response(config.apiKey, { status });
      }),
      (error: unknown) =>
        error instanceof JevError && !error.message.includes(config.apiKey),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    evaluateJev(source, config.apiKey, async () => {
      throw new Error(config.apiKey);
    }),
    (error: unknown) =>
      error instanceof JevError && !error.message.includes(config.apiKey),
  );
});

test("a credential in submitted text is rejected before contacting TypeSafe", async () => {
  let calls = 0;
  await assert.rejects(
    evaluateJev(
      { ...source, excerpt: source.excerpt + config.apiKey },
      config.apiKey,
      async () => {
        calls++;
        return Response.json(responseBody());
      },
    ),
  );
  assert.equal(calls, 0);
});

test("malformed or oversized provider bodies fail as sanitized upstream errors", async () => {
  for (const body of [
    "not-json",
    config.apiKey.repeat(1000),
    JSON.stringify({ model: "unknown" }),
  ]) {
    await assert.rejects(
      evaluateJev(source, config.apiKey, async () => new Response(body)),
      (error: unknown) =>
        error instanceof JevError &&
        error.status === 502 &&
        error.code === "invalid_provider_response" &&
        !error.message.includes(config.apiKey),
    );
  }
});

test("operator sessions expire, reject tampering and are revoked by token rotation", () => {
  assert.equal(jevConfigured(config), true);
  assert.equal(jevConfigured({ ...config, deskToken: "" }), false);
  const cookie = `${JEV_COOKIE}=${issueJevSession(config.deskToken, now)}`;
  const req = new Request("https://desk.example/api/ai/session", {
    headers: { Cookie: cookie },
  });
  assert.equal(hasJevAccess(req, config, now), true);
  assert.equal(hasJevAccess(req, config, now + JEV_SESSION_MS), false);
  assert.equal(
    hasJevAccess(req, { ...config, deskToken: "b".repeat(64) }, now),
    false,
  );
  assert.equal(
    hasJevAccess(
      new Request(req.url, { headers: { Cookie: cookie + "tampered" } }),
      config,
      now,
    ),
    false,
  );
});

test("anonymous, cross-origin and non-JSON paid requests cannot invoke Jev", async () => {
  let calls = 0;
  const service = new JevService(
    async () => {
      calls++;
      return Response.json(responseBody());
    },
    () => now,
  );
  const h = createJevHandlers(
    () => config,
    service,
    () => now,
  );
  assert.equal((await h.review(request())).status, 401);
  assert.equal(
    (
      await h.review(
        request("review", source, {
          ...operator,
          Origin: "https://evil.example",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await h.review(
        request("review", source, {
          ...operator,
          "Content-Type": "text/plain",
        }),
      )
    ).status,
    415,
  );
  assert.equal(calls, 0);
});

test("Next loopback normalization preserves valid Host/Origin checks without admitting cross-origin calls", () => {
  const local = (origin: string, host: string, site = "same-origin") =>
    new Request("http://localhost:3020/api/ai/session", {
      headers: { Origin: origin, Host: host, "Sec-Fetch-Site": site },
    });
  assert.doesNotThrow(() =>
    requireJevOrigin(local("http://127.0.0.1:3020", "127.0.0.1:3020")),
  );
  assert.doesNotThrow(() =>
    requireJevOrigin(local("http://[::1]:3020", "[::1]:3020")),
  );
  for (const req of [
    local("http://127.0.0.1:3020", "localhost:3020"),
    local("http://127.0.0.1:4000", "127.0.0.1:4000"),
    local("https://evil.example", "evil.example"),
    local("http://127.0.0.1:3020", "127.0.0.1:3020", "cross-site"),
    local("null", "127.0.0.1:3020"),
    local("http://127.0.0.1:3020/path", "127.0.0.1:3020"),
  ])
    assert.throws(() => requireJevOrigin(req), JevError);
});

test("unconfigured service fails closed; status exposes no credentials or paid calls", async () => {
  const h = createJevHandlers(() => ({ apiKey: config.apiKey, deskToken: "" }));
  const status = await h.status(
    new Request("https://desk.example/api/ai/session"),
  );
  assert.match(status.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(await status.json(), {
    configured: false,
    unlocked: false,
    model: JEV_MODEL,
    mode: "shadow-context-only",
  });
  assert.equal(
    (await h.review(request("review", source, operator))).status,
    503,
  );
});

test("unlock issues an HttpOnly same-site cookie and permits exactly the requested review", async () => {
  let calls = 0;
  const h = createJevHandlers(
    () => config,
    new JevService(
      async () => {
        calls++;
        return Response.json(responseBody());
      },
      () => now,
    ),
    () => now,
  );
  assert.equal(
    (await h.unlock(request("session", { token: config.apiKey }))).status,
    401,
  );
  const unlocked = await h.unlock(
    request("session", { token: config.deskToken }),
  );
  assert.equal(unlocked.status, 200);
  const cookie = unlocked.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.ok(
    !cookie.includes(config.apiKey) && !cookie.includes(config.deskToken),
  );
  assert.equal(calls, 0);
  const reviewed = await h.review(
    request("review", source, { Cookie: cookie.split(";")[0] }),
  );
  assert.equal(reviewed.status, 200);
  assert.equal(calls, 1);
  const body = await reviewed.json();
  assert.equal(body.review.source.coin, "BTC");
  assert.equal(body.review.sourceVerified, false);
});

test("unlock attempts are throttled before any paid call", async () => {
  const h = createJevHandlers(
    () => config,
    undefined,
    () => now,
  );
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await h.unlock(request("session", { token: "wrong" }))).status,
      401,
    );
  assert.equal(
    (await h.unlock(request("session", { token: config.deskToken }))).status,
    429,
  );
});

test("duplicate reviews are cached; new reviews respect pacing and hourly allowance", async () => {
  let time = now,
    calls = 0;
  const service = new JevService(
    async () => {
      calls++;
      return Response.json(responseBody());
    },
    () => time,
  );
  const first = await service.review(source, config.apiKey);
  assert.equal(first.cached, false);
  assert.equal((await service.review(source, config.apiKey)).cached, true);
  assert.equal(calls, 1);
  await assert.rejects(
    service.review({ ...source, title: "Different source" }, config.apiKey),
    (e: unknown) => e instanceof JevError && e.code === "review_cooldown",
  );
  for (let i = 1; i < 20; i++) {
    time += 10_001;
    await service.review({ ...source, title: `Source ${i}` }, config.apiKey);
  }
  time += 10_001;
  await assert.rejects(
    service.review({ ...source, title: "Source 21" }, config.apiKey),
    (e: unknown) => e instanceof JevError && e.code === "review_limit",
  );
  assert.equal(calls, 20);
});

test("in-flight requests cannot bypass process pacing with concurrency", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new JevService(
    async () => {
      await gate;
      return Response.json(responseBody());
    },
    () => now,
  );
  const first = service.review(source, config.apiKey);
  await assert.rejects(
    service.review({ ...source, title: "Concurrent request" }, config.apiKey),
    (e: unknown) => e instanceof JevError && e.code === "review_busy",
  );
  release();
  await first;
});
