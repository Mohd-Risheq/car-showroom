import "server-only";
import { inArray, isNull, lt, lte, type SQL, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { rateLimit } from "@/lib/db/schema";
import { assertLimit, LONGEST_WINDOW_SECONDS, type RateLimit, type RateLimitResult, rateLimitResult } from "./limit";

// ENT-RateLimit. Each check is one upsert, which restarts the key's window once it has ended, and in
// the same transaction a purge of up to 100 rows whose window and lock have both ended. They go in
// one batch, the upsert first, and the purge skips rows that other calls hold: a call can wait only
// at its upsert, before it holds any row, so two calls can never wait on each other. Times come
// from the caller, none from the database.

const PURGE_LIMIT = 100;

/**
 * Rows past every window whose lock, if any, has ended: the purge on write and the nightly cleanup
 * (API-27). One parenthesized group, so not() and any operator around it read it whole.
 */
export function endedRateLimits(now: Date): SQL {
  const horizon = new Date(now.getTime() - LONGEST_WINDOW_SECONDS * 1000);
  return sql`(${lt(rateLimit.windowStart, horizon)} and (${isNull(rateLimit.blockedUntil)} or ${lte(rateLimit.blockedUntil, now)}))`;
}

/**
 * Counts a call against the key's limit (SRS §8.3) and gives the verdict. Throws when the database
 * can't be reached: each caller decides whether that refuses the call or lets it through.
 */
export async function consume(db: Database, key: string, limit: RateLimit, now: Date): Promise<RateLimitResult> {
  assertLimit(limit);
  const restart = lte(rateLimit.windowStart, new Date(now.getTime() - limit.windowSeconds * 1000));
  const [[bucket]] = await db.batch([
    db
      .insert(rateLimit)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: {
          windowStart: sql`case when ${restart} then excluded.window_start else ${rateLimit.windowStart} end`,
          count: sql`case when ${restart} then 1 else ${rateLimit.count} + 1 end`,
        },
      })
      .returning({ count: rateLimit.count, windowStart: rateLimit.windowStart, blockedUntil: rateLimit.blockedUntil }),
    db
      .delete(rateLimit)
      .where(
        inArray(
          rateLimit.key,
          db
            .select({ key: rateLimit.key })
            .from(rateLimit)
            .where(endedRateLimits(now))
            .limit(PURGE_LIMIT)
            .for("update", { skipLocked: true }),
        ),
      ),
  ]);
  if (bucket === undefined) throw new Error("The rate-limit upsert returned no row");
  return rateLimitResult(bucket, limit, now);
}
