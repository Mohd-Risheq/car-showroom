import { Client } from "@neondatabase/serverless";
import { and, eq, getTableName, isNull, type SQL, TransactionRollbackError } from "drizzle-orm";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, httpDatabase, type PoolTransaction } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import * as schema from "@/lib/db/schema";
import {
  auditLog,
  car,
  carSlugHistory,
  dealer,
  dealerSettings,
  demoSession,
  inspection,
  inspectionPanel,
  journeyMilestone,
  media,
  place,
  priceChange,
  spinFrame,
  spinHotspot,
  spinSet,
} from "@/lib/db/schema";
import {
  type DemoContext,
  type PublicRepo,
  publicRepo,
  type PublicTable,
  SCOPED_TABLES,
  type ScopedRepo,
  scopedRepo,
  type ScopedTable,
  type WritableTable,
} from "@/lib/db/scoped-repo";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// SEC-04 on rows of every kind: the dealer's live rows (a seed car among them), two demo sessions'
// rows, one session's private copy of a seed car (BR-31), the shared place presets, and another
// dealer's rows. Each context finds exactly the rows its predicates admit, through statements that
// name the dealer and the context's demo predicate. The presets are every dealer's, so this file
// has a database of its own.

let database: ThrowawayDatabase | undefined;
let db: Database;

// Each fixture row's key, by the name the expectations use, and each car's photo's upload id
const names = new Map<unknown, string>();
const ids: Record<string, string> = {};
const uploads: Record<string, string> = {};
let dealerId: string;
let sessions: Record<"A" | "B", string>;
let contexts: { owner: ScopedRepo; staff: ScopedRepo; A: ScopedRepo; B: ScopedRepo };

const sandboxId = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
const tokenHash = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");

function remember(name: string, key: string): string {
  names.set(key, name);
  ids[name] ??= key;
  return key;
}

/** Every fixture row, written in one round trip */
async function makeFixture(): Promise<void> {
  dealerId = uuidv7();
  const otherDealerId = uuidv7();
  sessions = { A: sandboxId(), B: sandboxId() };

  const published = { status: "published", publishedAt: new Date("2026-10-01T09:00:00.000Z") } as const;
  const cars = [
    { name: "L1", dealerId, demoSessionId: null, refCode: "MU-2222", slug: "l1-car", seedKey: "S05", ...published },
    { name: "L2", dealerId, demoSessionId: null, refCode: "MU-3333", slug: "l2-car" },
    { name: "A1", dealerId, demoSessionId: sessions.A, refCode: "MU-4444", slug: "a1-car" },
    // Session A's private copy of L1 keeps its code and slug (BR-31)
    { name: "A2", dealerId, demoSessionId: sessions.A, refCode: "MU-2222", slug: "l1-car", ...published },
    { name: "B1", dealerId, demoSessionId: sessions.B, refCode: "MU-5555", slug: "b1-car" },
    { name: "E1", dealerId: otherDealerId, demoSessionId: null, refCode: "MU-6666", slug: "e1-car" },
  ].map(({ name, ...row }) => ({ name, id: remember(name, uuidv7()), ...row }));

  // The rows under each car go by the car's name, and a spin frame by its image, the car's photo
  const perCar = cars.map(({ name, id: carId, dealerId: carDealerId, demoSessionId }) => {
    const scope = { dealerId: carDealerId, demoSessionId };
    const photoId = remember(name, uuidv7());
    const inspectionId = remember(name, uuidv7());
    const spinSetId = remember(name, uuidv7());
    const clientUploadId = (uploads[name] = uuidv7());
    return {
      photo: { id: photoId, ...scope, carId, kind: "photo", storagePrefix: `test/${name}`, clientUploadId },
      inspection: { id: inspectionId, carId },
      panel: { id: remember(name, uuidv7()), inspectionId, panelId: "hood" },
      spinSet: { id: spinSetId, carId, frameCount: 24 },
      frame: { spinSetId, index: 0, mediaId: photoId },
      hotspot: { id: remember(name, uuidv7()), spinSetId, keyFrame: 0, x: 0.5, y: 0.5, noteEn: name },
      milestone: { id: remember(name, uuidv7()), carId, sortOrder: 0, type: "built" },
      price: { id: remember(name, uuidv7()), carId, oldPriceJod: 10_000, newPriceJod: 9_500 },
      slug: { carId, ...scope, slug: remember(name, `${name.toLowerCase()}-before`) },
    } as const;
  });
  const logos = [
    { name: "logo D", demoSessionId: null },
    { name: "logo A", demoSessionId: sessions.A },
  ].map(({ name, demoSessionId }) => ({
    id: remember(name, uuidv7()),
    dealerId,
    demoSessionId,
    kind: "logo" as const,
    storagePrefix: `test/${name}`,
    clientUploadId: uuidv7(),
  }));
  const settings = [
    { name: "settings D", dealerId, demoSessionId: null },
    { name: "settings A", dealerId, demoSessionId: sessions.A },
    { name: "settings B", dealerId, demoSessionId: sessions.B },
    { name: "settings E", dealerId: otherDealerId, demoSessionId: null },
  ].map(({ name, ...scope }) => ({ id: remember(name, uuidv7()), ...scope, brandNameAr: name, brandNameEn: name }));
  const preset = {
    id: remember("preset", uuidv7()),
    key: "scope_preset",
    nameAr: "Aqaba",
    nameEn: "Aqaba",
    countryCode: "JO",
    lat: 29.53,
    lng: 35.01,
    kind: "port",
    isPreset: true,
  } as const;
  const places = [
    { name: "place D", dealerId, demoSessionId: null },
    { name: "place A", dealerId, demoSessionId: sessions.A },
    { name: "place B", dealerId, demoSessionId: sessions.B },
    { name: "place E", dealerId: otherDealerId, demoSessionId: null },
  ].map(({ name, ...scope }) => ({ id: remember(name, uuidv7()), ...scope, nameAr: name, nameEn: name }));
  const audits = [
    { name: "audit D", dealerId, actorUserId: uuidv7() },
    // A job's row names no actor
    { name: "audit job", dealerId },
    { name: "audit A", dealerId, actorDemoSessionId: sessions.A },
    { name: "audit B", dealerId, actorDemoSessionId: sessions.B },
    { name: "audit E", dealerId: otherDealerId, actorUserId: uuidv7() },
  ].map(({ name, ...row }) => ({ id: remember(name, uuidv7()), ...row, action: "car.update" }));

  await db.batch([
    db.insert(dealer).values([
      { id: dealerId, slug: "scope-dealer" },
      { id: otherDealerId, slug: "scope-other-dealer" },
    ]),
    db.insert(demoSession).values([
      { id: sessions.A, tokenHash: tokenHash() },
      { id: sessions.B, tokenHash: tokenHash() },
    ]),
    db
      .insert(car)
      .values(cars.map(({ name, ...row }) => ({ ...row, copiedFromCarId: name === "A2" ? (ids.L1 ?? null) : null }))),
    db.insert(media).values([...perCar.map((rows) => rows.photo), ...logos]),
    db.insert(inspection).values(perCar.map((rows) => rows.inspection)),
    db.insert(inspectionPanel).values(perCar.map((rows) => rows.panel)),
    db.insert(spinSet).values(perCar.map((rows) => rows.spinSet)),
    db.insert(spinFrame).values(perCar.map((rows) => rows.frame)),
    db.insert(spinHotspot).values(perCar.map((rows) => rows.hotspot)),
    db.insert(journeyMilestone).values(perCar.map((rows) => rows.milestone)),
    db.insert(priceChange).values(perCar.map((rows) => rows.price)),
    db.insert(carSlugHistory).values(perCar.map((rows) => rows.slug)),
    db.insert(dealerSettings).values(settings),
    db.insert(place).values([preset, ...places]),
    db.insert(auditLog).values(audits),
  ]);
}

beforeAll(async () => {
  database = await createThrowawayDatabase("t16_scope");
  db = httpDatabase(database.url);
  await makeFixture();
  const demo = (sandbox: string): DemoContext => ({ role: "demo_dealer", dealerId, sandboxId: sandbox });
  contexts = {
    owner: scopedRepo({ role: "owner", dealerId, userId: uuidv7() }, db),
    staff: scopedRepo({ role: "staff", dealerId, userId: uuidv7() }, db),
    A: scopedRepo(demo(sessions.A), db),
    B: scopedRepo(demo(sessions.B), db),
  };
});

afterAll(async () => {
  await database?.drop();
});

// The column each table's fixture rows are known by
const KEYS = new Map<ScopedTable, PgColumn>([
  [car, car.id],
  [media, media.id],
  [carSlugHistory, carSlugHistory.slug],
  [place, place.id],
  [dealerSettings, dealerSettings.id],
  [auditLog, auditLog.id],
  [inspection, inspection.id],
  [inspectionPanel, inspectionPanel.id],
  [spinSet, spinSet.id],
  [spinFrame, spinFrame.mediaId],
  [spinHotspot, spinHotspot.id],
  [journeyMilestone, journeyMilestone.id],
  [priceChange, priceChange.id],
]);

/** The names of the table's rows the predicate admits, and the statement that found them */
async function found(repo: ScopedRepo | PublicRepo, table: ScopedTable, predicate: SQL) {
  const key = KEYS.get(table);
  if (key === undefined) throw new Error(`No key for ${getTableName(table)}`);
  const query = repo.db.select({ key }).from(table).where(predicate);
  const rows = await query;
  return { rows: rows.map((row) => names.get(row.key) ?? "unknown").sort(), statement: query.toSQL() };
}

/** What the context reads of the table, and what it may change, found at once */
function readAndWrite(repo: ScopedRepo, table: ScopedTable, writable: boolean) {
  return Promise.all([
    found(repo, table, repo.read(table)),
    writable ? found(repo, table, repo.write(table as WritableTable)) : undefined,
  ]);
}

type Found = { read: string[]; write?: string[] };

/** The names of the rows a query found */
const named = (rows: { key: unknown }[]) => rows.map((row) => names.get(row.key) ?? "unknown").sort();

// What each context finds, by the names above. The rows under a car follow the car
const BY_CAR = {
  live: { read: ["L1", "L2"], write: ["L1", "L2"] },
  A: { read: ["A1", "A2", "L2"], write: ["A1", "A2"] },
  B: { read: ["B1", "L1", "L2"], write: ["B1"] },
};
const EXPECTED = new Map<ScopedTable, Record<"live" | "A" | "B", Found>>([
  [car, BY_CAR],
  [inspection, BY_CAR],
  [inspectionPanel, BY_CAR],
  [spinSet, BY_CAR],
  [spinFrame, BY_CAR],
  [spinHotspot, BY_CAR],
  [journeyMilestone, BY_CAR],
  [priceChange, BY_CAR],
  // Media and earlier slugs carry their own scope columns, so a session reads the original's too
  [
    media,
    {
      live: { read: ["L1", "L2", "logo D"], write: ["L1", "L2", "logo D"] },
      A: { read: ["A1", "A2", "L1", "L2", "logo A", "logo D"], write: ["A1", "A2", "logo A"] },
      B: { read: ["B1", "L1", "L2", "logo D"], write: ["B1"] },
    },
  ],
  [
    carSlugHistory,
    {
      live: { read: ["L1", "L2"], write: ["L1", "L2"] },
      A: { read: ["A1", "A2", "L1", "L2"], write: ["A1", "A2"] },
      B: { read: ["B1", "L1", "L2"], write: ["B1"] },
    },
  ],
  [
    place,
    {
      live: { read: ["place D", "preset"], write: ["place D"] },
      A: { read: ["place A", "place D", "preset"], write: ["place A"] },
      B: { read: ["place B", "place D", "preset"], write: ["place B"] },
    },
  ],
  [
    dealerSettings,
    {
      live: { read: ["settings D"], write: ["settings D"] },
      A: { read: ["settings A"], write: ["settings A"] },
      B: { read: ["settings B"], write: ["settings B"] },
    },
  ],
  [
    auditLog,
    {
      live: { read: ["audit D", "audit job"] },
      A: { read: ["audit A"] },
      B: { read: ["audit B"] },
    },
  ],
]);

it("has rows of every scoped table, which tell the contexts apart", () => {
  expect(new Set(EXPECTED.keys())).toStrictEqual(new Set(SCOPED_TABLES));
  for (const { live, A, B } of EXPECTED.values()) {
    for (const rows of [live.read, A.read, B.read]) expect(rows).not.toHaveLength(0);
    expect(A.read).not.toStrictEqual(live.read);
    expect(B.read).not.toStrictEqual(live.read);
  }
});

describe.each([...EXPECTED].map(([table, expected]) => [getTableName(table), table, expected] as const))(
  "%s",
  (_, table, expected) => {
    const writable = expected.live.write !== undefined;

    it("owner and staff find the dealer's live rows, through statements that name nothing else", async () => {
      await Promise.all(
        [contexts.owner, contexts.staff].map(async (repo) => {
          const [read, write] = await readAndWrite(repo, table, writable);
          expect(read.rows).toStrictEqual(expected.live.read);
          expect(read.statement.sql).toMatch(/"(actor_)?demo_session_id" is null/);
          expect(new Set(read.statement.params)).toStrictEqual(new Set([dealerId]));
          if (write === undefined) return;
          expect(write.rows).toStrictEqual(expected.live.write);
          expect(new Set(write.statement.params)).toStrictEqual(new Set([dealerId]));
        }),
      );
    });

    it("each demo session reads the live rows and its own, and writes its own alone", async () => {
      await Promise.all(
        (["A", "B"] as const).map(async (session) => {
          const [read, write] = await readAndWrite(contexts[session], table, writable);
          expect(read.rows).toStrictEqual(expected[session].read);
          expect(new Set(read.statement.params)).toStrictEqual(new Set([dealerId, sessions[session]]));
          if (write === undefined) return;
          expect(write.rows).toStrictEqual(expected[session].write);
          expect(write.statement.sql).not.toContain("is null");
        }),
      );
    });
  },
);

// The audit log is workspace data, which the public repository refuses (the unit tests)
describe.each(
  [...EXPECTED]
    .filter(([table]) => table !== auditLog)
    .map(([table, expected]) => [getTableName(table), table as PublicTable, expected] as const),
)("%s, read by the public repository", (_, table, expected) => {
  it("finds the live rows, as owner and staff do", async () => {
    const repo = publicRepo(dealerId, db);
    const read = await found(repo, table, repo.read(table));
    expect(read.rows).toStrictEqual(expected.live.read);
    expect(new Set(read.statement.params)).toStrictEqual(new Set([dealerId]));
  });
});

describe("a statement that names more than its table", () => {
  it("scopes each name it gives a table, an alias by the table's predicate", async () => {
    const other = alias(car, "other");
    const pairs = async (repo: ScopedRepo | PublicRepo, scope: SQL | undefined) => {
      const rows = await repo.db
        .select({ one: car.id, two: other.id })
        .from(car)
        .innerJoin(other, eq(other.refCode, car.refCode))
        .where(scope);
      return rows.map(({ one, two }) => `${names.get(one)}=${names.get(two)}`).sort();
    };
    const { owner, A } = contexts;
    const visitor = publicRepo(dealerId, db);
    const found = await Promise.all([
      pairs(owner, and(owner.read(car), owner.read(car, other))),
      pairs(A, and(A.read(car), A.read(car, other))),
      pairs(visitor, and(visitor.read(car), visitor.read(car, other))),
    ]);
    // L1 and its copy A2 share a code: L1=A2 or A2=L1 would be a name left unscoped
    expect(found).toStrictEqual([
      ["L1=L1", "L2=L2"],
      ["A1=A1", "A2=A2", "L2=L2"],
      ["L1=L1", "L2=L2"],
    ]);
  });

  it("keeps each predicate on its own table when a CTE takes a scoped table's name", async () => {
    const { A } = contexts;
    // Every column, the way the table has them, but the live rows only
    const live = A.db.$with("car").as(A.db.select().from(car).where(isNull(car.demoSessionId)));
    const rows = await A.db.with(live).select({ key: inspection.id }).from(inspection).where(A.read(inspection));
    expect(named(rows)).toStrictEqual(BY_CAR.A.read);
  });
});

describe("writing through the scope", () => {
  it("a demo session's update changes its own cars, never the seed car it copied (TC-45-5's seed half)", async () => {
    const { A } = contexts;
    const changed = await A.db.update(car).set({ mileageKm: 1 }).where(A.write(car)).returning({ id: car.id });
    expect(changed.map((row) => names.get(row.id)).sort()).toStrictEqual(["A1", "A2"]);
    const [seed] = await db
      .select({ mileageKm: car.mileageKm })
      .from(car)
      .where(eq(car.id, ids.L1 ?? ""));
    expect(seed).toStrictEqual({ mileageKm: null });
  });

  it("an id from another session, or a live row's id to a write, finds nothing (TC-45-4's ids)", async () => {
    const { A, owner } = contexts;
    const byId = (repo: ScopedRepo, predicate: SQL, name: string) =>
      repo.db
        .select({ id: car.id })
        .from(car)
        .where(and(predicate, eq(car.id, ids[name] ?? "")));
    const placeById = (repo: ScopedRepo, name: string) =>
      repo.db
        .select({ id: place.id })
        .from(place)
        .where(and(repo.read(place), eq(place.id, ids[name] ?? "")));
    const lookups = await Promise.all([
      byId(A, A.read(car), "B1"),
      byId(A, A.read(car), "E1"),
      byId(A, A.write(car), "L2"),
      // A seed car is changed through the session's copy of it (BR-31), so a row under one waits for it
      byId(A, A.write(car), "L1"),
      byId(owner, owner.read(car), "A1"),
      // The session reads the original only as its copy
      byId(A, A.read(car), "L1"),
      // The presets' OR stays inside the scope, so another dealer's place doesn't bring them along
      placeById(A, "place E"),
      placeById(owner, "place B"),
    ]);
    expect(lookups).toStrictEqual([[], [], [], [], [], [], [], []]);
  });

  it("no context deletes a row outside its scope", async () => {
    const { A, owner } = contexts;
    const remove = (repo: ScopedRepo, name: string) =>
      repo.db
        .delete(place)
        .where(and(repo.write(place), eq(place.id, ids[name] ?? "")))
        .returning({ id: place.id });
    const removed = await Promise.all([
      remove(A, "place D"),
      remove(A, "preset"),
      remove(owner, "place A"),
      remove(owner, "preset"),
    ]);
    expect(removed).toStrictEqual([[], [], [], []]);
  });

  it("puts a new row in its context's scope, in a transaction on the WebSocket driver too", async () => {
    await rolledBack(async (tx) => {
      const A = scopedRepo({ role: "demo_dealer", dealerId, sandboxId: sessions.A }, tx);
      const owner = scopedRepo({ role: "owner", dealerId, userId: uuidv7() }, tx);
      const [made] = await A.db
        .insert(car)
        .values(A.values(car, { refCode: "MU-7777", slug: "made-in-a" }))
        .returning({ id: car.id, dealerId: car.dealerId, demoSessionId: car.demoSessionId });
      expect(made).toStrictEqual({ id: expect.any(String), dealerId, demoSessionId: sessions.A });
      const visibleTo = (repo: ScopedRepo) =>
        repo.db
          .select({ id: car.id })
          .from(car)
          .where(and(repo.read(car), eq(car.id, made?.id ?? "")));
      expect(await visibleTo(A)).toHaveLength(1);
      expect(await visibleTo(owner)).toHaveLength(0);

      const [custom] = await owner.db
        .insert(place)
        .values(owner.values(place, { nameAr: "Zarqa", nameEn: "Zarqa" }))
        .returning({ isPreset: place.isPreset, dealerId: place.dealerId, demoSessionId: place.demoSessionId });
      expect(custom).toStrictEqual({ isPreset: false, dealerId, demoSessionId: null });
    });
  });

  it("an upsert changes the row it meets only where write() admits it, in setWhere", async () => {
    await rolledBack(async (tx) => {
      const A = scopedRepo({ role: "demo_dealer", dealerId, sandboxId: sessions.A }, tx);
      // Session A names the seed car L1, whose inspection it can't change: targetWhere would only
      // choose the arbiter index, and setWhere leaves the row as it was
      const met = await A.db
        .insert(inspection)
        .values({ carId: ids.L1 ?? "", testCenterName: "session A" })
        .onConflictDoUpdate({
          target: inspection.carId,
          set: { testCenterName: "session A" },
          setWhere: A.write(inspection),
        })
        .returning({ id: inspection.id });
      expect(met).toStrictEqual([]);
      const [seed] = await tx
        .select({ testCenterName: inspection.testCenterName })
        .from(inspection)
        .where(eq(inspection.carId, ids.L1 ?? ""));
      expect(seed).toStrictEqual({ testCenterName: null });
    });
  });

  it("keeps each scope's upload ids apart, so a session reusing a live photo's id gets a row of its own", async () => {
    await rolledBack(async (tx) => {
      const A = scopedRepo({ role: "demo_dealer", dealerId, sandboxId: sessions.A }, tx);
      const owner = scopedRepo({ role: "owner", dealerId, userId: uuidv7() }, tx);
      const photo = (repo: ScopedRepo, carName: string) =>
        repo.values(media, {
          carId: ids[carName] ?? "",
          kind: "photo",
          storagePrefix: "test/again",
          clientUploadId: uploads.L1 ?? "",
        });
      // A live public URL carries the id, so a session may send it (API-16, API-17)
      const [mine] = await A.db
        .insert(media)
        .values(photo(A, "A1"))
        .onConflictDoUpdate({
          target: [media.demoSessionId, media.clientUploadId],
          set: { storagePrefix: "test/again" },
          setWhere: A.write(media),
        })
        .returning({ id: media.id, demoSessionId: media.demoSessionId });
      expect(mine).toStrictEqual({ id: expect.any(String), demoSessionId: sessions.A });
      // A live key is partial: targetWhere states its predicate, and setWhere the scope
      const [again] = await owner.db
        .insert(media)
        .values(photo(owner, "L1"))
        .onConflictDoUpdate({
          target: [media.dealerId, media.clientUploadId],
          targetWhere: isNull(media.demoSessionId),
          set: { storagePrefix: "test/again" },
          setWhere: owner.write(media),
        })
        .returning({ key: media.id });
      expect(named(again ? [again] : [])).toStrictEqual(["L1"]);
    });
  });
});

/** Runs work in a transaction on the WebSocket driver, then rolls it back to keep the fixture */
async function rolledBack(work: (tx: PoolTransaction) => Promise<void>): Promise<void> {
  // A client, not a Pool: Pool.end() resolves before its clients close, and the database is
  // dropped with its connections when the file ends
  const client = new Client(database?.url);
  await client.connect();
  try {
    const run = drizzlePool({ client, schema }).transaction(async (tx) => {
      await work(tx);
      tx.rollback();
    });
    await expect(run).rejects.toThrow(TransactionRollbackError);
  } finally {
    await client.end();
  }
}
