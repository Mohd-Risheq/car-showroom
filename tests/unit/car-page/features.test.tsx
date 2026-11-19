import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarFeatures } from "@/features/car-page/ui/features";
import { FEATURE_GROUPS, type FeatureKey } from "@/lib/db/feature-keys";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import type { AppLocale } from "@/lib/i18n/locales";
import ar from "../../../messages/ar.json";
import { pageCopy } from "../../support/page-copy";
import { publicCar } from "../../support/public-car";

// Region G (DESIGN §7.2.3, FR-09): the car's features under their groups, Interior, Exterior and
// Technology, each in the feature catalog's order (SRS §6.4), in the columns featureColumns sets them
// in from 768 px, and each group's list in two columns on a phone from 360 px. The section's frame,
// with its heading, and leaving it out for a car without features are sections.test.tsx's.

/** A car's features, as many from each group as given, from the start of its list in the catalog */
const owning = (interior: number, exterior: number, technology: number): FeatureKey[] => [
  ...FEATURE_GROUPS.interior.slice(0, interior),
  ...FEATURE_GROUPS.exterior.slice(0, exterior),
  ...FEATURE_GROUPS.technology.slice(0, technology),
];

function render(car: PublicCarDTO, locale: AppLocale = "en") {
  return renderToStaticMarkup(<CarFeatures car={car} {...pageCopy(locale)} />);
}

/** Each group's heading and its features, as text */
const groups = (html: string) =>
  Array.from(html.matchAll(/<h3[^>]*>([^<]*)<\/h3><ul[^>]*>([\s\S]*?)<\/ul>/g), ([, heading, list]) => [
    heading,
    Array.from((list ?? "").matchAll(/<li[^>]*>([^<]*)<\/li>/g), ([, item]) => item),
  ]);

describe("the features", () => {
  it("list the car's features under their groups, in the catalog's order", () => {
    const car = publicCar({ features: ["carplay", "alloy_wheels", "abs", "airbags"] });
    expect(groups(render(car))).toStrictEqual([
      ["Interior", ["Airbags"]],
      ["Exterior", ["Alloy wheels"]],
      ["Technology", ["ABS", "Apple CarPlay"]],
    ]);
    expect(groups(render(car, "ar"))).toStrictEqual([
      [ar.car.features.interior, ["وسائد هوائية"]],
      [ar.car.features.exterior, ["جنطات"]],
      [ar.car.features.technology, ["نظام ABS", "Apple CarPlay"]],
    ]);
  });

  it("give each group a heading under the section's, at the lead step in weight 500", () => {
    for (const locale of ["ar", "en"] as const) {
      const headings = Array.from(
        render(publicCar(), locale).matchAll(/<h3 class="([^"]*)"/g),
        ([, classes]) => classes,
      );
      expect(headings, locale).toStrictEqual(["type-lead font-medium", "type-lead font-medium"]);
    }
  });

  it("stand the groups, whole, in the columns featureColumns gives from 768 px", () => {
    /** The groups' grid's tracks from 768 px */
    const tracks = (html: string) =>
      /^<div class="([^"]*)">/
        .exec(html)?.[1]
        ?.split(" ")
        .filter((name) => name.startsWith("md:grid-cols-"));
    const html = render(publicCar({ features: owning(6, 4, 10) }));
    expect(tracks(html)).toStrictEqual(["md:grid-cols-2"]);
    const columns = html.split('<div class="flex flex-col gap-8">').slice(1);
    expect(
      columns.map((column) => Array.from(column.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g), ([, heading]) => heading)),
    ).toStrictEqual([["Interior", "Exterior"], ["Technology"]]);
    expect(tracks(render(publicCar({ features: owning(3, 3, 3) })))).toStrictEqual(["md:grid-cols-3"]);
  });

  it("set a group's features in two columns from 360 px, and from 768 px in one, or in three in a lone column", () => {
    const listColumns = (car: PublicCarDTO) =>
      Array.from(render(car).matchAll(/<ul class="([^"]*)"/g), ([, classes]) =>
        classes?.split(" ").filter((name) => /^(\w+:)?columns-/.test(name)),
      );
    expect(listColumns(publicCar())).toStrictEqual([
      ["sm:columns-2", "md:columns-1"],
      ["sm:columns-2", "md:columns-1"],
    ]);
    expect(listColumns(publicCar({ features: owning(0, 0, 12) }))).toStrictEqual([["sm:columns-2", "md:columns-3"]]);
    // A feature never breaks between two columns
    expect(render(publicCar())).toMatch(/<li class="break-inside-avoid">Airbags<\/li>/);
  });

  it("leave out a group the car has none of", () => {
    expect(groups(render(publicCar({ features: ["airbags"] })))).toStrictEqual([["Interior", ["Airbags"]]]);
  });
});
