import { describe, expect, it } from "vitest";
import {
  calendarDate,
  calendarMonth,
  choices,
  decimal,
  fraction,
  integer,
  orNull,
  text,
} from "@/lib/validation/fields";
import { validate } from "@/lib/validation/issues";
import { z } from "@/lib/validation/zod";

// The field builders every schema uses: numbers typed in any digits (FR-31.5, SRS §7.1), text
// counted as Postgres counts it, and calendar dates

const char = (codePoint: number) => String.fromCodePoint(codePoint);
const arabicIndic = (digits: string) => digits.replace(/\d/g, (digit) => char(0x0660 + Number(digit)));
const persian = (digits: string) => digits.replace(/\d/g, (digit) => char(0x06f0 + Number(digit)));

/** The field's value, or its first issue */
function check(field: z.ZodType, value: unknown): unknown {
  const result = validate(z.object({ field }), { field: value });
  return result.ok ? result.data.field : result.fieldErrors.field?.[0];
}

describe("integer", () => {
  const km = integer({ min: 0, max: 1_500_000, issue: { key: "validation.km" } });
  const field = (value: unknown) => check(km, value);

  it("reads Arabic-Indic and Persian digits as Western digits (TC-31-4)", () => {
    expect(field(arabicIndic("14500"))).toBe(14500);
    expect(field(persian("14500"))).toBe(14500);
    expect(field(` ${arabicIndic("120")} `)).toBe(120);
  });

  it("takes a number as it is", () => {
    expect(field(0)).toBe(0);
    expect(field(1_500_000)).toBe(1_500_000);
    expect(field("14500.0")).toBe(14500);
  });

  it("refuses a value outside its range with the rule's message", () => {
    expect(field(-1)).toStrictEqual({ key: "validation.km" });
    expect(field(1_500_001)).toStrictEqual({ key: "validation.km" });
  });

  it("asks for a whole number", () => {
    expect(field(12.5)).toStrictEqual({ key: "validation.integer" });
    expect(field(arabicIndic("12") + char(0x066b) + "5")).toStrictEqual({ key: "validation.integer" });
  });

  it("calls an empty value required and anything else malformed", () => {
    for (const empty of ["", "  ", null, undefined]) expect(field(empty)).toStrictEqual({ key: "validation.required" });
    for (const malformed of ["1,000", "1e5", "twelve", "12 km", Number.NaN, Number.POSITIVE_INFINITY, true]) {
      expect(field(malformed), String(malformed)).toStrictEqual({ key: "validation.invalid" });
    }
  });
});

describe("decimal", () => {
  const litres = decimal({
    min: 1,
    max: 40,
    scale: 1,
    issue: { key: "validation.range", values: { min: 1, max: 40 } },
  });
  const degrees = decimal({ min: -90, max: 90, scale: 6, issue: { key: "validation.coordinates" } });

  it("rounds to the column's scale, half away from zero, as Postgres stores it", () => {
    expect(check(litres, "7.25")).toBe(7.3);
    expect(check(litres, 7.24)).toBe(7.2);
    expect(check(litres, 7.05)).toBe(7.1);
    expect(check(degrees, "-12.3456785")).toBe(-12.345679);
    expect(check(degrees, 31.9184)).toBe(31.9184);
    expect(check(degrees, "-0.0000004")).toBe(0);
  });

  it("checks the range after rounding", () => {
    expect(check(litres, 40.04)).toBe(40);
    expect(check(litres, 40.05)).toStrictEqual({ key: "validation.range", values: { min: 1, max: 40 } });
    expect(check(litres, 0.95)).toBe(1);
    expect(check(litres, 0.94)).toStrictEqual({ key: "validation.range", values: { min: 1, max: 40 } });
  });

  it("refuses a number whose own text has an exponent, as one under a millionth does", () => {
    for (const tiny of [1e-7, 5.551115123125783e-17, -1e-7]) {
      expect(check(fraction(), tiny), String(tiny)).toStrictEqual({ key: "validation.invalid" });
    }
    expect(check(fraction(), 0.0001)).toBe(0.0001);
  });

  it("reads the Arabic decimal separator", () => {
    expect(check(litres, arabicIndic("8") + char(0x066b) + arabicIndic("5"))).toBe(8.5);
  });

  it("calls an empty value required and anything else malformed", () => {
    expect(check(litres, "")).toStrictEqual({ key: "validation.required" });
    for (const malformed of ["8,5", ".5", "5.", "--5", Number.NaN]) {
      expect(check(litres, malformed), String(malformed)).toStrictEqual({ key: "validation.invalid" });
    }
  });
});

describe("text", () => {
  const trim = text({ max: 60 });
  const notes = text({ max: 20, multiline: true });

  it("trims", () => {
    expect(check(trim, "  GXR  ")).toBe("GXR");
  });

  it("counts characters as Postgres does, by code point", () => {
    const sixty = char(0x1f697).repeat(60);
    expect(check(trim, sixty)).toBe(sixty);
    expect(check(trim, `${sixty}a`)).toStrictEqual({ key: "validation.maxChars", values: { max: 60 } });
  });

  it("keeps a single-line field printable", () => {
    for (const unprintable of [`G${char(7)}XR`, "G\nXR", `G${char(0x2028)}XR`, `G${char(0xd800)}XR`]) {
      expect(check(trim, unprintable), JSON.stringify(unprintable)).toStrictEqual({ key: "validation.invalid" });
    }
  });

  it("keeps line breaks in a multi-line field, written as one character", () => {
    expect(check(notes, "First\r\nSecond")).toBe("First\nSecond");
    expect(check(notes, `Tab\tok`)).toBe("Tab\tok");
    expect(check(notes, `Bell${char(7)}`)).toStrictEqual({ key: "validation.invalid" });
  });

  it("turns every other mandatory line break into a line feed in a multi-line field (UAX #14)", () => {
    for (const lineBreak of [char(0x0b), char(0x0c), char(0x85), char(0x2028), char(0x2029), "\r"]) {
      expect(check(notes, `a${lineBreak}b`), lineBreak.codePointAt(0)?.toString(16)).toBe("a\nb");
      expect(check(trim, `a${lineBreak}b`), lineBreak.codePointAt(0)?.toString(16)).toStrictEqual({
        key: "validation.invalid",
      });
    }
  });

  it("can take its own message and a lower bound", () => {
    const name = text({ min: 2, max: 60, issue: { key: "validation.nameLength" } });
    expect(check(name, "M")).toStrictEqual({ key: "validation.nameLength" });
    expect(check(name, "Mu")).toBe("Mu");
    expect(check(name, "M".repeat(61))).toStrictEqual({ key: "validation.nameLength" });
  });

  it("calls an empty value required", () => {
    expect(check(trim, "   ")).toStrictEqual({ key: "validation.required" });
    expect(check(trim, 12)).toStrictEqual({ key: "validation.invalid" });
  });
});

describe("orNull", () => {
  const km = orNull(integer({ min: 0, max: 10, issue: { key: "validation.km" } }));

  it("reads an empty value as no value, and checks any other", () => {
    expect(check(km, "")).toBeNull();
    expect(check(km, " ")).toBeNull();
    expect(check(km, null)).toBeNull();
    expect(check(km, arabicIndic("7"))).toBe(7);
    expect(check(km, 11)).toStrictEqual({ key: "validation.km" });
  });

  it("still calls a missing value required, as a patch leaves out what it doesn't change", () => {
    expect(check(km, undefined)).toStrictEqual({ key: "validation.required" });
  });
});

describe("choices", () => {
  // A cap below the number of values, so a list can go past it with each value once
  const colours = choices(["red", "green", "blue"], { min: 1, max: 2 });

  it("takes from min to max of the values, each once", () => {
    expect(check(colours, ["blue", "red"])).toStrictEqual(["blue", "red"]);
    expect(check(colours, [])).toStrictEqual({ key: "validation.required" });
    expect(check(colours, ["red", "green", "blue"])).toStrictEqual({ key: "validation.invalid" });
    expect(check(colours, ["red", "red"])).toStrictEqual({ key: "validation.invalid" });
    expect(check(colours, ["red", "pink"])).toStrictEqual({ key: "validation.invalid" });
  });
});

describe("calendar dates", () => {
  it("takes a real date, in any digits", () => {
    expect(check(calendarDate(), "2028-02-29")).toBe("2028-02-29");
    expect(check(calendarDate(), arabicIndic("2027-01-05"))).toBe("2027-01-05");
    for (const wrong of ["2026-02-29", "2026-13-01", "2026-1-5", "05/01/2027", "2027-01-05T00:00:00Z"]) {
      expect(check(calendarDate(), wrong), wrong).toStrictEqual({ key: "validation.invalid" });
    }
  });

  it("refuses year 0000, which Postgres's date type can't hold", () => {
    expect(check(calendarDate(), "0000-01-01")).toStrictEqual({ key: "validation.invalid" });
    expect(check(calendarDate(), "0001-01-01")).toBe("0001-01-01");
    expect(check(calendarMonth(), "0000-03")).toStrictEqual({ key: "validation.invalid" });
    expect(check(calendarMonth(), "0001-03")).toBe("0001-03-01");
  });

  it("stores a month as its first day", () => {
    expect(check(calendarMonth(), "2027-03")).toBe("2027-03-01");
    expect(check(calendarMonth(), "2027-03-01")).toBe("2027-03-01");
    for (const wrong of ["2027-13", "2027-03-15", "2027-3", "March 2027"]) {
      expect(check(calendarMonth(), wrong), wrong).toStrictEqual({ key: "validation.invalid" });
    }
  });
});
