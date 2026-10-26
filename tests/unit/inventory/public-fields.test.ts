import { describe, expect, it } from "vitest";
import { hasPublicFields, missingPublicFields, PUBLIC_FIELDS } from "@/features/inventory/domain/public-fields";

// The fields of BR-29's checklist on a car's own row that a public page reads with no fallback. Not
// the checklist itself, which T-31 checks

const complete = Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, `${field} value`])) as Record<
  (typeof PUBLIC_FIELDS)[number],
  string | null
>;

describe("the fields a public page reads with no fallback", () => {
  it("are the make, model, year, price, km, fuel, transmission, body, specs, customs, licence and insurance", () => {
    expect(PUBLIC_FIELDS).toStrictEqual([
      ...["makeKey", "modelKey", "modelYear", "priceJod", "mileageKm", "fuelType", "transmission", "bodyType"],
      ...["regionalSpecs", "customsStatus", "licenseStatus", "insuranceType"],
    ]);
  });

  it("names each one the car is missing, in BR-29's order", () => {
    expect(missingPublicFields(complete)).toStrictEqual([]);
    expect(hasPublicFields(complete)).toBe(true);
    const partial = { ...complete, insuranceType: null, modelYear: null };
    expect(missingPublicFields(partial)).toStrictEqual(["modelYear", "insuranceType"]);
    expect(hasPublicFields(partial)).toBe(false);
  });
});
