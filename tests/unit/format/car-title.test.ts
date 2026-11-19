import { describe, expect, it } from "vitest";
import { carTitle, carTitleLines } from "@/lib/format/car-title";
import { isolateScripts } from "@/lib/i18n/bidi";
import { LEFT_TO_RIGHT_ISOLATE, POP_DIRECTIONAL_ISOLATE, RIGHT_TO_LEFT_ISOLATE } from "../../support/marks";

// The car title (SRS FR-06, FR-09): year, make, model and trim, in the language the names are given
// in, with the trim, which has one spelling for both languages, each of its scripts' parts in an
// isolate of its own (FR-01.8, DESIGN §10.3).

describe("carTitle", () => {
  it("names the year, make, model and trim, in that order", () => {
    expect(carTitle({ modelYear: 2021, make: "Toyota", model: "Corolla", trim: "Hybrid" })).toBe(
      `2021 Toyota Corolla ${isolateScripts("Hybrid")}`,
    );
    expect(carTitle({ modelYear: 2022, make: "فولكس فاجن", model: "ID.4", trim: "Crozz Pure+" })).toBe(
      `2022 فولكس فاجن ID.4 ${isolateScripts("Crozz Pure+")}`,
    );
  });

  it("isolates the trim's Latin part and its Arabic part each in its direction (DESIGN §10.3)", () => {
    expect(
      carTitle({ modelYear: 2016, make: "مرسيدس بنز", model: "الفئة E", trim: "E 300 AMG لاين نايت باكيج كوبيه" }),
    ).toBe(
      `2016 مرسيدس بنز الفئة E ${LEFT_TO_RIGHT_ISOLATE}E 300 AMG${POP_DIRECTIONAL_ISOLATE} ${RIGHT_TO_LEFT_ISOLATE}لاين نايت باكيج كوبيه${POP_DIRECTIONAL_ISOLATE}`,
    );
  });

  it("leaves out a trim the car doesn't have, and never groups the year's digits", () => {
    expect(carTitle({ modelYear: 2024, make: "BYD", model: "Atto 3", trim: null })).toBe("2024 BYD Atto 3");
    expect(carTitle({ modelYear: 2017, make: "تويوتا", model: "بريوس", trim: "" })).toBe("2017 تويوتا بريوس");
  });
});

describe("carTitleLines", () => {
  it("gives the title's lines, as the car page's h1 sets them: the year and the make, the model, the trim", () => {
    expect(carTitleLines({ modelYear: 2021, make: "Toyota", model: "Corolla", trim: "Hybrid" })).toStrictEqual({
      lead: "2021 Toyota",
      model: "Corolla",
      trim: isolateScripts("Hybrid"),
    });
    expect(carTitleLines({ modelYear: 2022, make: "فولكس فاجن", model: "ID.4", trim: "Crozz Pure+" })).toStrictEqual({
      lead: "2022 فولكس فاجن",
      model: "ID.4",
      trim: isolateScripts("Crozz Pure+"),
    });
  });

  it("gives no trim line for a trim the car doesn't have", () => {
    for (const trim of [null, ""]) {
      expect(carTitleLines({ modelYear: 2024, make: "BYD", model: "Atto 3", trim }).trim, String(trim)).toBeNull();
    }
  });
});
