import {
  BODY_TYPES,
  type CarStatus,
  MECH_STATES,
  MILESTONE_TYPES,
  PANEL_IDS,
  PANEL_STATES,
  PLACE_KINDS,
  TITLE_BRANDS,
} from "../db/enums.ts";
import { carFields, daysAgo, seedOffsetsSchema } from "./car.ts";
import { calendarDate, latitude, longitude, makeKey, microns, modelKey, orNull, text } from "./fields.ts";
import { settingsSectionSchemas } from "./settings.ts";
import { vinDecodePayloadSchema } from "./vin-decode.ts";
import { z } from "./zod.ts";

// The seed's files (05-SEED-DATA §10 check 1), built from the app's own field rules. A file holds
// what the records say, so seed keys and place keys stand where the rows hold ids, offsets where they
// hold dates, and the media T-18 adds are left out. scripts/checks/seed-rows.ts expands the files
// into the rows for one day, which parse with the app's schemas again. The seed scripts load this
// module under plain Node, so it imports other modules by their relative .ts paths.

/** A seed car's key, its record number in lower case: s01 (05-SEED-DATA §5.2) */
export const seedKeySchema = z.string().regex(/^s\d{2}$/);

/** The statuses a seed car takes (§4.1): none is archived */
export const SEED_STATUSES = ["published", "reserved", "sold", "draft"] as const satisfies readonly CarStatus[];

// A month as a record writes it, 2018-12. The app's calendarMonth also takes 2018-12-01.
const month = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
// place.key's form
const placeKey = z
  .string()
  .max(60)
  .regex(/^[a-z0-9_]+$/);
// A note a record may give, under the column's length: absent is none
const inspectionNote = orNull(text({ max: 200 })).optional();
const journeyNote = orNull(text({ max: 240 })).optional();

const mechanicalItem = z.object({ state: z.enum(MECH_STATES), noteEn: inspectionNote, noteAr: inspectionNote });

const panel = z.object({
  panelId: z.enum(PANEL_IDS),
  state: z.enum(PANEL_STATES),
  // None for a plastic bumper, a glass roof and a panel the inspection didn't read
  microns: microns().nullable(),
  // A reading drawn from the inspection's range (§5.2), not one the record gives
  drawn: z.literal(true).optional(),
  // A steel bumper, which a gauge can read, and a glass roof, which it can't (§5.2)
  steel: z.literal(true).optional(),
  glass: z.literal(true).optional(),
  noteEn: inspectionNote,
  noteAr: inspectionNote,
});

const inspection = z.object({
  // The range the original panels' readings are drawn from, when the record gives one
  originalMicrons: z.tuple([microns(), microns()]).nullable(),
  mechanical: z.object({ chassis: mechanicalItem, engine: mechanicalItem, gearbox: mechanicalItem }),
  panels: z.array(panel),
});

const milestone = z.object({
  type: z.enum(MILESTONE_TYPES),
  place: placeKey.nullable(),
  // None for a milestone dated by an offset (§9.1), and for one whose month is unknown
  month: month.nullable(),
  titleBrand: z.enum(TITLE_BRANDS).optional(),
  noteEn: journeyNote,
  noteAr: journeyNote,
  damageNoteEn: journeyNote,
  damageNoteAr: journeyNote,
});

/** seed/cars.json: the records of §5.4 and §5.5, in their order, under the rules as of now */
export function seedCarsSchema(now: Date) {
  return z.array(
    z.object({
      seedKey: seedKeySchema,
      // BR-15's form is check 4's, with the dealer's prefix
      refCode: z.string(),
      status: z.enum(SEED_STATUSES),
      platesConfirmed: z.boolean(),
      // Days from today: when a car that was never published was created (S29). Every other car
      // was created when it was published.
      createdOffset: daysAgo.optional(),
      // Every field of the wizard's steps 1 to 4 but the VIN, which seed-private/vins.json keeps out
      // of the public repository (§6.1), and the licence expiry, which the offsets date. No seed VIN
      // shows on a public page either, so vinPublic is false (§5.2, BR-43).
      car: carFields(now)
        .omit({ vin: true, licenseExpiry: true })
        .extend({ vinPublic: z.literal(false) }),
      seedOffsets: seedOffsetsSchema,
      inspection: inspection.nullable(),
      journey: z.array(milestone),
    }),
  );
}

/** seed/reference.json: the makes of SRS §6.4, and the models and aliases of 05-SEED-DATA §5.3 */
export const seedReferenceSchema = z.object({
  makes: z.array(z.object({ key: makeKey(), nameEn: text({ max: 40 }), nameAr: text({ max: 40 }) })),
  models: z.array(
    z.object({
      key: modelKey(),
      makeKey: makeKey(),
      nameEn: text({ max: 60 }),
      nameAr: text({ max: 60 }),
      defaultBodyType: z.enum(BODY_TYPES).nullable(),
      // As people type them; the seed stores each folded (SRS §6.2)
      aliases: z.array(text({ max: 60 })),
    }),
  ),
});

/** seed/places.json: the preset places of §7. Their OpenStreetMap sources are in scripts/places.source.md. */
export const seedPlacesSchema = z.array(
  z.object({
    key: placeKey,
    nameEn: text({ max: 80 }),
    nameAr: text({ max: 80 }),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    kind: z.enum(PLACE_KINDS),
    lat: latitude(),
    lng: longitude(),
  }),
);

const { brand, contact, hours, prices, advanced } = settingsSectionSchemas;

/** seed/settings.json: the dealer and its live settings (§2), each section as API-24 saves it */
export const seedSettingsSchema = z.object({
  dealer: z.object({
    slug: z
      .string()
      .max(40)
      .regex(/^[a-z0-9-]+$/),
    refPrefix: z.string().regex(/^[A-Z]{2}$/),
  }),
  // The logo is media, which T-18 adds
  brand: brand.omit({ logoMediaId: true }),
  contact,
  hours,
  prices,
  // The fuel sheet's date, at midnight in Amman (§2.3)
  pricesUpdatedAt: calendarDate(),
  // The hero and featured cars by seed key. The hero photo and its marks are media (T-18, T-38).
  showcase: z.object({ heroCar: seedKeySchema.nullable(), featuredCars: z.array(seedKeySchema) }),
  advanced,
});

/**
 * seed-private/vins.json: each seed VIN and its stored decode, by seed key (§6.2). The file stays out
 * of the public repository (§6.1), so a public clone has none.
 */
export const seedVinsSchema = z.record(
  seedKeySchema,
  z.object({
    vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/),
    // §6.2's decode as vPIC gave it, and the fields API-22 maps it to
    decoded: text({ max: 200 }),
    payload: vinDecodePayloadSchema,
  }),
);

export type SeedCar = z.output<ReturnType<typeof seedCarsSchema>>[number];
export type SeedInspection = NonNullable<SeedCar["inspection"]>;
export type SeedPanel = SeedInspection["panels"][number];
export type SeedReference = z.output<typeof seedReferenceSchema>;
export type SeedPlace = z.output<typeof seedPlacesSchema>[number];
export type SeedSettings = z.output<typeof seedSettingsSchema>;
export type SeedVins = z.output<typeof seedVinsSchema>;

/** A key path as problems name it: [2].car.trim, or (top level) for the value itself */
export function keyPath(path: readonly PropertyKey[]): string {
  const shown = path.reduce<string>(
    (text, key) => (typeof key === "number" ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key)),
    "",
  );
  return shown || "(top level)";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The key paths of the input that the parse's output lacks */
function droppedKeys(input: unknown, output: unknown, path: readonly PropertyKey[]): string[] {
  if (Array.isArray(input)) {
    if (!Array.isArray(output)) return [];
    return input.flatMap((item, index) => droppedKeys(item, output[index], [...path, index]));
  }
  if (!isRecord(input) || !isRecord(output)) return [];
  return Object.entries(input).flatMap(([key, item]) =>
    Object.hasOwn(output, key) ? droppedKeys(item, output[key], [...path, key]) : [keyPath([...path, key])],
  );
}

export type StrictParse<Data> =
  { readonly ok: true; readonly data: Data } | { readonly ok: false; readonly problems: string[] };

/**
 * The value parsed by the schema, refusing any key the schema doesn't know. An object schema drops
 * such a key rather than refuse it (car.ts), so a misspelt optional field would vanish: here any key
 * missing from the output, at any depth, is a problem. Each problem starts with its key path.
 */
export function parseStrict<Schema extends z.ZodType>(schema: Schema, value: unknown): StrictParse<z.output<Schema>> {
  const result = schema.safeParse(value);
  if (!result.success) {
    return { ok: false, problems: result.error.issues.map((issue) => `${keyPath(issue.path)}: ${issue.message}`) };
  }
  const dropped = droppedKeys(value, result.data, []);
  if (dropped.length > 0) return { ok: false, problems: dropped.map((path) => `${path}: not a key of this file`) };
  return { ok: true, data: result.data };
}
