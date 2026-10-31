import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { dealer } from "@/lib/db/schema";

// getDealerId's statement (SRS §11.4): the id of the dealer a slug names. It runs as a batch of one,
// which the public client makes a read-only transaction.

/**
 * The id of the dealer with this slug, or null for none, in lower case as the cache tags read it:
 * Postgres writes a uuid so already, and the call keeps that form if the column's type changes.
 */
export async function loadDealerId(database: Database, slug: string): Promise<string | null> {
  const [rows] = await database.batch([database.select({ id: dealer.id }).from(dealer).where(eq(dealer.slug, slug))]);
  return rows[0]?.id.toLowerCase() ?? null;
}
