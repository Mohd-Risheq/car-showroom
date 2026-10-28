import { describe, expect, it } from "vitest";
import { addDays, ammanInstant, anchorSeedDates, daysBetween, monthAfter, seedTimeOfDay } from "@/lib/demo/seed-dates";
import { ammanDate } from "@/lib/format/calendar";
import { seedOffsetsSchema } from "@/lib/validation/car";

// 05-SEED-DATA §9: a seed car's offsets become its dates on one day in Amman

// SRS §16's test clock, a Sunday in Amman
const NOW = new Date("2026-10-18T12:00:00+03:00");
const TODAY = ammanDate(NOW);

/** The date and the time in Amman at an instant, as ["2026-10-09", "14:05"] */
function inAmman(instant: Date | null): [string, string] {
  if (instant === null) throw new Error("No instant where one was expected");
  return [ammanDate(instant), new Date(instant.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(11, 16)];
}

/** A car's time of day as HH:MM */
const clock = (seedKey: string) => {
  const minute = seedTimeOfDay(seedKey);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
};

describe("addDays, daysBetween and monthAfter", () => {
  it("count calendar days and months, across the ends of months, years and a leap day", () => {
    expect(addDays("2026-10-18", -9)).toBe("2026-10-09");
    expect(addDays("2026-10-18", 0)).toBe("2026-10-18");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-01-02", -2)).toBe("2025-12-31");
    expect(daysBetween("2026-10-09", "2026-10-18")).toBe(9);
    expect(daysBetween("2026-10-18", "2026-10-09")).toBe(-9);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2025-12-31", "2026-01-02")).toBe(2);
    expect(monthAfter("2026-10-18", 5)).toBe("2027-03-01");
    expect(monthAfter("2026-10-18", 0)).toBe("2026-10-01");
    expect(monthAfter("2026-01-31", -1)).toBe("2025-12-01");
  });

  it("refuse what is not a calendar date", () => {
    for (const day of ["2026-02-30", "2026-10-18T00:00", "18-10-2026", "", "2026-10", "2026"]) {
      expect(() => addDays(day, 1)).toThrow(RangeError);
      expect(() => monthAfter(day, 1)).toThrow(RangeError);
      expect(() => daysBetween(day, "2026-10-18")).toThrow(RangeError);
      expect(() => daysBetween("2026-10-18", day)).toThrow(RangeError);
    }
  });
});

describe("seedTimeOfDay", () => {
  it("is a minute from 09:00 to 19:59, the same for a car every time", () => {
    const minutes = Array.from({ length: 500 }, (_, index) => seedTimeOfDay(`s${index}`));
    expect(Math.min(...minutes)).toBeGreaterThanOrEqual(9 * 60);
    expect(Math.max(...minutes)).toBeLessThanOrEqual(19 * 60 + 59);
    expect(minutes.every(Number.isInteger)).toBe(true);
    expect(seedTimeOfDay("s01")).toBe(seedTimeOfDay("s01"));
    // Spread over the day rather than stuck at one hour
    expect(new Set(minutes.map((minute) => Math.floor(minute / 60))).size).toBe(11);
  });
});

describe("ammanInstant", () => {
  it("is the minute of the date in Amman, at UTC+3", () => {
    expect(ammanInstant("2026-10-09", 600).toISOString()).toBe("2026-10-09T07:00:00.000Z");
    expect(ammanInstant("2026-01-01", 0).toISOString()).toBe("2025-12-31T21:00:00.000Z");
    expect(ammanDate(ammanInstant("2026-10-09", 23 * 60 + 59))).toBe("2026-10-09");
  });

  it("refuses a minute outside the day, and a date that is not one", () => {
    expect(() => ammanInstant("2026-10-09", 24 * 60)).toThrow(RangeError);
    expect(() => ammanInstant("2026-10-09", -1)).toThrow(RangeError);
    expect(() => ammanInstant("2026-10-09", 1.5)).toThrow(RangeError);
    expect(() => ammanInstant("2026-02-30", 600)).toThrow(RangeError);
  });
});

describe("anchorSeedDates", () => {
  // S01's offsets (05-SEED-DATA §5.4)
  const s01 = seedOffsetsSchema.parse({
    published: -9,
    inspectedOn: -11,
    licenseExpiryMonths: 5,
    milestones: { inspected: -11, in_showroom: -9 },
  });

  it("dates S01 at the test clock: published nine days ago at its time of day", () => {
    const dates = anchorSeedDates(s01, "s01", TODAY);
    expect(inAmman(dates.publishedAt)).toStrictEqual(["2026-10-09", clock("s01")]);
    expect(dates).toMatchObject({
      soldAt: null,
      inspectedOn: "2026-10-07",
      licenseExpiry: "2027-03-01",
      milestoneMonths: { inspected: "2026-10-01", in_showroom: "2026-10-01" },
      priceChanges: [],
    });
  });

  it("dates S28's import milestones by their offsets, each as its month", () => {
    const s28 = seedOffsetsSchema.parse({
      published: -1,
      inspectedOn: -3,
      milestones: { shipped: -45, arrived_port: -35, free_zone: -33, inspected: -3 },
    });
    expect(anchorSeedDates(s28, "s28", TODAY)).toMatchObject({
      inspectedOn: "2026-10-15",
      licenseExpiry: null,
      milestoneMonths: {
        shipped: "2026-09-01",
        arrived_port: "2026-09-01",
        free_zone: "2026-09-01",
        inspected: "2026-10-01",
      },
    });
  });

  it("dates a sale and each price change at the car's time of day, with the prices before and after", () => {
    const offsets = seedOffsetsSchema.parse({
      published: -40,
      sold: -6,
      priceChanges: [
        { days: -20, from: 12_500, to: 11_900 },
        { days: -10, from: 11_900, to: 11_500 },
      ],
    });
    const dates = anchorSeedDates(offsets, "s11", TODAY);
    expect(dates.priceChanges.map(({ changedAt }) => inAmman(changedAt))).toStrictEqual([
      ["2026-09-28", clock("s11")],
      ["2026-10-08", clock("s11")],
    ]);
    expect(dates.priceChanges.map(({ oldPriceJod, newPriceJod }) => [oldPriceJod, newPriceJod])).toStrictEqual([
      [12_500, 11_900],
      [11_900, 11_500],
    ]);
    expect(inAmman(dates.soldAt)).toStrictEqual(["2026-10-12", clock("s11")]);
  });

  it("leaves out what a car has no offset for", () => {
    expect(anchorSeedDates(seedOffsetsSchema.parse({}), "s29", TODAY)).toStrictEqual({
      publishedAt: null,
      soldAt: null,
      inspectedOn: null,
      licenseExpiry: null,
      milestoneMonths: {},
      priceChanges: [],
    });
  });

  it("gives the same dates for the same day, and moves them with the day (§9.2's idempotence)", () => {
    expect(anchorSeedDates(s01, "s01", TODAY)).toStrictEqual(anchorSeedDates(s01, "s01", TODAY));
    // 22:30 UTC on the 17th is already the 18th in Amman
    expect(anchorSeedDates(s01, "s01", ammanDate(new Date("2026-10-17T22:30:00Z")))).toStrictEqual(
      anchorSeedDates(s01, "s01", TODAY),
    );
    const tomorrow = anchorSeedDates(s01, "s01", addDays(TODAY, 1));
    expect(inAmman(tomorrow.publishedAt)).toStrictEqual(["2026-10-10", clock("s01")]);
    expect(tomorrow.inspectedOn).toBe("2026-10-08");
  });
});
