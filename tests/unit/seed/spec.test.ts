import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEED_TIERS } from "@/lib/demo/seed-tiers";
import { parseStrict, type SeedCar, seedSettingsSchema } from "@/lib/validation/seed";
import { deckRows } from "../../../scripts/checks/deck.ts";
import { messageText } from "../../../scripts/checks/messages.ts";
import { readSeedFiles, SEED_PATHS, type SeedFiles } from "../../../scripts/checks/seed-files.ts";
import {
  specCars,
  specImportRules,
  specInventory,
  specMakes,
  specModels,
  specOverview,
  specPlaces,
  specSettings,
  specVins,
} from "../../support/seed-spec";

// The seed's files say what 05-SEED-DATA says, read as its records are written
// (tests/support/seed-spec.ts). The specification is private, so only the private repository can
// compare (D-035). It is read inside each test, so a clone without docs/ collects the file and
// skips the comparisons.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SEED = new URL("../../../docs/05-SEED-DATA.md", import.meta.url);
const SRS = new URL("../../../docs/02-SRS.md", import.meta.url);
const DESIGN = new URL("../../../docs/03-DESIGN-SPEC.md", import.meta.url);
const NOW = new Date("2026-10-18T12:00:00+03:00");

const text = (file: URL) => readFileSync(file, "utf8");
/** The key's name, or none for a car without the key */
const nameOf = (names: ReadonlyMap<string, string>, key: string | null) => (key === null ? null : names.get(key));

/** The committed seed files, or a failure that lists their problems */
function seedFiles(): SeedFiles {
  const read = readSeedFiles(ROOT, NOW);
  if ("problems" in read) throw new Error(`The seed files don't read:\n${read.problems.join("\n")}`);
  return read.files;
}

/** The car with each drawn reading checked against the record's range, then left null as §5 leaves it */
function withoutDrawnReadings(car: SeedCar): SeedCar {
  if (car.inspection === null) return car;
  const { originalMicrons } = car.inspection;
  const inRange = (microns: number | null) =>
    microns !== null && originalMicrons !== null && microns >= originalMicrons[0] && microns <= originalMicrons[1];
  const panels = car.inspection.panels.map((panel) => {
    if (panel.drawn !== true) return panel;
    expect(panel.microns, `${car.seedKey}'s ${panel.panelId}, drawn from ${String(originalMicrons)}`).toSatisfy(
      inRange,
    );
    return { ...panel, microns: null };
  });
  return { ...car, inspection: { ...car.inspection, panels } };
}

/** What §4.1 calls a car's inspection, from its record */
function inspectionKind(record: SeedCar, filled: number | null): string {
  if (record.inspection === null) return "none";
  return filled === null ? "complete" : "partial";
}

describe.skipIf(!existsSync(SEED))("the seed files, against 05-SEED-DATA", () => {
  it("hold §5's records in order", () => {
    const { cars } = seedFiles();
    const records = specCars(text(SEED), NOW).map(({ record }) => record);
    expect(cars.map(withoutDrawnReadings)).toStrictEqual(records);
  });

  it("hold §4.1's figures in the expectations, and its tiers in SEED_TIERS", () => {
    const seed = text(SEED);
    const cars = specCars(seed, NOW);
    const bySeedKey = new Map(cars.map((car) => [car.record.seedKey, car]));
    const overview = specOverview(seed);
    expect(seedFiles().expectations).toStrictEqual({
      cars: Object.fromEntries(
        overview.map((row) => {
          const car = bySeedKey.get(row.seedKey);
          const expected = {
            status: row.status,
            published: row.published,
            sold: row.sold,
            mileageKm: row.mileageKm,
            priceJod: row.priceJod,
            fuelType: row.fuelType,
            regionalSpecs: row.regionalSpecs,
            inspection: row.inspection === "partial" ? { filled: car?.filled } : row.inspection,
            epa: car?.epa ?? null,
          };
          return [row.seedKey, expected];
        }),
      ),
      ...specInventory(seed),
      contradictions: cars.flatMap(({ record, deliberate }) =>
        deliberate.map((panel) => ({ car: record.seedKey, panel })),
      ),
      ...specImportRules(seed),
    });
    expect(SEED_TIERS).toStrictEqual(Object.fromEntries(overview.map(({ seedKey, tier }) => [seedKey, tier])));
  });

  it("hold SRS §6.4's makes, and §5.3's models under the make each key begins with", () => {
    const makes = specMakes(text(SRS));
    const makeOf = (modelKey: string) => makes.find(({ key }) => modelKey.startsWith(`${key}-`))?.key;
    expect(seedFiles().reference).toStrictEqual({
      makes,
      models: specModels(text(SEED)).map((model) => ({ ...model, makeKey: makeOf(model.key) })),
    });
  });

  it("hold §7's places, each with the OpenStreetMap object its coordinates were read from", () => {
    const places = specPlaces(text(SEED));
    const files = seedFiles();
    expect(files.places).toStrictEqual(places.map(({ place }) => place));
    expect(files.sources).toStrictEqual(places.map(({ source }) => source));
  });

  it("hold §2's dealer and settings with the deck's tagline, and §2.4's showcase", () => {
    const seed = text(SEED);
    const [tagline] = deckRows(text(DESIGN)).filter(({ key }) => key === "home.tagline");
    if (tagline === undefined) throw new Error("03-DESIGN-SPEC has no home.tagline row");
    const settings = specSettings(seed, text(SRS), {
      en: messageText(tagline.en, "en"),
      ar: messageText(tagline.ar, "ar"),
    });
    // Parsed as the file is, so the schema's sorting applies to both
    const spec = parseStrict(seedSettingsSchema, settings);
    if (!spec.ok) throw new Error(`§2 doesn't parse as settings:\n${spec.problems.join("\n")}`);
    expect(seedFiles().settings).toStrictEqual(spec.data);
  });

  it.skipIf(!existsSync(path.join(ROOT, SEED_PATHS.vins)))(
    "hold §6.2's VINs, each decode with its car's make, model and year",
    () => {
      const seed = text(SEED);
      const decodes = specVins(seed);
      const makeNames = new Map(specMakes(text(SRS)).map(({ key, nameEn }) => [key, nameEn]));
      const modelNames = new Map(specModels(seed).map(({ key, nameEn }) => [key, nameEn]));
      const files = seedFiles();
      // No vPIC answer is stored for a seed VIN, so the payload holds what the decode names and nothing more
      const expected = specCars(seed, NOW).flatMap(({ record: { seedKey, car }, vin }) => {
        if (vin === null) return [];
        const decoded = decodes.get(seedKey)?.decoded ?? "";
        const payload = {
          make: nameOf(makeNames, car.makeKey),
          makeKey: car.makeKey,
          model: nameOf(modelNames, car.modelKey),
          modelKey: car.modelKey,
          year: Number(/\b(?:19|20)\d\d\b/.exec(decoded)?.[0]),
          bodyType: null,
          fuelType: null,
          engineCc: null,
          driveType: null,
          transmission: null,
          plant: { city: null, state: null, country: null },
        };
        return [[seedKey, { vin, decoded, payload }]];
      });
      expect(files.vins).toStrictEqual(Object.fromEntries(expected));
    },
  );
});

describe.skipIf(!existsSync(SEED))("05-SEED-DATA", () => {
  it("gives each car the same facts in §4.1's table as in its record", () => {
    const seed = text(SEED);
    const facts = specOverview(seed).map((row) => ({
      seedKey: row.seedKey,
      refCode: row.refCode,
      fuelType: row.fuelType,
      regionalSpecs: row.regionalSpecs,
      priceJod: row.priceJod,
      status: row.status,
      published: row.published,
      sold: row.sold,
      inspection: row.inspection,
    }));
    const records = specCars(seed, NOW).map(({ record, filled }) => ({
      seedKey: record.seedKey,
      refCode: record.refCode,
      fuelType: record.car.fuelType,
      regionalSpecs: record.car.regionalSpecs,
      priceJod: record.car.priceJod,
      status: record.status,
      published: record.seedOffsets.published ?? null,
      sold: record.seedOffsets.sold ?? null,
      inspection: inspectionKind(record, filled),
    }));
    expect(facts).toStrictEqual(records);
  });

  it("gives each tier its inspection: A and B cars a complete one and a journey, C cars a partial one or none", () => {
    const seed = text(SEED);
    const tiers = new Map(specOverview(seed).map(({ seedKey, tier }) => [seedKey, tier]));
    const outOfTier = specCars(seed, NOW).filter(({ record, filled }) => {
      const complete = inspectionKind(record, filled) === "complete";
      return tiers.get(record.seedKey) === "C" ? complete : !complete || record.journey.length === 0;
    });
    expect(outOfTier.map(({ record }) => record.seedKey)).toStrictEqual([]);
  });

  it("lists in §6.2 the VINs the records' Jordan lines give", () => {
    const seed = text(SEED);
    const fromRecords = specCars(seed, NOW).flatMap(({ record, vin }) => (vin === null ? [] : [[record.seedKey, vin]]));
    const listed = Array.from(specVins(seed), ([seedKey, { vin }]) => [seedKey, vin]);
    expect(Object.fromEntries(fromRecords)).toStrictEqual(Object.fromEntries(listed));
  });
});
