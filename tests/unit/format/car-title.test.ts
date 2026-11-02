import { describe, expect, it } from "vitest";
import { carTitle } from "@/lib/format/car-title";
import { isolate } from "@/lib/i18n/bidi";

// The car title (SRS FR-06, FR-09): year, make, model and trim, in the language the names are given
// in, with the trim, which has one spelling for both languages, in an isolate (FR-01.8).

describe("carTitle", () => {
  it("names the year, make, model and trim, in that order", () => {
    expect(carTitle({ modelYear: 2021, make: "Toyota", model: "Corolla", trim: "Hybrid" })).toBe(
      `2021 Toyota Corolla ${isolate("Hybrid")}`,
    );
    expect(carTitle({ modelYear: 2022, make: "فولكس فاجن", model: "ID.4", trim: "Crozz Pure+" })).toBe(
      `2022 فولكس فاجن ID.4 ${isolate("Crozz Pure+")}`,
    );
  });

  it("leaves out a trim the car doesn't have, and never groups the year's digits", () => {
    expect(carTitle({ modelYear: 2024, make: "BYD", model: "Atto 3", trim: null })).toBe("2024 BYD Atto 3");
    expect(carTitle({ modelYear: 2017, make: "تويوتا", model: "بريوس", trim: "" })).toBe("2017 تويوتا بريوس");
  });
});
