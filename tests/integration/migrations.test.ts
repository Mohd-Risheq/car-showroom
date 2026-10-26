import { is } from "drizzle-orm";
import { getTableConfig, isPgEnum, PgTable } from "drizzle-orm/pg-core";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// BUILD-PLAN T-16 Verify: the migrations in drizzle/ apply to an empty database, the way
// pnpm db:migrate applies them (postgres-js over the direct URL, in one transaction). The database
// then has every table, enum label, check and index the schema module names, and refuses the rows
// the cases below break (SRS §6). Column types, defaults and foreign-key actions are not compared
// here. The database is made for this file and dropped after it.

const declared: unknown[] = Object.values(schema);
const tables = declared.filter((value): value is PgTable => is(value, PgTable)).map((table) => getTableConfig(table));

let throwaway: ThrowawayDatabase | undefined;
let client: postgres.Sql | undefined;
let database: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  throwaway = await createThrowawayDatabase("t16_migrations");
  client = postgres(throwaway.directUrl, { max: 1, onnotice: () => {} });
  database = drizzle({ client, schema });
});

afterAll(async () => {
  await client?.end();
  await throwaway?.drop();
});

const sorted = (values: Iterable<string>) => [...values].sort();

/** The constraint a write broke, as Postgres names it, or "" when the write succeeded */
async function brokenConstraint(write: PromiseLike<unknown>): Promise<string> {
  try {
    await write;
    return "";
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof postgres.PostgresError) return cause.constraint_name ?? cause.message;
    throw error;
  }
}

describe("migrations", () => {
  it("apply to an empty database and make every table the schema declares", async () => {
    const rows = await client!<{ name: string }[]>`
      select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;
    expect(sorted(rows.map((row) => row.name))).toEqual(sorted(tables.map((table) => table.name)));
  });

  it("make each enum with its values in order", async () => {
    const rows = await client!<{ name: string; labels: string[] }[]>`
      select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' group by t.typname`;
    const enums = declared.filter(isPgEnum).map((pgEnum) => [pgEnum.enumName, [...pgEnum.enumValues]]);
    expect(Object.fromEntries(rows.map((row) => [row.name, row.labels]))).toEqual(Object.fromEntries(enums));
  });

  it("make every check and index the schema names, and no other", async () => {
    const checks = await client!<{ name: string }[]>`
      select c.relname || '.' || con.conname as name from pg_constraint con
      join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and con.contype = 'c'`;
    expect(sorted(checks.map((row) => row.name))).toEqual(
      sorted(tables.flatMap((table) => table.checks.map((check) => `${table.name}.${check.name}`))),
    );

    // Indexes that back a primary key or a unique constraint carry the constraint's name
    const indexes = await client!<{ name: string }[]>`
      select indexname as name from pg_indexes where schemaname = 'public'
      and indexname not in (select conname from pg_constraint where contype in ('p', 'u'))`;
    expect(sorted(indexes.map((row) => row.name))).toEqual(
      sorted(tables.flatMap((table) => table.indexes.map((index) => index.config.name ?? ""))),
    );
  });

  it("keep the public reads' indexes to the live rows (SRS §11.4)", async () => {
    const rows = await client!<{ name: string; definition: string }[]>`
      select indexname as name, indexdef as definition from pg_indexes
      where schemaname = 'public' and starts_with(indexname, 'car_public_')`;
    expect(sorted(rows.map((row) => row.name))).toEqual(["car_public_published_idx", "car_public_sold_idx"]);
    for (const { definition } of rows) expect(definition).toContain("(demo_session_id IS NULL)");
  });
});

describe("the database's own rules (SRS §6)", () => {
  let dealerId: string;
  const sessions = { a: "a".repeat(22), b: "b".repeat(22) };

  beforeAll(async () => {
    const [row] = await database.insert(schema.dealer).values({ slug: "migrations-test" }).returning();
    dealerId = row!.id;
    await database.insert(schema.demoSession).values([
      { id: sessions.a, tokenHash: "a".repeat(64) },
      { id: sessions.b, tokenHash: "b".repeat(64) },
    ]);
  });

  it("keeps a live car's code and slug unique, and lets each session hold one copy (BR-15, BR-31)", async () => {
    const live = { dealerId, refCode: "MU-24Q7", slug: "2019-toyota-land-cruiser-mu-24q7" };
    const [original] = await database.insert(schema.car).values(live).returning();
    const insert = (values: typeof schema.car.$inferInsert) =>
      brokenConstraint(database.insert(schema.car).values(values));

    expect(await insert({ ...live, slug: "2019-toyota-land-cruiser-mu-24q8" })).toBe("car_live_ref_code_key");
    expect(await insert({ ...live, refCode: "MU-24Q8" })).toBe("car_live_slug_key");

    // A copy keeps its original's code and slug (BR-31), once in each session
    const copy = { ...live, copiedFromCarId: original!.id };
    expect(await insert({ ...copy, demoSessionId: sessions.a })).toBe("");
    expect(await insert({ ...copy, demoSessionId: sessions.b })).toBe("");
    expect(await insert({ ...copy, demoSessionId: sessions.a, refCode: "MU-24Q9", slug: "copy-mu-24q9" })).toBe(
      "car_demo_copied_from_key",
    );
    expect(await insert({ ...live, demoSessionId: sessions.a, slug: "created-mu-24q7" })).toBe("car_demo_ref_code_key");
  });

  it("holds one live settings row per dealer, beside one sandbox row per session", async () => {
    const settings = { dealerId, brandNameAr: "مفتاح", brandNameEn: "Muftah" };
    expect(await brokenConstraint(database.insert(schema.dealerSettings).values(settings))).toBe("");
    expect(await brokenConstraint(database.insert(schema.dealerSettings).values(settings))).toBe(
      "dealer_settings_live_key",
    );
    const sandbox = { ...settings, demoSessionId: sessions.a };
    expect(await brokenConstraint(database.insert(schema.dealerSettings).values(sandbox))).toBe("");
    expect(await brokenConstraint(database.insert(schema.dealerSettings).values(sandbox))).toBe(
      "dealer_settings_dealer_demo_key",
    );
  });

  it("keeps an upload id unique among the live rows, and in each session apart from them (API-17)", async () => {
    const logo = (clientUploadId: string, demoSessionId: string | null) =>
      brokenConstraint(
        database
          .insert(schema.media)
          .values({ dealerId, demoSessionId, kind: "logo", storagePrefix: "logos/", clientUploadId }),
      );
    const clientUploadId = crypto.randomUUID();
    expect(await logo(clientUploadId, null)).toBe("");
    expect(await logo(clientUploadId, null)).toBe("media_live_client_upload_key");
    // A live upload's id is in its public URL, so a session may send it again
    expect(await logo(clientUploadId, sessions.a)).toBe("");
    expect(await logo(clientUploadId, sessions.b)).toBe("");
    expect(await logo(clientUploadId, sessions.a)).toBe("media_demo_client_upload_key");
  });

  it("refuses rows that break a rule, naming the rule", async () => {
    const car = (refCode: string) => ({ dealerId, refCode, slug: refCode.toLowerCase() });
    const media = () => ({ dealerId, storagePrefix: "cars/", clientUploadId: crypto.randomUUID() });
    const [carRow] = await database.insert(schema.car).values(car("MU-2222")).returning();
    const carId = carRow!.id;
    const [spinSetRow] = await database.insert(schema.spinSet).values({ carId, frameCount: 36 }).returning();

    const cases: [PromiseLike<unknown>, string][] = [
      [database.insert(schema.car).values({ ...car("MU-3333"), priceJod: 299 }), "car_price_jod_range"],
      [database.insert(schema.car).values({ ...car("MU-4444"), status: "published" }), "car_published_at_set"],
      [database.insert(schema.car).values({ ...car("MU-5555"), refCode: "MU-24O7" }), "car_ref_code_format"],
      [database.insert(schema.car).values({ ...car("MU-6666"), modelKey: "toyota-camry" }), "car_model_needs_make"],
      [database.insert(schema.media).values({ ...media(), kind: "logo", carId }), "media_car_unless_logo"],
      [
        database.insert(schema.media).values({ ...media(), kind: "photo", carId, mime: "image/svg+xml" }),
        "media_mime_allowed",
      ],
      [
        database
          .insert(schema.media)
          .values({ ...media(), kind: "photo", photoGroup: "exterior", carId, status: "ready" }),
        "media_ready_registered",
      ],
      [
        database.insert(schema.dealerSettings).values({
          dealerId,
          demoSessionId: sessions.b,
          brandNameAr: "مفتاح",
          brandNameEn: "Muftah",
          storyEn: "s".repeat(1001),
        }),
        "dealer_settings_story_length",
      ],
      [
        database.insert(schema.place).values({ nameAr: "ميناء", nameEn: "Port", isPreset: true }),
        "place_preset_complete",
      ],
      [database.insert(schema.place).values({ nameAr: "ميناء", nameEn: "Port" }), "place_owner"],
      [
        database.insert(schema.journeyMilestone).values({ carId, sortOrder: 0, type: "auction" }),
        "journey_milestone_auction_title",
      ],
      [
        database.insert(schema.spinHotspot).values({ spinSetId: spinSetRow!.id, keyFrame: 0, x: 0.5, y: 0.5 }),
        "spin_hotspot_note_present",
      ],
      // A raw address and path, as the auth library's own limiter builds its keys (SEC-12)
      [database.insert(schema.rateLimit).values({ key: "203.0.113.5|/sign-in/email" }), "rate_limit_key_format"],
    ];
    const broken = await Promise.all(cases.map(([write]) => brokenConstraint(write)));
    expect(broken).toEqual(cases.map(([, constraint]) => constraint));
  });

  it("asks a ready image for its size, and a PDF or a clip for none", async () => {
    const [carRow] = await database
      .insert(schema.car)
      .values({ dealerId, refCode: "MU-7777", slug: "mu-7777" })
      .returning();
    const ready = (values: Pick<typeof schema.media.$inferInsert, "kind" | "mime" | "width" | "height">) =>
      brokenConstraint(
        database.insert(schema.media).values({
          dealerId,
          carId: carRow!.id,
          storagePrefix: "cars/",
          clientUploadId: crypto.randomUUID(),
          status: "ready",
          variants: { src: "/seed/file" },
          bytes: 1000,
          ...values,
        }),
      );
    expect(await ready({ kind: "og_image", mime: "image/jpeg" })).toBe("media_ready_size");
    expect(await ready({ kind: "og_image", mime: "image/jpeg", width: 1200 })).toBe("media_ready_size");
    expect(await ready({ kind: "og_image", mime: "image/jpeg", width: 1200, height: 630 })).toBe("");
    expect(await ready({ kind: "inspection_report", mime: "application/pdf" })).toBe("");
  });
});
