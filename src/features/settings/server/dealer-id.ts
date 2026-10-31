import "server-only";
import { cacheLife } from "next/cache";
import { publicDb } from "@/lib/db/client";
import { loadDealerId } from "./dealer-queries";

// The dealer this deployment serves, the row DEALER_SLUG names (SRS §15.1), whose id the cached public
// reads take (SRS §11.4). Every public page shows the dealer's name and contact in its shell, so a
// deployment without its dealer stops at the build, where its pages are prerendered, rather than
// serving a showroom with no name.

// The dealer table's own rule (dealer_slug_format) and its column's length
const SLUG = /^[a-z0-9-]{1,40}$/;

/** DEALER_SLUG, checked: it must name a dealer the way the dealer table writes one */
export function dealerSlugOf(value: string | undefined): string {
  if (value === undefined || value === "")
    throw new Error("DEALER_SLUG isn't set: it names the dealer this deployment serves (SRS §15.1)");
  if (!SLUG.test(value))
    throw new Error("DEALER_SLUG must be the dealer's slug: lowercase letters, digits and hyphens, at most 40");
  return value;
}

/** The id of the dealer DEALER_SLUG names, in lower case as Postgres writes it and the cache tags read it */
export async function getDealerId(): Promise<string> {
  return dealerIdBySlug(dealerSlugOf(process.env.DEALER_SLUG));
}

/** Read once per slug and shared across instances, as the public reads are (SRS §11.4) */
async function dealerIdBySlug(slug: string): Promise<string> {
  "use cache: remote";
  cacheLife("catalog");
  const id = await loadDealerId(publicDb, slug);
  if (id === null)
    throw new Error(
      `No dealer has the slug in DEALER_SLUG. The seed makes the demo dealer when DEMO_MODE=true, and a client's dealer has a step of its own (D-045)`,
    );
  return id;
}
