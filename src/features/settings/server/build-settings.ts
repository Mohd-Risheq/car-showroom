import "server-only";
import { priceStaleness } from "@/features/cost/domain/staleness";
import type { AccentPreset } from "@/lib/db/enums";
import type { PublicFile, PublicSettingsDTO } from "@/lib/db/public-dto";
import { liveSettingsRow, publicFile } from "@/lib/db/public-rows";
import type { MediaVariants } from "@/lib/validation/media";
import type {
  BaselineConsumption,
  Closure,
  HeroMarks,
  RamadanSchedule,
  SocialLinks,
  WeeklyHours,
} from "@/lib/validation/settings";

// getSettings's row to the settings the public pages read (SRS §11.4). Each field is picked by name,
// so the dealer's rules for the other two functions (the sold window and the bands) never reach a
// page, nor a column the table gains until a builder names it.

/** The dealer's live settings, with its logo's file when the logo is ready */
export type SettingsRow = {
  readonly brandNameAr: string;
  readonly brandNameEn: string;
  readonly taglineAr: string | null;
  readonly taglineEn: string | null;
  readonly storyAr: string | null;
  readonly storyEn: string | null;
  readonly accentPreset: AccentPreset;
  readonly whatsappE164: string | null;
  readonly phoneE164: string | null;
  readonly email: string | null;
  readonly addressAr: string | null;
  readonly addressEn: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly social: SocialLinks;
  readonly hours: WeeklyHours;
  readonly ramadan: RamadanSchedule | null;
  readonly closures: readonly Closure[];
  readonly fuelPrice90: number | null;
  readonly fuelPrice95: number | null;
  readonly fuelPrice98: number | null;
  readonly fuelPriceDiesel: number | null;
  readonly elecHomeOffpeakKwh: number | null;
  readonly elecHomePeakKwh: number | null;
  readonly elecPublicKwh: number | null;
  readonly baselineLPer100km: BaselineConsumption;
  readonly pricesUpdatedAt: Date | null;
  readonly heroCarId: string | null;
  readonly heroMediaId: string | null;
  readonly heroMarks: HeroMarks | null;
  readonly featuredCarIds: readonly string[];
  readonly updatedAt: Date;
  readonly logoId: string | null;
  readonly logoVariants: MediaVariants | null;
  readonly logoWidth: number | null;
  readonly logoHeight: number | null;
};

/** The settings the public pages read at `now` */
export function buildSettings(rows: readonly SettingsRow[], now: Date): PublicSettingsDTO {
  const row = liveSettingsRow(rows);
  return {
    brandName: { ar: row.brandNameAr, en: row.brandNameEn },
    tagline: { ar: row.taglineAr, en: row.taglineEn },
    story: { ar: row.storyAr, en: row.storyEn },
    logo: logoOf(row),
    accentPreset: row.accentPreset,
    whatsappE164: row.whatsappE164,
    phoneE164: row.phoneE164,
    email: row.email,
    address: { ar: row.addressAr, en: row.addressEn },
    location: row.lat === null || row.lng === null ? null : { lat: row.lat, lng: row.lng },
    social: row.social,
    hours: row.hours,
    ramadan: row.ramadan,
    closures: row.closures.map(({ date, note_ar, note_en }) => ({ date, note: { ar: note_ar, en: note_en } })),
    showcase: {
      heroCarId: row.heroCarId,
      heroMediaId: row.heroMediaId,
      heroMarks: row.heroMarks,
      featuredCarIds: row.featuredCarIds,
    },
    prices: {
      fuel90: row.fuelPrice90,
      fuel95: row.fuelPrice95,
      fuel98: row.fuelPrice98,
      diesel: row.fuelPriceDiesel,
      elecHomeOffpeakKwh: row.elecHomeOffpeakKwh,
      elecHomePeakKwh: row.elecHomePeakKwh,
      elecPublicKwh: row.elecPublicKwh,
      baselineLPer100km: row.baselineLPer100km,
      updatedAt: row.pricesUpdatedAt?.getTime() ?? null,
      stale: priceStaleness(row.pricesUpdatedAt, now).publicNote,
    },
    updatedAt: row.updatedAt.getTime(),
  };
}

function logoOf(row: SettingsRow): PublicFile | null {
  return row.logoId === null ? null : publicFile(row.logoId, row.logoVariants, row.logoWidth, row.logoHeight);
}
