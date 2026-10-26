import { describe, expect, it } from "vitest";
import { mileageCheck } from "@/features/car-page/domain/mileage-check";

// BR-06: kilometres a year since 1 January of the model year, at least half a year, against the
// dealer's bands

const BANDS = { low: 12_000, high: 25_000 };
const used = (modelYear: number, mileageKm: number) => ({ condition: "used" as const, modelYear, mileageKm });

describe("BR-06: the mileage check", () => {
  it("finds low and high with the clock fixed at 2026-10-18 (TC-09-3)", () => {
    expect(mileageCheck(used(2019, 30_000), "2026-10-18", BANDS)?.band).toBe("low");
    expect(mileageCheck(used(2015, 300_000), "2026-10-18", BANDS)?.band).toBe("high");
  });

  it("reports the kilometres a year, rounded", () => {
    // 2,847 days since 1 Jan 2019 is 7.7947 years
    expect(mileageCheck(used(2019, 30_000), "2026-10-18", BANDS)?.kmPerYear).toBe(3849);
  });

  it("keeps the figure inside its band, as car.mileage.info shows it beside the bands", () => {
    // 25,000.06 and 11,999.75 km a year would round onto the edges, which are typical
    expect(mileageCheck(used(2019, 194_867), "2026-10-18", BANDS)).toStrictEqual({ band: "high", kmPerYear: 25_001 });
    expect(mileageCheck(used(2019, 93_534), "2026-10-18", BANDS)).toStrictEqual({ band: "low", kmPerYear: 11_999 });
  });

  it("counts a car of this year as half a year old, so its first months aren't judged on days", () => {
    expect(mileageCheck(used(2026, 5_999), "2026-03-01", BANDS)).toStrictEqual({ band: "low", kmPerYear: 11_998 });
    expect(mileageCheck(used(2026, 6_000), "2026-03-01", BANDS)).toStrictEqual({ band: "typical", kmPerYear: 12_000 });
    expect(mileageCheck(used(2026, 12_500), "2026-03-01", BANDS)).toStrictEqual({ band: "typical", kmPerYear: 25_000 });
    expect(mileageCheck(used(2026, 12_501), "2026-03-01", BANDS)).toStrictEqual({ band: "high", kmPerYear: 25_002 });
  });

  it("counts a model year that starts after today as half a year old too", () => {
    expect(mileageCheck(used(2027, 100), "2026-10-18", BANDS)).toStrictEqual({ band: "low", kmPerYear: 200 });
  });

  it("follows the dealer's own bands", () => {
    expect(mileageCheck(used(2026, 4_000), "2026-03-01", { low: 5_000, high: 7_000 })?.band).toBe("high");
  });

  it("gives a new car no check", () => {
    expect(mileageCheck({ condition: "new", modelYear: 2026, mileageKm: 10 }, "2026-10-18", BANDS)).toBeNull();
  });

  it("refuses a today that is no calendar date", () => {
    expect(() => mileageCheck(used(2019, 30_000), "2026-10-1", BANDS)).toThrow(RangeError);
    expect(() => mileageCheck(used(2019, 30_000), "2026-02-30", BANDS)).toThrow(RangeError);
    // A month or a year alone parses and reads back, so only the pattern refuses them
    expect(() => mileageCheck(used(2019, 30_000), "2026-10", BANDS)).toThrow(RangeError);
    expect(() => mileageCheck(used(2019, 30_000), "2026", BANDS)).toThrow(RangeError);
  });
});
