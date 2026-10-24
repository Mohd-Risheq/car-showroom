import { describe, expect, it } from "vitest";
import { formatNumber, formatPercent } from "@/lib/format/numbers";
import { LOCALES } from "@/lib/i18n/locales";

// BR-02: Western digits with thousands grouped, the same in both languages, and no direction marks,
// which ICU writes around a sign in Arabic and a browser's ICU need not write the same way

describe("formatNumber", () => {
  it("groups thousands with Western digits in both languages (TC-01-4)", () => {
    expect(formatNumber(14500, "ar")).toBe("14,500");
    expect(formatNumber(14500, "en")).toBe("14,500");
  });

  it.each([
    [1.36, 3, "1.360"],
    [0.108, 3, "0.108"],
    [2.5, 1, "2.5"],
    [6, 1, "6.0"],
    [1234567.89, 1, "1,234,567.9"],
    [999.5, 0, "1,000"],
  ])("writes %s with %s decimals as %s in both languages", (value, decimals, shown) => {
    for (const locale of LOCALES) expect(formatNumber(value, locale, decimals)).toBe(shown);
  });

  it("writes a negative number with a plain minus and no direction marks", () => {
    for (const locale of LOCALES) expect(formatNumber(-14500, locale)).toBe("-14,500");
  });

  it("writes no minus on a zero, such as a small negative number rounded away", () => {
    for (const locale of LOCALES) {
      expect(formatNumber(-0.4, locale)).toBe("0");
      expect(formatNumber(-0, locale)).toBe("0");
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("refuses %s", (value) => {
    expect(() => formatNumber(value, "ar")).toThrow(RangeError);
  });
});

describe("formatPercent", () => {
  it.each([
    [91, "91%"],
    [100, "100%"],
    [0, "0%"],
    [99.6, "100%"],
  ])("writes %s as %s in both languages, without direction marks", (percent, shown) => {
    for (const locale of LOCALES) expect(formatPercent(percent, locale)).toBe(shown);
  });

  it("refuses a value that isn't a number", () => {
    expect(() => formatPercent(Number.NaN, "en")).toThrow(RangeError);
  });
});
