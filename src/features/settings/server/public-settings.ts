import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { dealerTag } from "@/lib/db/cache-tags";
import { publicDb } from "@/lib/db/client";
import type { PublicSettingsDTO } from "@/lib/db/public-dto";
import { publicRepo } from "@/lib/db/scoped-repo";
import { buildSettings } from "./build-settings";
import { loadSettingsRows } from "./settings-queries";

/** The dealer's settings the public pages read (SRS §11.4) */
export async function getSettings(dealerId: string): Promise<PublicSettingsDTO> {
  "use cache: remote";
  cacheLife("catalog");
  cacheTag(dealerTag(dealerId));
  return buildSettings(await loadSettingsRows(publicRepo(dealerId, publicDb)), new Date());
}
