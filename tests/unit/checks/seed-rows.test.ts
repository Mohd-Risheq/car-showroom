import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readSeedFiles, type SeedFiles } from "../../../scripts/checks/seed-files.ts";
import { seedIds } from "../../../scripts/checks/seed-ids.ts";
import {
  appSchemaProblems,
  drawReading,
  type RowIds,
  type SeedCarRows,
  seedRows,
  type SeedRows,
} from "../../../scripts/checks/seed-rows.ts";

// 05-SEED-DATA §5 and §9.2: the seed's files expanded into the rows for one day in Amman, the rows
// scripts/seed.ts writes and pnpm check:seed checks

// SRS §16's test clock, a Sunday in Amman
const NOW = new Date("2026-10-18T12:00:00+03:00");
const FIXTURE = fileURLToPath(new URL("../../fixtures/checks/seed/", import.meta.url));

function fixtureFiles(): SeedFiles {
  const read = readSeedFiles(FIXTURE, NOW);
  if ("problems" in read) throw new Error(`The fixture doesn't read:\n${read.problems.join("\n")}`);
  return read.files;
}

/** One car's rows, or a failure when the car is missing */
function rowsOf(rows: SeedRows, seedKey: string): SeedCarRows {
  const found = rows.cars.find((car) => car.seedKey === seedKey);
  if (found === undefined) throw new Error(`No rows for ${seedKey}`);
  return found;
}

// The car's columns the seed owns: every field of the wizard's steps 1 to 4, and these
const SYSTEM_COLUMNS = [
  "id",
  "dealerId",
  "seedKey",
  "seedOffsets",
  "refCode",
  "slug",
  "status",
  "platesConfirmed",
  "publishedAt",
  "soldAt",
  "archivedAt",
  "createdAt",
];
const CAR_FIELDS = [
  ...["vin", "vinPublic", "makeKey", "modelKey", "trim", "modelYear", "bodyType", "fuelType", "transmission"],
  ...["drivetrain", "engineCc", "powerHp", "seats", "exteriorColorNameAr", "exteriorColorNameEn"],
  ...["exteriorColorHex", "paintFinish", "colorFamily", "interiorColorNameAr", "interiorColorNameEn"],
  ...["lengthMm", "wheelbaseMm", "regionalSpecs", "customsStatus", "licenseStatus", "licenseExpiry"],
  ...["insuranceType", "paymentMethods", "condition", "ownersCount", "warrantyUntil", "mileageKm", "features"],
  ...["priceJod", "descriptionAr", "descriptionEn", "recommendedOctane", "consumptionLPer100km"],
  ...["consumptionKwhPer100km", "consumptionSource", "batterySohPct", "batterySohSource", "phevElectricSharePct"],
];
const sorted = (keys: readonly string[]) => [...keys].sort();

describe("seedRows", () => {
  it("gives a car the columns the seed owns, its system's values among them, and no media", () => {
    const rows = seedRows(fixtureFiles(), NOW);
    const { car } = rowsOf(rows, "s01");
    expect(sorted(Object.keys(car))).toStrictEqual(sorted([...SYSTEM_COLUMNS, ...CAR_FIELDS]));
    expect(car).toMatchObject({
      id: seedIds.car("s01"),
      dealerId: seedIds.dealer("muftah"),
      slug: "2019-toyota-land-cruiser-gxr-mu-3hk8",
      status: "published",
      paymentMethods: ["cash", "instalments"],
      platesConfirmed: true,
      // S01 has no VIN in the fixture's private file, and S03 has one
      vin: null,
      licenseExpiry: "2027-03-01",
      archivedAt: null,
    });
    expect(rowsOf(rows, "s03").car.vin).toBe("4T1B11HK2JU128781");
  });

  it("dates a car from its offsets on the day, at its own time of day", () => {
    const rows = seedRows(fixtureFiles(), NOW);
    // S01 published 9 days ago, so created then too
    expect(rowsOf(rows, "s01").car).toMatchObject({
      publishedAt: new Date("2026-10-09T15:46:00+03:00"),
      soldAt: null,
      createdAt: new Date("2026-10-09T15:46:00+03:00"),
    });
    const sold = rowsOf(rows, "s02");
    expect(sold.car).toMatchObject({
      publishedAt: new Date("2026-09-08T09:03:00+03:00"),
      soldAt: new Date("2026-10-13T09:03:00+03:00"),
    });
    expect(sold.priceChanges).toStrictEqual([
      {
        id: seedIds.priceChange("s02", 0),
        carId: seedIds.car("s02"),
        oldPriceJod: 23500,
        newPriceJod: 22500,
        changedAt: new Date("2026-09-28T09:03:00+03:00"),
        changedBy: null,
      },
    ]);
    // S03, a draft, was created 2 days ago
    expect(rowsOf(rows, "s03").car).toMatchObject({
      publishedAt: null,
      createdAt: new Date("2026-10-16T18:58:00+03:00"),
    });
  });

  it("writes the inspection and its 13 panels without the seed's own marks", () => {
    const { inspection, panels } = rowsOf(seedRows(fixtureFiles(), NOW), "s02");
    // 42 days before 18 October; no report, which is media, and no author, so a re-seed credits no one
    expect(inspection).toStrictEqual({
      id: seedIds.inspection("s02"),
      carId: seedIds.car("s02"),
      inspectedOn: "2026-09-06",
      testCenterName: null,
      updatedBy: null,
      chassisState: "unknown",
      chassisNoteAr: null,
      chassisNoteEn: null,
      engineState: "unknown",
      engineNoteAr: null,
      engineNoteEn: null,
      gearboxState: "unknown",
      gearboxNoteAr: null,
      gearboxNoteEn: null,
    });
    expect(panels).toHaveLength(13);
    // The Tesla's glass roof has no reading, and a drawn reading is stored as drawn
    expect(panels.find(({ panelId }) => panelId === "roof")).toStrictEqual({
      id: seedIds.panel("s02", "roof"),
      inspectionId: seedIds.inspection("s02"),
      panelId: "roof",
      state: "original",
      microns: null,
      noteAr: null,
      noteEn: null,
    });
    expect(panels.find(({ panelId }) => panelId === "hood")?.microns).toBe(drawReading("s02", "hood", [100, 130]));
    expect(panels.find(({ panelId }) => panelId === "quarter_rear_right")).toMatchObject({
      state: "repainted",
      microns: 230,
      noteAr: "مرشوش بعد خدش خفيف",
      noteEn: "Repainted after a light scrape",
    });
    const rows = seedRows(fixtureFiles(), NOW);
    expect(rowsOf(rows, "s01").inspection).toMatchObject({
      engineState: "sound",
      engineNoteAr: "تمت صيانته عند 80,000 كم",
      engineNoteEn: "Serviced at 80,000 km",
    });
    expect(rowsOf(rows, "s03")).toMatchObject({ inspection: null, panels: [] });
  });

  it("writes the journey in order, each fixed month as its first day and each offset month for the day", () => {
    const { milestones } = rowsOf(seedRows(fixtureFiles(), NOW), "s01");
    expect(milestones.map(({ sortOrder, type, occurredMonth }) => [sortOrder, type, occurredMonth])).toStrictEqual([
      [0, "built", "2018-12-01"],
      [1, "first_sold", "2019-02-01"],
      [2, "shipped", "2024-01-01"],
      [3, "free_zone", "2024-01-01"],
      [4, "customs_cleared", "2024-02-01"],
      // 11 and 9 days before 18 October
      [5, "inspected", "2026-10-01"],
      [6, "in_showroom", "2026-10-01"],
    ]);
    expect(milestones[0]).toStrictEqual({
      id: seedIds.milestone("s01", 0),
      carId: seedIds.car("s01"),
      sortOrder: 0,
      type: "built",
      placeId: seedIds.place("toyota_city"),
      occurredMonth: "2018-12-01",
      noteAr: null,
      noteEn: null,
      auctionHouse: null,
      titleBrand: null,
      damageNoteAr: null,
      damageNoteEn: null,
    });
    expect(milestones[2]).toMatchObject({ placeId: seedIds.place("dubai"), noteAr: "برًا", noteEn: "By road" });
  });

  it("refers to the dealer, the places, the cars and the inspections by the ids given", () => {
    const ids: RowIds = {
      dealer: (slug) => `dealer ${slug}`,
      place: (key) => `place ${key}`,
      car: (seedKey) => `car ${seedKey}`,
      inspection: (seedKey) => `inspection ${seedKey}`,
    };
    const rows = seedRows(fixtureFiles(), NOW, ids);
    const s01 = rowsOf(rows, "s01");
    expect(rows.dealer.id).toBe("dealer muftah");
    expect(rows.places.map(({ id }) => id)).toContain("place amman");
    expect(s01.car).toMatchObject({ id: "car s01", dealerId: "dealer muftah" });
    expect(s01.inspection).toMatchObject({ id: "inspection s01", carId: "car s01" });
    expect(new Set(s01.panels.map(({ inspectionId }) => inspectionId))).toStrictEqual(new Set(["inspection s01"]));
    expect(s01.milestones.at(-1)).toMatchObject({ carId: "car s01", placeId: "place amman" });
    expect(rows.settings).toMatchObject({
      dealerId: "dealer muftah",
      heroCarId: "car s01",
      featuredCarIds: ["car s01"],
    });
  });

  it("writes the settings with the showcase as car ids, the closures by date and the sheet's date at midnight", () => {
    const { settings } = seedRows(fixtureFiles(), NOW);
    expect(settings).toMatchObject({
      id: seedIds.settings("muftah"),
      dealerId: seedIds.dealer("muftah"),
      brandNameEn: "Muftah Motors",
      pricesUpdatedAt: new Date("2026-10-01T00:00:00+03:00"),
      heroCarId: seedIds.car("s01"),
      featuredCarIds: [seedIds.car("s01")],
      soldVisibleDays: 30,
    });
    expect(settings.closures.map(({ date }) => date)).toStrictEqual(["2026-12-25", "2027-01-01"]);
    // T-18's and T-38's media are theirs to write
    expect(Object.keys(settings)).not.toContain("logoMediaId");
    expect(Object.keys(settings)).not.toContain("heroMediaId");
    expect(Object.keys(settings)).not.toContain("heroMarks");
  });

  it("stores each alias folded, as search compares it", () => {
    const files = fixtureFiles();
    const [first, ...others] = files.reference.models;
    if (first === undefined) throw new Error("The fixture has no models");
    const reference = {
      ...files.reference,
      models: [{ ...first, aliases: ["LandCruiser", "لاند كروزر", "أوديسي"] }, ...others],
    };
    const aliases = seedRows({ ...files, reference }, NOW).aliases.filter(({ modelKey }) => modelKey === first.key);
    expect(aliases).toStrictEqual(
      ["landcruiser", "لاند كروزر", "اوديسي"].map((alias) => ({
        id: seedIds.alias(first.key, alias),
        modelKey: first.key,
        alias,
      })),
    );
  });

  it("gives no slug to a code that isn't BR-15's, which check 4 then names", () => {
    const files = fixtureFiles();
    const cars = files.cars.map((record) => (record.seedKey === "s01" ? { ...record, refCode: "MU-0000" } : record));
    expect(rowsOf(seedRows({ ...files, cars }, NOW), "s01").car.slug).toBe("");
  });

  it("gives the same rows for the same day, and moves only the dated values a day later", () => {
    const files = fixtureFiles();
    expect(seedRows(files, NOW)).toStrictEqual(seedRows(files, NOW));
    const undated = (rows: SeedRows) =>
      rows.cars.map(({ car, inspection, milestones, priceChanges }) => ({
        car: { ...car, publishedAt: null, soldAt: null, createdAt: null },
        inspection: inspection === null ? null : { ...inspection, inspectedOn: null },
        milestones: milestones.map((milestone) => ({ ...milestone, occurredMonth: null })),
        priceChanges: priceChanges.map((change) => ({ ...change, changedAt: null })),
      }));
    const later = seedRows(files, new Date(NOW.getTime() + 24 * 60 * 60 * 1000));
    expect(undated(later)).toStrictEqual(undated(seedRows(files, NOW)));
    expect(rowsOf(later, "s01").car.publishedAt).toStrictEqual(new Date("2026-10-10T15:46:00+03:00"));
  });
});

describe("drawReading", () => {
  it("draws the same reading for the same car and panel, within the range, rounded", () => {
    expect(drawReading("s01", "hood", [98, 136])).toBe(102);
    expect(drawReading("s01", "hood", [98, 136])).toBe(drawReading("s01", "hood", [98, 136]));
    const readings = ["s01", "s02", "s03", "s04"].flatMap((seedKey) =>
      ["hood", "roof", "trunk", "door_front_left"].map((panelId) => drawReading(seedKey, panelId, [100, 140])),
    );
    expect(readings.filter((microns) => !Number.isInteger(microns) || microns < 100 || microns > 140)).toStrictEqual(
      [],
    );
    expect(new Set(readings).size).toBeGreaterThan(1);
  });
});

describe("appSchemaProblems", () => {
  it("finds none in the fixture's rows", () => {
    expect(appSchemaProblems(seedRows(fixtureFiles(), NOW), NOW)).toStrictEqual([]);
  });

  it("names the file, the car or section, and the field of each row the app's schemas refuse", () => {
    const rows = seedRows(fixtureFiles(), NOW);
    const planted: SeedRows = {
      ...rows,
      cars: rows.cars.map((carRows) => {
        if (carRows.seedKey !== "s01") return carRows;
        const [first, ...milestones] = carRows.milestones;
        if (first === undefined) throw new Error("S01 has no journey");
        return {
          ...carRows,
          // VR-31: a wheelbase as long as the car, each within its own range
          car: { ...carRows.car, lengthMm: 3000, wheelbaseMm: 3000 },
          // 12 panels, where API-19 takes each of the 13 once
          panels: carRows.panels.slice(1),
          // VR-14: next month, and VR-15: an auction without its title
          milestones: [
            { ...first, occurredMonth: "2026-11-01" },
            { ...first, type: "auction" as const },
            ...milestones,
          ],
        };
      }),
      settings: {
        ...rows.settings,
        // VR-28 takes up to 8
        featuredCarIds: Array.from({ length: 9 }, (_, index) => seedIds.car(`s0${index}`)),
      },
    };
    expect(appSchemaProblems(planted, NOW)).toStrictEqual([
      "seed/cars.json: s01: car.wheelbaseMm: validation.wheelbaseShorter",
      "seed/cars.json: s01: inspection.panels: validation.invalid",
      "seed/cars.json: s01: journey.milestones[0].occurredMonth: validation.futureDate",
      "seed/cars.json: s01: journey.milestones[1].titleBrand: validation.titleBrand",
      "seed/settings.json: showcase.featuredCarIds: validation.featured",
    ]);
  });

  it("names the VIN by the private file that holds it, and the licence expiry by the offset that dates it", () => {
    const rows = seedRows(fixtureFiles(), NOW);
    const planted: SeedRows = {
      ...rows,
      cars: rows.cars.map((carRows) =>
        carRows.seedKey === "s01"
          ? { ...carRows, car: { ...carRows.car, vin: "NOT A VIN", licenseExpiry: "2026-13-01" } }
          : carRows,
      ),
    };
    expect(appSchemaProblems(planted, NOW)).toStrictEqual([
      "seed-private/vins.json: s01: vin: validation.vin",
      "seed/cars.json: s01: seedOffsets.licenseExpiryMonths: validation.invalid",
    ]);
  });
});
