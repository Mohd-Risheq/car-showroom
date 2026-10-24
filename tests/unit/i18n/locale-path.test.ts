import { describe, expect, it } from "vitest";
import { localePrefixOf, pathInLocale } from "@/lib/i18n/locale-path";

// What a path's first segment says about its locale (FR-01.1, FR-01.2 and FR-01's edge cases), and
// the same page in the other locale (FR-01.4)

describe("localePrefixOf", () => {
  it.each([
    ["/ar", "ar", ""],
    ["/en/", "en", "/"],
    ["/ar/cars", "ar", "/cars"],
    ["/en/cars/toyota-rav4", "en", "/cars/toyota-rav4"],
  ] as const)("finds the site's locale in %s", (path, locale, rest) => {
    expect(localePrefixOf(path)).toStrictEqual({ kind: "site", locale, rest });
  });

  it.each(["/fr", "/fr/cars", "/de-AT/cars", "/zh-Hant-TW", "/en_GB/cars", "/AR/cars", "/En", "/ar-JO/cars"])(
    "reads %s as another locale's prefix",
    (path) => {
      expect(localePrefixOf(path)).toStrictEqual({ kind: "other" });
    },
  );

  // The site's own routes start with longer segments (SRS §11.3), so none reads as a locale
  it.each(["/", "/cars", "/cars/toyota", "/c/MU-24Q7", "/compare", "/dealer", "/dev/spin", "/arabic", "/e"])(
    "reads %s as unprefixed",
    (path) => {
      expect(localePrefixOf(path)).toStrictEqual({ kind: "none" });
    },
  );
});

describe("pathInLocale", () => {
  it("swaps the locale and keeps the rest of the path and the query", () => {
    expect(pathInLocale("/ar/cars", "fuel=hybrid", "en")).toBe("/en/cars?fuel=hybrid");
    expect(pathInLocale("/en/cars/toyota-rav4", "", "ar")).toBe("/ar/cars/toyota-rav4");
    expect(pathInLocale("/ar", "fuel=hybrid&sort=price", "en")).toBe("/en?fuel=hybrid&sort=price");
    expect(pathInLocale("/en/", "", "ar")).toBe("/ar");
  });

  it("puts a path without the site's locale under the new one, whole", () => {
    expect(pathInLocale("/fr/cars", "", "en")).toBe("/en/fr/cars");
    expect(pathInLocale("/", "", "ar")).toBe("/ar");
  });
});
