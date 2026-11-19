import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarDescription } from "@/features/car-page/ui/description";
import type { Bilingual } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { CATALOGS } from "../../support/catalogs";
import { pageCopy } from "../../support/page-copy";
import { publicCar } from "../../support/public-car";

// Region H (DESIGN §7.2.3, FR-09): the dealer's description in the page's language, in a reading
// column, or the other language's with its language marked and a label saying so (BR-28). The
// section's frame, with its heading About this car, and leaving it out for a car whose dealer wrote
// none (FR-09's edge cases) are sections.test.tsx's.

const ARABIC = "مالك واحد، وصيانة لدى الوكالة.";
const ENGLISH = "One owner, serviced at the agency.";

function render(description: Bilingual, locale: AppLocale = "en") {
  return renderToStaticMarkup(<CarDescription car={publicCar({ description })} {...pageCopy(locale)} />);
}

describe("the description", () => {
  it("is the dealer's text in the page's language", () => {
    for (const locale of ["ar", "en"] as const) {
      const html = render({ ar: ARABIC, en: ENGLISH }, locale);
      expect(html, locale).toContain(`>${locale === "ar" ? ARABIC : ENGLISH}</p>`);
      expect(html, locale).not.toContain(CATALOGS[locale].car.description.onlyArabic);
      expect(html, locale).not.toContain(CATALOGS[locale].car.description.onlyEnglish);
    }
  });

  it("falls back to the other language's, marked as that language, with a label saying so (BR-28)", () => {
    const english = render({ ar: ARABIC, en: null });
    expect(english).toContain(`<p class="type-small text-muted">${en.car.description.onlyArabic}</p>`);
    expect(english).toMatch(new RegExp(`<p lang="ar" dir="rtl" class="[^"]*">${ARABIC}</p>`));
    const arabic = render({ ar: null, en: ENGLISH }, "ar");
    expect(arabic).toContain(`<p class="type-small text-muted">${ar.car.description.onlyEnglish}</p>`);
    expect(arabic).toMatch(new RegExp(`<p lang="en" dir="ltr" class="[^"]*">${ENGLISH}</p>`));
  });

  it("keeps the dealer's line breaks, in a reading column", () => {
    expect(render({ ar: null, en: "One owner.\nServiced at the agency." })).toMatch(
      /<p lang="en" dir="ltr" class="[^"]*\bmax-w-measure\b[^"]*\bwhitespace-pre-line\b[^"]*">One owner.\nServiced/,
    );
  });
});
