import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  keyPath,
  parseStrict,
  seedCarsSchema,
  seedPlacesSchema,
  seedReferenceSchema,
  seedSettingsSchema,
  seedVinsSchema,
} from "@/lib/validation/seed";
import { z } from "@/lib/validation/zod";

// 05-SEED-DATA §10 check 1's first layer: the seed's files parse with schemas built from the app's
// field rules, and a key no schema knows is refused at any depth. The second layer, the rows the
// files expand to, is tests/unit/checks/seed-rows.test.ts's.

const NOW = new Date("2026-10-18T12:00:00+03:00");
const FIXTURES = new URL("../../fixtures/checks/seed/", import.meta.url);

/** A fixture file's JSON, a fresh copy each time, so a test may change it */
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));

type Json = Record<string, unknown>;
/** The fixture's cars, as plain objects to change */
const cars = () => fixture("seed/cars.json") as Json[];
const firstCar = (change: (car: Json) => void) => {
  const all = cars();
  change(all[0] as Json);
  return all;
};
const settings = (change: (file: Json) => void) => {
  const file = fixture("seed/settings.json") as Json;
  change(file);
  return file;
};

const problemsOf = (schema: z.ZodType, value: unknown) => {
  const result = parseStrict(schema, value);
  return result.ok ? [] : result.problems;
};

describe("the seed file schemas", () => {
  it("accept the fixture's files", () => {
    expect(problemsOf(seedCarsSchema(NOW), cars())).toStrictEqual([]);
    expect(problemsOf(seedReferenceSchema, fixture("seed/reference.json"))).toStrictEqual([]);
    expect(problemsOf(seedPlacesSchema, fixture("seed/places.json"))).toStrictEqual([]);
    expect(problemsOf(seedSettingsSchema, fixture("seed/settings.json"))).toStrictEqual([]);
    expect(problemsOf(seedVinsSchema, fixture("seed-private/vins.json"))).toStrictEqual([]);
  });

  it("refuse a key no schema knows, at any depth", () => {
    const misspelt = firstCar((car) => {
      (car["car"] as Json)["trimm"] = "GXR";
      const [hood] = (car["inspection"] as { panels: Json[] }).panels;
      if (hood) hood["micron"] = 120;
      (car["journey"] as Json[])[2] = { ...(car["journey"] as Json[])[2], notEn: "By road" };
    });
    expect(problemsOf(seedCarsSchema(NOW), misspelt)).toStrictEqual([
      "[0].car.trimm: not a key of this file",
      "[0].inspection.panels[0].micron: not a key of this file",
      "[0].journey[2].notEn: not a key of this file",
    ]);
    const period = settings((file) => {
      const hours = (file["hours"] as { hours: Record<string, Json[]> }).hours;
      hours["sat"] = [{ ...hours["sat"]?.[0], overnite: false }];
    });
    expect(problemsOf(seedSettingsSchema, period)).toStrictEqual([
      "hours.hours.sat[0].overnite: not a key of this file",
    ]);
  });

  it("names a refused key by its place in the file, even where the schema sorts the list", () => {
    // The fixture's closures are out of date order, and the hours section sorts them
    const closure = settings((file) => {
      const [first] = (file["hours"] as { closures: Json[] }).closures;
      if (first) first["noteAr"] = "رأس السنة";
    });
    expect(problemsOf(seedSettingsSchema, closure)).toStrictEqual(["hours.closures[0].noteAr: not a key of this file"]);
  });

  it("refuse the VIN and the licence expiry in a car: one is private, and the offsets date the other", () => {
    const withVin = firstCar((car) => {
      Object.assign(car["car"] as Json, { vin: "4T1B11HK2JU128781", licenseExpiry: "2027-03" });
    });
    expect(problemsOf(seedCarsSchema(NOW), withVin)).toStrictEqual([
      "[0].car.vin: not a key of this file",
      "[0].car.licenseExpiry: not a key of this file",
    ]);
  });

  it("refuse a car that would show its VIN, as no seed VIN appears on a public page (§5.2, BR-43)", () => {
    const shown = firstCar((car) => {
      (car["car"] as Json)["vinPublic"] = true;
    });
    expect(problemsOf(seedCarsSchema(NOW), shown)).toStrictEqual(["[0].car.vinPublic: Invalid input: expected false"]);
  });

  it("take a month as a record writes it, never with a day", () => {
    const month = (value: string) =>
      problemsOf(
        seedCarsSchema(NOW),
        firstCar((car) => {
          (car["journey"] as Json[])[0] = { ...(car["journey"] as Json[])[0], month: value };
        }),
      );
    expect(month("2018-12")).toStrictEqual([]);
    for (const value of ["2018-12-01", "2018-13", "2018-1", "12-2018"]) {
      expect(month(value), value).toHaveLength(1);
      expect(month(value)[0], value).toMatch(/^\[0\]\.journey\[0\]\.month: /);
    }
  });

  it("name the showcase's cars by seed key", () => {
    for (const featuredCars of [["S01"], ["s1"], ["cdbfe34a-bd9b-5e6d-893d-2e2d6f090662"]]) {
      const showcase = settings((file) => {
        file["showcase"] = { heroCar: "s01", featuredCars };
      });
      expect(problemsOf(seedSettingsSchema, showcase), featuredCars[0]).toHaveLength(1);
    }
  });

  it("refuse a status no seed car takes, a creation in the future, and the logo, which is media", () => {
    expect(
      problemsOf(
        seedCarsSchema(NOW),
        firstCar((car) => (car["status"] = "archived")),
      ),
    ).toHaveLength(1);
    expect(
      problemsOf(
        seedCarsSchema(NOW),
        firstCar((car) => (car["createdOffset"] = 1)),
      ),
    ).toHaveLength(1);
    const logo = settings((file) => {
      (file["brand"] as Json)["logoMediaId"] = null;
    });
    expect(problemsOf(seedSettingsSchema, logo)).toStrictEqual(["brand.logoMediaId: not a key of this file"]);
  });

  it("refuse an offset too far from today to give a date, naming where the file writes it", () => {
    const refused = (file: unknown) =>
      problemsOf(seedCarsSchema(NOW), file).map((problem) => problem.slice(0, problem.indexOf(": ")));
    const inspected = firstCar((car) => {
      (car["seedOffsets"] as Json)["inspectedOn"] = -200_000_000;
    });
    expect(refused(inspected)).toStrictEqual(["[0].seedOffsets.inspectedOn"]);
    const licence = firstCar((car) => {
      (car["seedOffsets"] as Json)["licenseExpiryMonths"] = 1_000_000_000;
    });
    expect(refused(licence)).toStrictEqual(["[0].seedOffsets.licenseExpiryMonths"]);
    const created = cars();
    (created[2] as Json)["createdOffset"] = -200_000_000;
    expect(refused(created)).toStrictEqual(["[2].createdOffset"]);
  });

  it("apply the app's own field rules, as of now", () => {
    // VR-02: no later than next year in Amman
    const year = (modelYear: number) =>
      problemsOf(
        seedCarsSchema(NOW),
        firstCar((car) => {
          (car["car"] as Json)["modelYear"] = modelYear;
        }),
      );
    expect(year(2027)).toStrictEqual([]);
    expect(year(2028)).toStrictEqual(["[0].car.modelYear: validation.year"]);
  });
});

describe("parseStrict", () => {
  const schema = z.object({ name: z.string(), parts: z.array(z.object({ id: z.int() })) });

  it("gives the data when the value parses and keeps every key", () => {
    expect(parseStrict(schema, { name: "a", parts: [{ id: 1 }] })).toStrictEqual({
      ok: true,
      data: { name: "a", parts: [{ id: 1 }] },
    });
  });

  it("names each of Zod's issues by its key path, and the value itself as the top level", () => {
    expect(problemsOf(schema, { name: 1, parts: [{ id: "x" }] })).toStrictEqual([
      "name: Invalid input: expected string, received number",
      "parts[0].id: Invalid input: expected number, received string",
    ]);
    expect(problemsOf(schema, [])).toStrictEqual(["(top level): Invalid input: expected object, received array"]);
  });

  it("refuses a key the output lacks, but not a value the schema turns into another kind", () => {
    expect(problemsOf(schema, { name: "a", parts: [{ id: 1, extra: true }], more: 1 })).toStrictEqual([
      "parts[0].extra: not a key of this file",
      "more: not a key of this file",
    ]);
    const turned = z.object({
      when: z.string().transform((text) => new Date(text)),
      list: z.string().transform(() => []),
    });
    expect(problemsOf(turned, { when: "2026-10-18", list: "x" })).toStrictEqual([]);
    const listToText = z.object({ list: z.array(z.int()).transform((items) => items.join()) });
    expect(problemsOf(listToText, { list: [1, 2] })).toStrictEqual([]);
  });
});

describe("keyPath", () => {
  it("writes a path as code reads it", () => {
    expect(keyPath(["cars", 2, "car", "trim"])).toBe("cars[2].car.trim");
    expect(keyPath([0, "journey", 1])).toBe("[0].journey[1]");
    expect(keyPath([])).toBe("(top level)");
  });
});
