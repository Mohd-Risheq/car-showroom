import { describe, expect, it } from "vitest";
import { batteryHealth, type FactLabel, keyFacts } from "@/features/car-page/domain/facts";
import type { PublicCarDTO } from "@/lib/db/public-dto";
import { publicCar } from "../../support/public-car";

// FR-09.3's key facts (DESIGN §7.2.3): each fact the car has, under its field's label, in FR-09's
// order, then the VIN where the dealer shows it (BR-43), and none it hasn't got, never as "N/A".
// FR-09.5's battery health, for a car that runs on a battery.

// A VIN the dealer shows, in no VIN's shape, as this file is public
const SHOWN_VIN = "VIN SHOWN BY THE DEALER";

const labelsOf = (car: PublicCarDTO) => keyFacts(car).map(({ label }) => label);
const valueOf = (car: PublicCarDTO, label: FactLabel) => keyFacts(car).find((fact) => fact.label === label)?.value;

describe("the key facts", () => {
  it("are FR-09's, in its order, then the VIN where the dealer shows it", () => {
    expect(labelsOf(publicCar({ vin: SHOWN_VIN }))).toStrictEqual([
      "field.km",
      "field.year",
      "field.fuel",
      "field.transmission",
      "field.regionalSpecs",
      "field.customs",
      "field.licenceUntil",
      "field.insurance",
      "field.owners",
      "field.seats",
      "field.engineSize",
      "field.drivetrain",
      "field.exteriorColour",
      "field.interiorColour",
      "field.vin",
    ]);
    expect(valueOf(publicCar({ vin: SHOWN_VIN }), "field.vin")).toStrictEqual({ kind: "code", value: SHOWN_VIN });
  });

  it("give each value by the way the page shows it", () => {
    expect(keyFacts(publicCar())).toStrictEqual([
      { label: "field.km", value: { kind: "quantity", value: 64_000, unit: "km" } },
      { label: "field.year", value: { kind: "figure", value: 2019 } },
      { label: "field.fuel", value: { kind: "copy", key: "enum.fuel_type.gasoline" } },
      { label: "field.transmission", value: { kind: "copy", key: "enum.transmission.automatic" } },
      { label: "field.regionalSpecs", value: { kind: "copy", key: "enum.regional_specs.gcc" } },
      { label: "field.customs", value: { kind: "copy", key: "enum.customs_status.cleared" } },
      { label: "field.licenceUntil", value: { kind: "month", value: "2027-03-01" } },
      { label: "field.insurance", value: { kind: "copy", key: "enum.insurance_type.comprehensive" } },
      { label: "field.owners", value: { kind: "figure", value: 1 } },
      { label: "field.seats", value: { kind: "figure", value: 7 } },
      { label: "field.engineSize", value: { kind: "quantity", value: 4, unit: "litre" } },
      { label: "field.drivetrain", value: { kind: "copy", key: "enum.drivetrain.four_wd" } },
      { label: "field.exteriorColour", value: { kind: "text", text: { ar: "أبيض لؤلؤي", en: "Pearl white" } } },
      { label: "field.interiorColour", value: { kind: "text", text: { ar: "بيج", en: "Beige" } } },
    ]);
  });

  it("leave out each fact the car hasn't got", () => {
    const unnamed = { ar: null, en: null };
    const car = publicCar({
      ownersCount: null,
      seats: null,
      engineCc: null,
      drivetrain: null,
      exteriorColorName: unnamed,
      interiorColorName: unnamed,
    });
    expect(labelsOf(car)).toStrictEqual([
      "field.km",
      "field.year",
      "field.fuel",
      "field.transmission",
      "field.regionalSpecs",
      "field.customs",
      "field.licenceUntil",
      "field.insurance",
    ]);
  });

  it("keep a fact whose value is none: a new car's 0 km, no licence, no insurance", () => {
    const car = publicCar({
      condition: "new",
      mileageKm: 0,
      mileageCheck: null,
      ownersCount: null,
      licenseStatus: "unlicensed",
      licenseExpiry: null,
      insuranceType: "none",
    });
    expect(valueOf(car, "field.km")).toStrictEqual({ kind: "quantity", value: 0, unit: "km" });
    expect(valueOf(car, "field.licence")).toStrictEqual({ kind: "copy", key: "enum.license_status.unlicensed" });
    expect(valueOf(car, "field.insurance")).toStrictEqual({ kind: "copy", key: "enum.insurance_type.none" });
  });

  it("give the licence's month while the car is licensed, and else whether it is", () => {
    expect(labelsOf(publicCar())).not.toContain("field.licence");
    const undated = publicCar({ licenseExpiry: null });
    expect(valueOf(undated, "field.licence")).toStrictEqual({ kind: "copy", key: "enum.license_status.licensed" });
    expect(labelsOf(undated)).not.toContain("field.licenceUntil");
    // A month left on a car that is no longer licensed doesn't say it is
    const lapsed = publicCar({ licenseStatus: "unlicensed" });
    expect(valueOf(lapsed, "field.licence")).toStrictEqual({ kind: "copy", key: "enum.license_status.unlicensed" });
    expect(labelsOf(lapsed)).not.toContain("field.licenceUntil");
  });

  it("read an electric car's engine as its electric motor, whatever size it holds (the owner, 2026-11-02)", () => {
    for (const engineCc of [0, null, 1500]) {
      expect(
        valueOf(publicCar({ fuelType: "electric", engineCc }), "field.engineSize"),
        String(engineCc),
      ).toStrictEqual({ kind: "copy", key: "car.facts.electricMotor" });
    }
  });

  it("give an engine's size in litres from its cc, and leave out a size of 0", () => {
    expect(valueOf(publicCar({ engineCc: 2488 }), "field.engineSize")).toStrictEqual({
      kind: "quantity",
      value: 2.488,
      unit: "litre",
    });
    expect(labelsOf(publicCar({ engineCc: 0 }))).not.toContain("field.engineSize");
  });

  it("keep a colour the dealer named in one language only (BR-28)", () => {
    const text = { ar: "أحمر", en: null };
    expect(valueOf(publicCar({ exteriorColorName: text }), "field.exteriorColour")).toStrictEqual({
      kind: "text",
      text,
    });
  });
});

describe("battery health", () => {
  it("shows for a car that runs on a battery once the dealer has set it (FR-09.5)", () => {
    const battery = { pct: 91, source: "diagnostic_scan" } as const;
    for (const fuelType of ["hybrid", "mild_hybrid", "plugin_hybrid", "electric"] as const) {
      expect(batteryHealth(publicCar({ fuelType, battery })), fuelType).toStrictEqual(battery);
      expect(batteryHealth(publicCar({ fuelType, battery: null })), fuelType).toBeNull();
    }
  });

  it("never shows for a petrol or diesel car, whatever it holds", () => {
    for (const fuelType of ["gasoline", "diesel"] as const) {
      expect(batteryHealth(publicCar({ fuelType, battery: { pct: 91, source: "car_display" } })), fuelType).toBeNull();
    }
  });
});
