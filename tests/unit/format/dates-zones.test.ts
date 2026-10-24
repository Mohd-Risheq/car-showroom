import { beforeEach, describe, expect, it, vi } from "vitest";

// BR-03 whatever the runtime's own time zone: a moment shows as Amman sees it, and a calendar date as
// stored. This Mac runs at Amman's offset, where a formatter that reads a moment or a calendar date
// in the runtime's zone still passes dates.test.ts. CI runs at UTC, where one that reads a calendar
// date in that zone, or as its midnight, still passes it. So each zone here sits on one side of UTC,
// neither at +3: Los Angeles shows a moment or a calendar date read in its own zone on the day
// before, and Tokyo a calendar date taken as its own midnight. Each zone gets a fresh module, whose
// formatters it builds in that zone.

// 18 October 2026: 01:30 in Amman, while UTC still has the 17th, and 17:00 in Amman
const AFTER_MIDNIGHT = new Date(Date.UTC(2026, 9, 17, 22, 30));
const FIVE_PM = new Date(Date.UTC(2026, 9, 18, 14));

describe.each(["America/Los_Angeles", "Asia/Tokyo"])("in %s", (zone) => {
  let dates: typeof import("@/lib/format/dates");

  beforeEach(async () => {
    vi.stubEnv("TZ", zone);
    vi.resetModules();
    dates = await import("@/lib/format/dates");
  });

  it("runs in that zone", () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  it("shows a moment as Amman sees it", () => {
    expect(dates.formatDate(AFTER_MIDNIGHT, "en")).toBe("18 Oct 2026");
    expect(dates.formatDate(AFTER_MIDNIGHT, "ar")).toBe("18 تشرين الأول 2026");
    expect(dates.formatTime(FIVE_PM, "en")).toBe("17:00");
  });

  it("shows a calendar date as stored", () => {
    expect(dates.formatDate("2026-10-18", "en")).toBe("18 Oct 2026");
    expect(dates.formatDate("2024-03-01", "ar")).toBe("1 آذار 2024");
    expect(dates.formatDate("2024-12-31", "en")).toBe("31 Dec 2024");
    expect(dates.formatMonthYear("2024-03-01", "en")).toBe("Mar 2024");
  });
});
