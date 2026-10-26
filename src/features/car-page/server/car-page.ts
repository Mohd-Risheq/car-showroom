import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { publicDb } from "@/lib/db/client";
import type { CarPageResult } from "@/lib/db/public-dto";
import { publicRepo } from "@/lib/db/scoped-repo";
import { resolveCarPage } from "./build-car";
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
