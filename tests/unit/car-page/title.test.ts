import { describe, expect, it } from "vitest";
import { carTitleIn } from "@/features/car-page/domain/title";
import { isolateScripts } from "@/lib/i18n/bidi";
import { publicCar } from "../../support/public-car";

// FR-09's h1 and the page's title: the car's title, its make and model named in the page's language

describe("carTitleIn", () => {
  it("names the make and model in the page's language, and the trim as it is spelled", () => {
    expect(carTitleIn(publicCar(), "en")).toBe(`2019 Toyota Land Cruiser ${isolateScripts("GXR")}`);
    expect(carTitleIn(publicCar(), "ar")).toBe(`2019 تويوتا لاند كروزر ${isolateScripts("GXR")}`);
  });

  it("leaves out a trim the car doesn't have", () => {
    expect(carTitleIn(publicCar({ trim: null }), "en")).toBe("2019 Toyota Land Cruiser");
  });
});
