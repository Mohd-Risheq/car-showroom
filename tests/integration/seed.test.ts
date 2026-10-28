import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "@/lib/db/id";
import * as schema from "@/lib/db/schema";
import {
  car,
  carSlugHistory,
  dealer,
  dealerSettings,
  demoSession,
  inspection,
  inspectionPanel,
  journeyMilestone,
  make,
  media,
  model,
  modelAlias,
  place,
  priceChange,
} from "@/lib/db/schema";
import { SEED_LOCK_KEY } from "@/lib/demo/seed-lock";
import { ROOT } from "../../scripts/checks/files.ts";
import { readSeedFiles, type SeedFiles } from "../../scripts/checks/seed-files.ts";
import { seedIds } from "../../scripts/checks/seed-ids.ts";
import { seedRows } from "../../scripts/checks/seed-rows.ts";
import type { ScriptDatabase } from "../../scripts/database.ts";
import { loadSeed, type SeedOptions, type SeedReport, type TableCounts } from "../../scripts/seed-loader.ts";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// scripts/seed.ts's loader (BUILD-PLAN T-17), loading the three-car fixture into a database made
// for this file: what a first run writes, that a second changes nothing, that a day later only what
// is anchored to today moves (the loader's side of TC-45-9), what a record no longer has, BR-16's
// slug history, the live settings' policy (05-SEED-DATA §2), the ids of rows made before the seed,
// and the guards, each of which refuses and writes nothing.

const FIXTURE = path.join(ROOT, "tests/fixtures/checks/seed");
// SRS §16's test clock, a Sunday in Amman
const NOW = new Date("2026-10-18T12:00:00+03:00");
const DAY_MS = 86_400_000;
const DEMO: SeedOptions = { demo: true, partial: false, resetSettings: false };
// FR-35.6's marks on a hero photo
const MARKS = { front: 0.1, rear: 0.9, wheelFront: 0.25, wheelRear: 0.75, ground: 0.8 };

let throwaway: ThrowawayDatabase | undefined;
let client: postgres.Sql | undefined;
let database: ScriptDatabase;

beforeAll(async () => {
  throwaway = await createThrowawayDatabase("t17_seed");
  client = postgres(throwaway.directUrl, { max: 1, onnotice: () => {} });
  database = drizzle({ client, schema });
});

afterAll(async () => {
  await client?.end();
  await throwaway?.drop();
});

// Each test starts empty: the cascade empties every table that refers to these
beforeEach(async () => {
  await database.execute(sql`truncate table dealer, make, place, demo_session cascade`);
});

/** A fresh copy of the fixture, read as of the day */
function fixture(now = NOW): SeedFiles {
  const read = readSeedFiles(FIXTURE, now);
  if ("problems" in read) throw new Error(read.problems.join("\n"));
  return read.files;
}

/** The committed seed files, read as of the day */
function committed(now = NOW): SeedFiles {
  const read = readSeedFiles(ROOT, now);
  if ("problems" in read) throw new Error(read.problems.join("\n"));
  return read.files;
}

function carIn(files: SeedFiles, seedKey: string) {
  const record = files.cars.find((candidate) => candidate.seedKey === seedKey);
  if (record === undefined) throw new Error(`No record for ${seedKey}`);
  return record;
}

const load = (files: SeedFiles, now = NOW, options: Partial<SeedOptions> = {}) =>
  loadSeed(database, files, now, { ...DEMO, ...options });

function loaded(report: SeedReport) {
  if ("refused" in report) throw new Error(`Refused:\n${report.refused.join("\n")}`);
  return report;
}

const countsOf = (report: SeedReport): Readonly<Record<string, TableCounts>> => loaded(report).counts;

const counted = (counts: Partial<TableCounts>): TableCounts => ({
  inserted: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  ...counts,
});

/** Every row the seed writes, table by table, in a stable order */
async function seedTables() {
  return {
    make: await database.select().from(make).orderBy(make.key),
    model: await database.select().from(model).orderBy(model.key),
    model_alias: await database.select().from(modelAlias).orderBy(modelAlias.modelKey, modelAlias.alias),
    place: await database.select().from(place).orderBy(place.key),
    dealer: await database.select().from(dealer).orderBy(dealer.slug),
    car_slug_history: await database.select().from(carSlugHistory).orderBy(carSlugHistory.slug),
    car: await database.select().from(car).orderBy(car.seedKey, car.refCode),
    inspection: await database.select().from(inspection).orderBy(inspection.carId),
    inspection_panel: await database.select().from(inspectionPanel).orderBy(inspectionPanel.id),
    journey_milestone: await database
      .select()
      .from(journeyMilestone)
      .orderBy(journeyMilestone.carId, journeyMilestone.sortOrder),
    price_change: await database.select().from(priceChange).orderBy(priceChange.id),
    dealer_settings: await database.select().from(dealerSettings).orderBy(dealerSettings.id),
  };
}

type Tables = Awaited<ReturnType<typeof seedTables>>;

/** A pending photo of the car, as API-16 makes one, for the hero to point at */
async function photoOf(carId: string): Promise<string> {
  const [muftah] = await database.select({ id: dealer.id }).from(dealer);
  if (muftah === undefined) throw new Error("The dealer didn't load");
  const [photo] = await database
    .insert(media)
    .values({ dealerId: muftah.id, carId, kind: "photo", storagePrefix: `cars/${carId}`, clientUploadId: uuidv7() })
    .returning({ id: media.id });
  if (photo === undefined) throw new Error("The photo wasn't returned");
  return photo.id;
}

const heroOf = async () =>
  (
    await database
      .select({
        heroCarId: dealerSettings.heroCarId,
        heroMediaId: dealerSettings.heroMediaId,
        heroMarks: dealerSettings.heroMarks,
      })
      .from(dealerSettings)
  )[0];

/** The columns any row's value moved in between the two readings, table by table */
function movedColumns(before: Tables, after: Tables): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(before).map(([table, rows]) => {
      const later: readonly Record<string, unknown>[] = after[table as keyof Tables];
      expect(later, table).toHaveLength(rows.length);
      const moved = new Set<string>();
      rows.forEach((row: Record<string, unknown>, index) => {
        for (const [column, value] of Object.entries(row)) {
          if (!isDeepStrictEqual(value, later[index]?.[column])) moved.add(column);
        }
      });
      return [table, [...moved].sort()];
    }),
  );
}

describe("loading the seed", () => {
  it("writes the fixture's rows under the seed's ids, and a second run on the day changes nothing", async () => {
    const first = countsOf(await load(fixture()));
    expect(first).toStrictEqual({
      make: counted({ inserted: 2 }),
      model: counted({ inserted: 3 }),
      model_alias: counted({ inserted: 5 }),
      place: counted({ inserted: 7 }),
      dealer: counted({ inserted: 1 }),
      car_slug_history: counted({}),
      car: counted({ inserted: 3 }),
      inspection: counted({ inserted: 2 }),
      inspection_panel: counted({ inserted: 26 }),
      journey_milestone: counted({ inserted: 13 }),
      price_change: counted({ inserted: 1 }),
      dealer_settings: counted({ inserted: 1 }),
    });
    const written = await seedTables();
    expect(written.car.map(({ id }) => id)).toStrictEqual(["s01", "s02", "s03"].map((key) => seedIds.car(key)));
    expect(written.dealer_settings[0]).toMatchObject({
      heroCarId: seedIds.car("s01"),
      featuredCarIds: [seedIds.car("s01")],
    });

    const second = countsOf(await load(fixture()));
    expect(second).toStrictEqual(
      Object.fromEntries(
        Object.entries(first).map(([table, { inserted }]) => [table, counted({ unchanged: inserted })]),
      ),
    );
    expect(await seedTables()).toStrictEqual(written);
  });

  it("moves only the dates anchored to today a day later, and a repeated run changes nothing (TC-45-9)", async () => {
    // The last day of a month, so each licence's expiry month moves too
    const lastOfMonth = new Date("2026-10-31T12:00:00+03:00");
    const nextDay = new Date(lastOfMonth.getTime() + DAY_MS);
    countsOf(await load(fixture(lastOfMonth), lastOfMonth));
    const before = await seedTables();
    countsOf(await load(fixture(nextDay), nextDay));
    const after = await seedTables();
    expect(movedColumns(before, after)).toStrictEqual({
      make: [],
      model: [],
      model_alias: [],
      place: [],
      dealer: [],
      car_slug_history: [],
      car: ["licenseExpiry", "publishedAt", "soldAt", "updatedAt", "version"],
      inspection: ["inspectedOn", "updatedAt"],
      inspection_panel: [],
      // No offset crosses into another month on this day
      journey_milestone: [],
      price_change: ["changedAt"],
      dealer_settings: [],
    });
    // Each instant moves by the day, at the car's own time of day
    const [published, sold] = [before.car[0]?.publishedAt, before.car[1]?.soldAt];
    expect(after.car[0]?.publishedAt?.getTime()).toBe((published?.getTime() ?? 0) + DAY_MS);
    expect(after.car[1]?.soldAt?.getTime()).toBe((sold?.getTime() ?? 0) + DAY_MS);
    expect(after.car.map(({ version }) => version)).toStrictEqual([2, 2, 2]);

    const repeated = countsOf(await load(fixture(nextDay), nextDay));
    expect(Object.values(repeated).every(({ inserted, updated, deleted }) => inserted + updated + deleted === 0)).toBe(
      true,
    );
    expect(await seedTables()).toStrictEqual(after);
  });

  it("moves a milestone's month when its offset crosses into the next month", async () => {
    // S01 came into the showroom 9 days before and S02 40 days before: on 31 October and 30
    // September, then a day later on 1 November and 1 October
    const ninth = new Date("2026-11-09T12:00:00+03:00");
    const tenth = new Date(ninth.getTime() + DAY_MS);
    countsOf(await load(fixture(ninth), ninth));
    const before = await seedTables();
    countsOf(await load(fixture(tenth), tenth));
    const after = await seedTables();
    expect(movedColumns(before, after).journey_milestone).toStrictEqual(["occurredMonth"]);
    const moved = after.journey_milestone
      .filter((row, index) => row.occurredMonth !== before.journey_milestone[index]?.occurredMonth)
      .map(({ carId, type, occurredMonth }) => ({ carId, type, occurredMonth }));
    expect(moved).toHaveLength(2);
    expect(moved).toStrictEqual(
      expect.arrayContaining([
        { carId: seedIds.car("s01"), type: "in_showroom", occurredMonth: "2026-11-01" },
        { carId: seedIds.car("s02"), type: "in_showroom", occurredMonth: "2026-10-01" },
      ]),
    );
  });

  it("deletes the aliases, journey steps, price changes and inspection the files no longer have", async () => {
    const longer = fixture();
    const s02 = carIn(longer, "s02");
    s02.journey.splice(3, 0, { type: "free_zone", place: "zarqa_free_zone", month: "2023-06" });
    s02.seedOffsets.priceChanges.unshift({ days: -30, from: 24500, to: 23500 });
    longer.reference.models[0]?.aliases.push("lc300");
    countsOf(await load(longer));

    const shorter = fixture();
    carIn(shorter, "s02").inspection = null;
    const expected = shorter.expectations.cars.s02;
    if (expected === undefined) throw new Error("No expectation for s02");
    expected.inspection = "none";
    const counts = countsOf(await load(shorter));
    expect(counts).toMatchObject({
      model_alias: counted({ deleted: 1, unchanged: 5 }),
      // S02's row holds its offsets, which lost a price change
      car: counted({ updated: 1, unchanged: 2 }),
      inspection: counted({ deleted: 1, unchanged: 1 }),
      // S02's 13 panels go with its inspection
      inspection_panel: counted({ deleted: 13, unchanged: 13 }),
      // S02's steps from the fourth on move up one, and its seventh goes
      journey_milestone: counted({ updated: 3, deleted: 1, unchanged: 10 }),
      price_change: counted({ updated: 1, deleted: 1 }),
    });
    const steps = await database
      .select({ type: journeyMilestone.type })
      .from(journeyMilestone)
      .where(eq(journeyMilestone.carId, seedIds.car("s02")))
      .orderBy(journeyMilestone.sortOrder);
    expect(steps.map(({ type }) => type)).toStrictEqual(carIn(shorter, "s02").journey.map(({ type }) => type));
    expect(await database.select().from(inspectionPanel)).toHaveLength(13);
  });

  it("deletes every alias the files drop from their models, and keeps another model's", async () => {
    countsOf(await load(fixture()));
    // A model the files don't have, as T-18's bench makes will be
    await database.insert(model).values({
      key: "toyota-hilux",
      makeKey: "toyota",
      nameEn: "Hilux",
      nameAr: "هايلوكس",
      defaultBodyType: "pickup",
    });
    await database.insert(modelAlias).values({ modelKey: "toyota-hilux", alias: "hilux" });
    const files = fixture();
    for (const { aliases } of files.reference.models) aliases.splice(0);
    expect(countsOf(await load(files)).model_alias).toStrictEqual(counted({ deleted: 5 }));
    expect(
      await database.select({ modelKey: modelAlias.modelKey, alias: modelAlias.alias }).from(modelAlias),
    ).toStrictEqual([{ modelKey: "toyota-hilux", alias: "hilux" }]);
  });

  it("sets what the files change in a make, a model, a preset and a panel", async () => {
    countsOf(await load(fixture()));
    const files = fixture();
    const [, tesla] = files.reference.makes;
    const [, camry] = files.reference.models;
    const [aqaba] = files.places;
    const bumper = carIn(files, "s01").inspection?.panels.find(({ panelId }) => panelId === "rear_bumper");
    if (tesla === undefined || camry === undefined || aqaba === undefined || bumper === undefined) {
      throw new Error("The fixture lacks a second make or model, a place or S01's rear bumper");
    }
    tesla.nameAr = "تيسلا";
    camry.nameAr = "كامري الجديدة";
    aqaba.nameEn = "Port of Aqaba";
    bumper.noteEn = "Scuff on the corner touched up twice";
    expect(countsOf(await load(files))).toMatchObject({
      make: counted({ updated: 1, unchanged: 1 }),
      model: counted({ updated: 1, unchanged: 2 }),
      place: counted({ updated: 1, unchanged: 6 }),
      inspection_panel: counted({ updated: 1, unchanged: 25 }),
    });
    const written = await seedTables();
    expect([
      written.make.find(({ key }) => key === tesla.key)?.nameAr,
      written.model.find(({ key }) => key === camry.key)?.nameAr,
      written.place.find(({ key }) => key === aqaba.key)?.nameEn,
      written.inspection_panel.find(({ noteEn }) => noteEn?.endsWith("twice"))?.panelId,
    ]).toStrictEqual(["تيسلا", "كامري الجديدة", "Port of Aqaba", "rear_bumper"]);
  });

  it("leaves the journey and price changes of a car the seed doesn't own", async () => {
    countsOf(await load(fixture()));
    const [muftah] = await database.select({ id: dealer.id }).from(dealer);
    if (muftah === undefined) throw new Error("The dealer didn't load");
    const [own] = await database
      .insert(car)
      .values({ dealerId: muftah.id, refCode: "MU-ZZZZ", slug: "2020-toyota-camry-mu-zzzz" })
      .returning({ id: car.id });
    if (own === undefined) throw new Error("The dealer's own car wasn't returned");
    await database
      .insert(journeyMilestone)
      .values({ carId: own.id, sortOrder: 0, type: "in_showroom", occurredMonth: "2026-10-01" });
    await database.insert(priceChange).values({ carId: own.id, oldPriceJod: 20_000, newPriceJod: 19_500 });
    countsOf(await load(fixture()));
    const [steps, changes] = await Promise.all([
      database.select().from(journeyMilestone).where(eq(journeyMilestone.carId, own.id)),
      database.select().from(priceChange).where(eq(priceChange.carId, own.id)),
    ]);
    expect([steps.length, changes.length]).toStrictEqual([1, 1]);
  });

  it("keeps a car's old slug when its slug changes, and moves its version (BR-16, FR-31)", async () => {
    countsOf(await load(fixture()));
    const [before] = await database.select({ slug: car.slug }).from(car).where(eq(car.seedKey, "s01"));
    const files = fixture();
    carIn(files, "s01").car.trim = "VXR";
    const counts = countsOf(await load(files));
    expect(counts).toMatchObject({
      car_slug_history: counted({ inserted: 1 }),
      car: counted({ updated: 1, unchanged: 2 }),
    });
    const [after] = await database
      .select({ slug: car.slug, version: car.version })
      .from(car)
      .where(eq(car.seedKey, "s01"));
    expect(after).toStrictEqual({ slug: before?.slug.replace("-gxr-", "-vxr-"), version: 2 });
    expect(
      await database.select({ carId: carSlugHistory.carId, slug: carSlugHistory.slug }).from(carSlugHistory),
    ).toStrictEqual([{ carId: seedIds.car("s01"), slug: before?.slug }]);
  });

  it("writes the live settings only while they're missing, and again under --reset-settings (05-SEED-DATA §2)", async () => {
    const files = fixture();
    countsOf(await load(files));
    const written = files.settings.brand.storyEn;
    files.settings.brand.storyEn = "The owner's own story.";
    const storyOf = async () =>
      (await database.select({ storyEn: dealerSettings.storyEn }).from(dealerSettings))[0]?.storyEn;

    expect(countsOf(await load(files)).dealer_settings).toStrictEqual(counted({ unchanged: 1 }));
    expect(await storyOf()).toBe(written);
    expect(countsOf(await load(files, NOW, { resetSettings: true })).dealer_settings).toStrictEqual(
      counted({ updated: 1 }),
    );
    expect(await storyOf()).toBe("The owner's own story.");
  });

  it("clears the hero's photo and marks when --reset-settings moves the hero car, as both are of that car", async () => {
    countsOf(await load(fixture()));
    // The owner made S02 the hero, with a photo of it and marks on that photo (FR-35.6)
    const photoId = await photoOf(seedIds.car("s02"));
    await database
      .update(dealerSettings)
      .set({ heroCarId: seedIds.car("s02"), heroMediaId: photoId, heroMarks: MARKS });
    expect(countsOf(await load(fixture(), NOW, { resetSettings: true })).dealer_settings).toStrictEqual(
      counted({ updated: 1 }),
    );
    expect(await heroOf()).toStrictEqual({ heroCarId: seedIds.car("s01"), heroMediaId: null, heroMarks: null });
  });

  it("keeps the hero's photo and marks when --reset-settings keeps the hero car", async () => {
    countsOf(await load(fixture()));
    const photoId = await photoOf(seedIds.car("s01"));
    await database.update(dealerSettings).set({ heroMediaId: photoId, heroMarks: MARKS });
    // A change elsewhere in the settings, so the reset sets the row
    const files = fixture();
    files.settings.brand.storyEn = "The owner's own story.";
    expect(countsOf(await load(files, NOW, { resetSettings: true })).dealer_settings).toStrictEqual(
      counted({ updated: 1 }),
    );
    expect(await heroOf()).toStrictEqual({ heroCarId: seedIds.car("s01"), heroMediaId: photoId, heroMarks: MARKS });
  });

  it("keeps the ids of a dealer, a preset, a car, an inspection and live settings made before the seed", async () => {
    const files = fixture();
    const [dealerId, placeId, carId, inspectionId, settingsId] = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
    const [aqaba] = files.places;
    const s01 = seedRows(files, NOW).cars[0]?.car;
    if (aqaba === undefined || s01 === undefined) throw new Error("The fixture has no places or no cars");
    await database.insert(dealer).values({ id: dealerId, slug: "muftah" });
    await database.insert(place).values({ ...aqaba, id: placeId, isPreset: true });
    await database.insert(car).values({ id: carId, dealerId, seedKey: "s01", refCode: s01.refCode, slug: s01.slug });
    await database.insert(inspection).values({ id: inspectionId, carId });
    await database
      .insert(dealerSettings)
      .values({ id: settingsId, dealerId, brandNameAr: "معرض", brandNameEn: "Showroom" });

    const counts = countsOf(await load(files, NOW, { resetSettings: true }));
    expect(counts).toMatchObject({
      dealer: counted({ unchanged: 1 }),
      place: counted({ inserted: 6, unchanged: 1 }),
      car: counted({ inserted: 2, updated: 1 }),
      inspection: counted({ inserted: 1, updated: 1 }),
      dealer_settings: counted({ updated: 1 }),
    });
    const written = await seedTables();
    expect(written.dealer.map(({ id }) => id)).toStrictEqual([dealerId]);
    expect(written.car.every((row) => row.dealerId === dealerId)).toBe(true);
    expect(written.car[0]?.id).toBe(carId);
    expect(written.inspection.find((row) => row.carId === carId)?.id).toBe(inspectionId);
    expect(written.inspection_panel.filter((row) => row.inspectionId === inspectionId)).toHaveLength(13);
    expect(written.place.find(({ key }) => key === aqaba.key)?.id).toBe(placeId);
    expect(written.journey_milestone.filter((row) => row.placeId === placeId)).toHaveLength(1);
    expect(written.dealer_settings).toMatchObject([
      { id: settingsId, dealerId, brandNameEn: files.settings.brand.brandNameEn, heroCarId: carId },
    ]);
  });

  it("keeps a preset the files no longer have, and says so, of presets alone", async () => {
    countsOf(await load(fixture()));
    const [muftah] = await database.select({ id: dealer.id }).from(dealer);
    if (muftah === undefined) throw new Error("The dealer didn't load");
    // A place of the dealer's own, which no file lists either
    await database
      .insert(place)
      .values({ key: "dealer_yard", nameEn: "The yard", nameAr: "الساحة", dealerId: muftah.id });
    const files = fixture();
    carIn(files, "s02").journey.splice(1, 1);
    const fewer = {
      ...files,
      places: files.places.filter(({ key }) => key !== "baltimore"),
      sources: files.sources.filter(({ key }) => key !== "baltimore"),
    };
    expect(loaded(await load(fewer)).notes).toStrictEqual([
      "place baltimore: a preset seed/places.json doesn't have, kept",
    ]);
    expect(await database.select({ key: place.key }).from(place).where(eq(place.key, "baltimore"))).toHaveLength(1);
  });

  it("takes no demo's copy for another car, as a copy keeps its original's code and slug (BR-31)", async () => {
    countsOf(await load(fixture()));
    const [original] = await database.select().from(car).where(eq(car.seedKey, "s01"));
    if (original === undefined) throw new Error("S01 didn't load");
    const sessionId = "a".repeat(22);
    await database.insert(demoSession).values({ id: sessionId, tokenHash: "0".repeat(64) });
    await database.insert(car).values({
      dealerId: original.dealerId,
      demoSessionId: sessionId,
      copiedFromCarId: original.id,
      refCode: original.refCode,
      slug: original.slug,
    });
    expect(countsOf(await load(fixture())).car).toStrictEqual(counted({ unchanged: 3 }));
  });

  it("takes no other dealer's car for a holder of a seed car's code or slug", async () => {
    countsOf(await load(fixture()));
    const [s01] = await database.select().from(car).where(eq(car.seedKey, "s01"));
    const [other] = await database.insert(dealer).values({ slug: "another-dealer" }).returning({ id: dealer.id });
    if (s01 === undefined || other === undefined) throw new Error("S01 or the other dealer is missing");
    await database.insert(car).values({ dealerId: other.id, refCode: s01.refCode, slug: s01.slug });
    expect(countsOf(await load(fixture())).car).toStrictEqual(counted({ unchanged: 3 }));
  });

  it("loads the dealer and its settings before the first car (--partial)", async () => {
    const files = fixture();
    const carless = {
      ...files,
      cars: [],
      settings: { ...files.settings, showcase: { heroCar: null, featuredCars: [] } },
    };
    expect(countsOf(await load(carless, NOW, { partial: true }))).toMatchObject({
      dealer: counted({ inserted: 1 }),
      car: counted({}),
      inspection: counted({}),
      inspection_panel: counted({}),
      journey_milestone: counted({}),
      price_change: counted({}),
      dealer_settings: counted({ inserted: 1 }),
    });
  });

  it("waits for another writer's lock, so no two runs interleave", async () => {
    const other = postgres(throwaway?.directUrl ?? "", { max: 1, onnotice: () => {} });
    const holder = await other.reserve();
    try {
      await holder`begin`;
      await holder`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`;
      let settled = false;
      const loading = load(fixture()).finally(() => {
        settled = true;
      });
      // The run waits on the lock the holder took. Each client has one connection, so the holder asks
      const waiting = async () =>
        (
          await holder<{ waiting: number }[]>`
            select count(*)::int as waiting from pg_locks where locktype = 'advisory' and not granted`
        )[0]?.waiting ?? 0;
      await expect.poll(waiting, { timeout: 10_000 }).toBe(1);
      expect(settled).toBe(false);
      await holder`commit`;
      countsOf(await loading);
    } finally {
      holder.release();
      await other.end();
    }
  });

  it("loads the committed seed, and a second run on the day changes nothing", async () => {
    const files = committed();
    const first = countsOf(await load(files));
    expect(first).toMatchObject({
      make: counted({ inserted: files.reference.makes.length }),
      model: counted({ inserted: files.reference.models.length }),
      place: counted({ inserted: files.places.length }),
      car: counted({ inserted: files.cars.length }),
      dealer_settings: counted({ inserted: 1 }),
    });
    const written = await seedTables();
    const second = countsOf(await load(committed()));
    expect(second).toStrictEqual(
      Object.fromEntries(
        Object.entries(first).map(([table, { inserted }]) => [table, counted({ unchanged: inserted })]),
      ),
    );
    expect(await seedTables()).toStrictEqual(written);
  });

  it("loads the reference data alone outside the demo", async () => {
    const counts = countsOf(await load(fixture(), NOW, { demo: false }));
    expect(Object.keys(counts)).toStrictEqual(["make", "model", "model_alias", "place"]);
    const written = await seedTables();
    expect([written.dealer, written.car, written.dealer_settings]).toStrictEqual([[], [], []]);
  });
});

describe("refusing to load the seed", () => {
  /** The guard's refusal, and that the database holds after it what it held before */
  async function refusal(files: SeedFiles, options: Partial<SeedOptions> = {}) {
    const before = await seedTables();
    const report = await load(files, NOW, options);
    expect(await seedTables()).toStrictEqual(before);
    if (!("refused" in report)) throw new Error("The seed loaded");
    return report.refused;
  }

  it("writes nothing while pnpm check:seed finds a problem", async () => {
    const files = fixture();
    carIn(files, "s01").car.descriptionEn = `Clean ${String.fromCodePoint(0x2014)} one owner`;
    expect(await refusal(files)).toStrictEqual(["seed/cars.json: s01: car.descriptionEn: an em dash (U+2014) (C-07)"]);
  });

  it("refuses a seed car the files no longer have, or whose code they change (BR-15)", async () => {
    countsOf(await load(fixture()));
    const files = fixture();
    const fewer = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s03") };
    expect(await refusal(fewer, { partial: true })).toStrictEqual([
      "car s03: a seed car seed/cars.json doesn't have (05-SEED-DATA §4.2)",
    ]);
    const recoded = fixture();
    carIn(recoded, "s01").refCode = "MU-2222";
    expect(await refusal(recoded)).toStrictEqual([
      "car s01: ref_code MU-3HK8, where seed/cars.json has MU-2222 (BR-15)",
    ]);
  });

  it("refuses a dealer whose prefix differs from the file's (BR-15)", async () => {
    countsOf(await load(fixture()));
    await database.update(dealer).set({ refPrefix: "AB" });
    expect(await refusal(fixture())).toStrictEqual([
      "dealer muftah: ref_prefix AB, where seed/settings.json has MU (BR-15)",
    ]);
  });

  it("refuses a code or a slug another of the dealer's cars holds, and a seed car of another dealer", async () => {
    const dealerId = uuidv7();
    const s02Slug = seedRows(fixture(), NOW).cars[1]?.car.slug ?? "";
    await database.insert(dealer).values({ id: dealerId, slug: "muftah" });
    await database.insert(car).values([
      { dealerId, refCode: "MU-3HK8", slug: "2019-toyota-land-cruiser-mu-3hk8" },
      { dealerId, refCode: "MU-ZZZZ", slug: s02Slug },
    ]);
    expect(await refusal(fixture())).toStrictEqual([
      "car s01: another car holds ref_code MU-3HK8",
      `car s02: another car holds slug ${s02Slug}`,
    ]);

    await database.execute(sql`truncate table dealer cascade`);
    const otherId = uuidv7();
    await database.insert(dealer).values({ id: otherId, slug: "another-dealer" });
    await database.insert(car).values({ dealerId: otherId, seedKey: "s01", refCode: "MU-3HK8", slug: "s01-elsewhere" });
    expect(await refusal(fixture())).toStrictEqual(["car s01: a seed car of another dealer"]);
  });
});
