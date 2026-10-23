import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { appLocaleOf, INTL_LOCALE, TIME_ZONE } from "@/lib/i18n/intl-locale";
import { routing } from "@/lib/i18n/routing";

// next-intl formats with the locales BR-02 and BR-03 name, not the URL's ar and en (D-040)

// A plural with each of Arabic's six forms, as the catalogs write them (NFR-I18N-03)
const PHOTOS = "{count, plural, zero {لا صور} one {صورة واحدة} two {صورتان} few {# صور} many {# صورة} other {# صورة}}";
// 18 October 2026, at noon in Amman
const DAY = new Date(Date.UTC(2026, 9, 18, 9));

describe("the formatting locale", () => {
  it("writes a plural's number in Arabic with Western digits (BR-02)", () => {
    const t = createTranslator({ locale: INTL_LOCALE.ar, messages: { photos: PHOTOS } });
    expect(t("photos", { count: 1234 })).toBe("1,234 صورة");
    expect(t("photos", { count: 5 })).toBe("5 صور");
  });

  it("owes its digits to the -u-nu-latn extension: Jordan's Arabic alone writes Arabic-Indic ones", () => {
    const t = createTranslator({ locale: "ar-JO", messages: { photos: PHOTOS } });
    expect(t("photos", { count: 5 })).toBe("٥ صور");
  });

  it("writes Levantine month names in Arabic and British dates in English, in Amman's time (BR-03)", () => {
    const date = (locale: string) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(
        DAY,
      );
    expect(date(INTL_LOCALE.ar)).toBe("18 تشرين الأول 2026");
    expect(date(INTL_LOCALE.en)).toBe("18 Oct 2026");
  });

  it("maps back to the URL's locale, and refuses a language the site doesn't have", () => {
    for (const locale of routing.locales) expect(appLocaleOf(INTL_LOCALE[locale])).toBe(locale);
    expect(() => appLocaleOf("fr-FR")).toThrow("No locale of the site formats as fr-FR");
  });
});
