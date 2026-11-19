import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CAR_SECTIONS, CarSections } from "@/features/car-page/ui/sections";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import { CATALOGS } from "../../support/catalogs";
import { pageCopy } from "../../support/page-copy";
import { publicCar } from "../../support/public-car";

// The car page's sections under the stage (FR-09, DESIGN §7.2.3): the list each section's task adds
// its entry to (BUILD-PLAN §5.1), in FR-09's order, each section in a frame with its anchor and its
// heading (DESIGN §8.1), the reading sections' heading beside what they show from 1440 px, and left
// out, frame and all, for a car without what it shows

// FR-09's order of the sections under the stage, by their anchors: the inspection report, the engine
// sound, the 360° spin, the journey, the cost to run, the features, the description and the related
// cars, as DESIGN §8.1 names their headings
const FR_09_ORDER = ["inspection", "sound", "spin", "journey", "cost", "features", "description", "related"];

function render(car: PublicCarDTO, locale: AppLocale = "en") {
  return renderToStaticMarkup(<CarSections car={car} {...pageCopy(locale)} />);
}

/** Each section's opening tag and its heading, in the page's order */
const frames = (html: string) =>
  Array.from(html.matchAll(/(<section[^>]*>)<h2 class="([^"]*)">([^<]*)<\/h2>/g), ([, tag, classes, heading]) => ({
    tag,
    classes,
    heading,
  }));

/** The anchors of the sections the page shows, in its order */
const anchors = (html: string) => frames(html).map(({ tag }) => /\bid="([^"]*)"/.exec(tag ?? "")?.[1]);

describe("the car page's sections", () => {
  it("follow FR-09's order, so an entry added out of its place fails here", () => {
    const places = CAR_SECTIONS.map(({ id }) => FR_09_ORDER.indexOf(id));
    expect(places).not.toContain(-1);
    expect(places).toStrictEqual(places.toSorted((a, b) => a - b));
  });

  it("each sit in a frame with its anchor and its heading, which from 1440 px stands beside what it shows", () => {
    const tag = (id: string) =>
      `<section id="${id}" class="flex flex-col gap-8 xl:grid xl:grid-cols-12 xl:items-baseline xl:gap-x-gutter">`;
    for (const locale of ["ar", "en"] as const) {
      const { car } = CATALOGS[locale];
      const html = render(publicCar(), locale);
      expect(frames(html), locale).toStrictEqual([
        { tag: tag("features"), classes: "type-subhead xl:col-span-4", heading: car.features.title },
        { tag: tag("description"), classes: "type-subhead xl:col-span-4", heading: car.description.title },
      ]);
      // What each shows takes the eight columns after its heading's four
      expect(html.match(/<\/h2><div class="xl:col-span-8">/g), locale).toHaveLength(2);
    }
  });

  it("are left out, frame and all, for a car without what they show", () => {
    expect(anchors(render(publicCar({ features: [] })))).toStrictEqual(["description"]);
    expect(anchors(render(publicCar({ description: { ar: null, en: null } })))).toStrictEqual(["features"]);
    expect(render(publicCar({ features: [], description: { ar: null, en: null } }))).toBe("");
  });

  it("show a description written in either language, in both of the page's (BR-28)", () => {
    for (const description of [
      { ar: "مالك واحد.", en: null },
      { ar: null, en: "One owner." },
    ]) {
      for (const locale of ["ar", "en"] as const) {
        expect(anchors(render(publicCar({ description }), locale)), locale).toContain("description");
      }
    }
  });
});
