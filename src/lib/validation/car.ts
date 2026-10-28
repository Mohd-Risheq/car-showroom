import {
  BODY_TYPES,
  CAR_CONDITIONS,
  COLOR_FAMILIES,
  CONSUMPTION_SOURCES,
  CUSTOMS_STATUSES,
  DRIVETRAINS,
  FUEL_TYPES,
  INSURANCE_TYPES,
  LICENSE_STATUSES,
  PAINT_FINISHES,
  PAYMENT_METHODS,
  REGIONAL_SPECS,
  SOH_SOURCES,
  TRANSMISSIONS,
} from "../db/enums.ts";
import { FEATURE_KEYS } from "../db/feature-keys.ts";
import type { FieldErrors } from "../errors/app-error.ts";
import { ammanDate } from "../format/calendar.ts";
import { normalizeDigits } from "../i18n/normalize.ts";
import {
  DESCRIPTION_MAX_CHARS,
  ENGINE_CC,
  FEATURES_MAX,
  KWH_PER_100KM,
  LENGTH_MM,
  MODEL_YEAR_MIN,
  OCTANES,
  OWNERS_COUNT,
  PERCENT,
  POWER_HP,
  PRICE_JOD,
  SEATS,
  WHEELBASE_MM,
} from "./bounds.ts";
import {
  between,
  calendarDate,
  calendarMonth,
  choices,
  decimal,
  integer,
  kilometres,
  litresPer100km,
  makeKey,
  modelKey,
  oneOf,
  orNull,
  text,
} from "./fields.ts";
import { addIssue, type ValidationIssue } from "./issues.ts";
import { checkVin, normalizeVin } from "./vin.ts";
import { z } from "./zod.ts";

// A car's fields as the wizard's steps 1 to 4 write them (FR-31, API-11), under the rules of
// SRS §7.1 and the column checks of §6.2. The reference code and the slug are the system's (VR-29),
// as is every column not listed here: an unknown key is dropped (§8.1).

// VR-04 refuses a VIN of the wrong form, and one whose check digit is wrong in North America. A
// mismatch elsewhere is only a warning (BR-23), which the form takes from checkVin itself.
const vin = z.preprocess(
  (value) => (typeof value === "string" ? normalizeVin(normalizeDigits(value)) : value),
  z.string().check((payload) => {
    const result = checkVin(payload.value);
    if (!result.ok) addIssue(payload, { key: result.error });
  }),
);

const exteriorColorHex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .transform((hex) => hex.toLowerCase());

/** VR-02: from the first model year to next year, as the year is in Amman */
function modelYear(now: Date) {
  const maxYear = Number(ammanDate(now).slice(0, 4)) + 1;
  return integer({ min: MODEL_YEAR_MIN, max: maxYear, issue: { key: "validation.year", values: { maxYear } } });
}

// VR-11: kWh per 100 km, to one decimal
const kwhPer100km = decimal({
  ...KWH_PER_100KM,
  scale: 1,
  issue: { key: "validation.range", values: KWH_PER_100KM },
});

const percent = integer({ ...PERCENT, issue: { key: "validation.percent" } });

/**
 * The fields of steps 1 to 4, each of which a draft may leave empty, save the payment methods and
 * a field whose column can't be. The seed's records hold them all but the VIN and the licence expiry
 * (src/lib/validation/seed.ts).
 */
export function carFields(now: Date) {
  return z.object({
    // Step 1: identity
    vin: orNull(vin),
    vinPublic: z.boolean(),
    makeKey: orNull(makeKey()),
    modelKey: orNull(modelKey()),
    trim: orNull(text({ max: 60 })),
    modelYear: orNull(modelYear(now)),
    bodyType: orNull(z.enum(BODY_TYPES)),
    fuelType: orNull(z.enum(FUEL_TYPES)),
    transmission: orNull(z.enum(TRANSMISSIONS)),
    drivetrain: orNull(z.enum(DRIVETRAINS)),
    engineCc: orNull(between(ENGINE_CC)),
    powerHp: orNull(between(POWER_HP)),
    seats: orNull(between(SEATS)),
    exteriorColorNameAr: orNull(text({ max: 40 })),
    exteriorColorNameEn: orNull(text({ max: 40 })),
    exteriorColorHex: orNull(exteriorColorHex),
    paintFinish: orNull(z.enum(PAINT_FINISHES)),
    colorFamily: orNull(z.enum(COLOR_FAMILIES)),
    interiorColorNameAr: orNull(text({ max: 40 })),
    interiorColorNameEn: orNull(text({ max: 40 })),
    lengthMm: orNull(integer({ ...LENGTH_MM, issue: { key: "validation.dimension" } })),
    wheelbaseMm: orNull(integer({ ...WHEELBASE_MM, issue: { key: "validation.dimension" } })),
    // Step 2: Jordan details
    regionalSpecs: orNull(z.enum(REGIONAL_SPECS)),
    customsStatus: orNull(z.enum(CUSTOMS_STATUSES)),
    licenseStatus: orNull(z.enum(LICENSE_STATUSES)),
    licenseExpiry: orNull(calendarMonth()),
    insuranceType: orNull(z.enum(INSURANCE_TYPES)),
    // Information only (C-04). At least one at every save, though ENT-Car asks for one only at
    // publish: a car starts with cash, and a patch to a published car can't take its last (D-043)
    paymentMethods: choices(PAYMENT_METHODS, { min: 1, max: PAYMENT_METHODS.length }),
    condition: z.enum(CAR_CONDITIONS),
    ownersCount: orNull(between(OWNERS_COUNT)),
    warrantyUntil: orNull(calendarDate()),
    mileageKm: orNull(kilometres()),
    // Step 3: features (VR-08)
    features: choices(FEATURE_KEYS, { min: 0, max: FEATURES_MAX }),
    // Step 4: price and description
    priceJod: orNull(integer({ ...PRICE_JOD, issue: { key: "validation.price" } })),
    descriptionAr: orNull(text({ max: DESCRIPTION_MAX_CHARS, multiline: true })),
    descriptionEn: orNull(text({ max: DESCRIPTION_MAX_CHARS, multiline: true })),
    recommendedOctane: orNull(oneOf(OCTANES)),
    consumptionLPer100km: orNull(litresPer100km()),
    consumptionKwhPer100km: orNull(kwhPer100km),
    consumptionSource: orNull(z.enum(CONSUMPTION_SOURCES)),
    batterySohPct: orNull(percent),
    batterySohSource: orNull(z.enum(SOH_SOURCES)),
    phevElectricSharePct: orNull(percent),
  });
}

type CarFields = z.output<ReturnType<typeof carFields>>;

/** The fields the rules over two fields read, as a stored row and a patch over it hold them */
export type CarPairFields = {
  readonly [Name in "lengthMm" | "wheelbaseMm" | "batterySohPct" | "batterySohSource"]?: CarFields[Name] | undefined;
};

const isSet = <Value>(value: Value): value is NonNullable<Value> => value !== null && value !== undefined;

// VR-31: the wheelbase is shorter than the length. VR-13: the percentage needs its source.
const PAIR_RULES: readonly {
  fields: readonly (keyof CarPairFields)[];
  field: keyof CarPairFields;
  issue: ValidationIssue;
  broken: (car: CarPairFields) => boolean;
}[] = [
  {
    fields: ["lengthMm", "wheelbaseMm"],
    field: "wheelbaseMm",
    issue: { key: "validation.wheelbaseShorter" },
    broken: ({ lengthMm, wheelbaseMm }) => isSet(lengthMm) && isSet(wheelbaseMm) && wheelbaseMm >= lengthMm,
  },
  {
    fields: ["batterySohPct", "batterySohSource"],
    field: "batterySohSource",
    issue: { key: "validation.sohSource" },
    broken: ({ batterySohPct, batterySohSource }) => isSet(batterySohPct) && !isSet(batterySohSource),
  },
];

/**
 * API-11's patch: any of the fields, each under its rule. A rule over two fields is checked here
 * when the patch holds both; with one of them, the action checks the stored row with the patch
 * over it through carPairIssues.
 */
export function carPatchSchema(now: Date) {
  return carFields(now)
    .partial()
    .check((payload) => {
      for (const rule of PAIR_RULES) {
        const both = rule.fields.every((name) => Object.hasOwn(payload.value, name));
        if (both && rule.broken(payload.value)) addIssue(payload, rule.issue, [rule.field]);
      }
    });
}

export type CarPatch = z.output<ReturnType<typeof carPatchSchema>>;

/** The rules over two fields on a whole car, the stored row with a patch over it: a missing field is empty */
export function carPairIssues(car: CarPairFields): FieldErrors {
  return Object.fromEntries(PAIR_RULES.filter((rule) => rule.broken(car)).map((rule) => [rule.field, [rule.issue]]));
}

// A seed car's ages, which the nightly job turns back into dates, and its price changes' prices,
// each within VR-01 as a price change's row holds it: 05-SEED-DATA §9.1's schema, with every offset
// held within a century of today, as one much further off would give no date
const SEED_OFFSET_DAYS_MAX = 36_525;
const SEED_OFFSET_MONTHS_MAX = 1200;

/** Days before today, as a seed car's ages are written */
export const daysAgo = z.int().min(-SEED_OFFSET_DAYS_MAX).max(0);
const changedPrice = z.int().min(PRICE_JOD.min).max(PRICE_JOD.max);

export const seedOffsetsSchema = z.object({
  published: daysAgo.optional(),
  sold: daysAgo.optional(),
  priceChanges: z.array(z.object({ days: daysAgo, from: changedPrice, to: changedPrice })).default([]),
  inspectedOn: daysAgo.optional(),
  licenseExpiryMonths: z.int().min(1).max(SEED_OFFSET_MONTHS_MAX).optional(),
  milestones: z
    .object({
      shipped: daysAgo.optional(),
      arrived_port: daysAgo.optional(),
      free_zone: daysAgo.optional(),
      inspected: daysAgo.optional(),
      in_showroom: daysAgo.optional(),
    })
    .default({}),
});

export type SeedOffsets = z.output<typeof seedOffsetsSchema>;
