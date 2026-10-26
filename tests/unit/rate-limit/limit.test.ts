import { describe, expect, it } from "vitest";
import { assertLimit, LONGEST_WINDOW_SECONDS, rateLimitResult } from "@/lib/rate-limit/limit";

// One verdict for the database's buckets (ENT-RateLimit) and the in-memory ones: a call is allowed
// while its window's count is within the limit and no BR-42 lock holds

const NOW = new Date("2026-10-24T09:00:00.000Z");
const LIMIT = { max: 3, windowSeconds: 60 };
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("a rate limit's verdict", () => {
  it("allows calls up to the limit in a window", () => {
    expect(rateLimitResult({ count: 3, windowStart: NOW, blockedUntil: null }, LIMIT, at(10))).toStrictEqual({
      allowed: true,
    });
  });

  it("refuses the next, until the window ends, in whole seconds rounded up", () => {
    expect(rateLimitResult({ count: 4, windowStart: NOW, blockedUntil: null }, LIMIT, at(10))).toStrictEqual({
      allowed: false,
      retryAfter: 50,
    });
    expect(rateLimitResult({ count: 4, windowStart: NOW, blockedUntil: null }, LIMIT, at(59.2))).toStrictEqual({
      allowed: false,
      retryAfter: 1,
    });
  });

  it("refuses while a lock holds, whatever the count", () => {
    const bucket = { count: 1, windowStart: NOW, blockedUntil: at(900) };
    expect(rateLimitResult(bucket, LIMIT, at(0))).toStrictEqual({ allowed: false, retryAfter: 900 });
    expect(rateLimitResult(bucket, LIMIT, at(900))).toStrictEqual({ allowed: true });
  });

  it("waits for the later of the two when both refuse", () => {
    expect(rateLimitResult({ count: 9, windowStart: NOW, blockedUntil: at(30) }, LIMIT, at(0))).toStrictEqual({
      allowed: false,
      retryAfter: 60,
    });
    expect(rateLimitResult({ count: 9, windowStart: NOW, blockedUntil: at(90) }, LIMIT, at(0))).toStrictEqual({
      allowed: false,
      retryAfter: 90,
    });
  });
});

describe("a limit", () => {
  it("allows at least one call, in a window of 1 s up to the purge's horizon", () => {
    expect(() => assertLimit({ max: 1, windowSeconds: 1 })).not.toThrow();
    expect(() => assertLimit({ max: 400, windowSeconds: LONGEST_WINDOW_SECONDS })).not.toThrow();
    expect(LONGEST_WINDOW_SECONDS).toBe(3600);
    for (const limit of [
      { max: 0, windowSeconds: 60 },
      { max: 1.5, windowSeconds: 60 },
      { max: 5, windowSeconds: 0 },
      { max: 5, windowSeconds: 1.5 },
      { max: 5, windowSeconds: LONGEST_WINDOW_SECONDS + 1 },
    ]) {
      expect(() => assertLimit(limit), JSON.stringify(limit)).toThrow(RangeError);
    }
  });
});
