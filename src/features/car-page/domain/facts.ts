import type {
  CustomsStatus,
  Drivetrain,
  FuelType,
  InsuranceType,
  LicenseStatus,
  RegionalSpecs,
  Transmission,
} from "@/lib/db/enums";
import type { Bilingual, PublicCarDTO } from "@/lib/db/public-dto";
import { hasText } from "@/lib/i18n/bilingual";

// FR-09.3's key facts (DESIGN §7.2.3): each fact the car has, under its field's label, in FR-09's
// order, then the VIN where the dealer shows it (BR-43). A fact the car hasn't got is left out, never
// shown as "N/A", while a value that says the car has none stays a fact: 0 km, not licensed, not
// insured. Each value says how the page shows it, and none depends on the page's language but a
// colour's name, which the dealer writes in either language or both. FR-09.5's battery health shows
// for a car that runs on a battery.

/** A fact's label: its field's, in the catalog */
export type FactLabel = `field.${
  | "km"
  | "year"
  | "fuel"
  | "transmission"
  | "regionalSpecs"
  | "customs"
  | "licence"
  | "licenceUntil"
  | "insurance"
  | "owners"
  | "seats"
  | "engineSize"
  | "drivetrain"
  | "exteriorColour"
  | "interiorColour"
  | "vin"}`;

/** A value the catalog words */
export type FactCopy =
  | `enum.fuel_type.${FuelType}`
  | `enum.transmission.${Transmission}`
  | `enum.regional_specs.${RegionalSpecs}`
  | `enum.customs_status.${CustomsStatus}`
  | `enum.license_status.${LicenseStatus}`
  | `enum.insurance_type.${InsuranceType}`
  | `enum.drivetrain.${Drivetrain}`
  | "car.facts.electricMotor";

/** A fact's value, by the way the page shows it */
export type FactValue =
  /** A number and its unit */
  | { readonly kind: "quantity"; readonly value: number; readonly unit: "km" | "litre" }
  /** A whole number as it is: a year, which is never grouped, or a count of owners or seats */
  | { readonly kind: "figure"; readonly value: number }
  | { readonly kind: "copy"; readonly key: FactCopy }
  /** A month as its first day, 'YYYY-MM-01' */
  | { readonly kind: "month"; readonly value: string }
  /** The dealer's words, in either language or both (BR-28) */
  | { readonly kind: "text"; readonly text: Bilingual }
  /** A code, read left to right (DESIGN §9.5) */
  | { readonly kind: "code"; readonly value: string };

type KeyFact = { readonly label: FactLabel; readonly value: FactValue };

const CC_A_LITRE = 1000;

/** The car's key facts, in FR-09's order */
export function keyFacts(car: PublicCarDTO): KeyFact[] {
  const facts: (KeyFact | null)[] = [
    { label: "field.km", value: { kind: "quantity", value: car.mileageKm, unit: "km" } },
    { label: "field.year", value: { kind: "figure", value: car.modelYear } },
    { label: "field.fuel", value: { kind: "copy", key: `enum.fuel_type.${car.fuelType}` } },
    { label: "field.transmission", value: { kind: "copy", key: `enum.transmission.${car.transmission}` } },
    { label: "field.regionalSpecs", value: { kind: "copy", key: `enum.regional_specs.${car.regionalSpecs}` } },
    { label: "field.customs", value: { kind: "copy", key: `enum.customs_status.${car.customsStatus}` } },
    licence(car),
    { label: "field.insurance", value: { kind: "copy", key: `enum.insurance_type.${car.insuranceType}` } },
    car.ownersCount === null ? null : { label: "field.owners", value: { kind: "figure", value: car.ownersCount } },
    car.seats === null ? null : { label: "field.seats", value: { kind: "figure", value: car.seats } },
    engine(car),
    car.drivetrain === null
      ? null
      : { label: "field.drivetrain", value: { kind: "copy", key: `enum.drivetrain.${car.drivetrain}` } },
    colour("field.exteriorColour", car.exteriorColorName),
    colour("field.interiorColour", car.interiorColorName),
    car.vin === null ? null : { label: "field.vin", value: { kind: "code", value: car.vin } },
  ];
  return facts.filter((fact) => fact !== null);
}

/** The month the licence runs to while the car is licensed, else whether it is */
function licence(car: PublicCarDTO): KeyFact {
  if (car.licenseStatus === "licensed" && car.licenseExpiry !== null) {
    return { label: "field.licenceUntil", value: { kind: "month", value: car.licenseExpiry } };
  }
  return { label: "field.licence", value: { kind: "copy", key: `enum.license_status.${car.licenseStatus}` } };
}

/**
 * An engine's size in litres, from its cc. An electric car's is its electric motor, whatever size the
 * car holds (the owner, 2026-11-02), and another car's size of 0 is none.
 */
function engine(car: PublicCarDTO): KeyFact | null {
  if (car.fuelType === "electric")
    return { label: "field.engineSize", value: { kind: "copy", key: "car.facts.electricMotor" } };
  if (car.engineCc === null || car.engineCc === 0) return null;
  return { label: "field.engineSize", value: { kind: "quantity", value: car.engineCc / CC_A_LITRE, unit: "litre" } };
}

/** A colour the dealer named in either language */
function colour(label: FactLabel, name: Bilingual): KeyFact | null {
  return hasText(name) ? { label, value: { kind: "text", text: name } } : null;
}

// FR-09.5: the fuels of a car that runs on a battery
const BATTERY_FUELS: ReadonlySet<FuelType> = new Set(["hybrid", "mild_hybrid", "plugin_hybrid", "electric"]);

/** The car's battery health, for a car that runs on a battery once the dealer has set it, else null */
export function batteryHealth(car: Pick<PublicCarDTO, "fuelType" | "battery">): PublicCarDTO["battery"] {
  return BATTERY_FUELS.has(car.fuelType) ? car.battery : null;
}
