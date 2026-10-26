import "server-only";
import { log } from "@/lib/log/logger";
import type { MediaVariants } from "@/lib/validation/media";
import { FEATURE_KEYS, type FeatureKey } from "./feature-keys";
import type { PublicFile } from "./public-dto";

// What the builders of the public reads share (SRS §11.4): the dealer's live settings row, the
// report of a public car or file a page can't show, a file shown whole, and a car's features in the
// catalog's terms.

/** The dealer's live settings row, the one source of the rules the builders apply */
export function liveSettingsRow<Row>(rows: readonly Row[]): Row {
  const [row] = rows;
  // The live row is unique (dealer_settings_live_key), so a second could only be a scope fault
  if (row === undefined || rows.length !== 1) {
    throw new Error(`The public pages read their rules from the dealer's one live settings row, not ${rows.length}`);
  }
  return row;
}

/**
 * Leaves out a public car missing a field its page reads with no fallback or the names it reads,
 * and logs it: a page never shows a gap where a fact should be
 */
export function incompleteCar(carId: string, missing: readonly string[]): null {
  log("error", "public_car_incomplete", { carId, missing: missing.join(" ") });
  return null;
}

/** Leaves out a ready file without what the page reads, and logs it */
export function incompleteMedia(mediaId: string): null {
  log("error", "public_media_incomplete", { mediaId });
  return null;
}

/** A ready image a page shows whole, as a logo or a link preview: its address and its size */
export function publicFile(
  mediaId: string,
  variants: MediaVariants | null,
  width: number | null,
  height: number | null,
): PublicFile | null {
  const src = variants?.src;
  if (src === undefined || width === null || height === null) return incompleteMedia(mediaId);
  return { src, width, height };
}

/** The car's catalog features in the catalog's order. A key outside it is dropped and logged */
export function catalogFeatures(carId: string, features: readonly string[]): FeatureKey[] {
  for (const feature of features) {
    if (!(FEATURE_KEYS as readonly string[]).includes(feature)) {
      log("warn", "public_car_feature_unknown", { carId, feature });
    }
  }
  return FEATURE_KEYS.filter((key) => features.includes(key));
}
