import "server-only";
import { inspectionFilled } from "@/features/inspection/domain/completeness";
import { isNewArrival, isPublic, priceDrop, soldCutoff } from "@/features/inventory/domain/listing";
import { hasPublicFields, missingPublicFields } from "@/features/inventory/domain/public-fields";
import {
  type BodyType,
  type CarStatus,
  type ColorFamily,
  type CustomsStatus,
  type FuelType,
  type InsuranceType,
  type LicenseStatus,
  type MechState,
  type PanelState,
  PAYMENT_METHODS,
  type PaymentMethod,
  type RegionalSpecs,
  type Transmission,
} from "@/lib/db/enums";
import type {
  CardWidth,
  Names,
  PublicCardCover,
  PublicCardDTO,
  PublicInventoryIndex,
  PublicModel,
} from "@/lib/db/public-dto";
import { catalogFeatures, incompleteCar, liveSettingsRow } from "@/lib/db/public-rows";

// getInventoryIndex's rows to the index (SRS §11.4). The rows are a superset: the statements read
// sold cars for the longest window there is, and BR-04's test here, on the dealer's own window, is
// the one that counts. Each card is picked field by field, so no column reaches a page unnamed. A
// public car missing a field its card reads with no fallback (public-fields.ts), or its names, is
// left out and logged: a card never shows a gap where a fact should be.

/** S1: a car of the dealer's, which may not be public */
export type IndexCarRow = {
  readonly id: string;
  readonly slug: string;
  readonly refCode: string;
  readonly status: CarStatus;
  readonly makeKey: string | null;
  readonly modelKey: string | null;
  readonly trim: string | null;
  readonly modelYear: number | null;
  readonly mileageKm: number | null;
  readonly priceJod: number | null;
  readonly fuelType: FuelType | null;
  readonly regionalSpecs: RegionalSpecs | null;
  readonly customsStatus: CustomsStatus | null;
  readonly bodyType: BodyType | null;
  readonly transmission: Transmission | null;
  readonly licenseStatus: LicenseStatus | null;
  readonly insuranceType: InsuranceType | null;
  readonly paymentMethods: readonly PaymentMethod[];
  readonly seats: number | null;
  readonly colorFamily: ColorFamily | null;
  readonly ownersCount: number | null;
  readonly features: readonly string[];
  readonly publishedAt: Date | null;
  readonly updatedAt: Date;
  readonly soldAt: Date | null;
  readonly hasSpin: boolean;
  /** A ready engine clip */
  readonly hasClip: boolean;
};

/** S2: the card widths of the car's cover, or of its first photo */
export type IndexCoverRow = {
  readonly carId: string;
  readonly variant480: string | null;
  readonly variant960: string | null;
  readonly placeholder: string | null;
  readonly dominantColor: string | null;
};

/** S3: the car's inspection */
export type IndexInspectionRow = {
  readonly carId: string;
  readonly updatedAt: Date;
  readonly panelStates: readonly PanelState[];
  readonly chassisState: MechState;
  readonly engineState: MechState;
  readonly gearboxState: MechState;
};

/** S4: the car's latest price change */
export type IndexPriceRow = {
  readonly carId: string;
  readonly oldPriceJod: number;
  readonly newPriceJod: number;
  readonly changedAt: Date;
};

/** S5: a model of the cars, with its make's names */
export type IndexModelRow = {
  readonly modelKey: string;
  readonly makeKey: string;
  readonly modelNameAr: string;
  readonly modelNameEn: string;
  readonly makeNameAr: string;
  readonly makeNameEn: string;
};

export type IndexRows = {
  /** S0: the dealer's live settings row, the one source of the sold window */
  readonly rules: readonly { readonly soldVisibleDays: number }[];
  readonly cars: readonly IndexCarRow[];
  readonly covers: readonly IndexCoverRow[];
  readonly inspections: readonly IndexInspectionRow[];
  readonly prices: readonly IndexPriceRow[];
  readonly models: readonly IndexModelRow[];
};

const byCar = <Row extends { readonly carId: string }>(rows: readonly Row[]) =>
  new Map(rows.map((row) => [row.carId, row]));

/** Newest first, a tie going to the larger id, so one set of rows always gives one order */
const newestFirst = (a: PublicCardDTO, b: PublicCardDTO) => b.publishedAt - a.publishedAt || (a.id < b.id ? 1 : -1);

function coverOf(row: IndexCoverRow | undefined): PublicCardCover | null {
  if (row === undefined) return null;
  const variants: Partial<Record<CardWidth, string>> = {};
  if (row.variant480 !== null) variants["480"] = row.variant480;
  if (row.variant960 !== null) variants["960"] = row.variant960;
  if (Object.keys(variants).length === 0) return null;
  return { variants, placeholder: row.placeholder, dominantColor: row.dominantColor };
}

type Context = {
  readonly now: Date;
  readonly covers: ReadonlyMap<string, IndexCoverRow>;
  readonly inspections: ReadonlyMap<string, IndexInspectionRow>;
  readonly prices: ReadonlyMap<string, IndexPriceRow>;
  readonly models: ReadonlyMap<string, IndexModelRow>;
};

/** The public car's card, or null for a car missing what its card reads */
function cardOf(car: IndexCarRow & { readonly status: PublicCardDTO["status"] }, context: Context) {
  if (!hasPublicFields(car) || car.publishedAt === null) {
    return incompleteCar(car.id, [...missingPublicFields(car), ...(car.publishedAt === null ? ["publishedAt"] : [])]);
  }
  if (context.models.get(car.modelKey)?.makeKey !== car.makeKey) return incompleteCar(car.id, ["names"]);
  const { now } = context;
  const inspection = context.inspections.get(car.id);
  const states = inspection && [
    ...inspection.panelStates,
    inspection.chassisState,
    inspection.engineState,
    inspection.gearboxState,
  ];
  return {
    id: car.id,
    slug: car.slug,
    refCode: car.refCode,
    status: car.status,
    makeKey: car.makeKey,
    modelKey: car.modelKey,
    trim: car.trim,
    modelYear: car.modelYear,
    mileageKm: car.mileageKm,
    priceJod: car.priceJod,
    fuelType: car.fuelType,
    regionalSpecs: car.regionalSpecs,
    customsStatus: car.customsStatus,
    bodyType: car.bodyType,
    transmission: car.transmission,
    licenseStatus: car.licenseStatus,
    insuranceType: car.insuranceType,
    paymentMethods: PAYMENT_METHODS.filter((method) => car.paymentMethods.includes(method)),
    seats: car.seats,
    colorFamily: car.colorFamily,
    ownersCount: car.ownersCount,
    features: catalogFeatures(car.id, car.features),
    publishedAt: car.publishedAt.getTime(),
    updatedAt: Math.max(car.updatedAt.getTime(), inspection?.updatedAt.getTime() ?? 0),
    isNew: isNewArrival(car.publishedAt, now),
    priceDropped: priceDrop(context.prices.get(car.id) ?? null, now)?.badge === true,
    inspectionFilled: states === undefined ? null : inspectionFilled(states),
    hasSpin: car.hasSpin,
    // An electric car has no engine to hear (FR-15.10)
    hasSound: car.hasClip && car.fuelType !== "electric",
    cover: coverOf(context.covers.get(car.id)),
  } satisfies PublicCardDTO;
}

/** The index of the cars the public sees at `now` */
export function buildIndex(rows: IndexRows, now: Date): PublicInventoryIndex {
  const cutoff = soldCutoff(now, liveSettingsRow(rows.rules).soldVisibleDays);
  const models = new Map(rows.models.map((row) => [row.modelKey, row]));
  const context = {
    now,
    covers: byCar(rows.covers),
    inspections: byCar(rows.inspections),
    prices: byCar(rows.prices),
    models,
  };
  const cards = rows.cars
    .filter((car) => isPublic(car, cutoff))
    .map((car) => cardOf(car, context))
    .filter((card) => card !== null)
    .sort(newestFirst);

  const makes: Record<string, Names> = {};
  const inStock: Record<string, PublicModel> = {};
  for (const { modelKey } of cards) {
    const row = models.get(modelKey);
    if (row === undefined) continue;
    makes[row.makeKey] = { ar: row.makeNameAr, en: row.makeNameEn };
    inStock[modelKey] = { makeKey: row.makeKey, ar: row.modelNameAr, en: row.modelNameEn };
  }
  return { cards, makes, models: inStock };
}
