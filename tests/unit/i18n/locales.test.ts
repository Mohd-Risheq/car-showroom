import { describe, expect, it } from "vitest";
import { directionOf, isAppLocale, otherLocale } from "@/lib/i18n/locales";

// The site's two languages (C-03, FR-01.1), their directions (FR-01.3) and the switch between them
// (FR-01.4)

describe("isAppLocale", () => {
  it("takes exactly the site's locales", () => {
    expect(isAppLocale("ar")).toBe(true);
    expect(isAppLocale("en")).toBe(true);
  });

  it("takes nothing else, a language tag or another case included", () => {
    for (const value of [undefined, null, "", "AR", "En", "ar-JO", "en-US", "fr", 1, ["ar"]]) {
      expect(isAppLocale(value), String(value)).toBe(false);
    }
  });
});

describe("the two languages", () => {
  it("read right to left in Arabic and left to right in English", () => {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });

  it("each switch to the other", () => {
    expect(otherLocale("ar")).toBe("en");
    expect(otherLocale("en")).toBe("ar");
  });
});
