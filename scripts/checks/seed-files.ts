// The seed's inputs, read and parsed for scripts/seed.ts and pnpm check:seed: the data in seed/, the
// private VINs where the repository has them, and two files the checks compare the data with, the
// places' OpenStreetMap sources and 05-SEED-DATA's own figures. CI can't read docs/ (D-035), so
// what the checks need from the specification is copied into scripts/seed-expectations.json. A
// problem names the file and the key path, and nothing is thrown.
import { existsSync } from "node:fs";
import path from "node:path";
import { BODY_TYPES, FUEL_TYPES, PANEL_IDS, REGIONAL_SPECS } from "../../src/lib/db/enums.ts";
import { calendarDate } from "../../src/lib/validation/fields.ts";
import {
  parseStrict,
  SEED_STATUSES,
  type SeedCar,
  seedCarsSchema,
  seedKeySchema,
  type SeedPlace,
  seedPlacesSchema,
  type SeedReference,
  seedReferenceSchema,
  type SeedSettings,
  seedSettingsSchema,
  type SeedVins,
  seedVinsSchema,
} from "../../src/lib/validation/seed.ts";
import { z } from "../../src/lib/validation/zod.ts";
import { readJson, readText, shown } from "./files.ts";

/** Each input's path from the project's root */
export const SEED_PATHS = {
  cars: "seed/cars.json",
  reference: "seed/reference.json",
  places: "seed/places.json",
  settings: "seed/settings.json",
  vins: "seed-private/vins.json",
  sources: "scripts/places.source.md",
  expectations: "scripts/seed-expectations.json",
} as const;

// What a record's inspection is, by §4.1: every item stated, a stated count of the 16, or none
const inspectionExpected = z.union([
  z.literal("complete"),
  z.literal("none"),
  z.object({ filled: z.int().min(0).max(16) }),
]);

const carExpected = z.object({
  status: z.enum(SEED_STATUSES),
  // Days from today, as §4.1 lists them
  published: z.int().max(0).nullable(),
  sold: z.int().max(0).nullable(),
  mileageKm: z.int().min(0),
  priceJod: z.int().nullable(),
  fuelType: z.enum(FUEL_TYPES),
  regionalSpecs: z.enum(REGIONAL_SPECS),
  inspection: inspectionExpected,
  // The EPA's figures, where a record's consumption is the EPA's (§10 check 13)
  epa: z.object({ lPer100km: z.number().optional(), kwhPer100km: z.number().optional() }).nullable(),
});

/** scripts/seed-expectations.json: what 05-SEED-DATA says the records add up to */
export const seedExpectationsSchema = z.object({
  cars: z.record(seedKeySchema, carExpected),
  // §4.1's mix: how many cars of each fuel type and body type
  mix: z.object({
    fuel: z.partialRecord(z.enum(FUEL_TYPES), z.int().min(1)),
    body: z.partialRecord(z.enum(BODY_TYPES), z.int().min(1)),
  }),
  // §4.1: so the Freshly inspected row never falls back (FR-04.4)
  publicWithCompleteInspection: z.int().min(0),
  // §4.1: the cars with each badge or note, as of the day the seed loads
  badges: z.object({
    new: z.array(seedKeySchema),
    priceReduced: z.array(seedKeySchema),
    priceDropped: z.array(seedKeySchema),
  }),
  // §5.5: the readings that contradict their declared state on purpose (BR-08)
  contradictions: z.array(z.object({ car: seedKeySchema, panel: z.enum(PANEL_IDS) })),
  // §1 rule 6: the day Jordan's import rules changed, and the one car that entered after it
  importRulesFrom: calendarDate(),
  importException: seedKeySchema.nullable(),
});

export type SeedExpectations = z.output<typeof seedExpectationsSchema>;

/** A preset place's source as scripts/places.source.md records it */
export type PlaceSource = { readonly key: string; readonly osm: string; readonly lat: number; readonly lng: number };

export type SeedFiles = {
  readonly cars: readonly SeedCar[];
  readonly reference: SeedReference;
  readonly places: readonly SeedPlace[];
  readonly settings: SeedSettings;
  /** None on a public clone, which leaves the VINs out (05-SEED-DATA §6.1) */
  readonly vins: SeedVins | null;
  readonly sources: readonly PlaceSource[];
  readonly expectations: SeedExpectations;
};

/** An input's value, or the problems that keep it from being read */
type Parsed<Data> = { readonly data: Data | undefined; readonly problems: readonly string[] };

const SOURCE_ROW = /^`([a-z0-9_]+)`$/;
const OSM_OBJECT = /^(?:node|way|relation)\/\d+$/;
const COORDINATE = /^-?\d+(?:\.\d+)?$/;

/**
 * The rows of scripts/places.source.md's table: a place key, its OSM object and the coordinates read
 * from it. Any other line is prose. A row that doesn't read is a problem.
 */
export function parsePlaceSources(markdown: string): { sources: PlaceSource[]; problems: string[] } {
  const sources: PlaceSource[] = [];
  const problems: string[] = [];
  markdown.split("\n").forEach((line, index) => {
    const cells = line.trim().startsWith("|")
      ? line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim())
      : [];
    const key = SOURCE_ROW.exec(cells[0] ?? "")?.[1];
    if (key === undefined) return;
    const [, osm = "", lat = "", lng = ""] = cells;
    if (!OSM_OBJECT.test(osm) || !COORDINATE.test(lat) || !COORDINATE.test(lng)) {
      problems.push(`line ${index + 1}: ${key}'s source doesn't read as an OSM object and two coordinates`);
      return;
    }
    sources.push({ key, osm, lat: Number(lat), lng: Number(lng) });
  });
  return { sources, problems };
}

/** scripts/places.source.md's rows, or the problems that keep them from being read */
function readPlaceSources(file: string): Parsed<PlaceSource[]> {
  const read = readText(file);
  if ("problem" in read) return { data: undefined, problems: [read.problem] };
  const { sources, problems } = parsePlaceSources(read.text);
  return problems.length > 0
    ? { data: undefined, problems: problems.map((problem) => `${shown(file)}: ${problem}`) }
    : { data: sources, problems: [] };
}

/** A file parsed with its schema, or its problems, each naming the file */
function parsed<Schema extends z.ZodType>(root: string, file: string, schema: Schema): Parsed<z.output<Schema>> {
  const full = path.join(root, file);
  const read = readJson(full);
  if ("problem" in read) return { data: undefined, problems: [read.problem] };
  const result = parseStrict(schema, read.json);
  if (result.ok) return { data: result.data, problems: [] };
  return { data: undefined, problems: result.problems.map((problem) => `${shown(full)}: ${problem}`) };
}

/**
 * Every seed input in the project at root, parsed under the rules as of now, or every problem that
 * keeps them from being read. The private VINs are read only where the file exists.
 */
export function readSeedFiles(root: string, now: Date): { files: SeedFiles } | { problems: string[] } {
  const cars = parsed(root, SEED_PATHS.cars, seedCarsSchema(now));
  const reference = parsed(root, SEED_PATHS.reference, seedReferenceSchema);
  const places = parsed(root, SEED_PATHS.places, seedPlacesSchema);
  const settings = parsed(root, SEED_PATHS.settings, seedSettingsSchema);
  const expectations = parsed(root, SEED_PATHS.expectations, seedExpectationsSchema);
  const vins: Parsed<SeedVins | null> = existsSync(path.join(root, SEED_PATHS.vins))
    ? parsed(root, SEED_PATHS.vins, seedVinsSchema)
    : { data: null, problems: [] };
  const sources = readPlaceSources(path.join(root, SEED_PATHS.sources));

  const problems = [cars, reference, places, settings, vins, sources, expectations].flatMap((input) => input.problems);
  if (
    cars.data === undefined ||
    reference.data === undefined ||
    places.data === undefined ||
    settings.data === undefined ||
    vins.data === undefined ||
    sources.data === undefined ||
    expectations.data === undefined ||
    problems.length > 0
  ) {
    return { problems };
  }
  return {
    files: {
      cars: cars.data,
      reference: reference.data,
      places: places.data,
      settings: settings.data,
      vins: vins.data,
      sources: sources.data,
      expectations: expectations.data,
    },
  };
}
