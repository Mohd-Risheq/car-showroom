import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { resolveCarPage } from "@/features/car-page/server/build-car";
import { loadCarPageRows } from "@/features/car-page/server/car-queries";
import { publicDatabase } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { dealer } from "@/lib/db/schema";
import { type PublicRepo, publicRepo } from "@/lib/db/scoped-repo";
import { ROOT } from "../../scripts/checks/files.ts";
import type { SeedFiles } from "../../scripts/checks/seed-files.ts";
import { seedRows } from "../../scripts/checks/seed-rows.ts";
import { loadSeed } from "../../scripts/seed-loader.ts";
import { DEMO, loaded, seedFilesIn } from "../support/seed-loading.ts";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// T-21's Done-when, that every car the seed shows has a whole page: the committed seed, loaded as
// scripts/seed.ts loads it, and each of its cars read as its page reads it. A public car missing a
// fact its page reads would answer 404 with only a log line (public-rows.ts). Without
// seed-private's VINs, as CI loads it, since no page shows a seed car's VIN.

// SRS §16.1's test clock, a Sunday in Amman
const NOW = new Date("2026-10-18T12:00:00+03:00");

let throwaway: ThrowawayDatabase | undefined;
let client: postgres.Sql | undefined;
let files: SeedFiles;
let dealerId: string;
let repo: PublicRepo;

beforeAll(async () => {
  files = { ...seedFilesIn(ROOT, NOW), vins: null };
  throwaway = await createThrowawayDatabase("t21_seed_pages");
  client = postgres(throwaway.directUrl, { max: 1, onnotice: () => {} });
  const database = drizzle({ client, schema });
  loaded(await loadSeed(database, files, NOW, DEMO));
  const [row] = await database
    .select({ id: dealer.id })
    .from(dealer)
    .where(eq(dealer.slug, files.settings.dealer.slug));
  if (row === undefined) throw new Error("The seed loaded no dealer");
  dealerId = row.id;
  repo = publicRepo(dealerId, publicDatabase(throwaway.url));
});

afterAll(async () => {
  await client?.end();
  await throwaway?.drop();
  vi.restoreAllMocks();
});

it("gives each car the seed publishes, reserves or has just sold its whole page, and its draft none", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const { cars } = seedRows(files, NOW);
  const pages: Record<string, string> = {};
  for (const { car } of cars) {
    const { result } = resolveCarPage(dealerId, await loadCarPageRows(repo, car.slug), NOW);
    pages[car.seedKey] = `${car.status}: ${result.kind}`;
  }
  // The seed's sold cars were sold days ago, inside the dealer's window (05-SEED-DATA)
  const expected = cars.map(({ car }) => [
    car.seedKey,
    `${car.status}: ${car.status === "draft" ? "notFound" : "car"}`,
  ]);
  expect(pages).toStrictEqual(Object.fromEntries(expected));
  // As many pages as seed/cars.json has records that aren't drafts: the statuses above are the
  // seed's rows', so this count alone catches a public car the rows make a draft
  const recorded = files.cars.filter(({ status }) => status !== "draft");
  expect(recorded.length).toBeGreaterThan(0);
  expect(Object.values(pages).filter((page) => page.endsWith(": car"))).toHaveLength(recorded.length);
  expect(logged).not.toHaveBeenCalled();
});
