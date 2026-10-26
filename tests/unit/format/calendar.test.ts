import { describe, expect, it } from "vitest";
import { ammanDate } from "@/lib/format/calendar";

// BR-03: the calendar is Amman's, three hours ahead of UTC since Jordan kept summer time in 2022

describe("ammanDate", () => {
  it("turns the day at midnight in Amman, 21:00 UTC", () => {
    expect(ammanDate(new Date("2026-12-31T20:59:59.999Z"))).toBe("2026-12-31");
    expect(ammanDate(new Date("2026-12-31T21:00:00Z"))).toBe("2027-01-01");
  });

  it("writes the date with Western digits and padded fields", () => {
    expect(ammanDate(new Date("2027-03-04T09:00:00Z"))).toBe("2027-03-04");
  });

  it("refuses an invalid date", () => {
    expect(() => ammanDate(new Date(Number.NaN))).toThrow(RangeError);
  });
});
