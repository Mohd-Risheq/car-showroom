import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_TIERS } from "@/lib/demo/seed-tiers";
import { readJson, ROOT } from "../../../scripts/checks/files.ts";
import { SEED_PATHS, seedExpectationsSchema } from "../../../scripts/checks/seed-files.ts";

// The seed cars' tiers (05-SEED-DATA §4.1). pnpm check:seed gives each car of seed/cars.json a tier,
// this test holds the tiers' keys to scripts/seed-expectations.json's cars, and the private spec
// test holds the tiers to §4.1's table.

describe("SEED_TIERS", () => {
  it("names the 29 seed cars, s01 to s29, in record order", () => {
    const seedKeys = Array.from({ length: 29 }, (_, index) => `s${String(index + 1).padStart(2, "0")}`);
    expect(Object.keys(SEED_TIERS)).toStrictEqual(seedKeys);
  });

  it("names the cars scripts/seed-expectations.json lists, which pnpm check:seed holds seed/cars.json to", () => {
    const read = readJson(path.join(ROOT, SEED_PATHS.expectations));
    if ("problem" in read) throw new Error(read.problem);
    expect(Object.keys(SEED_TIERS)).toStrictEqual(Object.keys(seedExpectationsSchema.parse(read.json).cars));
  });
});
