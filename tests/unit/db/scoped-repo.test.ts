import { neon } from "@neondatabase/serverless";
import { and, eq, getTableName, is, or, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { alias, getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  auditLog,
  car,
  carSlugHistory,
  dealerSettings,
  inspection,
  inspectionPanel,
  media,
  place,
  user,
} from "@/lib/db/schema";
import {
  type Changes,
  type NewRow,
  type PublicRepo,
  type PublicTable,
  publicRepo,
  SCOPED_TABLES,
  type ScopedRepo,
  scopedRepo,
  type ScopedTable,
  type WritableTable,
} from "@/lib/db/scoped-repo";

// SEC-04: every predicate names the dealer, and the demo predicate its context calls for: the live
// rows for owner, staff and the cached public functions; the live rows and the sandbox's own for a
// demo read, its private copies replacing their originals (BR-31); the sandbox's own rows alone for
// a demo write. The integration suite runs the same predicates on rows of each kind.

const DEALER = "0192f5e0-0000-7000-8000-00000000000d";
const OTHER_DEALER = "0192f5e0-0000-7000-8000-00000000000e";
const USER_ID = "0192f5e0-0000-7000-8000-0000000000a1";
const CAR_ID = "0192f5e0-0000-7000-8000-0000000000c1";
const SANDBOX = "Sandbox_A_0123456789ab";

// Renders queries without connecting
const database = drizzle({ client: neon("postgresql://user:password@db.localtest.me/main"), schema });
const dialect = new PgDialect();
const render = (predicate: SQL) => dialect.sqlToQuery(predicate);

const owner = scopedRepo({ role: "owner", dealerId: DEALER, userId: USER_ID }, database);
const staff = scopedRepo({ role: "staff", dealerId: DEALER, userId: USER_ID }, database);
const demo = scopedRepo({ role: "demo_dealer", dealerId: DEALER, sandboxId: SANDBOX }, database);
const visitor = publicRepo(DEALER, database);

const LIVE_CAR = '("car"."dealer_id" = $1 and "car"."demo_session_id" is null)';
const COPY_CHECK =
  'not exists (select 1 from "public"."car" as "scope_copy" where "scope_copy"."copied_from_car_id" = "car"."id" ' +
  'and "scope_copy"."demo_session_id" = $3)';

/** Whether the first parenthesis closes at the end, so the predicate stays whole inside and() or or() */
function isOneGroup(text: string): boolean {
  let depth = 0;
  for (const [index, char] of [...text].entries()) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < text.length - 1) return false;
  }
  return text.startsWith("(") && depth === 0;
}

describe("the predicates on cars", () => {
  it("give owner and staff the dealer's live rows, to read and to write", () => {
    for (const repo of [owner, staff]) {
      expect(render(repo.read(car))).toStrictEqual({ sql: LIVE_CAR, params: [DEALER], typings: ["none"] });
      expect(render(repo.write(car))).toStrictEqual(render(repo.read(car)));
    }
  });

  it("give the cached public functions the live rows too", () => {
    expect(render(visitor.read(car))).toStrictEqual(render(owner.read(car)));
  });

  it("let a demo session read the live rows and its own, each copy hiding its original", () => {
    expect(render(demo.read(car))).toMatchObject({
      sql: `("car"."dealer_id" = $1 and ("car"."demo_session_id" is null or "car"."demo_session_id" = $2) and ${COPY_CHECK})`,
      params: [DEALER, SANDBOX, SANDBOX],
    });
  });

  it("let a demo session write its own rows only", () => {
    expect(render(demo.write(car))).toMatchObject({
      sql: '("car"."dealer_id" = $1 and "car"."demo_session_id" = $2)',
      params: [DEALER, SANDBOX],
    });
  });
});

describe("the predicates on a car's rows", () => {
  it("scope a child through its car", () => {
    expect(render(owner.read(inspection)).sql).toBe(
      `("inspection"."car_id" in (select "car"."id" from "public"."car" where ${LIVE_CAR}))`,
    );
  });

  it("scope a grandchild through its parent, with the context's car predicate at the root", () => {
    expect(render(demo.write(inspectionPanel))).toMatchObject({
      sql:
        '("inspection_panel"."inspection_id" in (select "inspection"."id" from "public"."inspection" where ' +
        '("inspection"."car_id" in (select "car"."id" from "public"."car" where ' +
        '("car"."dealer_id" = $1 and "car"."demo_session_id" = $2)))))',
      params: [DEALER, SANDBOX],
    });
    expect(render(demo.read(inspectionPanel)).sql).toContain(render(demo.read(car)).sql);
  });

  it("name their own tables with the schema, so a CTE named after one can't stand in for it", () => {
    for (const table of SCOPED_TABLES) expect(getTableConfig(table).schema).toBeUndefined();
    expect(render(demo.read(inspectionPanel)).sql).not.toMatch(/from "(car|inspection|spin_set)"/);
  });
});

describe("the predicates on places", () => {
  it("add the presets every dealer shares to what a context reads", () => {
    expect(render(owner.read(place)).sql).toBe(
      '("place"."is_preset" or ("place"."dealer_id" = $1 and "place"."demo_session_id" is null))',
    );
    expect(render(demo.read(place)).sql).toBe(
      '("place"."is_preset" or ("place"."dealer_id" = $1 and ' +
        '("place"."demo_session_id" is null or "place"."demo_session_id" = $2)))',
    );
  });

  it("never let a context write a preset", () => {
    expect(render(owner.write(place)).sql).toBe('("place"."dealer_id" = $1 and "place"."demo_session_id" is null)');
    expect(render(demo.write(place)).sql).toBe('("place"."dealer_id" = $1 and "place"."demo_session_id" = $2)');
  });

  it("keep their scope inside and(), around a filter of the caller's own ORs", () => {
    // Drizzle wraps and()'s result, not its operands: an unwrapped OR would match every preset
    const filter = or(eq(place.id, USER_ID), eq(place.key, "aqaba_port"));
    expect(render(and(owner.read(place), filter) as SQL).sql).toBe(
      '(("place"."is_preset" or ("place"."dealer_id" = $1 and "place"."demo_session_id" is null)) and ' +
        '("place"."id" = $2 or "place"."key" = $3))',
    );
  });
});

describe("the predicates on a sandbox's own copies of shared rows", () => {
  it("give a demo session its settings row alone, which stands in for the live one", () => {
    expect(render(demo.read(dealerSettings))).toMatchObject({
      sql: '("dealer_settings"."dealer_id" = $1 and "dealer_settings"."demo_session_id" = $2)',
      params: [DEALER, SANDBOX],
    });
    expect(render(demo.write(dealerSettings))).toStrictEqual(render(demo.read(dealerSettings)));
  });

  it("give a demo session its own audit rows, and the dealer the live ones with the jobs'", () => {
    expect(render(demo.read(auditLog)).sql).toBe(
      '("audit_log"."dealer_id" = $1 and "audit_log"."actor_demo_session_id" = $2)',
    );
    expect(render(owner.read(auditLog)).sql).toBe(
      '("audit_log"."dealer_id" = $1 and "audit_log"."actor_demo_session_id" is null)',
    );
  });

  it("read media and earlier slugs as the live rows and the sandbox's own", () => {
    for (const table of [media, carSlugHistory]) {
      const name = getTableName(table);
      expect(render(demo.read(table)).sql).toBe(
        `("${name}"."dealer_id" = $1 and ("${name}"."demo_session_id" is null or "${name}"."demo_session_id" = $2))`,
      );
    }
  });
});

describe("the predicates on an alias, for a query that names a table twice", () => {
  const listed = alias(car, "listed");

  it("put the table's scope on the alias's columns", () => {
    expect(render(owner.read(car, listed)).sql).toBe(
      '("listed"."dealer_id" = $1 and "listed"."demo_session_id" is null)',
    );
    expect(render(visitor.read(media, alias(media, "cover"))).sql).toBe(
      '("cover"."dealer_id" = $1 and "cover"."demo_session_id" is null)',
    );
    expect(render(demo.read(place, alias(place, "stop"))).sql).toBe(
      '("stop"."is_preset" or ("stop"."dealer_id" = $1 and ' +
        '("stop"."demo_session_id" is null or "stop"."demo_session_id" = $2)))',
    );
  });

  it("check the copies against the alias's cars", () => {
    expect(render(demo.read(car, listed)).sql).toBe(
      '("listed"."dealer_id" = $1 and ("listed"."demo_session_id" is null or "listed"."demo_session_id" = $2) and ' +
        'not exists (select 1 from "public"."car" as "scope_copy" where "scope_copy"."copied_from_car_id" = ' +
        '"listed"."id" and "scope_copy"."demo_session_id" = $3))',
    );
  });

  it("scope a child's alias through its car, which the subquery names itself", () => {
    expect(render(owner.read(inspection, alias(inspection, "earlier"))).sql).toBe(
      `("earlier"."car_id" in (select "car"."id" from "public"."car" where ${LIVE_CAR}))`,
    );
  });
});

describe.each(SCOPED_TABLES.map((table) => [getTableName(table), table] as const))("on %s", (_, table) => {
  // The audit log is written once and never changed, and the public functions never read it
  const isAudit = table === auditLog;

  it("every live and public predicate names the dealer and the live rows alone", () => {
    const predicates = [owner.read(table), staff.read(table)];
    if (!isAudit) {
      predicates.push(owner.write(table as WritableTable), staff.write(table as WritableTable));
      predicates.push(visitor.read(table as PublicTable));
    }
    for (const { sql, params } of predicates.map(render)) {
      expect(isOneGroup(sql), sql).toBe(true);
      expect(sql).toContain('"dealer_id" = $1');
      expect(sql).toMatch(/"(actor_)?demo_session_id" is null/);
      expect(new Set(params)).toStrictEqual(new Set([DEALER]));
    }
  });

  it("every demo predicate names the dealer and the sandbox, and a write never a live row", () => {
    const read = render(demo.read(table));
    expect(isOneGroup(read.sql), read.sql).toBe(true);
    expect(read.sql).toContain('"dealer_id" = $1');
    expect(new Set(read.params)).toStrictEqual(new Set([DEALER, SANDBOX]));
    if (isAudit) return;
    const write = render(demo.write(table as WritableTable));
    expect(isOneGroup(write.sql), write.sql).toBe(true);
    expect(write.sql).not.toContain("is null");
    expect(new Set(write.params)).toStrictEqual(new Set([DEALER, SANDBOX]));
  });

  it("every predicate on an alias is the table's, on the alias's name", () => {
    const ref = alias(table as ScopedTable, "scope_ref");
    const onTable = (query: { sql: string; params: unknown[] }) => ({
      ...query,
      sql: query.sql.replaceAll('"scope_ref"', `"${getTableName(table)}"`),
    });
    const pairs = [owner, staff, demo].map((repo): [SQL, SQL] => [repo.read(table, ref as never), repo.read(table)]);
    if (!isAudit) {
      const writable = table as WritableTable;
      pairs.push(
        ...[owner, demo].map((repo): [SQL, SQL] => [repo.write(writable, ref as never), repo.write(writable)]),
      );
      pairs.push([visitor.read(writable, ref as never), visitor.read(writable)]);
    }
    for (const [onAlias, onBase] of pairs) {
      expect(render(onAlias).sql).toContain('"scope_ref".');
      expect(onTable(render(onAlias))).toStrictEqual(render(onBase));
    }
  });
});

describe("a new row", () => {
  it("takes the context's dealer and sandbox, over any the row carries", () => {
    // As a private copy of a seed car would arrive (BR-31): its original's live scope columns
    const copied = { refCode: "MU-3HK8", slug: "mu-3hk8", dealerId: OTHER_DEALER, demoSessionId: null };
    const before = structuredClone(copied);
    expect(demo.values(car, copied)).toStrictEqual({
      refCode: "MU-3HK8",
      slug: "mu-3hk8",
      dealerId: DEALER,
      demoSessionId: SANDBOX,
    });
    expect(copied).toStrictEqual(before);
    expect(owner.values(car, { refCode: "MU-3HK8", slug: "mu-3hk8" })).toStrictEqual({
      refCode: "MU-3HK8",
      slug: "mu-3hk8",
      dealerId: DEALER,
      demoSessionId: null,
    });
  });

  it("is never a preset", () => {
    const preset = { nameAr: "Aqaba", nameEn: "Aqaba", isPreset: true };
    expect(demo.values(place, preset)).toMatchObject({ isPreset: false, dealerId: DEALER, demoSessionId: SANDBOX });
  });

  it("takes a fresh id, and a place no key, so a client's value can't name another row", () => {
    const row = { id: CAR_ID, refCode: "MU-3HK8", slug: "mu-3hk8" };
    expect(owner.values(car, row as NewRow<typeof car>)).not.toHaveProperty("id");
    const stop = { nameAr: "Port", nameEn: "Port", key: "aqaba_port" };
    expect(demo.values(place, stop as NewRow<typeof place>)).not.toHaveProperty("key");
    expectTypeOf<NewRow<typeof car>>().not.toHaveProperty("id");
    expectTypeOf<NewRow<typeof place>>().not.toHaveProperty("key");
  });

  it("takes the scope the repository checked, whatever happens to the context object after", () => {
    const ctx = { role: "owner" as const, dealerId: DEALER, userId: USER_ID };
    const repo = scopedRepo(ctx, database);
    ctx.dealerId = OTHER_DEALER;
    ctx.userId = "not-a-uuid";
    expect(repo.values(auditLog, { action: "car.update" })).toMatchObject({ dealerId: DEALER, actorUserId: USER_ID });
    expect(repo.ctx).toStrictEqual({ role: "owner", dealerId: DEALER, userId: USER_ID });
    expect(Object.isFrozen(repo.ctx)).toBe(true);
  });

  it("in the audit log names the context as its actor", () => {
    expect(owner.values(auditLog, { action: "car.update" })).toStrictEqual({
      action: "car.update",
      dealerId: DEALER,
      actorUserId: USER_ID,
      actorDemoSessionId: null,
    });
    expect(demo.values(auditLog, { action: "car.update" })).toStrictEqual({
      action: "car.update",
      dealerId: DEALER,
      actorUserId: null,
      actorDemoSessionId: SANDBOX,
    });
  });
});

describe("a change", () => {
  it("never moves a row: its id, its scope and its parent stay, whatever the patch carries", () => {
    // As a copied row would arrive: its original's id, scope and copy columns with the change
    const copied = {
      id: CAR_ID,
      mileageKm: 1200,
      dealerId: OTHER_DEALER,
      demoSessionId: null,
      copiedFromCarId: CAR_ID,
    };
    const before = structuredClone(copied);
    expect(demo.changes(car, copied)).toStrictEqual({ mileageKm: 1200 });
    expect(copied).toStrictEqual(before);
    const preset = { nameEn: "Port", key: "aqaba_port", isPreset: true, dealerId: null, demoSessionId: null };
    expect(owner.changes(place, preset)).toStrictEqual({ nameEn: "Port" });
    const photo = { altEn: "Front", carId: CAR_ID };
    expect(owner.changes(media, photo)).toStrictEqual({ altEn: "Front" });
    const panel = { state: "repainted", inspectionId: CAR_ID } as const;
    expect(demo.changes(inspectionPanel, panel)).toStrictEqual({ state: "repainted" });
  });

  it("leaves those columns out of its type", () => {
    expectTypeOf<Changes<typeof car>>().not.toHaveProperty("id");
    expectTypeOf<Changes<typeof car>>().not.toHaveProperty("demoSessionId");
    expectTypeOf<Changes<typeof car>>().not.toHaveProperty("copiedFromCarId");
    expectTypeOf<Changes<typeof place>>().not.toHaveProperty("isPreset");
    expectTypeOf<Changes<typeof media>>().not.toHaveProperty("carId");
    expectTypeOf<Changes<typeof inspectionPanel>>().not.toHaveProperty("inspectionId");
    expectTypeOf<Changes<typeof car>>().toHaveProperty("mileageKm");
  });
});

describe("what the repositories refuse", () => {
  it("a context with a malformed id, before any query", () => {
    const contexts = [
      { role: "owner", dealerId: "test-dealer", userId: USER_ID },
      { role: "staff", dealerId: DEALER, userId: "" },
      { role: "demo_dealer", dealerId: DEALER, sandboxId: "" },
      { role: "demo_dealer", dealerId: DEALER, sandboxId: SANDBOX.slice(1) },
      { role: "demo_dealer", dealerId: DEALER, sandboxId: undefined },
      { role: "demo_dealer", dealerId: "test-dealer", sandboxId: SANDBOX },
      { role: "demo_dealer", dealerId: DEALER, sandboxId: `${SANDBOX}x` },
      { role: "owner", dealerId: `${DEALER}0`, userId: USER_ID },
      // The public repository is the visitor's, and the jobs' context comes with T-35
      { role: "visitor", dealerId: DEALER, userId: USER_ID },
      { role: "system", dealerId: DEALER, userId: USER_ID },
    ];
    for (const context of contexts) expect(() => scopedRepo(context as never, database)).toThrow(RangeError);
    expect(() => publicRepo("test-dealer", database)).toThrow(RangeError);
    expect(() => publicRepo(`x${DEALER}`, database)).toThrow(RangeError);
  });

  it("a table it has no rule for, an alias passed as the table among them", () => {
    expect(() => owner.read(user as never)).toThrow(/user/);
    expect(() => owner.read(alias(car, "listed") as never)).toThrow(/listed/);
    expect(() => owner.values(inspection as never, {} as never)).toThrow(/inspection/);
  });

  it("an alias of another table, and one named as the copy check's own", () => {
    // @ts-expect-error: the types refuse an alias of another table, and so does the repository
    expect(() => owner.read(car, alias(media, "photo"))).toThrow(/photo is not an alias of car/);
    expect(() => demo.read(car, alias(car, "scope_copy"))).toThrow(/scope_copy/);
    expect(() => owner.write(place, alias(place, "scope_copy"))).toThrow(/scope_copy/);
  });

  it("a write to the audit log, and a public read of it", () => {
    expect(() => owner.write(auditLog as never)).toThrow(/audit_log/);
    expect(() => visitor.read(auditLog as never)).toThrow(/audit_log/);
  });

  it("Drizzle's relational queries, which move a subquery's columns to the outer table", () => {
    // A nested transaction's tx has them again, and the repositories' callers own the transaction
    expectTypeOf<ScopedRepo["db"]>().not.toHaveProperty("query");
    expectTypeOf<ScopedRepo["db"]>().not.toHaveProperty("transaction");
    expectTypeOf<PublicRepo["db"]>().not.toHaveProperty("query");
    expectTypeOf<PublicRepo["db"]>().not.toHaveProperty("transaction");
    // What that would do: the copy check compares each car with itself, so every original shows
    const { sql } = database.query.car.findMany({ columns: { id: true }, where: demo.read(car) }).toSQL();
    expect(sql).toContain('"car"."copied_from_car_id" = "car"."id"');
  });

  it("any write through the public repository, which the cached functions use to read", () => {
    type Reads = PublicRepo["db"];
    expectTypeOf<Reads>().toHaveProperty("select");
    expectTypeOf<Reads>().toHaveProperty("batch");
    expectTypeOf<Reads>().not.toHaveProperty("insert");
    expectTypeOf<Reads>().not.toHaveProperty("update");
    expectTypeOf<Reads>().not.toHaveProperty("delete");
    expectTypeOf<Reads>().not.toHaveProperty("execute");
    expectTypeOf<ReturnType<Reads["with"]>>().toHaveProperty("select");
    expectTypeOf<ReturnType<Reads["with"]>>().not.toHaveProperty("update");
  });
});

describe("the tables the repositories scope", () => {
  const declared: unknown[] = Object.values(schema);
  const tables = declared.filter((value): value is PgTable => is(value, PgTable));
  const scoped = new Set<string>(SCOPED_TABLES.map((table) => getTableName(table)));
  // Each with the reason it has no rule here
  const unscoped: Record<string, string> = {
    dealer: "the root every scope names",
    user: "T-67 adds it with staff accounts; a demo session reads no users",
    session: "the auth library's",
    account: "the auth library's",
    verification: "the auth library's",
    demo_session: "T-29's, found by the hash of the cookie's token",
    make: "reference data every dealer shares",
    model: "reference data every dealer shares",
    model_alias: "reference data every dealer shares",
    vin_decode_cache: "vPIC's answers, which every dealer shares",
    event_daily: "daily counts with no dealer column (D-043)",
    rate_limit: "keyed by an HMAC, never by a tenant",
    blob_ledger: "the deployment's storage writes",
  };

  it("are every table but those listed, each with its reason", () => {
    const names = tables.map((table) => getTableName(table)).sort();
    expect(names).toStrictEqual([...scoped, ...Object.keys(unscoped)].sort());
  });

  it("include every table with a tenant column, but the two named", () => {
    const TENANT = new Set(["dealer_id", "demo_session_id", "car_id", "inspection_id", "spin_set_id"]);
    const tenant = tables
      .map((table) => getTableConfig(table))
      .filter((config) => config.columns.some((column) => TENANT.has(column.name)))
      .map((config) => config.name);
    expect(tenant.filter((name) => !scoped.has(name)).sort()).toStrictEqual(["event_daily", "user"]);
  });
});
