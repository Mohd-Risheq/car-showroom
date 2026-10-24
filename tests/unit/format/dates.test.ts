import { describe, expect, it } from "vitest";
import { formatDate, formatDuration, formatMonthYear, formatTime } from "@/lib/format/dates";
import { LOCALES } from "@/lib/i18n/locales";

// BR-03: the Gregorian calendar, with Levantine month names in Arabic and Western digits, and a
// moment read in Amman's time; a calendar date shows as stored. DESIGN §9.5: times on the 24-hour
// clock and durations in minutes and seconds.

// 18 October 2026, at noon in Amman
const NOON = new Date(Date.UTC(2026, 9, 18, 9));

describe("formatDate", () => {
  it("writes a day in both languages (TC-01-4)", () => {
    expect(formatDate(NOON, "ar")).toBe("18 تشرين الأول 2026");
    expect(formatDate(NOON, "en")).toBe("18 Oct 2026");
  });

  it("reads a moment in Amman's time, three hours ahead of UTC", () => {
    // 22:30 UTC on the 17th is 01:30 on the 18th in Amman
    const lateEvening = new Date(Date.UTC(2026, 9, 17, 22, 30));
    expect(formatDate(lateEvening, "ar")).toBe("18 تشرين الأول 2026");
    expect(formatDate(lateEvening, "en")).toBe("18 Oct 2026");
  });

  it("writes a calendar date as stored, in no time zone", () => {
    expect(formatDate("2026-10-18", "en")).toBe("18 Oct 2026");
    expect(formatDate("2024-03-01", "ar")).toBe("1 آذار 2024");
    expect(formatDate("2024-02-29", "en")).toBe("29 Feb 2024");
    expect(formatDate("2024-12-31", "en")).toBe("31 Dec 2024");
  });

  it.each(["18/10/2026", "2026-10-18T09:00:00Z", "", "2026-1-8", "2026-13-01", "2026-02-30", "2026-02-29"])(
    "refuses %j as a calendar date",
    (value) => {
      expect(() => formatDate(value, "en")).toThrow(RangeError);
    },
  );

  it("refuses an invalid moment", () => {
    expect(() => formatDate(new Date(Number.NaN), "ar")).toThrow(RangeError);
  });
});

describe("formatMonthYear", () => {
  // Arabic spells out the Levantine names, English shortens the British ones (BR-03)
  it.each([
    ["01", "كانون الثاني", "Jan"],
    ["02", "شباط", "Feb"],
    ["03", "آذار", "Mar"],
    ["04", "نيسان", "Apr"],
    ["05", "أيار", "May"],
    ["06", "حزيران", "Jun"],
    ["07", "تموز", "Jul"],
    ["08", "آب", "Aug"],
    ["09", "أيلول", "Sept"],
    ["10", "تشرين الأول", "Oct"],
    ["11", "تشرين الثاني", "Nov"],
    ["12", "كانون الأول", "Dec"],
  ])("names month %s %s in Arabic and %s in English", (month, arabic, english) => {
    expect(formatMonthYear(`2024-${month}-01`, "ar")).toBe(`${arabic} 2024`);
    expect(formatMonthYear(`2024-${month}-01`, "en")).toBe(`${english} 2024`);
  });

  it("reads a moment in Amman's time", () => {
    // 22:30 UTC on 31 October is 01:30 on 1 November in Amman
    expect(formatMonthYear(new Date(Date.UTC(2026, 9, 31, 22, 30)), "en")).toBe("Nov 2026");
  });
});

describe("formatTime", () => {
  it.each([
    [Date.UTC(2026, 9, 18, 17, 30), "20:30"],
    [Date.UTC(2026, 9, 18, 6, 5), "09:05"],
    [Date.UTC(2026, 9, 17, 21, 0), "00:00"],
  ])("writes the moment %s as %s in Amman on the 24-hour clock, in both languages", (moment, shown) => {
    for (const locale of LOCALES) expect(formatTime(new Date(moment), locale)).toBe(shown);
  });

  it("refuses an invalid moment", () => {
    expect(() => formatTime(new Date(Number.NaN), "en")).toThrow(RangeError);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [12, "0:12"],
    [11.9, "0:11"],
    [185, "3:05"],
    [3600, "60:00"],
  ])("writes %s seconds as %s", (seconds, shown) => {
    expect(formatDuration(seconds)).toBe(shown);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s seconds", (seconds) => {
    expect(() => formatDuration(seconds)).toThrow(RangeError);
  });
});
