// The fields of BR-29's checklist, on a car's own row, that a public page reads with no fallback, so
// a public car without one is a fault the page reports rather than shows. This is not BR-29's
// checklist: publishing also needs a payment method, a description, confirmed plates and six photos
// with a cover, which T-31's publish action (API-12) checks, apart from the plates confirmation,
// which T-32 adds to the checklist (FR-33.3, TC-33-2).

export const PUBLIC_FIELDS = [
  "makeKey",
  "modelKey",
  "modelYear",
  "priceJod",
  "mileageKm",
  "fuelType",
  "transmission",
  "bodyType",
  "regionalSpecs",
  "customsStatus",
  "licenseStatus",
  "insuranceType",
] as const;

export type PublicField = (typeof PUBLIC_FIELDS)[number];

type Fields = { readonly [Field in PublicField]: unknown };

/** The car with each of these fields set */
export type WithPublicFields<Car extends Fields> = Car & { readonly [Field in PublicField]: NonNullable<Car[Field]> };

/** The fields the car is missing, in BR-29's order */
export function missingPublicFields(car: Fields): PublicField[] {
  return PUBLIC_FIELDS.filter((field) => car[field] === null || car[field] === undefined);
}

export function hasPublicFields<Car extends Fields>(car: Car): car is WithPublicFields<Car> {
  return missingPublicFields(car).length === 0;
}
