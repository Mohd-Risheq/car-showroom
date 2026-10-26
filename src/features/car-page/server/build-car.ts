import "server-only";
import { mileageCheck } from "@/features/car-page/domain/mileage-check";
import { inspectionFilled } from "@/features/inspection/domain/completeness";
import { micronBand } from "@/features/inspection/domain/micron-band";
import { isPublic, type PriceChange, priceDrop, soldCutoff } from "@/features/inventory/domain/listing";
import { hasPublicFields, missingPublicFields } from "@/features/inventory/domain/public-fields";
import { carsTag, carTag, dealerTag } from "@/lib/db/cache-tags";
import {
  type AudioSource,
  type BodyType,
  type CarCondition,
  type CarStatus,
  type ColorFamily,
  type CustomsStatus,
  type Drivetrain,
  type FuelType,
  type InsuranceType,
  type LicenseStatus,
  type MechState,
  type MilestoneType,
  type PaintFinish,
  PANEL_IDS,
  type PanelId,
  type PanelState,
  type PhotoGroup,
  type RegionalSpecs,
  type SohSource,
  type Transmission,
} from "@/lib/db/enums";
import {
  type CarPageResult,
  type Names,
  PHOTO_VARIANTS,
  type PhotoVariant,
  type PublicCarDTO,
  type PublicFile,
  type PublicInspection,
  type PublicPhoto,
  type PublicSound,
  type PublicStatus,
} from "@/lib/db/public-dto";
import { catalogFeatures, incompleteCar, incompleteMedia, liveSettingsRow, publicFile } from "@/lib/db/public-rows";
import { ammanDate } from "@/lib/format/calendar";
import { MEDIA_TYPES, type MediaKind } from "@/lib/storage/rules";
import type { MediaVariants } from "@/lib/validation/media";
import type { MicronBands, MileageBands } from "@/lib/validation/settings";

// getCarPage's rows to its result (SRS §11.4, FR-09.1, FR-09.2, BR-16). A live slug names the car,
// and never falls through to an earlier slug; an earlier slug sends the visitor to its public car's
// current one. A car the public never saw answers as a slug no car has, tags included, so nothing
// tells that it exists. Each field is picked by name, and a public car or file missing what the
// page reads is left out and logged, as on the index.

/** P1: the dealer's live settings row, the one source of the rules the page applies */
export type CarPageRules = {
  readonly soldVisibleDays: number;
  readonly mileageBands: MileageBands;
  readonly micronBands: MicronBands;
};

/** What a slug resolves on: the car it names, now or before */
type SlugCar = {
  readonly id: string;
  /** The car's current slug */
  readonly slug: string;
  readonly status: CarStatus;
  readonly bodyType: BodyType | null;
  readonly publishedAt: Date | null;
  readonly soldAt: Date | null;
};

/** P3: the car an earlier slug names (BR-16), read when no car has the slug now */
export type CarPageHistoryRow = SlugCar;

/** P2: the car the slug names now, with its make's and model's names */
export type CarPageCarRow = SlugCar & {
  readonly refCode: string;
  readonly condition: CarCondition;
  readonly makeKey: string | null;
  readonly modelKey: string | null;
  readonly makeNameAr: string | null;
  readonly makeNameEn: string | null;
  readonly modelNameAr: string | null;
  readonly modelNameEn: string | null;
  readonly trim: string | null;
  readonly modelYear: number | null;
  readonly priceJod: number | null;
  readonly customsStatus: CustomsStatus | null;
  readonly mileageKm: number | null;
  readonly fuelType: FuelType | null;
  readonly transmission: Transmission | null;
  readonly regionalSpecs: RegionalSpecs | null;
  readonly drivetrain: Drivetrain | null;
  readonly engineCc: number | null;
  readonly seats: number | null;
  readonly ownersCount: number | null;
  readonly licenseStatus: LicenseStatus | null;
  readonly licenseExpiry: string | null;
  readonly insuranceType: InsuranceType | null;
  readonly exteriorColorNameAr: string | null;
  readonly exteriorColorNameEn: string | null;
  readonly interiorColorNameAr: string | null;
  readonly interiorColorNameEn: string | null;
  readonly batterySohPct: number | null;
  readonly batterySohSource: SohSource | null;
  readonly warrantyUntil: string | null;
  /** Null unless the dealer shows it: the statement never reads a hidden VIN (BR-43) */
  readonly vin: string | null;
  readonly features: readonly string[];
  readonly descriptionAr: string | null;
  readonly descriptionEn: string | null;
  readonly lengthMm: number | null;
  readonly wheelbaseMm: number | null;
  readonly consumptionLPer100km: number | null;
  readonly consumptionKwhPer100km: number | null;
  readonly recommendedOctane: number | null;
  readonly phevElectricSharePct: number | null;
  readonly colorFamily: ColorFamily | null;
  readonly exteriorColorHex: string | null;
  readonly paintFinish: PaintFinish | null;
  readonly coverMediaId: string | null;
  readonly ogMediaId: string | null;
};

/** P4: the car's ready photos, engine clips, report and link preview */
export type CarPageMediaRow = {
  readonly id: string;
  readonly kind: MediaKind;
  readonly sortOrder: number;
  readonly photoGroup: PhotoGroup | null;
  readonly altAr: string | null;
  readonly altEn: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly placeholder: string | null;
  readonly dominantColor: string | null;
  readonly variants: MediaVariants | null;
  readonly mime: string | null;
  readonly audioSource: AudioSource | null;
};

/** P5: the car's inspection, a row for each of its panels, or one with no panel */
export type CarPageInspectionRow = {
  readonly inspectedOn: string | null;
  readonly updatedAt: Date;
  readonly testCenterName: string | null;
  readonly reportMediaId: string | null;
  readonly chassisState: MechState;
  readonly engineState: MechState;
  readonly gearboxState: MechState;
  readonly chassisNoteAr: string | null;
  readonly chassisNoteEn: string | null;
  readonly engineNoteAr: string | null;
  readonly engineNoteEn: string | null;
  readonly gearboxNoteAr: string | null;
  readonly gearboxNoteEn: string | null;
  readonly panelId: PanelId | null;
  readonly panelState: PanelState | null;
  readonly microns: number | null;
  readonly panelNoteAr: string | null;
  readonly panelNoteEn: string | null;
  readonly closeupMediaId: string | null;
};

export type CarPageRows = {
  readonly rules: readonly CarPageRules[];
  readonly car: readonly CarPageCarRow[];
  readonly history: readonly CarPageHistoryRow[];
  readonly media: readonly CarPageMediaRow[];
  readonly inspection: readonly CarPageInspectionRow[];
  /** P6: the car's latest price change */
  readonly price: readonly PriceChange[];
  /** P7: the car's journey (FR-17) */
  readonly journey: readonly { readonly sortOrder: number; readonly type: MilestoneType }[];
  /** P8: the car's ready spin set */
  readonly spin: readonly { readonly frameCount: number }[];
};

/** The result, and the tags whose update refreshes it */
export type ResolvedCarPage = { readonly result: CarPageResult; readonly tags: readonly string[] };

const NOT_FOUND = { kind: "notFound", gone: null } as const;

/** The car's tag, which every change to the car updates, and the dealer's */
const carTags = (dealerId: string, carId: string) => [carTag(carId), dealerTag(dealerId)];

/** A miss refreshes with the inventory, so a car published or renamed onto the slug shows */
const missTags = (dealerId: string) => [carsTag(dealerId), dealerTag(dealerId)];

/** getCarPage's result for its slug's rows at `now` */
export function resolveCarPage(dealerId: string, rows: CarPageRows, now: Date): ResolvedCarPage {
  const rules = liveSettingsRow(rows.rules);
  const cutoff = soldCutoff(now, rules.soldVisibleDays);
  const [live] = rows.car;
  if (live !== undefined) {
    if (!isPublic(live, cutoff)) return hidden(dealerId, live);
    const car = carOf(live, rows, rules, now);
    return { result: car === null ? NOT_FOUND : { kind: "car", car }, tags: carTags(dealerId, live.id) };
  }
  const [earlier] = rows.history;
  if (earlier === undefined) return { result: NOT_FOUND, tags: missTags(dealerId) };
  if (!isPublic(earlier, cutoff)) return hidden(dealerId, earlier);
  return { result: { kind: "redirect", slug: earlier.slug }, tags: carTags(dealerId, earlier.id) };
}

/** A car the public can't see: gone, with its body type for similar cars, if it ever saw it */
function hidden(dealerId: string, car: SlugCar): ResolvedCarPage {
  if (car.publishedAt === null) return { result: NOT_FOUND, tags: missTags(dealerId) };
  const gone = car.bodyType === null ? null : { bodyType: car.bodyType };
  return { result: { kind: "notFound", gone }, tags: carTags(dealerId, car.id) };
}

/** The public car's page, or null for a car missing what its page reads */
function carOf(
  car: CarPageCarRow & { readonly status: PublicStatus },
  rows: CarPageRows,
  rules: CarPageRules,
  now: Date,
): PublicCarDTO | null {
  if (!hasPublicFields(car)) return incompleteCar(car.id, missingPublicFields(car));
  const names = namesOf(car);
  if (names === null) return incompleteCar(car.id, ["names"]);
  const media = new Map(rows.media.map((row) => [row.id, row]));
  const photos = photosOf(rows.media, car.coverMediaId);
  const drop = priceDrop(rows.price[0] ?? null, now);
  const check = mileageCheck(car, ammanDate(now), rules.mileageBands);
  const [spin] = rows.spin;
  return {
    id: car.id,
    slug: car.slug,
    refCode: car.refCode,
    status: car.status,
    condition: car.condition,
    makeName: names.make,
    modelName: names.model,
    trim: car.trim,
    modelYear: car.modelYear,
    priceJod: car.priceJod,
    priceDrop: drop === null ? null : { fromJod: drop.fromJod, on: drop.on.getTime(), badge: drop.badge },
    customsStatus: car.customsStatus,
    mileageKm: car.mileageKm,
    mileageCheck: check === null ? null : { ...check, low: rules.mileageBands.low, high: rules.mileageBands.high },
    fuelType: car.fuelType,
    transmission: car.transmission,
    regionalSpecs: car.regionalSpecs,
    bodyType: car.bodyType,
    drivetrain: car.drivetrain,
    engineCc: car.engineCc,
    seats: car.seats,
    ownersCount: car.ownersCount,
    licenseStatus: car.licenseStatus,
    licenseExpiry: car.licenseExpiry,
    insuranceType: car.insuranceType,
    exteriorColorName: { ar: car.exteriorColorNameAr, en: car.exteriorColorNameEn },
    interiorColorName: { ar: car.interiorColorNameAr, en: car.interiorColorNameEn },
    battery:
      car.batterySohPct === null || car.batterySohSource === null
        ? null
        : { pct: car.batterySohPct, source: car.batterySohSource },
    warrantyUntil: car.warrantyUntil,
    vin: car.vin,
    features: catalogFeatures(car.id, car.features),
    description: { ar: car.descriptionAr, en: car.descriptionEn },
    lengthMm: car.lengthMm,
    wheelbaseMm: car.wheelbaseMm,
    ogImage: ogImageOf(fileOf(media, car.ogMediaId, "og_image")),
    consumption: { lPer100km: car.consumptionLPer100km, kwhPer100km: car.consumptionKwhPer100km },
    recommendedOctane: car.recommendedOctane,
    phevElectricSharePct: car.phevElectricSharePct,
    colorFamily: car.colorFamily,
    exteriorColorHex: car.exteriorColorHex,
    paintFinish: car.paintFinish,
    photos,
    inspection: inspectionOf(rows.inspection, {
      media,
      photoIds: new Set(photos.map((photo) => photo.id)),
      bands: rules.micronBands,
    }),
    sound: soundOf(rows.media, car.fuelType),
    spin: spin === undefined ? null : { frameCount: spin.frameCount },
    journey: [...rows.journey].sort((a, b) => a.sortOrder - b.sortOrder).map(({ type }) => ({ type })),
  };
}

function namesOf(car: CarPageCarRow): { readonly make: Names; readonly model: Names } | null {
  const { makeNameAr, makeNameEn, modelNameAr, modelNameEn } = car;
  if (makeNameAr === null || makeNameEn === null || modelNameAr === null || modelNameEn === null) return null;
  return { make: { ar: makeNameAr, en: makeNameEn }, model: { ar: modelNameAr, en: modelNameEn } };
}

/** The file a pointer names, when it is ready and of the kind the pointer expects */
function fileOf(media: ReadonlyMap<string, CarPageMediaRow>, mediaId: string | null, kind: MediaKind) {
  const row = mediaId === null ? undefined : media.get(mediaId);
  return row?.kind === kind ? row : undefined;
}

/** The dealer's order, then the id, so one set of rows always gives one order */
const inOrder = (a: CarPageMediaRow, b: CarPageMediaRow) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1);

/** The gallery: the cover first when it is a photo, then the dealer's order */
function photosOf(media: readonly CarPageMediaRow[], coverId: string | null): PublicPhoto[] {
  const isCover = (row: CarPageMediaRow) => Number(row.id === coverId);
  return media
    .filter((row) => row.kind === "photo")
    .sort((a, b) => isCover(b) - isCover(a) || inOrder(a, b))
    .map((row) => photoOf(row))
    .filter((photo) => photo !== null);
}

function photoOf(row: CarPageMediaRow): PublicPhoto | null {
  const { width, height, photoGroup } = row;
  const variants = galleryVariants(row.variants);
  if (width === null || height === null || photoGroup === null || variants === null) return incompleteMedia(row.id);
  return {
    id: row.id,
    group: photoGroup,
    alt: { ar: row.altAr, en: row.altEn },
    width,
    height,
    placeholder: row.placeholder,
    dominantColor: row.dominantColor,
    variants,
  };
}

/** The photo's widths the gallery reads, or null for a photo with none */
function galleryVariants(variants: MediaVariants | null): Partial<Record<PhotoVariant, string>> | null {
  const widths: Partial<Record<PhotoVariant, string>> = {};
  for (const width of PHOTO_VARIANTS) {
    const src = variants?.[width];
    if (src !== undefined) widths[width] = src;
  }
  return Object.keys(widths).length === 0 ? null : widths;
}

function ogImageOf(row: CarPageMediaRow | undefined): PublicFile | null {
  return row === undefined ? null : publicFile(row.id, row.variants, row.width, row.height);
}

function reportOf(row: CarPageMediaRow | undefined): PublicInspection["report"] {
  if (row === undefined) return null;
  const src = row.variants?.src;
  if (src === undefined) return incompleteMedia(row.id);
  // A PDF has no pixel size
  return { src, format: row.mime === MEDIA_TYPES.pdf ? "pdf" : "image", width: row.width, height: row.height };
}

type InspectionContext = {
  readonly media: ReadonlyMap<string, CarPageMediaRow>;
  /** A close-up opens in the gallery, so one outside it is dropped */
  readonly photoIds: ReadonlySet<string>;
  readonly bands: MicronBands;
};

function inspectionOf(rows: readonly CarPageInspectionRow[], context: InspectionContext): PublicInspection | null {
  const [inspection] = rows;
  if (inspection === undefined) return null;
  const byPanel = new Map(rows.map((row) => [row.panelId, row]));
  // A panel without a row is unknown, as a new inspection's panels are
  const panels = PANEL_IDS.map((panelId) => {
    const row = byPanel.get(panelId);
    const microns = row?.microns ?? null;
    const closeup = row?.closeupMediaId ?? null;
    return {
      panelId,
      state: row?.panelState ?? "unknown",
      microns,
      band: microns === null ? null : micronBand(microns, context.bands),
      note: { ar: row?.panelNoteAr ?? null, en: row?.panelNoteEn ?? null },
      closeupPhotoId: closeup !== null && context.photoIds.has(closeup) ? closeup : null,
    };
  });
  const { chassisState, engineState, gearboxState } = inspection;
  return {
    declaredOn: inspection.inspectedOn ?? ammanDate(inspection.updatedAt),
    testCenterName: inspection.testCenterName,
    report: reportOf(fileOf(context.media, inspection.reportMediaId, "inspection_report")),
    filled: inspectionFilled([...panels.map((panel) => panel.state), chassisState, engineState, gearboxState]),
    panels,
    mechanical: {
      chassis: { state: chassisState, note: { ar: inspection.chassisNoteAr, en: inspection.chassisNoteEn } },
      engine: { state: engineState, note: { ar: inspection.engineNoteAr, en: inspection.engineNoteEn } },
      gearbox: { state: gearboxState, note: { ar: inspection.gearboxNoteAr, en: inspection.gearboxNoteEn } },
    },
  };
}

/** The first engine clip's source; an electric car has no engine to hear (FR-15.10) */
function soundOf(media: readonly CarPageMediaRow[], fuelType: FuelType): PublicSound | null {
  if (fuelType === "electric") return null;
  const [clip] = media.filter((row) => row.kind === "engine_audio").sort(inOrder);
  if (clip === undefined) return null;
  return clip.audioSource === null ? incompleteMedia(clip.id) : { source: clip.audioSource };
}
