import { describe, expect, it } from "vitest";
import { MemoryLimiter } from "@/lib/rate-limit/memory";

// The per-instance windows of API-30 and API-34, and API-03's first check (SRS §8.3): nothing is
// written to the database, and the instance keeps a bounded number of keys

const NOW = new Date("2026-10-24T09:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe("an in-memory rate limit", () => {
  it("counts a key's calls in its window and refuses past the limit", () => {
    const limiter = new MemoryLimiter({ max: 2, windowSeconds: 60 });
    expect(limiter.consume("a", at(0))).toStrictEqual({ allowed: true });
    expect(limiter.consume("a", at(1))).toStrictEqual({ allowed: true });
    expect(limiter.consume("a", at(10))).toStrictEqual({ allowed: false, retryAfter: 50 });
    // Each key has its own window
    expect(limiter.consume("b", at(10))).toStrictEqual({ allowed: true });
  });

  it("starts a new window when the old one has ended", () => {
    const limiter = new MemoryLimiter({ max: 1, windowSeconds: 60 });
    limiter.consume("a", at(0));
    expect(limiter.consume("a", at(59))).toStrictEqual({ allowed: false, retryAfter: 1 });
    expect(limiter.consume("a", at(60))).toStrictEqual({ allowed: true });
    expect(limiter.consume("a", at(61))).toStrictEqual({ allowed: false, retryAfter: 59 });
  });

  it("starts a new window when the old one has ended behind a later one", () => {
    // Two calls whose times were read in one order and counted in the other
    const limiter = new MemoryLimiter({ max: 1, windowSeconds: 60 });
    limiter.consume("b", at(1));
    limiter.consume("a", at(0));
    expect(limiter.consume("a", at(60))).toStrictEqual({ allowed: true });
    expect(limiter.consume("a", at(61))).toStrictEqual({ allowed: false, retryAfter: 59 });
  });

  it("forgets windows that have ended", () => {
    const limiter = new MemoryLimiter({ max: 1, windowSeconds: 60 });
    limiter.consume("a", at(0));
    limiter.consume("b", at(30));
    limiter.consume("c", at(70));
    expect(limiter.size).toBe(2);
    limiter.consume("d", at(200));
    expect(limiter.size).toBe(1);
  });

  it("keeps at most maxKeys, dropping the oldest window first", () => {
    const limiter = new MemoryLimiter({ max: 1, windowSeconds: 60 }, 2);
    limiter.consume("a", at(0));
    limiter.consume("b", at(1));
    limiter.consume("c", at(2));
    expect(limiter.size).toBe(2);
    // a was dropped, so it starts again and pushes out b; c still counts
    expect(limiter.consume("a", at(3))).toStrictEqual({ allowed: true });
    expect(limiter.consume("c", at(3))).toStrictEqual({ allowed: false, retryAfter: 59 });
  });

  it("refuses a limit outside the rules", () => {
    expect(() => new MemoryLimiter({ max: 0, windowSeconds: 60 })).toThrow(RangeError);
    expect(() => new MemoryLimiter({ max: 1, windowSeconds: 60 }, 0)).toThrow(RangeError);
  });
});
