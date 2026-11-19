import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { isCarSlug } from "@/features/dealer/domain/slug";
import { getDealerId } from "@/features/settings/server/dealer-id";
import { publicDb } from "@/lib/db/client";
import type { CarPageResult } from "@/lib/db/public-dto";
import { publicRepo } from "@/lib/db/scoped-repo";
import { NOT_FOUND, resolveCarPage } from "./build-car";
import { loadCarPageRows } from "./car-queries";

/**
 * What the dealer's slug shows (SRS §11.4): the car, its current slug for an earlier one, or not
 * found, as values, since an entry that throws is never stored. The tags follow the result.
 */
export async function getCarPage(dealerId: string, slug: string): Promise<CarPageResult> {
  "use cache: remote";
  cacheLife("catalog");
  const rows = await loadCarPageRows(publicRepo(dealerId, publicDb), slug);
  const { result, tags } = resolveCarPage(dealerId, rows, new Date());
  cacheTag(...tags);
  return result;
}

/**
 * What the slug in a page's address shows, for the dealer this deployment serves. A slug no car can
 * have shows nothing, without a read: the database refuses a NUL in text, which an address can hold.
 */
export async function carPageFor(slug: string): Promise<CarPageResult> {
  return isCarSlug(slug) ? getCarPage(await getDealerId(), slug) : NOT_FOUND;
}
