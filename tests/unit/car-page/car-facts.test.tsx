import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarFacts } from "@/features/car-page/ui/car-facts";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import { isolate } from "@/lib/i18n/bidi";
import type { AppLocale } from "@/lib/i18n/locales";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { CATALOGS } from "../../support/catalogs";
import { LEFT_TO_RIGHT_MARK, NO_BREAK_SPACE } from "../../support/marks";
import { element } from "../../support/markup";
import { pageCopy, wordsBefore } from "../../support/page-copy";
import { publicCar } from "../../support/public-car";

// FR-09's facts under the title block (DESIGN §7.2.3), between two rules: the key facts as a
// definition list of cells, labels muted over values in ink, with numbers and codes in Martian Mono
// (FR-09.3); the mileage check, which opens to its rule (FR-09.4, BR-06); battery health and how it
// was measured (FR-09.5); and the agency warranty.

// A VIN the dealer shows, in no VIN's shape, as this file is public
const SHOWN_VIN = "VIN SHOWN BY THE DEALER";

function render(car: PublicCarDTO, locale: AppLocale = "en") {
  return renderToStaticMarkup(<CarFacts car={car} {...pageCopy(locale)} />);
}

/** What the page shows of the markup: its text, without the tags or what only screen readers get */
const shown = (html: string) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, "").replace(/<[^>]*>/g, "");

/** The key facts' terms and their descriptions, as the page shows them */
const rows = (html: string) =>
  Array.from(element(html, "dl").matchAll(/<dt[^>]*>([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g), ([, term, value]) => [
    shown(term ?? ""),
    shown(value ?? ""),
  ]);

describe("the key facts", () => {
  it("list each fact under its label in English (FR-09.3)", () => {
    expect(rows(render(publicCar()))).toStrictEqual([
      ["Kilometres", `64,000${NO_BREAK_SPACE}km`],
      ["Model year", "2019"],
      ["Fuel", "Petrol"],
      ["Transmission", "Automatic"],
      ["Regional specs", "GCC specs"],
      ["Customs", "Customs paid"],
      ["Licence valid until", "Mar 2027"],
      ["Insurance", "Comprehensive"],
      ["Owners", "1"],
      ["Seats", "7"],
      ["Engine size", `4.0${NO_BREAK_SPACE}L`],
      ["Drivetrain", "4x4"],
      ["Exterior colour", "Pearl white"],
      ["Interior colour", "Beige"],
    ]);
  });

  it("list each fact under its label in Arabic", () => {
    const field = ar.field;
    expect(rows(render(publicCar(), "ar"))).toStrictEqual([
      [field.km, `64,000${NO_BREAK_SPACE}كم`],
      [field.year, "2019"],
      [field.fuel, ar.enum.fuel_type.gasoline],
      [field.transmission, ar.enum.transmission.automatic],
      [field.regionalSpecs, ar.enum.regional_specs.gcc],
      [field.customs, ar.enum.customs_status.cleared],
      [field.licenceUntil, "آذار 2027"],
      [field.insurance, ar.enum.insurance_type.comprehensive],
      [field.owners, "1"],
      [field.seats, "7"],
      [field.engineSize, `4.0${NO_BREAK_SPACE}لتر`],
      [field.drivetrain, ar.enum.drivetrain.four_wd],
      [field.exteriorColour, "أبيض لؤلؤي"],
      [field.interiorColour, "بيج"],
    ]);
  });

  it("stand, with the checks under them, between a --line rule above and one below, as a table's rules (D-049)", () => {
    for (const locale of ["ar", "en"] as const) {
      expect(render(publicCar(), locale), locale).toMatch(
        /^<div class="flex flex-col gap-4 border-y border-line py-5 lg:py-6"><section>/,
      );
    }
  });

  it("sit under a heading screen readers find, which the page doesn't show", () => {
    for (const locale of ["ar", "en"] as const) {
      expect(render(publicCar(), locale), locale).toContain(
        `<h2 class="sr-only">${CATALOGS[locale].car.facts.title}</h2>`,
      );
    }
  });

  it("set numbers and the VIN in Martian Mono, left to right (DESIGN §3.3, §9.5)", () => {
    const html = render(publicCar({ vin: SHOWN_VIN }), "ar");
    for (const figures of ["64,000", "2019", "1", "7", "4.0", SHOWN_VIN]) {
      expect(html, figures).toContain(`<bdi dir="ltr" class="figures">${figures}</bdi>`);
    }
    expect(rows(html).at(-1)).toStrictEqual([ar.field.vin, SHOWN_VIN]);
  });

  it("show labels muted and values in ink", () => {
    const html = render(publicCar());
    expect(element(html, "dt")).toMatch(/^<dt class="type-small text-muted">/);
    expect(element(html, "dd")).toMatch(/^<dd class="type-body">/);
  });

  it("set each value under its label in a cell: one column under 360 px, two from 360, three from 768, two from 1024", () => {
    const html = render(publicCar());
    const list = /^<dl class="([^"]*)"/.exec(element(html, "dl"))?.[1]?.split(" ") ?? [];
    expect(list.filter((name) => /^(\w+:)?grid-cols-/.test(name))).toStrictEqual([
      "sm:grid-cols-2",
      "md:grid-cols-3",
      "lg:grid-cols-2",
    ]);
    const cells = Array.from(html.matchAll(/<div class="([^"]*)"><dt/g), ([, classes]) => classes?.split(" ") ?? []);
    expect(cells).toHaveLength(14);
    for (const classes of cells) {
      expect(classes).toContain("flex-col");
      expect(classes).not.toContain("col-span-full");
    }
  });

  it("put the VIN in a cell across the list, as its figures read as one and fill a phone's column", () => {
    const html = render(publicCar({ vin: SHOWN_VIN }));
    const vinCell = /<div class="([^"]*)"><dt[^>]*>VIN<\/dt>/.exec(html)?.[1]?.split(" ");
    expect(vinCell).toContain("col-span-full");
    expect(vinCell).toContain("flex-col");
  });

  it("leave out each fact the car hasn't got, never showing N/A", () => {
    const unnamed = { ar: null, en: null };
    const car = publicCar({
      ownersCount: null,
      seats: null,
      engineCc: null,
      drivetrain: null,
      exteriorColorName: unnamed,
      interiorColorName: unnamed,
    });
    const html = render(car);
    expect(rows(html).map(([term]) => term)).toStrictEqual([
      "Kilometres",
      "Model year",
      "Fuel",
      "Transmission",
      "Regional specs",
      "Customs",
      "Licence valid until",
      "Insurance",
    ]);
    expect(shown(html)).not.toMatch(/N\/A/);
  });

  it("say whether the car is licensed when there is no month to give", () => {
    expect(rows(render(publicCar({ licenseStatus: "unlicensed", licenseExpiry: null })))).toContainEqual([
      "Licence",
      "Not licensed",
    ]);
    expect(rows(render(publicCar({ licenseExpiry: null }), "ar"))).toContainEqual([
      ar.field.licence,
      ar.enum.license_status.licensed,
    ]);
  });

  it("name an electric car's engine as its electric motor (the owner, 2026-11-02)", () => {
    const car = publicCar({ fuelType: "electric", engineCc: 0 });
    expect(rows(render(car))).toContainEqual(["Engine size", en.car.facts.electricMotor]);
    expect(rows(render(car, "ar"))).toContainEqual([ar.field.engineSize, ar.car.facts.electricMotor]);
  });

  it("mark a colour named only in the other language with its language and direction (BR-28)", () => {
    const html = render(publicCar({ exteriorColorName: { ar: null, en: "Pearl white" } }), "ar");
    expect(html).toContain('<span lang="en" dir="ltr">Pearl white</span>');
    expect(render(publicCar(), "ar")).toContain('<span lang="ar" dir="rtl">أبيض لؤلؤي</span>');
  });
});

describe("the mileage check", () => {
  it("says how the car's kilometres a year compare for its age, and opens to the rule (FR-09.4)", () => {
    const html = render(publicCar());
    expect(shown(element(html, "summary"))).toBe(en.car.mileage.low);
    expect(element(html, "details")).toContain(
      `About ${isolate("11,016")}${NO_BREAK_SPACE}km a year since ${isolate("2019")}. ` +
        `Typical is ${isolate("12,000")} to ${isolate("25,000")}${NO_BREAK_SPACE}km a year.`,
    );
  });

  it("names each band in the page's language", () => {
    for (const band of ["low", "typical", "high"] as const) {
      const check = { band, kmPerYear: 18_000, low: 12_000, high: 25_000 };
      expect(shown(element(render(publicCar({ mileageCheck: check }), "ar"), "summary")), band).toBe(
        ar.car.mileage[band],
      );
    }
  });

  it("opens from a 44 px target, without the browser's marker", () => {
    const summary = element(render(publicCar()), "summary");
    expect(summary).toMatch(/^<summary class="[^"]*\bmin-h-11\b[^"]*\blist-none\b/);
    expect(summary).toContain('aria-hidden="true"');
  });

  it("is left out for a new car (BR-06)", () => {
    expect(render(publicCar({ condition: "new", mileageKm: 0, mileageCheck: null }))).not.toContain("<details");
  });
});

describe("battery health", () => {
  const battery = { pct: 91, source: "diagnostic_scan" } as const;

  it("shows a hybrid's percentage and how it was measured (FR-09.5, TC-09-5)", () => {
    const english = shown(render(publicCar({ fuelType: "hybrid", battery })));
    expect(english).toContain(`Battery health ${LEFT_TO_RIGHT_MARK}91%`);
    expect(english).toContain("Source: Diagnostic scan");
    const arabic = shown(render(publicCar({ fuelType: "hybrid", battery }), "ar"));
    expect(arabic).toContain(`صحة البطارية ${LEFT_TO_RIGHT_MARK}91%`);
    expect(arabic).toContain(`المصدر: ${ar.enum.soh_source.diagnostic_scan}`);
  });

  it("sets the percentage in Martian Mono, read left to right with its sign, as 91% in Arabic too", () => {
    expect(render(publicCar({ fuelType: "electric", battery }), "ar")).toContain(
      `صحة البطارية <span class="figures">${LEFT_TO_RIGHT_MARK}91</span>%`,
    );
  });

  it("draws a bar as full as the battery, which screen readers skip as the words say it", () => {
    expect(render(publicCar({ fuelType: "plugin_hybrid", battery }))).toMatch(
      /<div aria-hidden="true" class="[^"]*"><div class="[^"]*" style="inline-size:91%"><\/div><\/div>/,
    );
  });

  it("is left out for a car without it, and for one that burns fuel alone", () => {
    expect(render(publicCar({ fuelType: "hybrid", battery: null }))).not.toContain(wordsBefore(en.car.battery));
    expect(render(publicCar({ fuelType: "gasoline", battery }))).not.toContain(wordsBefore(en.car.battery));
  });
});

describe("the agency warranty", () => {
  it("says until when the agency's warranty runs", () => {
    expect(shown(render(publicCar({ warrantyUntil: "2030-05-01" })))).toContain("Agency warranty until 1 May 2030");
    expect(shown(render(publicCar({ warrantyUntil: "2030-05-01" }), "ar"))).toContain("كفالة الوكالة حتى 1 أيار 2030");
  });

  it("is left out for a car without one", () => {
    expect(render(publicCar())).not.toContain(wordsBefore(en.car.warranty));
  });
});
