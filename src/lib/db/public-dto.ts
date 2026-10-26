import type {
  BaselineConsumption,
  HeroMarks,
  RamadanSchedule,
  SocialLinks,
  WeeklyHours,
} from "@/lib/validation/settings";
import type {
  AccentPreset,
  AudioSource,
  BodyType,
  CarCondition,
  CarStatus,
  ColorFamily,
  CustomsStatus,
  Drivetrain,
  FuelType,
  InsuranceType,
  LicenseStatus,
  MechState,
  MilestoneType,
  PaintFinish,
  PanelId,
  PanelState,
  PaymentMethod,
  PhotoGroup,
  RegionalSpecs,
  SohSource,
  Transmission,
} from "./enums";
import type { FeatureKey } from "./feature-keys";

// The public DTOs of SRS §11.4: everything the public pages read about the dealer's cars and
// settings, and nothing else. Their builders pick each field by name, so a column the schema gains
// reaches no page until a builder names it, and a VIN only when its car shows it (BR-43, TC-28-6).
// - One vocabulary: the schema's columns in camelCase. API-01 and API-02 rename at their edge.
// - Instants are epoch milliseconds, and calendar dates are 'YYYY-MM-DD'.
// - Keys and enum values are carried, and pages localize them from the catalogs. The cached
//   functions take ids only (no locale), so text the dealer writes travels in both languages.

/** Published, reserved, or sold inside BR-04's window */
export type PublicStatus = Extract<CarStatus, "published" | "reserved" | "sold">;

/** Names the catalog or the dealer's brand always has in both languages */
export type Names = { readonly ar: string; readonly en: string };

/** Text the dealer writes, where either language may be missing (BR-28) */
export type Bilingual = { readonly ar: string | null; readonly en: string | null };

/** A stored file and the size of its largest variant */
export type PublicFile = { readonly src: string; readonly width: number; readonly height: number };

/** BR-06's band of a used car's kilometres a year */
export type MileageBand = "low" | "typical" | "high";

/** BR-08's advisory band of a paint reading */
export type MicronBand = "factory" | "refinish" | "filler";

/** One publicly visible car, as the inventory, search, Garage and Compare read it */
export type PublicCardDTO = {
  readonly id: string;
  readonly slug: string;
  readonly refCode: string;
  readonly status: PublicStatus;
  readonly makeKey: string;
  readonly modelKey: string;
  readonly trim: string | null;
  readonly modelYear: number;
  readonly mileageKm: number;
  readonly priceJod: number;
  readonly fuelType: FuelType;
  readonly regionalSpecs: RegionalSpecs;
  readonly customsStatus: CustomsStatus;
  readonly bodyType: BodyType;
  readonly transmission: Transmission;
  readonly licenseStatus: LicenseStatus;
  readonly insuranceType: InsuranceType;
  // Information only (C-04)
  readonly paymentMethods: readonly PaymentMethod[];
  readonly seats: number | null;
  readonly colorFamily: ColorFamily | null;
  readonly ownersCount: number | null;
  readonly features: readonly FeatureKey[];
  readonly publishedAt: number;
  /** The sitemap's lastmod: the later of the car's and its inspection's last change */
  readonly updatedAt: number;
  /** FR-06.7, BR-05: the cards' New and Price dropped badges */
  readonly isNew: boolean;
  readonly priceDropped: boolean;
  /** BR-07: known items of 16, or null without an inspection */
  readonly inspectionFilled: number | null;
  readonly hasSpin: boolean;
  /** An engine clip, which an electric car never shows (FR-15.10) */
  readonly hasSound: boolean;
  /** The cover, else the first photo (FR-06), else null for the silhouette */
  readonly cover: PublicCardCover | null;
};

/** The card's photo: decorative, as the card's link names the car (D-043), so it carries no alt text */
export type PublicCardCover = {
  /** The card widths the photo has: BR-20 never upscales, so a narrow photo may lack 960 */
  readonly variants: Readonly<Partial<Record<CardWidth, string>>>;
  readonly placeholder: string | null;
  readonly dominantColor: string | null;
};

export type CardWidth = "480" | "960";

/** A model's names and its make, for the model facet under its make (FR-07) */
export type PublicModel = Names & { readonly makeKey: string };

/** What getInventoryIndex returns: the cards newest first, and the makes and models in stock */
export type PublicInventoryIndex = {
  readonly cards: readonly PublicCardDTO[];
  readonly makes: Readonly<Record<string, Names>>;
  readonly models: Readonly<Record<string, PublicModel>>;
};

/** The gallery's widths: the variants a photo is stored in, less those wider than the photo (BR-20) */
export const PHOTO_VARIANTS = ["480", "960", "1200", "1600", "2560"] as const;
export type PhotoVariant = (typeof PHOTO_VARIANTS)[number];

export type PublicPhoto = {
  readonly id: string;
  readonly group: PhotoGroup;
  /**
   * FR-10.6. Where the page language's alt is empty, the page writes car.gallery.alt in that
   * language, or car.gallery.altImperfection for an imperfection photo whose linked panel's or
   * hotspot's note is in that language (DESIGN §8.6, §9.2 photos.alt.hint)
   */
  readonly alt: Bilingual;
  readonly width: number;
  readonly height: number;
  readonly placeholder: string | null;
  readonly dominantColor: string | null;
  readonly variants: Readonly<Partial<Record<PhotoVariant, string>>>;
};

export type PublicPanel = {
  readonly panelId: PanelId;
  readonly state: PanelState;
  /** Null for a plastic panel */
  readonly microns: number | null;
  /** BR-08 by the dealer's bands, or null without a reading */
  readonly band: MicronBand | null;
  readonly note: Bilingual;
  /** Kept only when the photo is in the gallery */
  readonly closeupPhotoId: string | null;
};

export type MechanicalItem = "chassis" | "engine" | "gearbox";

export type PublicInspection = {
  /** The inspection's date, else the Amman date of its last change (DESIGN §5.2) */
  readonly declaredOn: string;
  readonly testCenterName: string | null;
  /** FR-13.4's official report. A PDF has no size */
  readonly report: {
    readonly src: string;
    readonly format: "pdf" | "image";
    readonly width: number | null;
    readonly height: number | null;
  } | null;
  /** BR-07: known items of 16 */
  readonly filled: number;
  /** All 13, in PANEL_IDS order */
  readonly panels: readonly PublicPanel[];
  readonly mechanical: Readonly<Record<MechanicalItem, { readonly state: MechState; readonly note: Bilingual }>>;
};

/** BR-05: "Price reduced from {fromJod} on {on}", and the title block's badge while it is under 14 days */
export type PublicPriceDrop = { readonly fromJod: number; readonly on: number; readonly badge: boolean };

/** BR-06, with the dealer's bands the explanation names */
export type PublicMileageCheck = {
  readonly band: MileageBand;
  readonly kmPerYear: number;
  readonly low: number;
  readonly high: number;
};

/** An engine clip's source (FR-15.14). T-40 adds the clip itself */
export type PublicSound = { readonly source: AudioSource };

/** A ready spin set. T-41 adds its frames and hotspots */
export type PublicSpin = { readonly frameCount: number };

/** A journey step. T-42 adds its place, month and notes */
export type PublicMilestone = { readonly type: MilestoneType };

/** The car page's car */
export type PublicCarDTO = {
  readonly id: string;
  /** The current slug, which the page's canonical URL takes */
  readonly slug: string;
  readonly refCode: string;
  readonly status: PublicStatus;
  readonly condition: CarCondition;
  readonly makeName: Names;
  readonly modelName: Names;
  readonly trim: string | null;
  readonly modelYear: number;
  readonly priceJod: number;
  readonly priceDrop: PublicPriceDrop | null;
  readonly customsStatus: CustomsStatus;
  readonly mileageKm: number;
  /** Null for a new car */
  readonly mileageCheck: PublicMileageCheck | null;
  readonly fuelType: FuelType;
  readonly transmission: Transmission;
  readonly regionalSpecs: RegionalSpecs;
  readonly bodyType: BodyType;
  readonly drivetrain: Drivetrain | null;
  readonly engineCc: number | null;
  readonly seats: number | null;
  readonly ownersCount: number | null;
  readonly licenseStatus: LicenseStatus;
  /** The month as its first day */
  readonly licenseExpiry: string | null;
  readonly insuranceType: InsuranceType;
  readonly exteriorColorName: Bilingual;
  readonly interiorColorName: Bilingual;
  readonly battery: { readonly pct: number; readonly source: SohSource } | null;
  readonly warrantyUntil: string | null;
  /** BR-43: only when the dealer shows it */
  readonly vin: string | null;
  readonly features: readonly FeatureKey[];
  readonly description: Bilingual;
  readonly lengthMm: number | null;
  readonly wheelbaseMm: number | null;
  /** FR-28.6's link preview, made at publish (FR-34.6) */
  readonly ogImage: PublicFile | null;
  // Read by later phases (FR-18, FR-21, FR-22), from the same row
  readonly consumption: { readonly lPer100km: number | null; readonly kwhPer100km: number | null };
  readonly recommendedOctane: number | null;
  readonly phevElectricSharePct: number | null;
  readonly colorFamily: ColorFamily | null;
  readonly exteriorColorHex: string | null;
  readonly paintFinish: PaintFinish | null;
  /** The cover first, then the dealer's order */
  readonly photos: readonly PublicPhoto[];
  readonly inspection: PublicInspection | null;
  /** Null without a clip, and for an electric car (FR-15.10) */
  readonly sound: PublicSound | null;
  readonly spin: PublicSpin | null;
  readonly journey: readonly PublicMilestone[];
};

/**
 * What getCarPage finds for a slug: the car, the car's current slug for an earlier one (BR-16), or
 * nothing. A car that was public and is no longer gives its body type, for DESIGN §7.2.11's link
 * to similar cars, and nothing else.
 */
export type CarPageResult =
  | { readonly kind: "car"; readonly car: PublicCarDTO }
  | { readonly kind: "redirect"; readonly slug: string }
  | { readonly kind: "notFound"; readonly gone: { readonly bodyType: BodyType } | null };

export type PublicClosure = { readonly date: string; readonly note: Bilingual };

/** The live settings the public pages read. The dealer's rules for the other two functions stay out */
export type PublicSettingsDTO = {
  readonly brandName: Names;
  readonly tagline: Bilingual;
  /** FR-27: the dealer's story on the Visit page */
  readonly story: Bilingual;
  readonly logo: PublicFile | null;
  readonly accentPreset: AccentPreset;
  readonly whatsappE164: string | null;
  readonly phoneE164: string | null;
  readonly email: string | null;
  readonly address: Bilingual;
  readonly location: { readonly lat: number; readonly lng: number } | null;
  readonly social: SocialLinks;
  readonly hours: WeeklyHours;
  readonly ramadan: RamadanSchedule | null;
  readonly closures: readonly PublicClosure[];
  /** Ids the pages look up in public data, never trusting them: VR-28 runs at save only */
  readonly showcase: {
    readonly heroCarId: string | null;
    readonly heroMediaId: string | null;
    readonly heroMarks: HeroMarks | null;
    readonly featuredCarIds: readonly string[];
  };
  readonly prices: {
    readonly fuel90: number | null;
    readonly fuel95: number | null;
    readonly fuel98: number | null;
    readonly diesel: number | null;
    readonly elecHomeOffpeakKwh: number | null;
    readonly elecHomePeakKwh: number | null;
    readonly elecPublicKwh: number | null;
    readonly baselineLPer100km: BaselineConsumption;
    /** Null when the dealer never set them */
    readonly updatedAt: number | null;
    /** BR-12's public note: older than 45 days, or never set */
    readonly stale: boolean;
  };
  /** The static pages' lastmod (FR-28.3) */
  readonly updatedAt: number;
};
