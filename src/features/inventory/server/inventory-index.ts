import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { soldCutoff } from "@/features/inventory/domain/listing";
import { carsTag, dealerTag } from "@/lib/db/cache-tags";
import { publicDb } from "@/lib/db/client";
import type { PublicInventoryIndex } from "@/lib/db/public-dto";
import { publicRepo } from "@/lib/db/scoped-repo";
import { SOLD_VISIBLE_DAYS } from "@/lib/validation/bounds";
import { buildIndex } from "./build-index";
import { decodeIndex, encodeIndex, type IndexWire } from "./index-codec";
import { loadIndexRows } from "./index-queries";

/** The index in its stored form, a third of the cards' size (D-043) */
async function loadIndexWire(dealerId: string): Promise<IndexWire> {
  "use cache: remote";
  cacheLife("catalog");
  cacheTag(carsTag(dealerId), dealerTag(dealerId));
  const now = new Date();
  // Every dealer's window fits BR-04's longest, and the builder applies the dealer's own
  const rows = await loadIndexRows(publicRepo(dealerId, publicDb), soldCutoff(now, SOLD_VISIBLE_DAYS.max));
  return encodeIndex(buildIndex(rows, now));
}

/** The cars the public sees (SRS §11.4), decoded once a request however many readers it has */
export const getInventoryIndex = cache(async (dealerId: string): Promise<PublicInventoryIndex> =>
  decodeIndex(await loadIndexWire(dealerId)),
);
