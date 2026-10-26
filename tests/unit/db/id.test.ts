import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { uuidv7 } from "@/lib/db/id";

// SRS §6: primary keys are UUIDv7, made in the app (RFC 9562 §5.7)

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function timestampOf(id: string): number {
  return Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("uuidv7", () => {
  it("writes version 7 and the RFC 9562 variant", () => {
    for (let i = 0; i < 200; i++) expect(uuidv7()).toMatch(V7);
  });

  it("starts with the time in milliseconds", () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T12:00:00.123Z") });
    expect(timestampOf(uuidv7())).toBe(Date.parse("2026-10-24T12:00:00.123Z"));
  });

  it("sorts by time, across the boundary between its two time fields", () => {
    const ids = [2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1, Date.parse("2026-10-24T12:00:00Z")].map((now) => {
      vi.useFakeTimers({ now });
      return uuidv7();
    });
    expect(ids.map(timestampOf)).toEqual([2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1, Date.parse("2026-10-24T12:00:00Z")]);
    expect([...ids].sort()).toEqual(ids);
  });

  it("fills the rest with random bits, so ids made in one millisecond differ", () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T12:00:00Z") });
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()));
    expect(ids.size).toBe(1000);
  });

  it("draws its random bits from the platform's cryptographic source (RFC 9562 §6.9)", () => {
    const source = vi.spyOn(globalThis.crypto, "getRandomValues");
    uuidv7();
    expect(source).toHaveBeenCalledOnce();
  });

  it("passes the schemas that check ids", () => {
    expect(z.uuid().safeParse(uuidv7()).success).toBe(true);
  });
});
