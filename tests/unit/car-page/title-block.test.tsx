import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { carTitleIn } from "@/features/car-page/domain/title";
import { TitleBlock } from "@/features/car-page/ui/title-block";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { CATALOGS } from "../../support/catalogs";
import { NO_BREAK_SPACE } from "../../support/marks";
import { element, textOf } from "../../support/markup";
import { pageCopy, wordsBefore } from "../../support/page-copy";
import { publicCar } from "../../support/public-car";

// FR-09's title block (DESIGN §7.2.3): the car's title as the page's h1, its reference, its price
// with the price-drop note (BR-05) and the customs label (BR-45), the band of a reserved or sold car,
// a sold car's way on to similar cars (FR-09.9), and Share (FR-09.11)

const URL = "https://showroom.example/en/cars/2019-toyota-land-cruiser-gxr-mu-3hk8";

function render(car: PublicCarDTO, locale: AppLocale = "en") {
  return renderToStaticMarkup(<TitleBlock car={car} url={URL} {...pageCopy(locale)} />);
}

describe("the title", () => {
  it("is the car's title, read whole, with the model name at the display step", () => {
    for (const locale of ["ar", "en"] as const) {
      const h1 = element(render(publicCar(), locale), "h1");
      expect(textOf(h1), locale).toBe(carTitleIn(publicCar(), locale));
      // In a container of its own, which model-names.css measures in the name's ems, and naming its
      // model, which a long name's narrower letters select (D-049)
      expect(h1, locale).toContain(
        '<span class="model-name"><span class="block type-display" data-model="toyota-land-cruiser">' +
          `${publicCar().modelName[locale]}</span></span>`,
      );
    }
  });

  it("isolates each of a trim's scripts, as the title does (DESIGN §10.3)", () => {
    const car = publicCar({ trim: "E 300 AMG لاين نايت" });
    for (const locale of ["ar", "en"] as const) {
      expect(textOf(element(render(car, locale), "h1")), locale).toBe(carTitleIn(car, locale));
    }
  });

  it("goes without a trim the car doesn't have", () => {
    for (const trim of [null, ""]) {
      const car = publicCar({ trim });
      expect(textOf(element(render(car), "h1"))).toBe("2019 Toyota Land Cruiser");
    }
  });
});

describe("the reference", () => {
  it("is left to right in Martian Mono, in Arabic too (DESIGN §9.5), at the body step", () => {
    const code = '<bdi dir="ltr" class="figures">MU-3HK8</bdi>';
    expect(render(publicCar(), "ar")).toContain(`<p class="mt-2 type-body text-muted">رقم الإعلان ${code}</p>`);
    expect(render(publicCar())).toContain(`<p class="mt-2 type-body text-muted">Ref. ${code}</p>`);
  });
});

describe("the price", () => {
  it("is the car's price, its figures in Martian Mono at the subhead step and its unit muted at the body step (DESIGN §7.2.3)", () => {
    const line =
      '<p class="flex flex-wrap items-baseline gap-x-3 gap-y-1 type-subhead"><span class="whitespace-nowrap">';
    expect(render(publicCar())).toContain(
      `${line}<bdi dir="ltr" class="figures">48,500</bdi>${NO_BREAK_SPACE}<span aria-hidden="true" class="text-muted type-body">JOD</span>`,
    );
    expect(render(publicCar(), "ar")).toContain(
      `${line}<bdi dir="ltr" class="figures">48,500</bdi>${NO_BREAK_SPACE}<span aria-hidden="true" class="text-muted type-body">د.أ</span>`,
    );
  });

  it("says it is before customs and registration while customs aren't paid (BR-45)", () => {
    expect(render(publicCar({ customsStatus: "not_cleared" }))).toContain(en.car.priceBeforeCustoms);
    expect(render(publicCar({ customsStatus: "not_cleared" }), "ar")).toContain(ar.car.priceBeforeCustoms);
    expect(render(publicCar({ customsStatus: "cleared" }))).not.toContain(en.car.priceBeforeCustoms);
  });

  it("notes a recent drop, with the old price as screen readers say it too (BR-05)", () => {
    const drop = { fromJod: 52_000, on: Date.UTC(2026, 9, 20, 12), badge: true };
    const english = render(publicCar({ priceDrop: drop }));
    expect(english).toContain(
      `<span aria-hidden="true">Price reduced from 52,000${NO_BREAK_SPACE}JOD on 20 Oct 2026</span>` +
        `<span class="sr-only">Price reduced from 52,000${NO_BREAK_SPACE}Jordanian dinars on 20 Oct 2026</span>`,
    );
    expect(render(publicCar({ priceDrop: drop }), "ar")).toContain(
      `<span aria-hidden="true">خُفّض السعر من 52,000${NO_BREAK_SPACE}د.أ بتاريخ 20 تشرين الأول 2026</span>`,
    );
    expect(render(publicCar())).not.toContain(wordsBefore(en.car.priceReduced));
  });

  it("has a Price dropped badge for the first 14 days of a drop (the owner, 2026-11-02)", () => {
    const drop = { fromJod: 52_000, on: Date.UTC(2026, 9, 20, 12), badge: true };
    const badge = (html: string) => /<span class="[^"]*\brounded-full\b[^"]*">([^<]*)<\/span>/.exec(html)?.[1];
    expect(badge(render(publicCar({ priceDrop: drop })))).toBe(en.card.priceDropped);
    expect(badge(render(publicCar({ priceDrop: drop }), "ar"))).toBe(ar.card.priceDropped);
    // After 14 days the note stays and the badge goes
    const older = render(publicCar({ priceDrop: { ...drop, badge: false } }));
    expect(older).toContain(wordsBefore(en.car.priceReduced));
    expect(badge(older)).toBeUndefined();
    expect(badge(render(publicCar()))).toBeUndefined();
  });

  it("is muted once the car is sold, its figures struck through, and only then", () => {
    // One line through the figures alone, in their face: a strike of the whole price crossed figures
    // and a unit of two sizes, which Chromium drew in three pieces at three heights (D-049)
    expect(render(publicCar({ status: "sold" }))).toContain(
      '<s class="text-muted no-underline"><span class="whitespace-nowrap">' +
        '<bdi dir="ltr" class="figures line-through decoration-from-font">',
    );
    for (const status of ["published", "reserved"] as const)
      expect(render(publicCar({ status }))).not.toMatch(/<s[ >]|line-through/);
  });
});

describe("the status band", () => {
  it("asks a reserved car's buyers to join the waiting list, on the --warn hatch", () => {
    for (const locale of ["ar", "en"] as const) {
      const html = render(publicCar({ status: "reserved" }), locale);
      expect(html, locale).toMatch(
        new RegExp(`class="[^"]*\\bhatch\\b[^"]*"><span[^>]*>${CATALOGS[locale].car.reserved}<`),
      );
    }
  });

  it("says a sold car is sold, on --surface-3", () => {
    expect(render(publicCar({ status: "sold" }))).toMatch(/class="[^"]*\bbg-surface-3\b[^"]*">Sold</);
    expect(render(publicCar({ status: "sold" }), "ar")).toContain(`>${ar.car.sold}<`);
  });

  it("is left out while the car is for sale", () => {
    const html = render(publicCar());
    expect(html).not.toContain(en.car.reserved);
    expect(textOf(html)).not.toContain(en.car.sold);
  });

  it("comes after the title for screen readers, and shows above it", () => {
    const html = render(publicCar({ status: "reserved" }));
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf(en.car.reserved));
    expect(html).toMatch(/<p class="[^"]*\border-first\b[^"]*\bhatch\b/);
  });
});

describe("a sold car's way on", () => {
  it("leads to cars of its body type within a fifth of its price (FR-09.9)", () => {
    expect(render(publicCar({ status: "sold" }))).toContain(
      `href="/en/cars?body=suv&amp;priceMin=38800&amp;priceMax=58200"`,
    );
    expect(render(publicCar({ status: "sold" }), "ar")).toContain(`>${ar.car.findSimilar}</a>`);
  });

  it("is the title block's from 1024 px only, as a phone's action bar holds it", () => {
    const link = /<a [^>]*class="([^"]*)"[^>]*>Find a similar car<\/a>/.exec(render(publicCar({ status: "sold" })));
    const classes = link?.[1]?.split(" ") ?? [];
    expect(classes).toContain("hidden");
    expect(classes).toContain("lg:inline-flex");
    // A display of its own would show it on a phone, whichever comes later in the stylesheet
    expect(classes).not.toContain("inline-flex");
  });

  it("isn't offered for a car still for sale", () => {
    for (const status of ["published", "reserved"] as const) {
      expect(render(publicCar({ status }))).not.toContain(en.car.findSimilar);
    }
  });
});

describe("Share", () => {
  it("is a button named Share in the page's language", () => {
    expect(textOf(element(render(publicCar()), "button"))).toBe(en.car.share);
    expect(textOf(element(render(publicCar(), "ar"), "button"))).toBe(ar.car.share);
  });
});
