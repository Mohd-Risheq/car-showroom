import "server-only";
import {
  BODY_TYPES,
  CAR_STATUSES,
  COLOR_FAMILIES,
  CUSTOMS_STATUSES,
  FUEL_TYPES,
  INSURANCE_TYPES,
  LICENSE_STATUSES,
  PAYMENT_METHODS,
  REGIONAL_SPECS,
  TRANSMISSIONS,
} from "@/lib/db/enums";
import { FEATURE_GROUPS, FEATURE_KEYS, type FeatureKey } from "@/lib/db/feature-keys";
import type {
  CardWidth,
  Names,
  PublicCardCover,
  PublicCardDTO,
  PublicInventoryIndex,
  PublicModel,
  PublicStatus,
} from "@/lib/db/public-dto";

// The index's cache entry (SRS §11.4, NFR-SCALE-01). Keyed cards would take about 2.3 KB each, so
// 1,000 cars would pass the 1 MB the entry may hold. The entry writes each card as a row of
// positions instead, with enum values as indexes into their tuples and features, payment methods
// and flags as bit masks. Names are written once a make or model, a car's make is its model's
// (car_model_fk), a reference code its slug ends with is left to the slug (BR-16), and the store's
// origin is written once, with each cover under its own car's folder there. getInventoryIndex
// decodes the entry once a request. A cache key holds the build's id, so a version only guards
// against a decoder of another layout reading an entry.

/** Bump on any change to the layout, an enum tuple or FEATURE_GROUPS */
export const INDEX_WIRE_VERSION = 1;

type NamesWire = readonly [ar: string, en: string];
type ModelWire = readonly [makeKey: string, ar: string, en: string];

/**
 * The cover's variants share a prefix. One that starts with ~ is under the car's own folder at
 * the store's origin; any other is written in full, as a site path or a URL, or is empty.
 */
type CoverWire = readonly [
  prefix: string,
  tail480: string | null,
  tail960: string | null,
  placeholder: string | null,
  dominantColor: string | null,
];

type CardRow = readonly [
  id: string,
  slug: string,
  // 0 when the slug ends with it
  refCode: string | 0,
  status: number,
  modelKey: string,
  trim: string | null,
  modelYear: number,
  mileageKm: number,
  priceJod: number,
  fuelType: number,
  regionalSpecs: number,
  customsStatus: number,
  bodyType: number,
  transmission: number,
  licenseStatus: number,
  insuranceType: number,
  paymentMethods: number,
  seats: number | null,
  colorFamily: number | null,
  ownersCount: number | null,
  featuresInterior: number,
  featuresExterior: number,
  featuresTechnology: number,
  publishedAt: number,
  updatedAt: number,
  flags: number,
  inspectionFilled: number | null,
  cover: CoverWire | null,
];

export type IndexWire = {
  readonly v: typeof INDEX_WIRE_VERSION;
  /** The origin most covers are stored at */
  readonly mediaOrigin: string | null;
  readonly makes: Readonly<Record<string, NamesWire>>;
  readonly models: Readonly<Record<string, ModelWire>>;
  readonly rows: readonly CardRow[];
};

const FLAGS = ["isNew", "priceDropped", "hasSpin", "hasSound"] as const;
const PUBLIC_STATUSES = ["published", "reserved", "sold"] as const satisfies readonly PublicStatus[];
const LOCAL = "~";
// A reference code is 7 characters (car_ref_code_format), and the slug ends with it in lower case
const REF_LENGTH = 7;

const isPublicStatus = (status: string): status is PublicStatus =>
  (PUBLIC_STATUSES as readonly string[]).includes(status);

/** The cars' covers under the folder the store gives each car's photos */
const carFolder = (origin: string, carId: string) => `${origin}/cars/${carId}/photo/`;

function indexIn<T extends string>(tuple: readonly T[], value: T, field: string): number {
  const index = tuple.indexOf(value);
  if (index < 0) throw new Error(`index wire: ${field} ${value} has no index`);
  return index;
}

function valueAt<T extends string>(tuple: readonly T[], index: number, field: string): T {
  const value = tuple[index];
  if (value === undefined) throw new Error(`index wire: no ${field} at ${index}`);
  return value;
}

/** Bit i for tuple[i] */
function maskOf(tuple: readonly string[], values: readonly string[], field: string): number {
  return values.reduce((mask, value) => mask | (1 << indexIn(tuple, value, field)), 0);
}

/** tuple[i] for bit i, in the tuple's order */
function valuesOf<T extends string>(tuple: readonly T[], mask: number): T[] {
  return tuple.filter((_, index) => (mask & (1 << index)) !== 0);
}

/** The features as one mask a group, the groups together holding the catalog's keys once each */
function featureMasks(features: readonly FeatureKey[]): readonly [number, number, number] {
  for (const feature of features) {
    if (!(FEATURE_KEYS as readonly string[]).includes(feature)) {
      throw new Error(`index wire: feature ${feature} is not in the catalog`);
    }
  }
  const mask = (keys: readonly string[]) =>
    maskOf(
      keys,
      features.filter((key) => keys.includes(key)),
      "feature",
    );
  return [mask(FEATURE_GROUPS.interior), mask(FEATURE_GROUPS.exterior), mask(FEATURE_GROUPS.technology)];
}

function commonPrefix(texts: readonly string[]): string {
  const [first = "", ...rest] = texts;
  let length = first.length;
  for (const text of rest) {
    length = Math.min(length, text.length);
    while (text.slice(0, length) !== first.slice(0, length)) length -= 1;
  }
  return first.slice(0, length);
}

/** The origin most cover URLs are at, the first in sort order on a tie, or null */
function mediaOriginOf(cards: readonly PublicCardDTO[]): string | null {
  const counts = new Map<string, number>();
  for (const url of cards.flatMap((each) => Object.values(each.cover?.variants ?? {}))) {
    // A site path, the seed's, has no origin, though its query may hold "://"
    if (!URL.canParse(url)) continue;
    const { origin } = new URL(url);
    counts.set(origin, (counts.get(origin) ?? 0) + 1);
  }
  const ranked = [...counts].sort(([a, countA], [b, countB]) => countB - countA || (a < b ? -1 : 1));
  return ranked[0]?.[0] ?? null;
}

function encodeCover(cover: PublicCardCover | null, carId: string, origin: string | null): CoverWire | null {
  if (cover === null) return null;
  const { "480": wide480 = null, "960": wide960 = null } = cover.variants;
  const shared = commonPrefix([wide480, wide960].filter((url) => url !== null));
  const folder = origin === null ? null : carFolder(origin, carId);
  const prefix = folder !== null && shared.startsWith(folder) ? `${LOCAL}${shared.slice(folder.length)}` : shared;
  const tail = (url: string | null) => (url === null ? null : url.slice(shared.length));
  return [prefix, tail(wide480), tail(wide960), cover.placeholder, cover.dominantColor];
}

function decodeCover(wire: CoverWire | null, carId: string, origin: string | null): PublicCardCover | null {
  if (wire === null) return null;
  const [prefix, tail480, tail960, placeholder, dominantColor] = wire;
  let shared = prefix;
  if (prefix.startsWith(LOCAL)) {
    if (origin === null) throw new Error("index wire: a cover at the store, which has no origin");
    shared = `${carFolder(origin, carId)}${prefix.slice(LOCAL.length)}`;
  }
  const variants: Partial<Record<CardWidth, string>> = {};
  if (tail480 !== null) variants["480"] = `${shared}${tail480}`;
  if (tail960 !== null) variants["960"] = `${shared}${tail960}`;
  return { variants, placeholder, dominantColor };
}

const refOfSlug = (slug: string) => slug.slice(-REF_LENGTH).toUpperCase();

function encodeCard(
  card: PublicCardDTO,
  models: Readonly<Record<string, PublicModel>>,
  origin: string | null,
): CardRow {
  if (models[card.modelKey]?.makeKey !== card.makeKey) {
    throw new Error(`index wire: ${card.modelKey} is not a model of ${card.makeKey}`);
  }
  if (!isPublicStatus(card.status)) throw new Error(`index wire: status ${String(card.status)} is not public`);
  const [interior, exterior, technology] = featureMasks(card.features);
  const flags = FLAGS.filter((flag) => card[flag]);
  return [
    card.id,
    card.slug,
    refOfSlug(card.slug) === card.refCode ? 0 : card.refCode,
    indexIn(CAR_STATUSES, card.status, "status"),
    card.modelKey,
    card.trim,
    card.modelYear,
    card.mileageKm,
    card.priceJod,
    indexIn(FUEL_TYPES, card.fuelType, "fuelType"),
    indexIn(REGIONAL_SPECS, card.regionalSpecs, "regionalSpecs"),
    indexIn(CUSTOMS_STATUSES, card.customsStatus, "customsStatus"),
    indexIn(BODY_TYPES, card.bodyType, "bodyType"),
    indexIn(TRANSMISSIONS, card.transmission, "transmission"),
    indexIn(LICENSE_STATUSES, card.licenseStatus, "licenseStatus"),
    indexIn(INSURANCE_TYPES, card.insuranceType, "insuranceType"),
    maskOf(PAYMENT_METHODS, card.paymentMethods, "paymentMethods"),
    card.seats,
    card.colorFamily === null ? null : indexIn(COLOR_FAMILIES, card.colorFamily, "colorFamily"),
    card.ownersCount,
    interior,
    exterior,
    technology,
    card.publishedAt,
    card.updatedAt,
    maskOf(FLAGS, flags, "flags"),
    card.inspectionFilled,
    encodeCover(card.cover, card.id, origin),
  ];
}

function decodeCard(row: CardRow, models: Readonly<Record<string, ModelWire>>, origin: string | null): PublicCardDTO {
  const [id, slug, refCode, status, modelKey, trim, modelYear, mileageKm, priceJod, ...rest] = row;
  const [fuelType, regionalSpecs, customsStatus, bodyType, transmission, licenseStatus, insuranceType, ...more] = rest;
  const [paymentMethods, seats, colorFamily, ownersCount, interior, exterior, technology, ...last] = more;
  const [publishedAt, updatedAt, flags, inspectionFilled, cover] = last;
  const makeKey = models[modelKey]?.[0];
  if (makeKey === undefined) throw new Error(`index wire: no model ${modelKey}`);
  const publicStatus = valueAt(CAR_STATUSES, status, "status");
  if (!isPublicStatus(publicStatus)) throw new Error(`index wire: status ${publicStatus} is not public`);
  const set = valuesOf(FLAGS, flags);
  return {
    id,
    slug,
    refCode: refCode === 0 ? refOfSlug(slug) : refCode,
    status: publicStatus,
    makeKey,
    modelKey,
    trim,
    modelYear,
    mileageKm,
    priceJod,
    fuelType: valueAt(FUEL_TYPES, fuelType, "fuelType"),
    regionalSpecs: valueAt(REGIONAL_SPECS, regionalSpecs, "regionalSpecs"),
    customsStatus: valueAt(CUSTOMS_STATUSES, customsStatus, "customsStatus"),
    bodyType: valueAt(BODY_TYPES, bodyType, "bodyType"),
    transmission: valueAt(TRANSMISSIONS, transmission, "transmission"),
    licenseStatus: valueAt(LICENSE_STATUSES, licenseStatus, "licenseStatus"),
    insuranceType: valueAt(INSURANCE_TYPES, insuranceType, "insuranceType"),
    paymentMethods: valuesOf(PAYMENT_METHODS, paymentMethods),
    seats,
    colorFamily: colorFamily === null ? null : valueAt(COLOR_FAMILIES, colorFamily, "colorFamily"),
    ownersCount,
    features: [
      ...valuesOf(FEATURE_GROUPS.interior, interior),
      ...valuesOf(FEATURE_GROUPS.exterior, exterior),
      ...valuesOf(FEATURE_GROUPS.technology, technology),
    ],
    publishedAt,
    updatedAt,
    isNew: set.includes("isNew"),
    priceDropped: set.includes("priceDropped"),
    inspectionFilled,
    hasSpin: set.includes("hasSpin"),
    hasSound: set.includes("hasSound"),
    cover: decodeCover(cover, id, origin),
  };
}

/** The entry getInventoryIndex's cached function stores for the index */
export function encodeIndex(index: PublicInventoryIndex): IndexWire {
  for (const card of index.cards) {
    if (index.makes[card.makeKey] === undefined) throw new Error(`index wire: no names for the make ${card.makeKey}`);
    if (index.models[card.modelKey] === undefined) {
      throw new Error(`index wire: no names for the model ${card.modelKey}`);
    }
  }
  const mediaOrigin = mediaOriginOf(index.cards);
  const pair = ({ ar, en }: Names): NamesWire => [ar, en];
  return {
    v: INDEX_WIRE_VERSION,
    mediaOrigin,
    makes: Object.fromEntries(Object.entries(index.makes).map(([key, names]) => [key, pair(names)])),
    models: Object.fromEntries(
      Object.entries(index.models).map(([key, model]) => [key, [model.makeKey, ...pair(model)] as const]),
    ),
    rows: index.cards.map((card) => encodeCard(card, index.models, mediaOrigin)),
  };
}

/** The index an entry holds */
export function decodeIndex(wire: IndexWire): PublicInventoryIndex {
  if (wire.v !== INDEX_WIRE_VERSION) throw new Error(`index wire: version ${String(wire.v)} is not this build's`);
  return {
    cards: wire.rows.map((row) => decodeCard(row, wire.models, wire.mediaOrigin)),
    makes: Object.fromEntries(Object.entries(wire.makes).map(([key, [ar, en]]) => [key, { ar, en }])),
    models: Object.fromEntries(
      Object.entries(wire.models).map(([key, [makeKey, ar, en]]) => [key, { makeKey, ar, en }]),
    ),
  };
}
