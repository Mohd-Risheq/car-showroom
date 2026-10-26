import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { dealerSettings, media } from "@/lib/db/schema";
import type { PublicRepo } from "@/lib/db/scoped-repo";
import type { SettingsRow } from "./build-settings";

// getSettings's statement (SRS §11.4): the dealer's live settings and its ready logo. It runs as a
// batch of one, which the public client makes a read-only transaction.

export function settingsStatement(repo: PublicRepo) {
  return repo.db
    .select({
      brandNameAr: dealerSettings.brandNameAr,
      brandNameEn: dealerSettings.brandNameEn,
      taglineAr: dealerSettings.taglineAr,
      taglineEn: dealerSettings.taglineEn,
      storyAr: dealerSettings.storyAr,
      storyEn: dealerSettings.storyEn,
      accentPreset: dealerSettings.accentPreset,
      whatsappE164: dealerSettings.whatsappE164,
      phoneE164: dealerSettings.phoneE164,
      email: dealerSettings.email,
      addressAr: dealerSettings.addressAr,
      addressEn: dealerSettings.addressEn,
      lat: dealerSettings.lat,
      lng: dealerSettings.lng,
      social: dealerSettings.social,
      hours: dealerSettings.hours,
      ramadan: dealerSettings.ramadan,
      closures: dealerSettings.closures,
      fuelPrice90: dealerSettings.fuelPrice90,
      fuelPrice95: dealerSettings.fuelPrice95,
      fuelPrice98: dealerSettings.fuelPrice98,
      fuelPriceDiesel: dealerSettings.fuelPriceDiesel,
      elecHomeOffpeakKwh: dealerSettings.elecHomeOffpeakKwh,
      elecHomePeakKwh: dealerSettings.elecHomePeakKwh,
      elecPublicKwh: dealerSettings.elecPublicKwh,
      baselineLPer100km: dealerSettings.baselineLPer100km,
      pricesUpdatedAt: dealerSettings.pricesUpdatedAt,
      heroCarId: dealerSettings.heroCarId,
      heroMediaId: dealerSettings.heroMediaId,
      heroMarks: dealerSettings.heroMarks,
      featuredCarIds: dealerSettings.featuredCarIds,
      updatedAt: dealerSettings.updatedAt,
      logoId: media.id,
      logoVariants: media.variants,
      logoWidth: media.width,
      logoHeight: media.height,
    })
    .from(dealerSettings)
    .leftJoin(
      media,
      and(
        eq(media.id, dealerSettings.logoMediaId),
        eq(media.kind, "logo"),
        eq(media.status, "ready"),
        isNull(media.deletedAt),
        repo.read(media),
      ),
    )
    .where(repo.read(dealerSettings));
}

/** The settings rows, read in a batch of one */
export async function loadSettingsRows(repo: PublicRepo): Promise<readonly SettingsRow[]> {
  const [rows] = await repo.db.batch([settingsStatement(repo)]);
  return rows;
}
