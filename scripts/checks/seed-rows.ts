// The seed's rows for one day in Amman (05-SEED-DATA §5 and §9.2): the files expanded into what each
// table holds, with the ids, dates, slugs and folded aliases the files leave out. scripts/seed.ts
// writes these rows and pnpm check:seed checks them, so the two can't read the files differently.
// A row holds the columns the seed owns and no others: a re-seed sets those, and leaves the rest,
// such as the media T-18 adds, to whoever writes them. Pure, and it imports other modules by their
// relative .ts paths.
import { isRefCode } from "../../src/features/dealer/domain/ref-code.ts";
import { carSlug } from "../../src/features/dealer/domain/slug.ts";
import type {
  car,
  dealer,
  dealerSettings,
  inspection,
  inspectionPanel,
  journeyMilestone,
  make,
  model,
  modelAlias,
  place,
  priceChange,
} from "../../src/lib/db/schema.ts";
import {
  addDays,
  ammanInstant,
  anchorSeedDates,
  type SeedDates,
  seedTimeOfDay,
} from "../../src/lib/demo/seed-dates.ts";
import { ammanDate } from "../../src/lib/format/calendar.ts";
import { normalizeSearch } from "../../src/lib/i18n/normalize.ts";
import { keyedRandom } from "../../src/lib/seeded-random.ts";
import { carPatchSchema } from "../../src/lib/validation/car.ts";
import { inspectionSchema } from "../../src/lib/validation/inspection.ts";
import { journeySchema } from "../../src/lib/validation/journey.ts";
import {
  keyPath,
  type SeedCar,
  type SeedInspection,
  type SeedPanel,
  type SeedSettings,
} from "../../src/lib/validation/seed.ts";
import { settingsSectionSchemas } from "../../src/lib/validation/settings.ts";
import type { z } from "../../src/lib/validation/zod.ts";
import { SEED_PATHS, type SeedFiles } from "./seed-files.ts";
import { seedIds } from "./seed-ids.ts";

type Insert<Table extends { readonly $inferInsert: object }> = Table["$inferInsert"];

/**
 * The ids the rows refer to one another by: the seed's own, or the id the database already holds a
 * row under, found by its natural key, which scripts/seed-loader.ts reads back
 */
export type RowIds = {
  readonly dealer: (slug: string) => string;
  readonly place: (key: string) => string;
  readonly car: (seedKey: string) => string;
  readonly inspection: (seedKey: string) => string;
};

/** The seed's own ids (05-SEED-DATA §5.2) */
export const SEED_ROW_IDS: RowIds = {
  dealer: (slug) => seedIds.dealer(slug),
  place: (key) => seedIds.place(key),
  car: (seedKey) => seedIds.car(seedKey),
  inspection: (seedKey) => seedIds.inspection(seedKey),
};

/** What the rows are expanded from: every seed file but the checks' own inputs */
export type SeedRowInputs = Pick<SeedFiles, "cars" | "reference" | "places" | "settings" | "vins">;

/** What every car's rows need besides its record */
type CarContext = {
  readonly today: string;
  readonly ids: RowIds;
  readonly dealerId: string;
  readonly makeNames: ReadonlyMap<string, string>;
  readonly modelNames: ReadonlyMap<string, string>;
  readonly vins: SeedFiles["vins"];
};

/** The key's English name, or none for a car without the key */
const nameOf = (names: ReadonlyMap<string, string>, key: string | null) =>
  (key === null ? null : names.get(key)) ?? null;

/**
 * BR-16's slug. A code that isn't BR-15's has none: check 4 names the code, and nothing is written
 * while a check fails.
 */
function slugOf(record: SeedCar, context: CarContext): string {
  const { car: fields, refCode } = record;
  if (!isRefCode(refCode)) return "";
  return carSlug({
    modelYear: fields.modelYear,
    makeNameEn: nameOf(context.makeNames, fields.makeKey),
    modelNameEn: nameOf(context.modelNames, fields.modelKey),
    trim: fields.trim,
    refCode,
  });
}

function carRow(record: SeedCar, dates: SeedDates, context: CarContext) {
  const { seedKey, seedOffsets } = record;
  // A car was created when it was published, and S29, never published, a few days ago (§5.5)
  const created = seedOffsets.published ?? record.createdOffset ?? 0;
  return {
    id: context.ids.car(seedKey),
    dealerId: context.dealerId,
    seedKey,
    seedOffsets,
    refCode: record.refCode,
    slug: slugOf(record, context),
    status: record.status,
    ...record.car,
    vin: context.vins?.[seedKey]?.vin ?? null,
    licenseExpiry: dates.licenseExpiry,
    platesConfirmed: record.platesConfirmed,
    publishedAt: dates.publishedAt,
    soldAt: dates.soldAt,
    // A seed car is never archived, so a re-seed brings an archived one back whole
    archivedAt: null,
    createdAt: ammanInstant(addDays(context.today, created), seedTimeOfDay(seedKey)),
  } satisfies Insert<typeof car>;
}

function inspectionRow({ mechanical }: SeedInspection, carId: string, inspectionId: string, dates: SeedDates) {
  const { chassis, engine, gearbox } = mechanical;
  return {
    id: inspectionId,
    carId,
    inspectedOn: dates.inspectedOn,
    // §1 rule 3: no seed inspection names a test centre
    testCenterName: null,
    // The seed wrote it, so a re-seed credits no user with what it wrote
    updatedBy: null,
    chassisState: chassis.state,
    chassisNoteAr: chassis.noteAr ?? null,
    chassisNoteEn: chassis.noteEn ?? null,
    engineState: engine.state,
    engineNoteAr: engine.noteAr ?? null,
    engineNoteEn: engine.noteEn ?? null,
    gearboxState: gearbox.state,
    gearboxNoteAr: gearbox.noteAr ?? null,
    gearboxNoteEn: gearbox.noteEn ?? null,
  } satisfies Insert<typeof inspection>;
}

function panelRow(seedKey: string, inspectionId: string, panel: SeedPanel) {
  return {
    id: seedIds.panel(seedKey, panel.panelId),
    inspectionId,
    panelId: panel.panelId,
    state: panel.state,
    microns: panel.microns,
    noteAr: panel.noteAr ?? null,
    noteEn: panel.noteEn ?? null,
  } satisfies Insert<typeof inspectionPanel>;
}

type InspectionRows = {
  readonly inspection: ReturnType<typeof inspectionRow> | null;
  readonly panels: readonly ReturnType<typeof panelRow>[];
};

function inspectionRows(record: SeedCar, carId: string, inspectionId: string, dates: SeedDates): InspectionRows {
  if (record.inspection === null) return { inspection: null, panels: [] };
  return {
    inspection: inspectionRow(record.inspection, carId, inspectionId, dates),
    panels: record.inspection.panels.map((panel) => panelRow(record.seedKey, inspectionId, panel)),
  };
}

function milestoneRows(record: SeedCar, carId: string, dates: SeedDates, ids: RowIds) {
  const offsetMonths: ReadonlyMap<string, string> = new Map(Object.entries(dates.milestoneMonths));
  return record.journey.map(
    (milestone, sortOrder) =>
      ({
        id: seedIds.milestone(record.seedKey, sortOrder),
        carId,
        sortOrder,
        type: milestone.type,
        placeId: milestone.place === null ? null : ids.place(milestone.place),
        // A month the record fixes, or one its offsets date, or none known (§9.1)
        occurredMonth: milestone.month === null ? (offsetMonths.get(milestone.type) ?? null) : `${milestone.month}-01`,
        noteAr: milestone.noteAr ?? null,
        noteEn: milestone.noteEn ?? null,
        // §1 rule 3: no seed auction names its house
        auctionHouse: null,
        titleBrand: milestone.titleBrand ?? null,
        damageNoteAr: milestone.damageNoteAr ?? null,
        damageNoteEn: milestone.damageNoteEn ?? null,
      }) satisfies Insert<typeof journeyMilestone>,
  );
}

function carRows(record: SeedCar, context: CarContext) {
  const { seedKey } = record;
  const dates = anchorSeedDates(record.seedOffsets, seedKey, context.today);
  const carId = context.ids.car(seedKey);
  return {
    seedKey,
    car: carRow(record, dates, context),
    ...inspectionRows(record, carId, context.ids.inspection(seedKey), dates),
    milestones: milestoneRows(record, carId, dates, context.ids),
    priceChanges: dates.priceChanges.map(
      ({ changedAt, oldPriceJod, newPriceJod }, index) =>
        ({
          id: seedIds.priceChange(seedKey, index),
          carId,
          oldPriceJod,
          newPriceJod,
          changedAt,
          changedBy: null,
        }) satisfies Insert<typeof priceChange>,
    ),
  };
}

function settingsRow(settings: SeedSettings, dealerId: string, ids: RowIds) {
  const { brand, contact, hours, prices, showcase, advanced } = settings;
  return {
    id: seedIds.settings(settings.dealer.slug),
    dealerId,
    ...brand,
    ...contact,
    ...hours,
    ...prices,
    // The fuel sheet's date, at midnight in Amman (§2.3)
    pricesUpdatedAt: ammanInstant(settings.pricesUpdatedAt, 0),
    heroCarId: showcase.heroCar === null ? null : ids.car(showcase.heroCar),
    featuredCarIds: showcase.featuredCars.map((seedKey) => ids.car(seedKey)),
    ...advanced,
  } satisfies Insert<typeof dealerSettings>;
}

/** A car's rows: the car, its inspection and 13 panels when it has one, its journey and its price changes */
export type SeedCarRows = ReturnType<typeof carRows>;
export type SeedSettingsRow = ReturnType<typeof settingsRow>;

export type SeedRows = {
  readonly makes: readonly Insert<typeof make>[];
  readonly models: readonly Insert<typeof model>[];
  readonly aliases: readonly Insert<typeof modelAlias>[];
  readonly places: readonly Insert<typeof place>[];
  readonly dealer: Insert<typeof dealer>;
  readonly cars: readonly SeedCarRows[];
  readonly settings: SeedSettingsRow;
};

/** The rows the files give on the Amman day of `now`, referring to one another by the ids given */
export function seedRows(files: SeedRowInputs, now: Date, ids: RowIds = SEED_ROW_IDS): SeedRows {
  const { reference, settings } = files;
  const dealerId = ids.dealer(settings.dealer.slug);
  const context: CarContext = {
    today: ammanDate(now),
    ids,
    dealerId,
    makeNames: new Map(reference.makes.map(({ key, nameEn }) => [key, nameEn])),
    modelNames: new Map(reference.models.map(({ key, nameEn }) => [key, nameEn])),
    vins: files.vins,
  };
  return {
    makes: reference.makes.map(({ key, nameEn, nameAr }) => ({ key, nameEn, nameAr })),
    models: reference.models.map(({ key, makeKey, nameEn, nameAr, defaultBodyType }) => ({
      key,
      makeKey,
      nameEn,
      nameAr,
      defaultBodyType,
    })),
    // Stored as normalizeSearch folds them (SRS §6.2)
    aliases: reference.models.flatMap(({ key, aliases }) =>
      aliases.map((typed) => {
        const alias = normalizeSearch(typed);
        return { id: seedIds.alias(key, alias), modelKey: key, alias };
      }),
    ),
    places: files.places.map((preset) => ({
      id: ids.place(preset.key),
      ...preset,
      isPreset: true,
      dealerId: null,
      demoSessionId: null,
    })),
    dealer: { id: dealerId, slug: settings.dealer.slug, refPrefix: settings.dealer.refPrefix },
    cars: files.cars.map((record) => carRows(record, context)),
    settings: settingsRow(settings, dealerId, ids),
  };
}

/** A panel's reading drawn from its inspection's range (§5.2): uniform within it, rounded to a whole µm */
export function drawReading(seedKey: string, panelId: string, [min, max]: readonly [number, number]): number {
  return Math.round(min + keyedRandom(`${seedKey}:${panelId}`)() * (max - min));
}

type AppInspection = z.input<ReturnType<typeof inspectionSchema>>;
type AppPanel = AppInspection["panels"][number];
type AppMilestone = z.input<ReturnType<typeof journeySchema>>["milestones"][number];
type SettingsSection = keyof typeof settingsSectionSchemas;

/** An issue a schema finds in a row: the field's key path, and the message */
type RowIssue = { readonly path: string; readonly message: string };

/** The issues of a value under a schema */
function issuesOf(schema: z.ZodType, value: unknown): RowIssue[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map(({ path, message }) => ({ path: keyPath(path), message }));
}

// The car row's fields that seed/cars.json doesn't hold as the row does, by the file and key that
// write each: the VIN, which stays out of the public repository (§6.1), and the licence expiry,
// which the offsets date (§9.1)
const ROW_FIELD_SOURCES: ReadonlyMap<string, { readonly file: string; readonly keyPath: string }> = new Map([
  ["car.vin", { file: SEED_PATHS.vins, keyPath: "vin" }],
  ["car.licenseExpiry", { file: SEED_PATHS.cars, keyPath: "seedOffsets.licenseExpiryMonths" }],
]);

/** The inspection as API-19 takes it */
function appInspection(rows: SeedCarRows): AppInspection | null {
  if (rows.inspection === null) return null;
  const { inspectedOn, testCenterName, chassisState, engineState, gearboxState } = rows.inspection;
  return {
    meta: { inspectedOn, testCenterName, reportMediaId: null },
    mechanical: {
      chassis: { state: chassisState, noteAr: rows.inspection.chassisNoteAr, noteEn: rows.inspection.chassisNoteEn },
      engine: { state: engineState, noteAr: rows.inspection.engineNoteAr, noteEn: rows.inspection.engineNoteEn },
      gearbox: { state: gearboxState, noteAr: rows.inspection.gearboxNoteAr, noteEn: rows.inspection.gearboxNoteEn },
    },
    panels: rows.panels.map(({ panelId, state, microns, noteAr, noteEn }): AppPanel => ({
      panelId,
      state,
      microns,
      noteAr,
      noteEn,
    })),
  };
}

/** The settings as API-24 takes each section */
function appSettings(row: SeedSettingsRow): Record<SettingsSection, unknown> {
  return {
    brand: {
      brandNameAr: row.brandNameAr,
      brandNameEn: row.brandNameEn,
      taglineAr: row.taglineAr,
      taglineEn: row.taglineEn,
      storyAr: row.storyAr,
      storyEn: row.storyEn,
      logoMediaId: null,
      accentPreset: row.accentPreset,
    },
    contact: {
      whatsappE164: row.whatsappE164,
      phoneE164: row.phoneE164,
      email: row.email,
      addressAr: row.addressAr,
      addressEn: row.addressEn,
      lat: row.lat,
      lng: row.lng,
      social: row.social,
    },
    hours: { hours: row.hours, ramadan: row.ramadan, closures: row.closures },
    prices: {
      fuelPrice90: row.fuelPrice90,
      fuelPrice95: row.fuelPrice95,
      fuelPrice98: row.fuelPrice98,
      fuelPriceDiesel: row.fuelPriceDiesel,
      elecHomeOffpeakKwh: row.elecHomeOffpeakKwh,
      elecHomePeakKwh: row.elecHomePeakKwh,
      elecPublicKwh: row.elecPublicKwh,
      baselineLPer100km: row.baselineLPer100km,
    },
    showcase: { heroCarId: row.heroCarId, heroMediaId: null, heroMarks: null, featuredCarIds: row.featuredCarIds },
    advanced: { soldVisibleDays: row.soldVisibleDays, mileageBands: row.mileageBands, micronBands: row.micronBands },
  };
}

/**
 * 05-SEED-DATA §10 check 1's second half: the rows, as the app's forms would send them, parse with
 * the app's own schemas as of now (the car, its inspection and journey, and each settings section).
 * Each problem names the file, the car or section, and the field as the app's schema names it, but
 * the VIN and the licence expiry, which it names by the file and key that write them.
 */
export function appSchemaProblems(rows: SeedRows, now: Date): string[] {
  const car = carPatchSchema(now);
  const inspection = inspectionSchema(now);
  const journey = journeySchema(now);
  const cars = rows.cars.flatMap((carRows) => {
    const named =
      (part: string) =>
      ({ path, message }: RowIssue) => {
        const field = `${part}.${path}`;
        const { file, keyPath: written } = ROW_FIELD_SOURCES.get(field) ?? { file: SEED_PATHS.cars, keyPath: field };
        return `${file}: ${carRows.seedKey}: ${written}: ${message}`;
      };
    const asSent = appInspection(carRows);
    const milestones = carRows.milestones.map(
      ({ type, placeId, occurredMonth, noteAr, noteEn, auctionHouse, titleBrand, damageNoteAr, damageNoteEn }) =>
        ({
          type,
          placeId,
          occurredMonth,
          noteAr,
          noteEn,
          auctionHouse,
          titleBrand,
          damageNoteAr,
          damageNoteEn,
        }) satisfies AppMilestone,
    );
    return [
      ...issuesOf(car, carRows.car).map(named("car")),
      ...(asSent === null ? [] : issuesOf(inspection, asSent).map(named("inspection"))),
      ...issuesOf(journey, { milestones }).map(named("journey")),
    ];
  });
  const sections = Object.entries(appSettings(rows.settings)).flatMap(([section, values]) =>
    issuesOf(settingsSectionSchemas[section as SettingsSection], values).map(
      ({ path, message }) => `${SEED_PATHS.settings}: ${section}.${path}: ${message}`,
    ),
  );
  return [...cars, ...sections];
}
