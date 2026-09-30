import test from "node:test";
import assert from "node:assert/strict";
import { buildVolumeProfile } from "./volume-profile";
import type { Candle } from "./types";

function candles(): Candle[] {
  return Array.from({ length: 24 }, (_, i) => ({
    time: i * 300_000,
    closeTime: (i + 1) * 300_000,
    open: 100 + (i % 3),
    high: 102 + (i % 3),
    low: 98 + (i % 3),
    close: 100 + (i % 3),
    volume: i === 12 ? 100 : 10,
  }));
}

test("volume profile returns POC and a 70% value area from closed candles", () => {
  const profile = buildVolumeProfile(candles(), 24 * 300_000, 24, 12);
  assert.ok(profile);
  assert.ok(profile.poc >= profile.val && profile.poc <= profile.vah);
  assert.ok(profile.vah > profile.val);
  assert.equal(profile.rows, 12);
});

test("forming or insufficient candles do not produce a profile", () => {
  assert.equal(buildVolumeProfile(candles().slice(0, 10), 10 * 300_000), null);
  assert.equal(buildVolumeProfile(candles(), 10 * 300_000 + 1), null);
});
