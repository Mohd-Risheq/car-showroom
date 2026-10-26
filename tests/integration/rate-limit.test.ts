import { createHash } from "node:crypto";
import { eq, inArray, not, type SQL } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Database, httpDatabase } from "@/lib/db/client";
import { rateLimit } from "@/lib/db/schema";
import { consume, endedRateLimits } from "@/lib/rate-limit/store";
import { createThrowawayDatabase, type ThrowawayDatabase } from "../support/throwaway-database";

// ENT-RateLimit: each check is one upsert, which restarts the window once it has ended; a BR-42 lock
// holds whatever the window; rows whose window and lock have both ended are deleted on write, at
// most 100 a call. The purge reaches every row in the table, so this file has a database of its own.
// Keys have key.ts's form, 43 base64url characters, which the table's check requires.

let database: ThrowawayDatabase | undefined;
let db: Database;

beforeAll(async () => {
  database = await createThrowawayDatabase("t16_rate_limit");
  db = httpDatabase(database.url);
});

afterAll(async () => {
  await database?.drop();
});

const NOW = new Date("2026-10-24T09:00:00.000Z");
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const LIMIT = { max: 3, windowSeconds: 60 };
const ONE_A_MINUTE = { max: 1, windowSeconds: 60 };
const keyOf = (label: string) => createHash("sha256").update(label).digest("base64url");
const newKey = () => keyOf(crypto.randomUUID());

async function rowOf(key: string) {
  const [row] = await db.select().from(rateLimit).where(eq(rateLimit.key, key));
  return row;
}

describe("a rate limit in the database", () => {
  it("counts each call in the window, and refuses past the limit with the seconds left", async () => {
    const key = newKey();
    for (const second of [0, 1, 2]) expect(await consume(db, key, LIMIT, at(second))).toStrictEqual({ allowed: true });
    expect(await consume(db, key, LIMIT, at(10))).toStrictEqual({ allowed: false, retryAfter: 50 });
    expect(await rowOf(key)).toMatchObject({ count: 4, windowStart: NOW, blockedUntil: null });
  });

  it("starts a new window at the moment the old one ends", async () => {
    const key = newKey();
    await consume(db, key, ONE_A_MINUTE, at(0));
    expect(await consume(db, key, ONE_A_MINUTE, at(59))).toStrictEqual({ allowed: false, retryAfter: 1 });
    expect(await consume(db, key, ONE_A_MINUTE, at(60))).toStrictEqual({ allowed: true });
    expect(await rowOf(key)).toMatchObject({ count: 1, windowStart: at(60) });
  });

  it("holds a BR-42 lock whatever the window", async () => {
    const key = newKey();
    await db.insert(rateLimit).values({ key, windowStart: at(0), count: 0, blockedUntil: at(900) });
    expect(await consume(db, key, LIMIT, at(0))).toStrictEqual({ allowed: false, retryAfter: 900 });
    expect(await consume(db, key, LIMIT, at(899))).toStrictEqual({ allowed: false, retryAfter: 1 });
    expect(await consume(db, key, LIMIT, at(900))).toStrictEqual({ allowed: true });
    expect(await rowOf(key)).toMatchObject({ blockedUntil: at(900) });
  });

  it("counts calls made at the same moment without losing one", async () => {
    const key = newKey();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume(db, key, { max: 10, windowSeconds: 60 }, at(0))),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(await rowOf(key)).toMatchObject({ count: 20 });
  });

  it("refuses a limit outside the rules before it writes", async () => {
    const key = newKey();
    await expect(consume(db, key, { max: 0, windowSeconds: 60 }, at(0))).rejects.toThrow(RangeError);
    expect(await rowOf(key)).toBeUndefined();
  });
});

describe("the rows that have ended", () => {
  it("are one condition, so its negation is every row still in force (API-27)", async () => {
    await db.delete(rateLimit);
    const rows = {
      ended: { windowStart: at(-7200), blockedUntil: null },
      endedLockOver: { windowStart: at(-7200), blockedUntil: at(0) },
      endedLocked: { windowStart: at(-7200), blockedUntil: at(60) },
      live: { windowStart: at(-60), blockedUntil: null },
      liveLocked: { windowStart: at(-60), blockedUntil: at(60) },
    };
    await db.insert(rateLimit).values(Object.entries(rows).map(([label, row]) => ({ key: keyOf(label), ...row })));
    const labelsWhere = async (where: SQL) => {
      const keys = new Set(
        (await db.select({ key: rateLimit.key }).from(rateLimit).where(where)).map((row) => row.key),
      );
      return Object.keys(rows).filter((label) => keys.has(keyOf(label)));
    };

    expect(await labelsWhere(endedRateLimits(at(0)))).toStrictEqual(["ended", "endedLockOver"]);
    expect(await labelsWhere(not(endedRateLimits(at(0))))).toStrictEqual(["endedLocked", "live", "liveLocked"]);
  });
});

describe("the purge on write", () => {
  it("deletes up to 100 rows whose window and lock have ended", async () => {
    await db.delete(rateLimit);
    // 150 rows to purge, the last of them locked until the moment of the call
    const lockOver = keyOf("lock-over");
    const purgeable = [...Array.from({ length: 149 }, (_, index) => keyOf(`ended-${index}`)), lockOver];
    const locked = keyOf("locked");
    const recent = keyOf("recent");
    const counted = keyOf("counted");
    await db.insert(rateLimit).values([
      ...purgeable.slice(0, -1).map((key) => ({ key, windowStart: at(-7200), count: 1 })),
      { key: lockOver, windowStart: at(-7200), count: 5, blockedUntil: at(0) },
      { key: locked, windowStart: at(-7200), count: 5, blockedUntil: at(60) },
      // Within the longest window, an hour, so possibly still counting
      { key: recent, windowStart: at(-3000), count: 1 },
      { key: counted, windowStart: at(-7200), count: 7 },
    ]);
    const keysLeft = async () =>
      new Set((await db.select({ key: rateLimit.key }).from(rateLimit)).map((row) => row.key));

    expect(await consume(db, counted, LIMIT, at(0))).toStrictEqual({ allowed: true });
    const left = await keysLeft();
    expect(purgeable.filter((key) => left.has(key))).toHaveLength(50);
    expect([locked, recent, counted].every((key) => left.has(key))).toBe(true);
    // The counted key's own ended window starts again
    expect(await rowOf(counted)).toMatchObject({ count: 1, windowStart: at(0) });

    // The next write takes the rest
    await consume(db, newKey(), LIMIT, at(0));
    const after = await keysLeft();
    expect(purgeable.filter((key) => after.has(key))).toHaveLength(0);
    expect([locked, recent, counted].every((key) => after.has(key))).toBe(true);
  });

  it("never waits for a row that another transaction holds", async () => {
    await db.delete(rateLimit);
    const held = keyOf("held");
    await db.insert(rateLimit).values({ key: held, windowStart: at(-7200), count: 1 });
    const holder = postgres(database!.directUrl, { max: 1, onnotice: () => {} });
    try {
      await holder.begin(async (transaction) => {
        await transaction`select key from rate_limit where key = ${held} for update`;
        // Waiting here would wait for this transaction, which waits for the call: refuse after 5 s
        const waited = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("the purge waited for a row another transaction holds")), 5000);
        });
        expect(await Promise.race([consume(db, newKey(), LIMIT, at(0)), waited])).toStrictEqual({ allowed: true });
      });
    } finally {
      await holder.end();
    }
    expect(await rowOf(held)).toBeDefined();
    await consume(db, newKey(), LIMIT, at(0));
    expect(await rowOf(held)).toBeUndefined();
  });

  it("starts a new window for each of many ended keys that come back at once", async () => {
    await db.delete(rateLimit);
    const keys = Array.from({ length: 200 }, (_, index) => keyOf(`back-${index}`));
    await db.insert(rateLimit).values(keys.map((key) => ({ key, windowStart: at(-7200), count: 9 })));

    const returning = keys.slice(0, 50);
    const results = await Promise.all(returning.map((key) => consume(db, key, LIMIT, at(0))));
    expect(results.every((result) => result.allowed)).toBe(true);
    const rows = await db.select({ count: rateLimit.count }).from(rateLimit).where(inArray(rateLimit.key, returning));
    expect(rows.map((row) => row.count)).toStrictEqual(returning.map(() => 1));
  });
});
