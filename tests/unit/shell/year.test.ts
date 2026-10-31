import { cacheLife } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentYear } from "@/features/shell/server/year";

// The footer's copyright year: this year in Amman (BR-03), cached with the public data, so the new
// year arrives with the day's refresh

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("currentYear", () => {
  it("turns at midnight in Amman, three hours before midnight in UTC", async () => {
    vi.useFakeTimers({ now: new Date("2026-12-31T20:59:59.999Z") });
    expect(await currentYear()).toBe("2026");
    vi.setSystemTime(new Date("2026-12-31T21:00:00.000Z"));
    expect(await currentYear()).toBe("2027");
  });

  it("is cached with the public data", async () => {
    await currentYear();
    expect(vi.mocked(cacheLife).mock.calls).toStrictEqual([["catalog"]]);
  });
});
