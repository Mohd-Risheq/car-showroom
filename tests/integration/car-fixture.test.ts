import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it, onTestFinished, vi } from "vitest";
import { PANEL_IDS } from "@/lib/db/enums";
import * as schema from "@/lib/db/schema";
import { car, priceChange } from "@/lib/db/schema";
import { PRICE_JOD } from "@/lib/validation/bounds";
import { ROOT } from "../../scripts/checks/files.ts";
import type { ScriptDatabase } from "../../scripts/database.ts";
import { loadSeed } from "../../scripts/seed-loader.ts";
import { CarFixtures, seedCar } from "../support/car-fixture.ts";
import type { FixturePhoto } from "../support/fixture-photos.ts";
import { DEMO, loaded, seedFilesIn } from "../support/seed-loading.ts";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// The car page's e2e fixtures (car-fixture.ts) on a database of their own, with the committed seed
// loaded as the demo's deployment loads it. A copy is written whole or not at all: one whose part
// the database refuses leaves no car behind, which remove() wouldn't know of and the inventory
// would list, and one with more close-ups than an inspection has panels is refused before any photo
// or row is written.

// SRS §16.1's test clock, a Sunday in Amman
const NOW = new Date("2026-10-18T12:00:00+03:00");

let throwaway: ThrowawayDatabase | undefined;
let client: postgres.Sql | undefined;
let url: string;
let database: ScriptDatabase;
let fixtures: CarFixtures;

beforeAll(async () => {
  throwaway = await createThrowawayDatabase("t21_car_fixture");
  url = throwaway.directUrl;
  client = postgres(url, { max: 1, onnotice: () => {} });
  database = drizzle({ client, schema });
  loaded(await loadSeed(database, { ...seedFilesIn(ROOT, NOW), vins: null }, NOW, DEMO));
  fixtures = new CarFixtures(url);
});

afterAll(async () => {
  await client?.end();
  await throwaway?.drop();
});

it("writes a copy under a reference of its own, with its price drop, which remove() deletes", async () => {
  const seed = await seedCar("s01", url);
  if (seed.priceJod === null) throw new Error("The seed's s01 has no price to drop to");
  const before = await database.$count(car);
  const slug = await fixtures.copy("s01", "sold", { drop: { fromJod: seed.priceJod + 1000, daysAgo: 3 } });
  const [copy] = await database
    .select({ id: car.id, refCode: car.refCode, status: car.status })
    .from(car)
    .where(eq(car.slug, slug));
  if (copy === undefined) throw new Error("The copy isn't in the database");
  expect(copy.status).toBe("sold");
  expect(copy.refCode).not.toBe(seed.refCode);
  expect(await database.$count(priceChange, eq(priceChange.carId, copy.id))).toBe(1);
  await fixtures.remove();
  expect(await database.$count(car)).toBe(before);
});

it("leaves no part of a copy the database refuses a part of, as a drop from a price no car has", async () => {
  const before = await database.$count(car);
  await expect(
    fixtures.copy("s01", "published", { drop: { fromJod: PRICE_JOD.min - 1, daysAgo: 3 } }),
  ).rejects.toMatchObject({ cause: { constraint_name: "price_change_prices_range" } });
  expect(await database.$count(car)).toBe(before);
});

it("refuses more close-ups than an inspection has panels before it writes a photo or a row", async () => {
  const store = path.join(os.tmpdir(), `muftah-e2e-store-${crypto.randomUUID()}`);
  vi.stubEnv("MUFTAH_E2E_STORE", store);
  onTestFinished(() => rm(store, { recursive: true, force: true }));
  const closeup: FixturePhoto = { group: "imperfection", note: { en: "A chip on the edge" } };
  const photos = Array.from({ length: PANEL_IDS.length + 1 }, () => closeup);
  const before = await database.$count(car);
  await expect(fixtures.copy("s01", "published", { photos })).rejects.toThrow(
    `A copy has ${PANEL_IDS.length} close-ups at most`,
  );
  expect(existsSync(store)).toBe(false);
  expect(await database.$count(car)).toBe(before);
});
