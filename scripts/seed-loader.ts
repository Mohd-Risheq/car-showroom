import {
  and,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { PgColumn, PgInsertValue, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import {
  car,
  carSlugHistory,
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
} from "../src/lib/db/schema.ts";
import { SEED_LOCK_KEY } from "../src/lib/demo/seed-lock.ts";
import { seedChecks } from "./checks/seed-checks.ts";
import { SEED_PATHS, type SeedFiles } from "./checks/seed-files.ts";
import { type RowIds, SEED_ROW_IDS, type SeedRows, seedRows } from "./checks/seed-rows.ts";
import { Refusal, type ScriptDatabase, type ScriptTransaction } from "./database.ts";

// What scripts/seed.ts writes (05-SEED-DATA §9.2, SRS §6.4), in one transaction: the reference data
// everywhere, and in a demo the dealer, its cars and its live settings. Each table takes one
// statement, which inserts the rows and sets a stored row only where it differs, so a second run on
// the same day changes nothing, and a run a day later moves only what is anchored to today. The rows
// hold the columns the seed owns and no others, so a re-seed never touches what others write, such
// as the media T-18 adds. Every guard reads before the first write, and nothing is written while
// pnpm check:seed finds a problem or a guard refuses.

// Never set on a stored row: its id, which other rows refer to it by, and when it was made. A row the
// seed meets again stays with its parent too, as its conflict target or its id holds the parent's key,
// and the guards refuse a seed car of another dealer.
const NEVER_SET = new Set(["id", "createdAt"]);

const LIVE_SETTINGS = sql`${sql.identifier("demo_session_id")} is null`;

export type SeedOptions = {
  /** DEMO_MODE=true and DEALER_SLUG is the demo dealer's: the dealer, its cars and its settings load too */
  readonly demo: boolean;
  /** pnpm check:seed --partial's rules, for the batches written before every car is */
  readonly partial: boolean;
  /** The live settings are written again from seed/settings.json, not only when missing (§2) */
  readonly resetSettings: boolean;
};

/**
 * The run's options from its environment and arguments: the demo loads only when DEMO_MODE is
 * exactly "true" and DEALER_SLUG is the demo dealer's (SRS §6.4), and each flag sets its own option
 */
export function seedOptions(
  environment: Readonly<Record<string, string | undefined>>,
  argv: readonly string[],
  slug: string,
): SeedOptions {
  return {
    demo: environment.DEMO_MODE === "true" && environment.DEALER_SLUG === slug,
    partial: argv.includes("--partial"),
    resetSettings: argv.includes("--reset-settings"),
  };
}

export type TableCounts = {
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly unchanged: number;
};

export type SeedReport =
  | { readonly refused: readonly string[] }
  | { readonly counts: Readonly<Record<string, TableCounts>>; readonly notes: readonly string[] };

const NONE: TableCounts = { inserted: 0, updated: 0, deleted: 0, unchanged: 0 };

// Writing

function columnOf(table: PgTable, key: string): PgColumn {
  const columns: Record<string, PgColumn | undefined> = getTableColumns(table);
  const column = columns[key];
  if (column === undefined) throw new Error(`${getTableName(table)} has no column for ${key}`);
  return column;
}

const excluded = (column: PgColumn) => sql`excluded.${sql.identifier(column.name)}`;

/** A live settings column's stored value while a reset keeps the hero car, and null once it moves it */
const keptWhileHeroStays = (column: PgColumn) =>
  sql`case when ${dealerSettings.heroCarId} is not distinct from ${excluded(dealerSettings.heroCarId)} then ${column} end`;

type Conflict<Table extends PgTable> = {
  readonly target: PgColumn | PgColumn[];
  /** The predicate of a partial unique index */
  readonly targetWhere?: SQL;
  /** Set too, on a row set because it differs: columns the rows don't hold, each to its expression */
  readonly alsoSet?: { readonly [Key in keyof Table["$inferInsert"]]?: SQL };
};

/**
 * Inserts the rows, and sets each stored row that conflicts on the target wherever it differs from
 * its row, in one statement. An inserted row returns xmax = 0, a set row another xmax, and a row
 * left as it was returns nothing.
 */
async function upsert<Table extends PgTable>(
  tx: ScriptTransaction,
  table: Table,
  rows: readonly PgInsertValue<Table>[],
  { target, targetWhere, alsoSet = {} }: Conflict<Table>,
): Promise<TableCounts> {
  const [first] = rows;
  if (first === undefined) return NONE;
  // A conflicting row holds the target's values already, so setting them changes nothing
  const settable = Object.keys(first)
    .filter((key) => !NEVER_SET.has(key))
    .map((key) => [key, columnOf(table, key)] as const);
  const set = Object.fromEntries(settable.map(([key, column]) => [key, excluded(column)]));
  // alsoSet's keys are columns the rows don't hold, so it never overrides what the files give
  for (const key of Object.keys(alsoSet)) {
    columnOf(table, key);
    if (key in first) throw new Error(`${getTableName(table)}: ${key} set from the rows and from alsoSet`);
  }
  const stored = sql.join(
    settable.map(([, column]) => column),
    sql`, `,
  );
  const proposed = sql.join(
    settable.map(([, column]) => excluded(column)),
    sql`, `,
  );
  const returned = await tx
    .insert(table)
    .values([...rows])
    .onConflictDoUpdate({
      target,
      ...(targetWhere === undefined ? {} : { targetWhere }),
      // Every key passed columnOf: the rows', each set to the inserted row's value, and alsoSet's
      set: { ...set, ...alsoSet } as PgUpdateSetSource<Table>,
      setWhere: sql`(${stored}) is distinct from (${proposed})`,
    })
    .returning({ inserted: sql<boolean>`xmax = 0` });
  const inserted = returned.filter((row) => row.inserted).length;
  return { inserted, updated: returned.length - inserted, deleted: 0, unchanged: rows.length - returned.length };
}

/** Inserts the rows not stored yet, and leaves the stored ones as they are */
async function insertMissing<Table extends PgTable>(
  tx: ScriptTransaction,
  table: Table,
  rows: readonly PgInsertValue<Table>[],
  { target, where }: { readonly target: PgColumn | PgColumn[]; readonly where?: SQL },
): Promise<TableCounts> {
  if (rows.length === 0) return NONE;
  const returned = await tx
    .insert(table)
    .values([...rows])
    .onConflictDoNothing({ target, ...(where === undefined ? {} : { where }) })
    .returning({ inserted: sql<boolean>`true` });
  return { ...NONE, inserted: returned.length, unchanged: rows.length - returned.length };
}

/** Whether a row's two columns hold none of the pairs */
function noneOf(first: PgColumn, second: PgColumn, pairs: readonly (readonly [unknown, unknown])[]): SQL {
  if (pairs.length === 0) return sql`true`;
  const listed = pairs.map(([one, other]) => sql`(${sql.param(one, first)}, ${sql.param(other, second)})`);
  return sql`(${first}, ${second}) not in (${sql.join(listed, sql`, `)})`;
}

// Reading, before any write

type StoredCar = { readonly id: string; readonly dealerId: string; readonly refCode: string; readonly slug: string };

/** The rows the seed meets: its dealer, the presets, the seed cars and their inspections, by natural key */
type Stored = {
  readonly dealer: { readonly id: string; readonly refPrefix: string } | undefined;
  readonly placeIds: ReadonlyMap<string, string>;
  readonly cars: ReadonlyMap<string, StoredCar>;
  /** By car id */
  readonly inspectionIds: ReadonlyMap<string, string>;
};

async function storedRows(tx: ScriptTransaction, files: SeedFiles): Promise<Stored> {
  const [found] = await tx
    .select({ id: dealer.id, refPrefix: dealer.refPrefix })
    .from(dealer)
    .where(eq(dealer.slug, files.settings.dealer.slug));
  const places = await tx
    .select({ key: place.key, id: place.id })
    .from(place)
    .where(
      inArray(
        place.key,
        files.places.map(({ key }) => key),
      ),
    );
  const cars = await tx
    .select({ seedKey: car.seedKey, id: car.id, dealerId: car.dealerId, refCode: car.refCode, slug: car.slug })
    .from(car)
    .where(isNotNull(car.seedKey));
  const inspections = await tx
    .select({ carId: inspection.carId, id: inspection.id })
    .from(inspection)
    .where(
      inArray(
        inspection.carId,
        cars.map(({ id }) => id),
      ),
    );
  return {
    dealer: found,
    placeIds: new Map(places.flatMap(({ key, id }) => (key === null ? [] : [[key, id]]))),
    cars: new Map(cars.flatMap(({ seedKey, ...stored }) => (seedKey === null ? [] : [[seedKey, stored]]))),
    inspectionIds: new Map(inspections.map(({ carId, id }) => [carId, id])),
  };
}

/** The stored row's id for each natural key, and the seed's own id for a row not stored yet */
function rowIds(stored: Stored): RowIds {
  return {
    dealer: (slug) => stored.dealer?.id ?? SEED_ROW_IDS.dealer(slug),
    place: (key) => stored.placeIds.get(key) ?? SEED_ROW_IDS.place(key),
    car: (seedKey) => stored.cars.get(seedKey)?.id ?? SEED_ROW_IDS.car(seedKey),
    inspection: (seedKey) => {
      const carId = stored.cars.get(seedKey)?.id;
      return (carId === undefined ? undefined : stored.inspectionIds.get(carId)) ?? SEED_ROW_IDS.inspection(seedKey);
    },
  };
}

/** BR-15's prefix and codes never change, and a seed car is never dropped here (§4.2's swaps are T-18's) */
function storedProblems(files: SeedFiles, stored: Stored): string[] {
  const { slug, refPrefix } = files.settings.dealer;
  const problems: string[] = [];
  if (stored.dealer !== undefined && stored.dealer.refPrefix !== refPrefix) {
    problems.push(
      `dealer ${slug}: ref_prefix ${stored.dealer.refPrefix}, where ${SEED_PATHS.settings} has ${refPrefix} (BR-15)`,
    );
  }
  const records = new Map(files.cars.map((record) => [record.seedKey, record]));
  for (const [seedKey, { dealerId, refCode }] of stored.cars) {
    const record = records.get(seedKey);
    if (record === undefined) {
      problems.push(`car ${seedKey}: a seed car ${SEED_PATHS.cars} doesn't have (05-SEED-DATA §4.2)`);
    } else if (dealerId !== stored.dealer?.id) {
      problems.push(`car ${seedKey}: a seed car of another dealer`);
    } else if (refCode !== record.refCode) {
      problems.push(`car ${seedKey}: ref_code ${refCode}, where ${SEED_PATHS.cars} has ${record.refCode} (BR-15)`);
    }
  }
  return problems;
}

/**
 * A seed car's code or slug held by another of the dealer's live cars, which the unique keys would
 * refuse. A demo's copy keeps its original's (BR-31), and a seed car the files lack is an orphan.
 */
async function takenProblems(tx: ScriptTransaction, rows: SeedRows, stored: Stored): Promise<string[]> {
  if (stored.dealer === undefined || rows.cars.length === 0) return [];
  const seeded = rows.cars.map(({ car: row }) => row);
  const others = await tx
    .select({ refCode: car.refCode, slug: car.slug })
    .from(car)
    .where(
      and(
        eq(car.dealerId, stored.dealer.id),
        isNull(car.demoSessionId),
        isNull(car.seedKey),
        or(
          inArray(
            car.refCode,
            seeded.map(({ refCode }) => refCode),
          ),
          inArray(
            car.slug,
            seeded.map(({ slug }) => slug),
          ),
        ),
      ),
    );
  return seeded.flatMap(({ seedKey, refCode, slug }) => [
    ...(others.some((other) => other.refCode === refCode)
      ? [`car ${seedKey}: another car holds ref_code ${refCode}`]
      : []),
    ...(others.some((other) => other.slug === slug) ? [`car ${seedKey}: another car holds slug ${slug}`] : []),
  ]);
}

// The writes, in the order the foreign keys need

type Counted = Record<string, TableCounts>;

/** The makes, the models and their aliases, and the preset places (SRS §6.4) */
async function writeReference(tx: ScriptTransaction, rows: SeedRows): Promise<Counted> {
  const makes = await upsert(tx, make, rows.makes, { target: make.key });
  const models = await upsert(tx, model, rows.models, { target: model.key });
  const aliases = await insertMissing(tx, modelAlias, rows.aliases, {
    target: [modelAlias.modelKey, modelAlias.alias],
  });
  // A seed model's aliases the file no longer has
  const droppedAliases = await tx
    .delete(modelAlias)
    .where(
      and(
        inArray(
          modelAlias.modelKey,
          rows.models.map(({ key }) => key),
        ),
        noneOf(
          modelAlias.modelKey,
          modelAlias.alias,
          rows.aliases.map(({ modelKey, alias }) => [modelKey, alias] as const),
        ),
      ),
    )
    .returning({ id: modelAlias.id });
  const places = await upsert(tx, place, rows.places, { target: place.key });
  return {
    [getTableName(make)]: makes,
    [getTableName(model)]: models,
    [getTableName(modelAlias)]: { ...aliases, deleted: droppedAliases.length },
    [getTableName(place)]: places,
  };
}

/** A preset the file no longer has keeps its row, as milestones may name it */
async function keptPresets(tx: ScriptTransaction, files: SeedFiles): Promise<string[]> {
  const kept = await tx
    .select({ key: place.key })
    .from(place)
    .where(
      and(
        eq(place.isPreset, true),
        notInArray(
          place.key,
          files.places.map(({ key }) => key),
        ),
      ),
    );
  return kept.map(({ key }) => `place ${key}: a preset ${SEED_PATHS.places} doesn't have, kept`);
}

/** The demo dealer, its cars with what each holds, and its live settings (05-SEED-DATA §2, §4, §5) */
async function writeDemo(
  tx: ScriptTransaction,
  rows: SeedRows,
  stored: Stored,
  options: SeedOptions,
): Promise<Counted> {
  const seeded = rows.cars;
  const carIds = seeded.map(({ car: row }) => row.id);
  const dealers = await insertMissing(tx, dealer, [rows.dealer], { target: dealer.slug });
  // BR-16: a car's old slug keeps redirecting to it
  const movedSlugs = seeded.flatMap(({ seedKey, car: row }) => {
    const before = stored.cars.get(seedKey);
    return before === undefined || before.slug === row.slug
      ? []
      : [{ carId: before.id, dealerId: row.dealerId, slug: before.slug }];
  });
  const slugHistory = await insertMissing(tx, carSlugHistory, movedSlugs, {
    target: [carSlugHistory.carId, carSlugHistory.slug],
  });
  // FR-31: a re-seed is a write an open editor didn't see, so it moves the version too
  const cars = await upsert(
    tx,
    car,
    seeded.map(({ car: row }) => row),
    { target: car.seedKey, alsoSet: { version: sql`${car.version} + 1` } },
  );
  const inspections = await upsert(
    tx,
    inspection,
    seeded.flatMap(({ inspection: row }) => (row === null ? [] : [row])),
    { target: inspection.carId },
  );
  // A dropped inspection's panels go first, in a statement of their own, so the report counts them
  const droppedCarIds = seeded.flatMap(({ car: row, inspection: held }) => (held === null ? [row.id] : []));
  const droppedPanels = await tx
    .delete(inspectionPanel)
    .where(
      inArray(
        inspectionPanel.inspectionId,
        tx.select({ id: inspection.id }).from(inspection).where(inArray(inspection.carId, droppedCarIds)),
      ),
    )
    .returning({ id: inspectionPanel.id });
  const droppedInspections = await tx
    .delete(inspection)
    .where(inArray(inspection.carId, droppedCarIds))
    .returning({ id: inspection.id });
  const panels = await upsert(
    tx,
    inspectionPanel,
    seeded.flatMap(({ panels: held }) => held),
    { target: [inspectionPanel.inspectionId, inspectionPanel.panelId] },
  );
  const milestoneRows = seeded.flatMap(({ milestones }) => milestones);
  const milestones = await upsert(tx, journeyMilestone, milestoneRows, {
    target: [journeyMilestone.carId, journeyMilestone.sortOrder],
  });
  // The steps past a journey's new end
  const droppedMilestones = await tx
    .delete(journeyMilestone)
    .where(
      and(
        inArray(journeyMilestone.carId, carIds),
        noneOf(
          journeyMilestone.carId,
          journeyMilestone.sortOrder,
          milestoneRows.map(({ carId, sortOrder }) => [carId, sortOrder] as const),
        ),
      ),
    )
    .returning({ id: journeyMilestone.id });
  const changeRows = seeded.flatMap(({ priceChanges }) => priceChanges);
  const priceChanges = await upsert(tx, priceChange, changeRows, { target: priceChange.id });
  const droppedChanges = await tx
    .delete(priceChange)
    .where(
      and(
        inArray(priceChange.carId, carIds),
        notInArray(
          priceChange.id,
          changeRows.map(({ id }) => id),
        ),
      ),
    )
    .returning({ id: priceChange.id });
  // §2: the live settings are the owner's once written, unless --reset-settings writes them again.
  // The hero's photo and marks are of its car (FR-35.6), so a reset that moves the hero car clears
  // them, and one that keeps it keeps them.
  const settings = options.resetSettings
    ? await upsert(tx, dealerSettings, [rows.settings], {
        target: dealerSettings.dealerId,
        targetWhere: LIVE_SETTINGS,
        alsoSet: {
          heroMediaId: keptWhileHeroStays(dealerSettings.heroMediaId),
          heroMarks: keptWhileHeroStays(dealerSettings.heroMarks),
        },
      })
    : await insertMissing(tx, dealerSettings, [rows.settings], {
        target: dealerSettings.dealerId,
        where: LIVE_SETTINGS,
      });
  return {
    [getTableName(dealer)]: dealers,
    [getTableName(carSlugHistory)]: slugHistory,
    [getTableName(car)]: cars,
    [getTableName(inspection)]: { ...inspections, deleted: droppedInspections.length },
    [getTableName(inspectionPanel)]: { ...panels, deleted: droppedPanels.length },
    [getTableName(journeyMilestone)]: { ...milestones, deleted: droppedMilestones.length },
    [getTableName(priceChange)]: { ...priceChanges, deleted: droppedChanges.length },
    [getTableName(dealerSettings)]: settings,
  };
}

/**
 * Loads the seed files on the Amman day of `now`, in one transaction, or refuses and writes nothing:
 * while pnpm check:seed finds a problem, or a guard finds what the seed must not overwrite
 */
export async function loadSeed(
  database: ScriptDatabase,
  files: SeedFiles,
  now: Date,
  options: SeedOptions,
): Promise<SeedReport> {
  const checked = seedChecks(files, now, { partial: options.partial });
  if (checked.problems.length > 0) return { refused: checked.problems };
  try {
    return await database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SEED_LOCK_KEY})`);
      const stored = await storedRows(tx, files);
      const rows = seedRows(files, now, rowIds(stored));
      if (options.demo) {
        const problems = [...storedProblems(files, stored), ...(await takenProblems(tx, rows, stored))];
        if (problems.length > 0) throw new Refusal(problems);
      }
      const counts = {
        ...(await writeReference(tx, rows)),
        ...(options.demo ? await writeDemo(tx, rows, stored, options) : {}),
      };
      return { counts, notes: await keptPresets(tx, files) };
    });
  } catch (error) {
    if (error instanceof Refusal) return { refused: error.problems };
    throw error;
  }
}
