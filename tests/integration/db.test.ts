import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, withTransaction } from "@/lib/db/client";
import { verification } from "@/lib/db/schema";

// SRS §11.4: single queries over neon-http, multi-statement writes in a per-request Pool
// transaction. Runs unchanged on the local proxy (BUILD-PLAN §6.3) and on a Neon branch (T-37).

const identifier = `t02-db-${crypto.randomUUID()}`;
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);
const rowsForThisRun = () => db.select().from(verification).where(eq(verification.identifier, identifier));

afterAll(async () => {
  await db.delete(verification).where(eq(verification.identifier, identifier));
});

describe("database drivers", () => {
  it("runs a single query over neon-http", async () => {
    const result = await db.execute<{ two: number }>(sql`select 1 + 1 as two`);
    expect(result.rows).toEqual([{ two: 2 }]);
  });

  it("commits a Pool transaction that a separate HTTP connection then reads", async () => {
    const ids = await withTransaction(async (tx) => {
      const rows = await tx
        .insert(verification)
        .values([
          { identifier, value: "first", expiresAt: inAnHour() },
          { identifier, value: "second", expiresAt: inAnHour() },
        ])
        .returning({ id: verification.id });
      const inside = await tx.select().from(verification).where(eq(verification.identifier, identifier));
      expect(inside).toHaveLength(2);
      return rows.map((row) => row.id);
    });

    const committed = await rowsForThisRun();
    expect(committed.map((row) => row.id).sort()).toEqual([...ids].sort());
    await db.delete(verification).where(eq(verification.identifier, identifier));
  });

  it("rolls back a Pool transaction that throws", async () => {
    const failing = withTransaction(async (tx) => {
      await tx.insert(verification).values({ identifier, value: "rolled back", expiresAt: inAnHour() });
      throw new Error("abort after the insert");
    });

    await expect(failing).rejects.toThrow("abort after the insert");
    expect(await rowsForThisRun()).toEqual([]);
  });
});
