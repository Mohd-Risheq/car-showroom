import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROOT } from "../../../scripts/checks/files.ts";
import { PENDING_CHECKS, seedChecks } from "../../../scripts/checks/seed-checks.ts";
import { readSeedFiles, type SeedFiles } from "../../../scripts/checks/seed-files.ts";

// 05-SEED-DATA §10: pnpm check:seed's checks, each shown on violations planted in the three-car
// fixture (PLAN §6.2), so each names its file, its car or key path, and its rule

// SRS §16's test clock, a Sunday in Amman
const NOW = new Date("2026-10-18T12:00:00+03:00");
const FIXTURE = fileURLToPath(new URL("../../fixtures/checks/seed/", import.meta.url));

const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const FATHA = String.fromCodePoint(0x064e);
const TATWEEL = String.fromCodePoint(0x0640);
/** The digits written as Arabic-Indic ones, from U+0660, or Persian ones, from U+06F0 */
const easternDigits = (digits: string, zero = 0x0660) =>
  digits.replace(/[0-9]/g, (digit) => String.fromCodePoint(zero + Number(digit)));

type SeedRecord = SeedFiles["cars"][number];

/** A fresh copy of the seed files at root, read as pnpm check:seed reads them */
function filesAt(root: string): SeedFiles {
  const read = readSeedFiles(root, NOW);
  if ("problems" in read) throw new Error(`${root} doesn't read:\n${read.problems.join("\n")}`);
  return read.files;
}

const fixture = () => filesAt(FIXTURE);

/** A car's record, to plant a violation in */
function carIn(files: SeedFiles, seedKey: string): SeedRecord {
  const record = files.cars.find((car) => car.seedKey === seedKey);
  if (record === undefined) throw new Error(`No record for ${seedKey}`);
  return record;
}

/** What scripts/seed-expectations.json says of a car, to plant a violation in */
function expectedOf(files: SeedFiles, seedKey: string) {
  const expected = files.expectations.cars[seedKey];
  if (expected === undefined) throw new Error(`No expectation for ${seedKey}`);
  return expected;
}

/** A panel of a car's inspection, to plant a violation in */
function panelIn(files: SeedFiles, seedKey: string, panelId: string) {
  const panel = carIn(files, seedKey).inspection?.panels.find((candidate) => candidate.panelId === panelId);
  if (panel === undefined) throw new Error(`No ${panelId} on ${seedKey}`);
  return panel;
}

/** A milestone of a car's journey, to plant a violation in */
function milestoneIn(files: SeedFiles, seedKey: string, index: number) {
  const milestone = carIn(files, seedKey).journey[index];
  if (milestone === undefined) throw new Error(`No milestone ${index} on ${seedKey}`);
  return milestone;
}

const problemsOf = (files: SeedFiles, partial = false) => seedChecks(files, NOW, { partial }).problems;

describe("seedChecks", () => {
  it("passes the fixture, with T-18's checks pending and nothing skipped", () => {
    expect(seedChecks(fixture(), NOW, { partial: false })).toStrictEqual({
      problems: [],
      pending: PENDING_CHECKS,
      skipped: [],
    });
  });

  it("passes the committed seed in a full run", () => {
    expect(problemsOf(filesAt(ROOT))).toStrictEqual([]);
  });

  it("takes every car but the hero as waiting in a partial run with none written, and as missing in a full one", () => {
    const files = { ...fixture(), cars: [] };
    expect(seedChecks(files, NOW, { partial: true })).toStrictEqual({
      problems: ["seed/settings.json: showcase.heroCar: s01 has no record"],
      pending: PENDING_CHECKS,
      skipped: [
        "check 2: the totals, until every car is written (not yet: s01, s02, s03)",
        "check 4: the showcase's s01, not written yet",
        "check 5: the VINs of s03, not written yet",
        "check 14: the badges of s02, not written yet",
      ],
    });
    expect(seedChecks(files, NOW, { partial: false })).toStrictEqual({
      problems: [
        "scripts/seed-expectations.json: s01: no record in seed/cars.json",
        "scripts/seed-expectations.json: s02: no record in seed/cars.json",
        "scripts/seed-expectations.json: s03: no record in seed/cars.json",
        "seed/settings.json: showcase.heroCar: s01 has no record",
        "seed/settings.json: showcase.featuredCars[0]: s01 has no record",
        "seed-private/vins.json: s03: no record in seed/cars.json",
      ],
      pending: PENDING_CHECKS,
      skipped: [],
    });
  });

  it("lists the contradictions and badges of a car not written yet as skipped in a partial run only", () => {
    const files = fixture();
    files.expectations.contradictions = [{ car: "s03", panel: "hood" }];
    files.expectations.badges.new = ["s03"];
    const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s03") };
    expect(seedChecks(planted, NOW, { partial: true })).toStrictEqual({
      problems: [],
      pending: PENDING_CHECKS,
      skipped: [
        "check 2: the totals, until every car is written (not yet: s03)",
        "check 5: the VINs of s03, not written yet",
        "check 7: the BR-08 contradictions on s03, not written yet",
        "check 14: the badges of s03, not written yet",
      ],
    });
    // A full run names the car as missing instead
    expect(seedChecks(planted, NOW, { partial: false }).skipped).toStrictEqual([]);
  });

  it("lists a car not written yet once, though two of its badges wait for it", () => {
    const files = fixture();
    files.expectations.badges.new = ["s03"];
    files.expectations.badges.priceDropped = ["s03"];
    const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s03") };
    expect(seedChecks(planted, NOW, { partial: true }).skipped).toStrictEqual([
      "check 2: the totals, until every car is written (not yet: s03)",
      "check 5: the VINs of s03, not written yet",
      "check 14: the badges of s03, not written yet",
    ]);
  });

  describe("check 1, schemas", () => {
    it("includes the rows the app's own schemas refuse", () => {
      const files = fixture();
      // VR-31: a wheelbase as long as the car
      Object.assign(carIn(files, "s01").car, { lengthMm: 3000, wheelbaseMm: 3000 });
      expect(problemsOf(files)).toStrictEqual(["seed/cars.json: s01: car.wheelbaseMm: validation.wheelbaseShorter"]);
    });

    it("names a key the rows join on twice, a make that isn't listed, and an alias that folds to nothing or twice", () => {
      const files = fixture();
      const [, camry] = files.reference.models;
      if (camry === undefined) throw new Error("The fixture has no second model");
      const planted: SeedFiles = {
        ...files,
        reference: {
          makes: [...files.reference.makes, { key: "toyota", nameEn: "Toyota", nameAr: "تويوتا" }],
          models: [
            ...files.reference.models,
            {
              key: "nissan-altima",
              makeKey: "nissan",
              nameEn: "Altima",
              nameAr: "ألتيما",
              defaultBodyType: "sedan",
              aliases: [TATWEEL, "Altima", "altima"],
            },
            camry,
          ],
        },
        places: [...files.places, ...files.places.filter(({ key }) => key === "amman")],
      };
      expect(problemsOf(planted)).toStrictEqual([
        "seed/reference.json: makes[2].key: toyota repeats makes[0].key",
        "seed/reference.json: models[4].key: toyota-camry repeats models[1].key",
        "seed/reference.json: models[3].makeKey: nissan isn't a make here",
        "seed/reference.json: models[3].aliases[0]: folds to nothing",
        "seed/reference.json: models[3].aliases[2]: folds to altima, as aliases[1] does",
        "seed/places.json: [7].key: amman repeats [2].key",
      ]);
    });

    it("names a seed key two records share, and what the second copy adds up to", () => {
      const files = fixture();
      const planted = { ...files, cars: [...files.cars, structuredClone(carIn(files, "s03"))] };
      expect(problemsOf(planted)).toStrictEqual([
        "seed/cars.json: [3].seedKey: s03 repeats [2].seedKey",
        "seed/cars.json: the fuel mix has 3 gasoline, where scripts/seed-expectations.json has 2",
        "seed/cars.json: the body mix has 3 sedan, where scripts/seed-expectations.json has 2",
        "seed/cars.json: s03: refCode: MU-SP8D repeats s03's",
      ]);
    });
  });

  describe("check 2, counts and statuses", () => {
    it("names each field a car holds otherwise than §4.1 lists it", () => {
      const files = fixture();
      Object.assign(expectedOf(files, "s01"), {
        status: "reserved",
        published: -8,
        sold: -1,
        mileageKm: 85000,
        priceJod: 48000,
        fuelType: "diesel",
        regionalSpecs: "american",
      });
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: status: published, where scripts/seed-expectations.json has reserved",
        "seed/cars.json: s01: seedOffsets.published: -9, where scripts/seed-expectations.json has -8",
        "seed/cars.json: s01: seedOffsets.sold: none, where scripts/seed-expectations.json has -1",
        "seed/cars.json: s01: car.mileageKm: 84000, where scripts/seed-expectations.json has 85000",
        "seed/cars.json: s01: car.priceJod: 47500, where scripts/seed-expectations.json has 48000",
        "seed/cars.json: s01: car.fuelType: gasoline, where scripts/seed-expectations.json has diesel",
        "seed/cars.json: s01: car.regionalSpecs: gcc, where scripts/seed-expectations.json has american",
      ]);
    });

    it("names a car §4.1 doesn't list, without a tier, and what it adds to the totals", () => {
      const files = fixture();
      const extra = { ...structuredClone(carIn(files, "s03")), seedKey: "s30", refCode: "MU-SP9D" };
      expect(problemsOf({ ...files, cars: [...files.cars, extra], vins: null })).toStrictEqual([
        "seed/cars.json: s30: not in scripts/seed-expectations.json, which lists §4.1's cars",
        "seed/cars.json: s30: no tier in src/lib/demo/seed-tiers.ts",
        "seed/cars.json: the fuel mix has 3 gasoline, where scripts/seed-expectations.json has 2",
        "seed/cars.json: the body mix has 3 sedan, where scripts/seed-expectations.json has 2",
      ]);
    });

    it("holds the totals to the mix and the public cars with a complete inspection", () => {
      const files = fixture();
      carIn(files, "s03").car.bodyType = "hatchback";
      files.expectations.publicWithCompleteInspection = 2;
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: the body mix has 1 sedan, where scripts/seed-expectations.json has 2",
        "seed/cars.json: the body mix has 1 hatchback, where scripts/seed-expectations.json has 0",
        "seed/cars.json: the public cars with a complete inspection number 1, where scripts/seed-expectations.json has 2",
      ]);
    });

    it("counts only published and reserved cars as public, as §4.1 does", () => {
      const files = fixture();
      // The sold S02 states its 13 panels; with its mechanical items, it is complete but still not public
      Object.assign(carIn(files, "s02").inspection?.mechanical ?? {}, {
        chassis: { state: "sound" },
        engine: { state: "sound" },
        gearbox: { state: "sound" },
      });
      expectedOf(files, "s02").inspection = "complete";
      expect(problemsOf(files)).toStrictEqual([]);
    });

    it("leaves the totals and the references to a car not written yet in a partial run, and names them in a full one", () => {
      const files = fixture();
      files.settings.showcase.featuredCars = ["s01", "s03"];
      const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s03") };
      expect(seedChecks(planted, NOW, { partial: true })).toStrictEqual({
        problems: [],
        pending: PENDING_CHECKS,
        skipped: [
          "check 2: the totals, until every car is written (not yet: s03)",
          "check 4: the showcase's s03, not written yet",
          "check 5: the VINs of s03, not written yet",
        ],
      });
      expect(problemsOf(planted)).toStrictEqual([
        "scripts/seed-expectations.json: s03: no record in seed/cars.json",
        "seed/settings.json: showcase.featuredCars[1]: s03 has no record",
        "seed-private/vins.json: s03: no record in seed/cars.json",
      ]);
    });

    it("names a car a badge, a contradiction or the import exception gives that the expectations don't list", () => {
      const files = fixture();
      files.expectations.badges.new = ["s04"];
      files.expectations.contradictions = [{ car: "s05", panel: "hood" }];
      files.expectations.importException = "s06";
      const problems = [
        "scripts/seed-expectations.json: badges.new[0]: s04 isn't one of its cars",
        "scripts/seed-expectations.json: contradictions[0].car: s05 isn't one of its cars",
        "scripts/seed-expectations.json: importException: s06 isn't one of its cars",
      ];
      expect(problemsOf(files)).toStrictEqual(problems);
      // A partial run refuses them too, as no car waits under a key the expectations don't list
      expect(problemsOf(files, true)).toStrictEqual(problems);
    });

    it("still holds each car written to §4.1 in a partial run", () => {
      const files = fixture();
      carIn(files, "s01").car.mileageKm = 85000;
      const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s03") };
      expect(problemsOf(planted, true)).toStrictEqual([
        "seed/cars.json: s01: car.mileageKm: 85000, where scripts/seed-expectations.json has 84000",
      ]);
    });
  });

  describe("check 3, publish rules", () => {
    it("names a car that was published without BR-29's fields, a description or its plates confirmed", () => {
      const files = fixture();
      Object.assign(carIn(files, "s01").car, { transmission: null, descriptionAr: null, descriptionEn: null });
      carIn(files, "s01").platesConfirmed = false;
      // A sold car was published too, and the draft S03 has none of these
      carIn(files, "s02").platesConfirmed = false;
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: car.transmission: none, where BR-29 needs one",
        "seed/cars.json: s01: car.descriptionAr, car.descriptionEn: none, where BR-29 needs a description",
        "seed/cars.json: s01: platesConfirmed: false, where BR-29 needs the plates confirmed",
        "seed/cars.json: s02: platesConfirmed: false, where BR-29 needs the plates confirmed",
      ]);
    });
  });

  describe("check 4, references", () => {
    it("names a code that isn't BR-15's, and one another car has", () => {
      const files = fixture();
      carIn(files, "s02").refCode = "MU-0000";
      carIn(files, "s03").refCode = "MU-3HK8";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s02: refCode: MU-0000 isn't BR-15's form",
        "seed/cars.json: s03: refCode: MU-3HK8 repeats s01's",
      ]);
    });

    it("names a code without the dealer's prefix", () => {
      const files = fixture();
      files.settings.dealer.refPrefix = "AB";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: refCode: MU-3HK8 doesn't start with AB-",
        "seed/cars.json: s02: refCode: MU-7KRA doesn't start with AB-",
        "seed/cars.json: s03: refCode: MU-SP8D doesn't start with AB-",
      ]);
    });

    it("names a make or model the reference data doesn't hold, and a model of another make", () => {
      const files = fixture();
      carIn(files, "s01").car.modelKey = "toyota-hilux";
      carIn(files, "s02").car.makeKey = "honda";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: car.modelKey: toyota-hilux isn't a model in seed/reference.json",
        "seed/cars.json: s02: car.makeKey: honda isn't a make in seed/reference.json",
        "seed/cars.json: s02: car.modelKey: tesla-model-3 is a model of tesla, not honda",
      ]);
    });

    it("holds the hero and featured cars to published ones, waiting for none §4.1 doesn't list (FR-04.1, VR-28)", () => {
      const files = fixture();
      files.settings.showcase = { heroCar: "s03", featuredCars: ["s01", "s02", "s09"] };
      const problems = [
        "seed/settings.json: showcase.heroCar: s03 is draft, where FR-04.1 takes published cars only",
        "seed/settings.json: showcase.featuredCars[1]: s02 is sold, where VR-28 takes published cars only",
        "seed/settings.json: showcase.featuredCars[2]: s09 has no record",
      ];
      expect(problemsOf(files)).toStrictEqual(problems);
      expect(problemsOf(files, true)).toStrictEqual(problems);
    });

    it("names a reserved hero or featured car, which is public but not published (FR-04.1, VR-28)", () => {
      const files = fixture();
      carIn(files, "s01").status = "reserved";
      expectedOf(files, "s01").status = "reserved";
      expect(problemsOf(files)).toStrictEqual([
        "seed/settings.json: showcase.heroCar: s01 is reserved, where FR-04.1 takes published cars only",
        "seed/settings.json: showcase.featuredCars[0]: s01 is reserved, where VR-28 takes published cars only",
      ]);
    });

    it("never lets the hero wait in a partial run, as the live settings refer to its row", () => {
      const files = fixture();
      const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s01") };
      expect(seedChecks(planted, NOW, { partial: true })).toStrictEqual({
        problems: ["seed/settings.json: showcase.heroCar: s01 has no record"],
        pending: PENDING_CHECKS,
        // A featured car may wait, as the live settings list the featured cars without a key
        skipped: [
          "check 2: the totals, until every car is written (not yet: s01)",
          "check 4: the showcase's s01, not written yet",
        ],
      });
    });

    it("lists a featured car as waiting for the showcase, never the hero", () => {
      const files = fixture();
      files.settings.showcase.featuredCars = [];
      const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s01") };
      expect(seedChecks(planted, NOW, { partial: true })).toStrictEqual({
        problems: ["seed/settings.json: showcase.heroCar: s01 has no record"],
        pending: PENDING_CHECKS,
        skipped: ["check 2: the totals, until every car is written (not yet: s01)"],
      });
    });
  });

  describe("check 5, VINs", () => {
    it("names a check digit that fails, a decode other than its car, and a VIN of no car", () => {
      const files = fixture();
      const [entry] = Object.values(files.vins ?? {});
      if (entry === undefined) throw new Error("The fixture has no VIN");
      const planted: SeedFiles = {
        ...files,
        vins: {
          // A check digit that fails outside North America is a warning for a dealer, and a problem here
          s01: {
            ...entry,
            vin: "JTDKARFU9H3503077",
            payload: { ...entry.payload, makeKey: "lexus", modelKey: "toyota-land-cruiser", year: 2019 },
          },
          s03: {
            ...entry,
            vin: "4T1B11HK3JU128781",
            payload: { ...entry.payload, modelKey: "toyota-corolla", year: 2019 },
          },
          s07: entry,
        },
      };
      expect(problemsOf(planted)).toStrictEqual([
        // The row the app would refuse, as check 1 finds it
        "seed-private/vins.json: s03: vin: validation.vinCheckDigit",
        "seed-private/vins.json: s01: vin: validation.vinCheckDigitWarn (BR-23)",
        "seed-private/vins.json: s01: payload.makeKey: lexus, where the record has toyota",
        "seed-private/vins.json: s03: vin: validation.vinCheckDigit (BR-23)",
        "seed-private/vins.json: s03: payload.modelKey: toyota-corolla, where the record has toyota-camry",
        "seed-private/vins.json: s03: payload.year: 2019, where the record has 2018",
        "seed-private/vins.json: s07: no record in seed/cars.json",
      ]);
    });

    it("skips the VINs on a public clone, which has no private file (§6.1)", () => {
      expect(seedChecks({ ...fixture(), vins: null }, NOW, { partial: false })).toStrictEqual({
        problems: [],
        pending: PENDING_CHECKS,
        skipped: ["check 5: the VINs, as seed-private/vins.json isn't in this clone (§6.1)"],
      });
    });
  });

  describe("check 6, regulation", () => {
    it("names an import that entered once the rules changed, naming an electric car and a refused history", () => {
      const files = fixture();
      milestoneIn(files, "s02", 2).month = "2025-12";
      milestoneIn(files, "s01", 3).month = "2025-11";
      milestoneIn(files, "s01", 0).titleBrand = "rebuilt";
      milestoneIn(files, "s01", 1).titleBrand = "salvage";
      // A flood title isn't among the histories A-11 refuses
      milestoneIn(files, "s01", 2).titleBrand = "flood";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: journey[3]: this car with a rebuilt and salvage history entered Jordan at free_zone in 2025-11, not before 2025-11-01, when the import rules changed (A-11)",
        "seed/cars.json: s02: journey[2]: this electric car entered Jordan at arrived_port in 2025-12, not before 2025-11-01, when the import rules changed (A-11)",
      ]);
      milestoneIn(files, "s01", 3).month = "2025-10";
      milestoneIn(files, "s02", 2).month = "2025-10";
      expect(problemsOf(files)).toStrictEqual([]);
    });

    it("names an import whose month is unknown, and a journey without its entry", () => {
      const files = fixture();
      milestoneIn(files, "s02", 2).month = null;
      carIn(files, "s01").journey = carIn(files, "s01").journey.filter(({ type }) => type !== "free_zone");
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: journey: no arrived_port or free_zone, so its import can't be checked (A-11)",
        "seed/cars.json: s02: journey[2].month: none, so the import can't be checked (A-11)",
      ]);
    });

    it("names a car without a journey, unless it is an agency car that isn't electric, as S29 is", () => {
      const files = fixture();
      // S01 has GCC specs and runs on petrol, and S02 has American specs and is electric. S03 is an
      // agency car on petrol without a journey, as S29 is.
      for (const seedKey of ["s01", "s02"]) {
        carIn(files, seedKey).journey = [];
        carIn(files, seedKey).seedOffsets.milestones = {};
      }
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: journey: none, so its import can't be checked (A-11)",
        "seed/cars.json: s02: journey: none, so its import can't be checked (A-11)",
      ]);
      // Agency specs spare a car on petrol, but not an electric one, whose import §10 checks
      // explicitly
      for (const seedKey of ["s01", "s02"]) {
        carIn(files, seedKey).car.regionalSpecs = "agency";
        expectedOf(files, seedKey).regionalSpecs = "agency";
      }
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s02: journey: none, so its import can't be checked (A-11)",
      ]);
    });

    it("holds the one later import to the rules it entered under, whenever it entered", () => {
      const files = fixture();
      files.expectations.importException = "s02";
      carIn(files, "s02").car.regionalSpecs = "korean";
      expectedOf(files, "s02").regionalSpecs = "korean";
      milestoneIn(files, "s02", 2).month = "2026-01";
      Object.assign(milestoneIn(files, "s02", 1), { type: "auction", titleBrand: "salvage" });
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s02: car.regionalSpecs: korean, where an import since the rules changed (A-11) has one of gcc, american, european",
        "seed/cars.json: s02: car.fuelType: electric, where an import since the rules changed (A-11) isn't electric",
        "seed/cars.json: s02: car.modelYear: 2020, where an import since the rules changed (A-11) is a 2021 model or later",
        "seed/cars.json: s02: journey[1].titleBrand: salvage, where an import since the rules changed (A-11) has a clean title",
      ]);
    });

    it("takes a later import of a model year 5 before this year, gcc specs and a clean auction", () => {
      const files = fixture();
      files.expectations.importException = "s01";
      carIn(files, "s01").car.modelYear = 2021;
      Object.assign(milestoneIn(files, "s01", 1), { type: "auction", titleBrand: "clean" });
      milestoneIn(files, "s01", 3).month = "2026-01";
      expect(problemsOf(files)).toStrictEqual([]);
    });

    it("takes the port's month as the entry when the journey has the free zone's too", () => {
      const files = fixture();
      // S02 reached Aqaba before the rules changed, then went through the free zone after
      milestoneIn(files, "s02", 2).month = "2025-10";
      carIn(files, "s02").journey.splice(3, 0, { type: "free_zone", place: "zarqa_free_zone", month: "2025-11" });
      Object.assign(milestoneIn(files, "s02", 4), { place: "zarqa_free_zone", month: "2025-11" });
      expect(problemsOf(files)).toStrictEqual([]);
    });
  });

  describe("check 7, inspections", () => {
    it("holds the bumpers and the roof to what a gauge reads (§5.2)", () => {
      const files = fixture();
      panelIn(files, "s01", "front_bumper").microns = 120;
      Object.assign(panelIn(files, "s01", "hood"), { glass: true });
      Object.assign(panelIn(files, "s01", "trunk"), { steel: true });
      Object.assign(panelIn(files, "s01", "rear_bumper"), { steel: true });
      // A steel bumper takes a reading
      Object.assign(panelIn(files, "s02", "front_bumper"), { steel: true, microns: 150 });
      // A roof without a reading is a glass one, which the record marks
      delete panelIn(files, "s02", "roof").glass;
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: inspection.panels[0]: front_bumper has a reading, where a plastic bumper has none (§5.2)",
        "seed/cars.json: s01: inspection.panels[1]: hood is marked glass, which only the roof is (§5.2)",
        "seed/cars.json: s01: inspection.panels[1]: hood is marked glass and has a reading, which a gauge can't take (§5.2)",
        "seed/cars.json: s01: inspection.panels[3]: trunk is marked steel, which only a bumper is (§5.2)",
        "seed/cars.json: s01: inspection.panels[4]: rear_bumper is a steel bumper without a reading (§5.2)",
        "seed/cars.json: s02: inspection.panels[2]: roof has no reading, where a metal roof has one and a glass roof is marked (§5.2)",
      ]);
    });

    it("takes a roof the inspection didn't read with neither a reading nor a mark", () => {
      const files = fixture();
      Object.assign(panelIn(files, "s02", "roof"), { state: "unknown" });
      delete panelIn(files, "s02", "roof").glass;
      expectedOf(files, "s02").inspection = { filled: 12 };
      expect(problemsOf(files)).toStrictEqual([]);
    });

    it("names a drawn reading other than drawReading's, and a range that runs backwards", () => {
      const files = fixture();
      panelIn(files, "s01", "roof").microns = 99;
      const s02 = carIn(files, "s02").inspection;
      if (s02 === null) throw new Error("S02 has no inspection");
      s02.originalMicrons = [130, 100];
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: inspection.panels[2]: roof reads 99, where its draw from 98 to 136 gives 103 (§5.2)",
        "seed/cars.json: s02: inspection.originalMicrons: 130 to 100 runs backwards (§5.2)",
      ]);
    });

    it("names a drawn reading one micron off its draw, as the record stores the draw itself (§5.2)", () => {
      const files = fixture();
      panelIn(files, "s01", "hood").microns = 103;
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: inspection.panels[1]: hood reads 103, where its draw from 98 to 136 gives 102 (§5.2)",
      ]);
    });

    it("names each drawn reading of an inspection without a range", () => {
      const files = fixture();
      const s02 = carIn(files, "s02").inspection;
      if (s02 === null) throw new Error("S02 has no inspection");
      s02.originalMicrons = null;
      const drawn = s02.panels.flatMap(({ panelId, drawn: isDrawn }, index) =>
        isDrawn === true
          ? [
              `seed/cars.json: s02: inspection.panels[${index}]: ${panelId}'s reading is drawn, but inspection.originalMicrons gives no range (§5.2)`,
            ]
          : [],
      );
      expect(drawn).toHaveLength(9);
      expect(problemsOf(files)).toStrictEqual(drawn);
    });

    it("names an inspection filled otherwise than §5 states", () => {
      const files = fixture();
      expectedOf(files, "s01").inspection = "none";
      expectedOf(files, "s02").inspection = { filled: 12 };
      expectedOf(files, "s03").inspection = "complete";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: inspection: 16 of 16 items filled, where scripts/seed-expectations.json has none",
        "seed/cars.json: s02: inspection: 13 of 16 items filled, where scripts/seed-expectations.json has 12 of 16 items filled",
        "seed/cars.json: s03: inspection: none, where scripts/seed-expectations.json has 16 of 16 items filled",
      ]);
    });

    it("holds BR-08's contradictions to those §5.5 lists, for the cars written", () => {
      const files = fixture();
      // Listed and found
      const { drawn: listedDrawn, ...listed } = panelIn(files, "s01", "door_front_left");
      Object.assign(listed, { microns: 200 });
      // Found, not listed: an original panel above 180 µm, and a repainted one at or below it
      const { drawn: unlistedDrawn, ...unlisted } = panelIn(files, "s01", "door_front_right");
      Object.assign(unlisted, { microns: 210 });
      const s01 = carIn(files, "s01").inspection;
      if (s01 === null || listedDrawn !== true || unlistedDrawn !== true) throw new Error("S01's doors aren't drawn");
      s01.panels = s01.panels.map((panel) =>
        panel.panelId === "door_front_left" ? listed : panel.panelId === "door_front_right" ? unlisted : panel,
      );
      panelIn(files, "s02", "quarter_rear_right").microns = 150;
      files.expectations.contradictions = [
        { car: "s01", panel: "door_front_left" },
        // Listed, not found
        { car: "s02", panel: "hood" },
        // Not written yet, in a partial run
        { car: "s03", panel: "roof" },
      ];
      const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s03") };
      expect(problemsOf(planted, true)).toStrictEqual([
        "seed/cars.json: s01: inspection.panels[8]: door_front_right is original at 210, a BR-08 contradiction scripts/seed-expectations.json doesn't list (§5.5)",
        "seed/cars.json: s02: inspection.panels[12]: quarter_rear_right is repainted at 150, a BR-08 contradiction scripts/seed-expectations.json doesn't list (§5.5)",
        "seed/cars.json: s02: inspection: hood holds no BR-08 contradiction, where scripts/seed-expectations.json lists one (§5.5)",
      ]);
    });
  });

  describe("check 8, journeys", () => {
    it("names a place that isn't a preset, and in_showroom before the journey's end", () => {
      const files = fixture();
      milestoneIn(files, "s01", 1).place = "kyoto";
      carIn(files, "s02").journey.push({ type: "customs_cleared", place: "amman", month: null });
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: journey[1].place: kyoto isn't a place in seed/places.json",
        "seed/cars.json: s02: journey[5]: in_showroom, which comes last when a journey has it",
      ]);
    });

    it("holds each place to its OpenStreetMap source and its coordinates (§7)", () => {
      const files = fixture();
      const sources = files.sources.flatMap((source) => {
        if (source.key === "dubai") return [];
        if (source.key === "amman") return [{ ...source, lat: 31.95 }];
        if (source.key === "zarqa_free_zone") return [{ ...source, lng: 36.2 }];
        if (source.key === "baltimore") return [source, source];
        return [source];
      });
      const kyoto = { key: "kyoto", osm: "relation/357794", lat: 35.0116, lng: 135.7681 };
      expect(problemsOf({ ...files, sources: [...sources, kyoto] })).toStrictEqual([
        "scripts/places.source.md: zarqa_free_zone: 32.0972, 36.2, where seed/places.json has 32.0972, 36.2177",
        "scripts/places.source.md: amman: 31.95, 35.924, where seed/places.json has 31.9516, 35.924",
        "seed/places.json: dubai: no source in scripts/places.source.md",
        "scripts/places.source.md: kyoto: no place has this key",
        "scripts/places.source.md: baltimore: listed twice",
      ]);
    });
  });

  describe("check 12, copy", () => {
    it("names a long dash, a digit other than 0 to 9, and a trade word outside brackets in any seed text", () => {
      const files = fixture();
      const s01 = carIn(files, "s01").car;
      s01.descriptionEn = `A test car ${EM_DASH} the 4.0 V6 and 84,000 km.`;
      s01.descriptionAr = s01.descriptionAr?.replace("84,000", easternDigits("84,000")) ?? null;
      // Marks and the tatweel sit inside a word; whole words and brackets pass
      carIn(files, "s02").car.descriptionAr =
        `الم${FATHA}اتور نظيف وشاصيه سليم وج${TATWEEL}ير، باجيرو من نيوجيرسي، ناقل الحركة (الجير) جيد`;
      const [model] = files.reference.models;
      if (model === undefined) throw new Error("The fixture has no model");
      model.nameAr = `لاند كروزر ${easternDigits("3", 0x06f0)}`;
      const planted: SeedFiles = {
        ...files,
        places: files.places.map((place) =>
          place.key === "amman" ? { ...place, nameEn: `Amman ${EN_DASH} Jordan` } : place,
        ),
      };
      planted.settings.brand.taglineEn = `Cars ${EM_DASH} inspected`;
      expect(problemsOf(planted)).toStrictEqual([
        `seed/cars.json: s01: car.descriptionAr: ${[...easternDigits("840")].join(" ")}: digits other than 0 to 9`,
        "seed/cars.json: s01: car.descriptionEn: an em dash (U+2014) (C-07)",
        "seed/cars.json: s02: car.descriptionAr: الماتور outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s02: car.descriptionAr: وشاصيه outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s02: car.descriptionAr: وجير outside brackets, where D-007 puts the formal word first",
        `seed/reference.json: models[0].nameAr: ${easternDigits("3", 0x06f0)}: digits other than 0 to 9`,
        "seed/places.json: amman: nameEn: an en dash (U+2013) (C-07)",
        "seed/settings.json: brand.taglineEn: an em dash (U+2014) (C-07)",
      ]);
    });

    it("names a trade word with a prefix or an ending Arabic joins to it, in a description or a note", () => {
      const files = fixture();
      // Words that only hold the letters pass, as باجيرو and نيوجيرسي do
      carIn(files, "s01").car.descriptionAr = "بالماتور، كجير، ماتورها، شاصيات، والجيران في الفجيرة";
      const s01 = carIn(files, "s01").inspection;
      if (s01 === null) throw new Error("S01 has no inspection");
      s01.mechanical.engine.noteAr = "الماتور نظيف";
      milestoneIn(files, "s01", 2).noteAr = "برًا، والشاصي سليم";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: car.descriptionAr: بالماتور outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: car.descriptionAr: كجير outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: car.descriptionAr: ماتورها outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: car.descriptionAr: شاصيات outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: inspection.mechanical.engine.noteAr: الماتور outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: journey[2].noteAr: والشاصي outside brackets, where D-007 puts the formal word first",
      ]);
    });

    it("names a trade word after a conjunction and a preposition, and one with my or your joined to it", () => {
      const files = fixture();
      carIn(files, "s01").car.descriptionAr = "وبالماتور، فللجير، وكشاصي، ماتوري، ماتورك";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: car.descriptionAr: وبالماتور outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: car.descriptionAr: فللجير outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: car.descriptionAr: وكشاصي outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: car.descriptionAr: ماتوري outside brackets, where D-007 puts the formal word first",
        "seed/cars.json: s01: car.descriptionAr: ماتورك outside brackets, where D-007 puts the formal word first",
      ]);
    });

    it("names a description of a car that was published in one language only", () => {
      const files = fixture();
      carIn(files, "s01").car.descriptionAr = null;
      carIn(files, "s02").car.descriptionEn = null;
      // A draft may hold one
      carIn(files, "s03").car.descriptionAr = "سيارة للاختبار";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: car.descriptionAr: none, where the other language has a description",
        "seed/cars.json: s02: car.descriptionEn: none, where the other language has a description",
      ]);
    });
  });

  describe("check 13, running data", () => {
    it("names a consumption value without its source, and a plug-in hybrid without both figures", () => {
      const files = fixture();
      carIn(files, "s01").car.consumptionSource = null;
      Object.assign(carIn(files, "s03").car, {
        fuelType: "plugin_hybrid",
        consumptionLPer100km: 2.1,
        consumptionSource: "dealer",
      });
      expectedOf(files, "s03").fuelType = "plugin_hybrid";
      files.expectations.mix.fuel = { gasoline: 1, electric: 1, plugin_hybrid: 1 };
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: car.consumptionSource: none, where a consumption value has its source",
        "seed/cars.json: s03: car.consumptionLPer100km, car.consumptionKwhPer100km: a plug-in hybrid has both",
      ]);
    });

    it("holds the EPA's figures to §5's, both of them, and an EPA source to a car §5 gives figures", () => {
      const files = fixture();
      expectedOf(files, "s01").epa = { lPer100km: 13.5 };
      Object.assign(carIn(files, "s02").car, { consumptionLPer100km: 2, consumptionKwhPer100km: 16 });
      carIn(files, "s03").car.consumptionSource = "epa";
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: car.consumptionSource: dealer, where scripts/seed-expectations.json has the EPA's figures",
        "seed/cars.json: s02: car.consumptionLPer100km: 2, where the EPA's is none",
        "seed/cars.json: s02: car.consumptionKwhPer100km: 16, where the EPA's is 16.2",
        "seed/cars.json: s03: car.consumptionSource: epa, where scripts/seed-expectations.json has no EPA figures",
      ]);
    });

    it("names an EPA figure the record leaves out", () => {
      const files = fixture();
      carIn(files, "s02").car.consumptionKwhPer100km = null;
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s02: car.consumptionKwhPer100km: none, where the EPA's is 16.2",
      ]);
    });
  });

  describe("check 14, offsets", () => {
    it("holds a car's days to its status and to one another", () => {
      const files = fixture();
      // S01 sold on the day it was published, S03 the day before
      Object.assign(carIn(files, "s01").seedOffsets, { sold: -9, inspectedOn: -8 });
      expectedOf(files, "s01").sold = -9;
      delete carIn(files, "s02").seedOffsets.published;
      expectedOf(files, "s02").published = null;
      Object.assign(carIn(files, "s03").seedOffsets, { published: -2, sold: -3 });
      Object.assign(expectedOf(files, "s03"), { published: -2, sold: -3 });
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: seedOffsets.sold: -9 for a published car",
        "seed/cars.json: s01: seedOffsets.sold: -9, not after seedOffsets.published, -9",
        "seed/cars.json: s01: seedOffsets.inspectedOn: -8, after seedOffsets.published, -9",
        "seed/cars.json: s02: seedOffsets.published: none for a sold car",
        "seed/cars.json: s02: seedOffsets.priceChanges[0].days: -20, not after seedOffsets.published, none",
        "seed/cars.json: s03: seedOffsets.published: -2 for a draft car",
        "seed/cars.json: s03: seedOffsets.sold: -3 for a draft car",
        "seed/cars.json: s03: seedOffsets.sold: -3, not after seedOffsets.published, -2",
      ]);
    });

    it("takes an inspection on the day the car was published, as §10 check 14 does", () => {
      const files = fixture();
      // The inspected milestone is the inspection's day (§5.2)
      const { seedOffsets } = carIn(files, "s01");
      seedOffsets.inspectedOn = -9;
      seedOffsets.milestones.inspected = -9;
      expect(problemsOf(files)).toStrictEqual([]);
    });

    it("names a sold car without its day of sale", () => {
      const files = fixture();
      delete carIn(files, "s02").seedOffsets.sold;
      expectedOf(files, "s02").sold = null;
      // A sold car without a sale date is public to no one (BR-04)
      files.expectations.badges.priceReduced = [];
      expect(problemsOf(files)).toStrictEqual(["seed/cars.json: s02: seedOffsets.sold: none for a sold car"]);
    });

    it("holds the price changes to their order, each a change after the publish day, the newest at the price", () => {
      const files = fixture();
      carIn(files, "s01").seedOffsets.priceChanges = [{ days: -9, from: 48000, to: 47000 }];
      carIn(files, "s02").seedOffsets.priceChanges.push({ days: -30, from: 22500, to: 22500 });
      files.expectations.badges = { new: [], priceReduced: ["s01", "s02"], priceDropped: ["s01"] };
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: seedOffsets.priceChanges[0].days: -9, not after seedOffsets.published, -9",
        "seed/cars.json: s01: seedOffsets.priceChanges: the newest is to 47000, where car.priceJod is 47500",
        "seed/cars.json: s02: seedOffsets.priceChanges[1].days: -30, not after the change before it",
        "seed/cars.json: s02: seedOffsets.priceChanges[1]: from 22500 to 22500, which changes nothing",
      ]);
    });

    it("names two price changes on one day, which would leave the newest to the rows' order (BR-05)", () => {
      const files = fixture();
      carIn(files, "s02").seedOffsets.priceChanges = [
        { days: -20, from: 24500, to: 23500 },
        { days: -20, from: 23500, to: 22500 },
      ];
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s02: seedOffsets.priceChanges[1].days: -20, not after the change before it",
        "seed/cars.json: s02: seedOffsets.priceChanges: the newest is to 23500, where car.priceJod is 22500",
      ]);
    });

    it("reads a car's newest price change by its day, for its price and its badges", () => {
      const files = fixture();
      // S02 drops to 23500 35 days ago, past BR-05's 30, then to 22500 20 days ago, which the note shows
      carIn(files, "s02").seedOffsets.priceChanges.unshift({ days: -35, from: 24500, to: 23500 });
      expect(problemsOf(files)).toStrictEqual([]);
      carIn(files, "s02").seedOffsets.priceChanges.reverse();
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s02: seedOffsets.priceChanges[1].days: -35, not after the change before it",
      ]);
    });

    it("holds the offset milestones to the journey's order, after every fixed month", () => {
      const files = fixture();
      Object.assign(carIn(files, "s01").seedOffsets.milestones, { shipped: -20, arrived_port: -30, in_showroom: -12 });
      // About 3 years and 5 months ago: 2023-05, before S02's customs month
      carIn(files, "s02").seedOffsets.milestones.inspected = -1250;
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: s01: seedOffsets.milestones.arrived_port: the journey has no arrived_port",
        "seed/cars.json: s01: journey[2].month: 2024-01, where seedOffsets.milestones.shipped dates it",
        "seed/cars.json: s01: journey[6]: in_showroom's offset, -12, falls before inspected's, -11",
        "seed/cars.json: s02: journey[4]: inspected falls in 2023-05, before journey[3]'s 2023-07",
      ]);
    });

    it("holds §4.1's badges on the day, over the cars written", () => {
      const files = fixture();
      carIn(files, "s01").seedOffsets.published = -3;
      expectedOf(files, "s01").published = -3;
      // S03 isn't written yet, in a partial run
      files.expectations.badges = { new: ["s03"], priceReduced: [], priceDropped: ["s02"] };
      const planted = { ...files, cars: files.cars.filter(({ seedKey }) => seedKey !== "s03") };
      expect(problemsOf(planted, true)).toStrictEqual([
        "seed/cars.json: the New badge on s01 on 2026-10-18, where scripts/seed-expectations.json has none",
        "seed/cars.json: the Price reduced note on s02 on 2026-10-18, where scripts/seed-expectations.json has none",
        "seed/cars.json: the Price dropped badge on none on 2026-10-18, where scripts/seed-expectations.json has s02",
      ]);
    });

    it("shows a sold car's badges only inside its window (BR-04)", () => {
      const files = fixture();
      // S02 sold 5 days ago
      files.settings.advanced.soldVisibleDays = 4;
      expect(problemsOf(files)).toStrictEqual([
        "seed/cars.json: the Price reduced note on none on 2026-10-18, where scripts/seed-expectations.json has s02",
      ]);
    });
  });
});
