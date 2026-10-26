import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { dealer } from "@/lib/db/schema";

// The dealer the integration tests' rows belong to. Its slug keeps it apart from the deployment's
// own dealer (DEALER_SLUG, which the seed makes). No action deletes a dealer, so it is made on first
// use and kept, and making it twice at once is harmless.
const TEST_DEALER_SLUG = "test-dealer";

let made: Promise<string> | undefined;

/** The test dealer's id */
export function testDealerId(): Promise<string> {
  made ??= makeTestDealer();
  return made;
}

async function makeTestDealer(): Promise<string> {
  await db.insert(dealer).values({ slug: TEST_DEALER_SLUG }).onConflictDoNothing({ target: dealer.slug });
  const [row] = await db.select({ id: dealer.id }).from(dealer).where(eq(dealer.slug, TEST_DEALER_SLUG));
  if (!row) throw new Error(`the ${TEST_DEALER_SLUG} row is missing after it was made`);
  return row.id;
}
