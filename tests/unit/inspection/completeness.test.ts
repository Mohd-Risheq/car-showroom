import { describe, expect, it } from "vitest";
import { INSPECTION_ITEMS, inspectionFilled } from "@/features/inspection/domain/completeness";
import { micronBand } from "@/features/inspection/domain/micron-band";
import { MECH_STATES, PANEL_IDS, PANEL_STATES } from "@/lib/db/enums";

// BR-07's completeness and BR-08's advisory bands, which the cards and the car page share

describe("BR-07: an inspection's completeness", () => {
  it("counts the 13 panels and 3 mechanical items", () => {
    expect(INSPECTION_ITEMS).toBe(PANEL_IDS.length + 3);
  });

  it("counts every item whose state is known, and none that is unknown", () => {
    const known = [...PANEL_STATES, ...MECH_STATES].filter((state) => state !== "unknown");
    expect(inspectionFilled(known)).toBe(known.length);
    expect(inspectionFilled(["unknown", "original", "unknown", "issue"])).toBe(2);
    expect(inspectionFilled([])).toBe(0);
  });
});

describe("BR-08: a paint reading's band", () => {
  const bands = { factoryMax: 180, refinishMax: 300 };

  it("is factory up to factoryMax, refinish up to refinishMax, and filler above (TC-13-2)", () => {
    expect(micronBand(0, bands)).toBe("factory");
    expect(micronBand(180, bands)).toBe("factory");
    expect(micronBand(181, bands)).toBe("refinish");
    expect(micronBand(240, bands)).toBe("refinish");
    expect(micronBand(300, bands)).toBe("refinish");
    expect(micronBand(301, bands)).toBe("filler");
  });

  it("follows the dealer's own bands", () => {
    expect(micronBand(200, { factoryMax: 220, refinishMax: 400 })).toBe("factory");
    expect(micronBand(350, { factoryMax: 120, refinishMax: 340 })).toBe("filler");
  });
});
