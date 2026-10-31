import { getTableName, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveCarPage } from "@/features/car-page/server/build-car";
import { carStatements, loadCarPageRows } from "@/features/car-page/server/car-queries";
import { soldCutoff } from "@/features/inventory/domain/listing";
import { buildIndex } from "@/features/inventory/server/build-index";
import { indexStatements, loadIndexRows } from "@/features/inventory/server/index-queries";
import { buildSettings } from "@/features/settings/server/build-settings";
import { loadDealerId } from "@/features/settings/server/dealer-queries";
import { loadSettingsRows, settingsStatement } from "@/features/settings/server/settings-queries";
import { type Database, publicDatabase } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import * as schema from "@/lib/db/schema";
import { type PublicRepo, publicRepo, SCOPED_TABLES } from "@/lib/db/scoped-repo";
import { SOLD_VISIBLE_DAYS } from "@/lib/validation/bounds";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// The cached public reads' statements on Postgres (SRS §11.4): the dealer's live rows and nothing
// else, beside a demo session's rows (a private copy of a live car among them, BR-31) and another
// dealer's; one round trip and one read-only snapshot each; and the builders' results over them.

const DAY = 86_400_000;
// SRS §16.1's fixed clock, from which every row's dates are set
const now = new Date("2026-10-18T12:00:00+03:00");
const ago = (ms: number) => new Date(now.getTime() - ms);

let throwaway: ThrowawayDatabase | undefined;
let client: postgres.Sql | undefined;
let writer: PostgresJsDatabase<typeof schema>;
let reader: Database;
let repo: PublicRepo;

const dealerId = uuidv7();
const otherDealerId = uuidv7();
const sandboxId = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
const ids = Object.fromEntries(
  [
    ...["published", "reserved", "soldRecently", "soldInBound", "soldPastBound", "draft", "archived"],
    ...["copy", "sandboxCar", "otherDealerCar", "sandboxSold", "otherDealerSold"],
    ...["cover", "photo", "deletedPhoto", "pendingPhoto", "sandboxPhoto", "clip", "og", "report", "logo"],
    ...["reservedFirst", "reservedSecond", "reservedSandboxPhoto", "reservedSandboxClip"],
    ...["reservedDeleted", "reservedPending", "reservedOg", "reservedPendingClip", "reservedDeletedClip"],
    ...["deletedLogo", "pendingLogo", "sandboxLogo"],
  ].map((name) => [name, uuidv7()]),
);

const COMPLETE = {
  dealerId,
  makeKey: "toyota",
  modelKey: "toyota-land-cruiser",
  modelYear: 2021,
  priceJod: 48_500,
  mileageKm: 64_000,
  fuelType: "gasoline",
  transmission: "automatic",
  bodyType: "suv",
  regionalSpecs: "gcc",
  customsStatus: "cleared",
  licenseStatus: "licensed",
  insuranceType: "comprehensive",
} as const;
// The reserved car's cover and the live logo, which tests move and put back
const RESERVED_COVER = ids.reservedSandboxPhoto!;
const pointReservedCover = (mediaId: string) =>
  writer
    .update(schema.car)
    .set({ coverMediaId: mediaId })
    .where(sql`${schema.car.id} = ${ids.reserved!}`);
const pointLogo = (mediaId: string) =>
  writer
    .update(schema.dealerSettings)
    .set({ logoMediaId: mediaId })
    .where(sql`${schema.dealerSettings.dealerId} = ${dealerId} and ${schema.dealerSettings.demoSessionId} is null`);

const shown = (days: number) => ({ status: "published", publishedAt: ago(days * DAY) }) as const;
const sold = (days: number) => ({ status: "sold", publishedAt: ago(90 * DAY), soldAt: ago(days * DAY) }) as const;

const ready = { status: "ready", bytes: 1000, storagePrefix: "test/" } as const;
const photo = (
  id: string,
  carId: string,
  sortOrder: number,
  extra: Partial<typeof schema.media.$inferInsert> = {},
) => ({
  id,
  dealerId,
  carId,
  kind: "photo" as const,
  photoGroup: "exterior" as const,
  sortOrder,
  width: 2560,
  height: 1707,
  mime: "image/webp",
  variants: { "480": `/seed/${id}-480.webp`, "960": `/seed/${id}-960.webp`, "2560": `/seed/${id}-2560.webp` },
  clientUploadId: uuidv7(),
  ...ready,
  ...extra,
});
const clip = (id: string, carId: string, extra: Partial<typeof schema.media.$inferInsert> = {}) => ({
  id,
  dealerId,
  carId,
  kind: "engine_audio" as const,
  mime: "audio/wav",
  variants: { src: `/seed/${id}.wav` },
  audioSource: "this_car" as const,
  audioClipType: "idle" as const,
  clientUploadId: uuidv7(),
  ...ready,
  ...extra,
});
const logo = (id: string, extra: Partial<typeof schema.media.$inferInsert> = {}) => ({
  ...photo(id, ids.published!, 0),
  carId: null,
  kind: "logo" as const,
  photoGroup: null,
  variants: { src: `/seed/${id}.webp` },
  ...extra,
});

async function makeFixture(): Promise<void> {
  await writer.insert(schema.make).values({ key: "toyota", nameEn: "Toyota", nameAr: "تويوتا" });
  await writer.insert(schema.model).values([
    { key: "toyota-land-cruiser", makeKey: "toyota", nameEn: "Land Cruiser", nameAr: "لاند كروزر" },
    { key: "toyota-hilux", makeKey: "toyota", nameEn: "Hilux", nameAr: "هايلكس" },
    { key: "toyota-camry", makeKey: "toyota", nameEn: "Camry", nameAr: "كامري" },
  ]);
  await writer.insert(schema.dealer).values([
    { id: dealerId, slug: "public-reads" },
    { id: otherDealerId, slug: "public-reads-other" },
  ]);
  await writer.insert(schema.demoSession).values({ id: sandboxId, tokenHash: "c".repeat(64) });
  await writer.insert(schema.car).values([
    {
      id: ids.published!,
      ...COMPLETE,
      ...shown(3),
      refCode: "MU-2222",
      slug: "published-mu-2222",
      vin: "JTMHV05J604123456",
      features: ["carplay", "airbags"],
    },
    {
      id: ids.reserved!,
      ...COMPLETE,
      modelKey: "toyota-hilux",
      status: "reserved",
      publishedAt: ago(4 * DAY),
      refCode: "MU-3333",
      slug: "reserved-mu-3333",
      vin: "JTMHV05J604654321",
      vinPublic: true,
    },
    { id: ids.soldRecently!, ...COMPLETE, ...sold(5), refCode: "MU-4444", slug: "sold-recently-mu-4444" },
    { id: ids.soldInBound!, ...COMPLETE, ...sold(30), refCode: "MU-5555", slug: "sold-in-bound-mu-5555" },
    { id: ids.soldPastBound!, ...COMPLETE, ...sold(70), refCode: "MU-6666", slug: "sold-past-bound-mu-6666" },
    { id: ids.draft!, dealerId, refCode: "MU-7777", slug: "draft-mu-7777" },
    // No longer public, with a model no public car has
    {
      id: ids.archived!,
      ...COMPLETE,
      modelKey: "toyota-camry",
      status: "archived",
      publishedAt: ago(40 * DAY),
      archivedAt: ago(DAY),
      refCode: "MU-8888",
      slug: "archived-mu-8888",
    },
    // The session's copy keeps its original's code and slug (BR-31), at its own price
    {
      id: ids.copy!,
      ...COMPLETE,
      ...shown(3),
      demoSessionId: sandboxId,
      copiedFromCarId: ids.published!,
      priceJod: 1000,
      refCode: "MU-2222",
      slug: "published-mu-2222",
    },
    {
      id: ids.sandboxCar!,
      ...COMPLETE,
      ...shown(1),
      demoSessionId: sandboxId,
      refCode: "MU-9999",
      slug: "sandbox-mu-9999",
    },
    {
      id: ids.otherDealerCar!,
      ...COMPLETE,
      ...shown(1),
      dealerId: otherDealerId,
      refCode: "MU-AAAA",
      slug: "other-dealer-mu-aaaa",
    },
    // Sales inside the dealer's window that aren't its live rows: a session's and another dealer's
    {
      id: ids.sandboxSold!,
      ...COMPLETE,
      ...sold(5),
      demoSessionId: sandboxId,
      refCode: "MU-CCCC",
      slug: "sandbox-sold-mu-cccc",
    },
    {
      id: ids.otherDealerSold!,
      ...COMPLETE,
      ...sold(5),
      dealerId: otherDealerId,
      refCode: "MU-DDDD",
      slug: "other-dealer-sold-mu-dddd",
    },
  ]);
  await writer.insert(schema.media).values([
    // The first photo has a placeholder the cover lacks, so a cover mixed from the two would show
    photo(ids.photo!, ids.published!, 1, {
      photoGroup: "interior",
      placeholder: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
      dominantColor: "#d8d4cc",
    }),
    photo(ids.cover!, ids.published!, 2, { altEn: "Front three quarters" }),
    photo(ids.deletedPhoto!, ids.published!, 0, { deletedAt: ago(DAY) }),
    photo(ids.pendingPhoto!, ids.published!, 0, { status: "pending" }),
    photo(ids.sandboxPhoto!, ids.published!, 0, { demoSessionId: sandboxId }),
    clip(ids.clip!, ids.published!, { audioClipType: "cold_start" }),
    {
      id: ids.og!,
      dealerId,
      carId: ids.published!,
      kind: "og_image",
      mime: "image/jpeg",
      width: 1200,
      height: 630,
      variants: { src: "/seed/og.jpg" },
      clientUploadId: uuidv7(),
      ...ready,
    },
    {
      id: ids.report!,
      dealerId,
      carId: ids.published!,
      kind: "inspection_report",
      mime: "application/pdf",
      variants: { src: "/seed/report.pdf" },
      clientUploadId: uuidv7(),
      ...ready,
    },
    logo(ids.logo!),
    logo(ids.deletedLogo!, { deletedAt: ago(DAY) }),
    logo(ids.pendingLogo!, { status: "pending" }),
    logo(ids.sandboxLogo!, { demoSessionId: sandboxId }),
    // The reserved car's cover is a session's photo, which the public never sees, so its card takes
    // its first live photo. Ahead of that photo are files no card reads: a deleted photo, a pending
    // one and a link preview, and beside them a session's clip, a pending one and a deleted one
    photo(ids.reservedSecond!, ids.reserved!, 3),
    photo(ids.reservedFirst!, ids.reserved!, 1),
    photo(ids.reservedSandboxPhoto!, ids.reserved!, 0, { demoSessionId: sandboxId }),
    photo(ids.reservedDeleted!, ids.reserved!, 0, { deletedAt: ago(DAY) }),
    photo(ids.reservedPending!, ids.reserved!, 0, { status: "pending" }),
    {
      ...photo(ids.reservedOg!, ids.reserved!, 0),
      kind: "og_image",
      photoGroup: null,
      width: 1200,
      height: 630,
      mime: "image/jpeg",
      variants: { src: `/seed/${ids.reservedOg}.jpg` },
    },
    clip(ids.reservedSandboxClip!, ids.reserved!, { demoSessionId: sandboxId }),
    clip(ids.reservedPendingClip!, ids.reserved!, { status: "pending" }),
    clip(ids.reservedDeletedClip!, ids.reserved!, { deletedAt: ago(DAY) }),
  ]);
  await writer
    .update(schema.car)
    .set({ coverMediaId: ids.cover!, ogMediaId: ids.og! })
    .where(sql`${schema.car.id} = ${ids.published!}`);
  await pointReservedCover(RESERVED_COVER);
  // A cover pointer to another car's photo finds nothing
  await writer
    .update(schema.car)
    .set({ coverMediaId: ids.photo! })
    .where(sql`${schema.car.id} = ${ids.soldRecently!}`);
  const [inspected] = await writer
    .insert(schema.inspection)
    .values({ carId: ids.published!, reportMediaId: ids.report!, chassisState: "sound", engineState: "notes" })
    .returning();
  await writer.insert(schema.inspectionPanel).values([
    { inspectionId: inspected!.id, panelId: "hood", state: "repainted", microns: 240, closeupMediaId: ids.photo! },
    { inspectionId: inspected!.id, panelId: "roof", state: "original" },
  ]);
  // An inspection without panel rows knows its chassis alone (BR-07)
  await writer.insert(schema.inspection).values({ carId: ids.soldRecently!, chassisState: "sound" });
  // The archived car's inspection and price change, which no card reads
  const [archivedInspection] = await writer
    .insert(schema.inspection)
    .values({ carId: ids.archived!, chassisState: "sound" })
    .returning();
  await writer
    .insert(schema.inspectionPanel)
    .values({ inspectionId: archivedInspection!.id, panelId: "hood", state: "original" });
  await writer.insert(schema.priceChange).values([
    { carId: ids.published!, oldPriceJod: 50_000, newPriceJod: 49_000, changedAt: ago(20 * DAY) },
    { carId: ids.published!, oldPriceJod: 49_000, newPriceJod: 48_500, changedAt: ago(2 * DAY) },
    { carId: ids.archived!, oldPriceJod: 47_000, newPriceJod: 46_000, changedAt: ago(10 * DAY) },
  ]);
  await writer.insert(schema.journeyMilestone).values([
    { carId: ids.published!, sortOrder: 1, type: "shipped" },
    { carId: ids.published!, sortOrder: 0, type: "built" },
  ]);
  await writer.insert(schema.spinSet).values([
    { carId: ids.published!, frameCount: 36, status: "ready" },
    { carId: ids.reserved!, frameCount: 36 },
  ]);
  await writer.insert(schema.carSlugHistory).values([
    { carId: ids.published!, dealerId, slug: "published-earlier-mu-2222" },
    { carId: ids.archived!, dealerId, slug: "archived-earlier-mu-8888" },
    { carId: ids.sandboxCar!, dealerId, demoSessionId: sandboxId, slug: "sandbox-earlier-mu-9999" },
    // Rows that cross scope, which no write makes: a live row naming a session's car or another
    // dealer's, and a session's row naming a live car
    { carId: ids.sandboxCar!, dealerId, slug: "sandbox-live-earlier-mu-9999" },
    { carId: ids.otherDealerCar!, dealerId, slug: "other-dealer-earlier-mu-aaaa" },
    { carId: ids.published!, dealerId, demoSessionId: sandboxId, slug: "sandbox-earlier-mu-2222" },
  ]);
  const settings = { brandNameAr: "مفتاح", brandNameEn: "Muftah" };
  await writer.insert(schema.dealerSettings).values([
    { ...settings, dealerId, storyEn: "Our story", logoMediaId: ids.logo!, soldVisibleDays: 14 },
    { ...settings, dealerId, demoSessionId: sandboxId, brandNameEn: "Sandbox", soldVisibleDays: 60 },
    // Another dealer's row pointing at this dealer's logo, which no write makes
    { ...settings, dealerId: otherDealerId, brandNameEn: "Other", logoMediaId: ids.logo! },
  ]);
}

beforeAll(async () => {
  throwaway = await createThrowawayDatabase("t16_public_reads");
  client = postgres(throwaway.directUrl, { max: 1, onnotice: () => {} });
  writer = drizzle({ client, schema });
  reader = publicDatabase(throwaway.url);
  repo = publicRepo(dealerId, reader);
  await makeFixture();
});

afterAll(async () => {
  await client?.end();
  await throwaway?.drop();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const bound = () => soldCutoff(now, SOLD_VISIBLE_DAYS.max);
const nameOf = (id: string) => Object.entries(ids).find(([, value]) => value === id)?.[0] ?? id;
const carPage = async (slug: string) => resolveCarPage(dealerId, await loadCarPageRows(repo, slug), now);

const SCOPED = new Set<string>(SCOPED_TABLES.map((table) => getTableName(table)));
// The column a child table's predicate tests, naming its parent row (scoped-repo.ts). The other
// scoped tables test their own dealer column
const PARENT_COLUMN: Readonly<Record<string, string>> = {
  inspection: schema.inspection.carId.name,
  spin_set: schema.spinSet.carId.name,
  journey_milestone: schema.journeyMilestone.carId.name,
  price_change: schema.priceChange.carId.name,
  inspection_panel: schema.inspectionPanel.inspectionId.name,
  spin_frame: schema.spinFrame.spinSetId.name,
  spin_hotspot: schema.spinHotspot.spinSetId.name,
};

/** Each scoped table or alias a statement names, with its table and how often it is named */
function scopedReferences(text: string): Map<string, { table: string; count: number }> {
  const references = new Map<string, { table: string; count: number }>();
  // A statement names a table bare or before its alias, and a predicate's subquery in its schema
  for (const [, table = "", as] of text.matchAll(/\b(?:from|join) "(\w+)"(?: "(\w+)")?/g)) {
    if (!SCOPED.has(table)) continue;
    const reference = as ?? table;
    references.set(reference, { table, count: (references.get(reference)?.count ?? 0) + 1 });
  }
  return references;
}

/**
 * The predicates on the reference's own columns, less a parent's inside a child's subquery. An own
 * table's names the dealer and leaves out every demo session's rows, as SEC-04 has it.
 */
function ownPredicates(text: string, params: readonly unknown[], reference: string, table: string): number {
  const parent = PARENT_COLUMN[table];
  const pattern =
    parent === undefined
      ? new RegExp(`"${reference}"\\."dealer_id" = \\$(\\d+) and "${reference}"\\."demo_session_id" is null\\)`, "g")
      : new RegExp(`"${reference}"\\."${parent}" in \\(select "\\w+"\\."id" from "public"\\."\\w+"`, "g");
  return [...text.matchAll(pattern)].filter(
    (match) =>
      !text.slice(0, match.index).endsWith(`from "public"."${reference}" where (`) &&
      (parent !== undefined || params[Number(match[1]) - 1] === dealerId),
  ).length;
}

describe("the public client", () => {
  it("runs a batch as one read-only REPEATABLE READ transaction, which refuses a write", async () => {
    const [isolation, readOnly] = await reader.batch([
      reader.execute(sql`show transaction_isolation`),
      reader.execute(sql`show transaction_read_only`),
    ]);
    expect([isolation.rows, readOnly.rows]).toStrictEqual([
      [{ transaction_isolation: "repeatable read" }],
      [{ transaction_read_only: "on" }],
    ]);
    const write = reader.batch([reader.insert(schema.make).values({ key: "kia", nameEn: "Kia", nameAr: "كيا" })]);
    await expect(write).rejects.toThrow(/read-only transaction/);
  });

  it("reads each of the three in one round trip", async () => {
    const fetched = vi.spyOn(globalThis, "fetch");
    await loadIndexRows(repo, bound());
    await loadCarPageRows(repo, "published-mu-2222");
    await loadSettingsRows(repo);
    expect(fetched).toHaveBeenCalledTimes(3);
  });

  it("gives every scoped table or alias a statement names its own predicate (SEC-04)", () => {
    const statements = [...indexStatements(repo, bound()), ...carStatements(repo, "any"), settingsStatement(repo)];
    for (const statement of statements) {
      const { sql: text, params } = statement.toSQL();
      const references = scopedReferences(text);
      for (const [reference, { table, count }] of references) {
        expect(ownPredicates(text, params, reference, table), `${reference} in ${text}`).toBe(count);
      }
      // Each name brings the dealer's id once: in its own predicate, or in its parent's inside a
      // child's subquery, so no child is scoped through another dealer's rows
      const named = [...references.values()].reduce((sum, { count }) => sum + count, 0);
      expect(
        params.filter((param) => param === dealerId),
        text,
      ).toHaveLength(named);
    }
  });
});

describe("getInventoryIndex's rows", () => {
  it("reads the dealer's public cars, sales within the longest window among them, and nothing else", async () => {
    const rows = await loadIndexRows(repo, bound());
    expect(rows.rules).toStrictEqual([{ soldVisibleDays: 14 }]);
    expect(rows.cars.map((row) => nameOf(row.id)).sort()).toStrictEqual(
      ["published", "reserved", "soldInBound", "soldRecently"].sort(),
    );
    expect(rows.models.map((row) => row.modelKey).sort()).toStrictEqual(["toyota-hilux", "toyota-land-cruiser"]);
    // The rows under the cars are the public cars' own: their covers, inspections and latest changes
    expect(rows.covers.map((row) => nameOf(row.carId)).sort()).toStrictEqual(
      rows.cars.map((row) => nameOf(row.id)).sort(),
    );
    expect(rows.inspections.map((row) => nameOf(row.carId)).sort()).toStrictEqual(["published", "soldRecently"]);
    expect(rows.prices.map((row) => nameOf(row.carId))).toStrictEqual(["published"]);
  });

  it("builds the cards from them: the dealer's window, the cover or the first live photo, the latest drop", async () => {
    const index = buildIndex(await loadIndexRows(repo, bound()), now);
    expect(index.cards.map((card) => nameOf(card.id))).toStrictEqual(["published", "reserved", "soldRecently"]);
    const [published, reserved, soldRecently] = index.cards;
    expect(published).toMatchObject({
      cover: {
        variants: { "480": `/seed/${ids.cover}-480.webp`, "960": `/seed/${ids.cover}-960.webp` },
        placeholder: null,
        dominantColor: null,
      },
      priceDropped: true,
      // The hood and the roof, the chassis and the engine
      inspectionFilled: 4,
      hasSpin: true,
      hasSound: true,
      features: ["airbags", "carplay"],
    });
    // A session's cover, photo and clip on a live car are the session's alone, no deleted, pending or
    // other file stands in for a photo or a clip, and the spin is not ready
    expect(reserved).toMatchObject({
      cover: { variants: { "480": `/seed/${ids.reservedFirst}-480.webp` } },
      hasSpin: false,
      hasSound: false,
      inspectionFilled: null,
    });
    // Its cover pointer names another car's photo, and its inspection has no panel rows
    expect(soldRecently).toMatchObject({ cover: null, inspectionFilled: 1 });
  });

  it("takes no deleted, pending or other file as a cover, and falls back to the first live photo", async () => {
    for (const target of [ids.reservedDeleted!, ids.reservedPending!, ids.reservedOg!]) {
      await pointReservedCover(target);
      try {
        const index = buildIndex(await loadIndexRows(repo, bound()), now);
        expect(index.cards.find((card) => card.id === ids.reserved)?.cover?.variants, nameOf(target)).toStrictEqual({
          "480": `/seed/${ids.reservedFirst}-480.webp`,
          "960": `/seed/${ids.reservedFirst}-960.webp`,
        });
      } finally {
        await pointReservedCover(RESERVED_COVER);
      }
    }
  });
});

describe("getCarPage's rows", () => {
  it("builds the car from its live rows", async () => {
    const { result, tags } = await carPage("published-mu-2222");
    expect(tags).toStrictEqual([`car:${ids.published}`, `dealer:${dealerId}`]);
    if (result.kind !== "car") throw new Error(`no car: ${JSON.stringify(result)}`);
    const { car } = result;
    expect(car).toMatchObject({
      priceJod: 48_500,
      priceDrop: { fromJod: 49_000, badge: true },
      makeName: { ar: "تويوتا", en: "Toyota" },
      // BR-43: the dealer hides it
      vin: null,
      ogImage: { src: "/seed/og.jpg", width: 1200, height: 630 },
      sound: { source: "this_car" },
      spin: { frameCount: 36 },
      journey: [{ type: "built" }, { type: "shipped" }],
    });
    expect(car.photos.map((each) => nameOf(each.id))).toStrictEqual(["cover", "photo"]);
    expect(car.inspection).toMatchObject({
      report: { src: "/seed/report.pdf", format: "pdf" },
      filled: 4,
      mechanical: { chassis: { state: "sound" }, engine: { state: "notes" }, gearbox: { state: "unknown" } },
    });
    expect(car.inspection?.panels.find((panel) => panel.panelId === "hood")).toMatchObject({
      state: "repainted",
      microns: 240,
      band: "refinish",
      closeupPhotoId: ids.photo,
    });
  });

  it("shows a VIN the dealer shows, and none of another car's rows", async () => {
    const { result } = await carPage("reserved-mu-3333");
    if (result.kind !== "car") throw new Error(`no car: ${JSON.stringify(result)}`);
    // Its spin set is still processing, and the inspections, price changes and journeys of the
    // dealer's other cars stay theirs
    expect(result.car).toMatchObject({
      vin: "JTMHV05J604654321",
      spin: null,
      sound: null,
      inspection: null,
      priceDrop: null,
      journey: [],
    });
    // The session's cover is not among its photos, which keep the dealer's order
    expect(result.car.photos.map((each) => nameOf(each.id))).toStrictEqual(["reservedFirst", "reservedSecond"]);
  });

  it("sends an earlier slug to the current one, and answers for a car no longer public", async () => {
    expect((await carPage("published-earlier-mu-2222")).result).toStrictEqual({
      kind: "redirect",
      slug: "published-mu-2222",
    });
    expect((await carPage("archived-earlier-mu-8888")).result).toStrictEqual({
      kind: "notFound",
      gone: { bodyType: "suv" },
    });
    expect((await carPage("archived-mu-8888")).result).toStrictEqual({ kind: "notFound", gone: { bodyType: "suv" } });
    expect((await carPage("sold-in-bound-mu-5555")).result).toStrictEqual({
      kind: "notFound",
      gone: { bodyType: "suv" },
    });
  });

  it("answers a draft, a session's car or slug, and another dealer's car as a slug no car has", async () => {
    const miss = { result: { kind: "notFound", gone: null }, tags: [`cars:${dealerId}`, `dealer:${dealerId}`] };
    for (const slug of [
      "draft-mu-7777",
      "sandbox-mu-9999",
      "sandbox-earlier-mu-9999",
      "other-dealer-mu-aaaa",
      "sandbox-sold-mu-cccc",
      "other-dealer-sold-mu-dddd",
      "no-such-car-mu-bbbb",
      // Slug history rows that cross scope
      "sandbox-live-earlier-mu-9999",
      "other-dealer-earlier-mu-aaaa",
      "sandbox-earlier-mu-2222",
    ]) {
      expect(await carPage(slug)).toStrictEqual(miss);
    }
  });
});

describe("getDealerId's row", () => {
  it("is the id of the dealer a slug names, in lower case, and none for a slug no dealer has", async () => {
    expect(await loadDealerId(reader, "public-reads")).toBe(dealerId.toLowerCase());
    expect(await loadDealerId(reader, "public-reads-other")).toBe(otherDealerId.toLowerCase());
    expect(await loadDealerId(reader, "no-dealer-has-this")).toBeNull();
  });
});

describe("getSettings's row", () => {
  it("reads the dealer's live settings alone, with the ready logo", async () => {
    const settings = buildSettings(await loadSettingsRows(repo), now);
    expect(settings).toMatchObject({
      brandName: { ar: "مفتاح", en: "Muftah" },
      story: { ar: null, en: "Our story" },
      logo: { src: `/seed/${ids.logo}.webp`, width: 2560, height: 1707 },
      prices: { updatedAt: null, stale: true },
    });
  });

  it("shows no deleted, pending, session's or other file as the logo, nor another dealer's", async () => {
    for (const target of [ids.deletedLogo!, ids.pendingLogo!, ids.sandboxLogo!, ids.og!]) {
      await pointLogo(target);
      try {
        expect(buildSettings(await loadSettingsRows(repo), now).logo, nameOf(target)).toBeNull();
      } finally {
        await pointLogo(ids.logo!);
      }
    }
    // The other dealer's row points at this dealer's logo
    const other = buildSettings(await loadSettingsRows(publicRepo(otherDealerId, reader)), now);
    expect(other).toMatchObject({ brandName: { en: "Other" }, logo: null });
  });
});
