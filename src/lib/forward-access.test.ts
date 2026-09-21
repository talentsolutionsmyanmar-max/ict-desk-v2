import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/cron/record/route";

test("the scheduler cannot run with absent or incorrect authorization", async () => {
  const saved = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal(
      (await GET(new Request("https://desk.test/api/cron/record"))).status,
      401,
    );
    process.env.CRON_SECRET = "test-only-recorder-secret";
    assert.equal(
      (
        await GET(
          new Request("https://desk.test/api/cron/record", {
            headers: { authorization: "Bearer wrong" },
          }),
        )
      ).status,
      401,
    );
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  }
});
