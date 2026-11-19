import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarActionBar } from "@/features/car-page/ui/car-action-bar";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import { CATALOGS } from "../../support/catalogs";
import { partOf } from "../../support/markup";
import { pageCopy } from "../../support/page-copy";
import { publicCar } from "../../support/public-car";

// FR-02.2's action bar on the car page, below 1024 px (DESIGN §7.1.1): the car's price in Martian
// Mono at the start, with the customs note while customs aren't paid (BR-45). A sold car's bar holds
// its way on to similar cars alone, across the bar, its struck price the title block's (FR-09.9,
// D-049). Contact is T-23's.

function render(car: PublicCarDTO, locale: AppLocale = "en") {
  return renderToStaticMarkup(<CarActionBar car={car} {...pageCopy(locale)} />);
}

/** The bar's start, which holds the price */
const startOf = (html: string) => partOf(html, /<div class="min-w-0">([\s\S]*?)<\/div><div class="[^"]*">/, "price");

/** What the bar holds */
const partsOf = (html: string) => partOf(html, /^<div [^>]*>([\s\S]*)<\/div>$/, "bar");

/** The bar's end, which holds its actions */
const endOf = (html: string) => partOf(html, /<div class="[^"]*\bshrink-0\b[^"]*">([\s\S]*?)<\/div><\/div>$/, "end");

describe("the car page's action bar", () => {
  it("holds the car's price at its start, in Martian Mono at the lead step with its unit muted at the body step (FR-02.2)", () => {
    for (const locale of ["ar", "en"] as const) {
      const start = startOf(render(publicCar(), locale));
      expect(start, locale).toContain(
        '<p class="flex flex-wrap items-baseline gap-x-2 type-lead"><span class="whitespace-nowrap"><bdi dir="ltr" class="figures">48,500</bdi>',
      );
      expect(start, locale).toContain(
        `<span aria-hidden="true" class="text-muted type-body">${CATALOGS[locale].format.unit.jod}</span>`,
      );
      expect(start, locale).not.toContain("<s>");
      expect(start, locale).not.toContain(CATALOGS[locale].car.priceBeforeCustoms);
    }
  });

  it("says the price is before customs while customs aren't paid (BR-45)", () => {
    for (const locale of ["ar", "en"] as const) {
      expect(startOf(render(publicCar({ customsStatus: "not_cleared" }), locale)), locale).toContain(
        `<span class="type-small text-muted">${CATALOGS[locale].car.priceBeforeCustoms}</span>`,
      );
    }
  });

  it("holds a sold car's way on to similar cars alone, the struck price the title block's (FR-09.9, D-049)", () => {
    for (const locale of ["ar", "en"] as const) {
      // The customs note goes with the price, so a car not yet cleared shows the same
      for (const customsStatus of ["cleared", "not_cleared"] as const) {
        const html = render(publicCar({ status: "sold", customsStatus }), locale);
        const link = `<a class="[^"]*" href="/${locale}/cars\\?body=suv&amp;priceMin=38800&amp;priceMax=58200">`;
        expect(partsOf(html), `${locale} ${customsStatus}`).toMatch(
          new RegExp(`^<div class="[^"]*">${link}${CATALOGS[locale].car.findSimilar}</a></div>$`),
        );
      }
    }
  });

  it("holds no action for a car on sale, where T-23's contact will go (BUILD-PLAN §5.4)", () => {
    for (const status of ["published", "reserved"] as const) {
      expect(endOf(render(publicCar({ status }))), status).toBe("");
    }
  });
});
