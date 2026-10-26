import { REF_SYMBOLS } from "@/features/dealer/domain/ref-code";
import { carSlug } from "@/features/dealer/domain/slug";
import { FEATURE_KEYS } from "@/lib/db/feature-keys";
import type { Names, PublicCardDTO, PublicInventoryIndex, PublicModel } from "@/lib/db/public-dto";

// Inventory cards for the index's tests: a card with every field set, the pathnames a photo's
// variants are stored under (API-16, src/lib/storage/rules.ts), and the largest index 1,000 cars
// can make

/** A store's origin, as Vercel Blob names a public store */
export const STORE_ORIGIN = "https://w0n7yx8mjcb4cqqk.public.blob.vercel-storage.com";

/** Where the store keeps a photo variant: the signed pathname plus the store's 30-character suffix */
export function storedPhoto(carId: string, uploadId: string, width: string, suffix: string, origin = STORE_ORIGIN) {
  return `${origin}/cars/${carId}/photo/${uploadId}-${width}-${suffix.padEnd(30, "x")}.webp`;
}

/** A published card with every field set, the cover at the store */
export function card(overrides: Partial<PublicCardDTO> = {}): PublicCardDTO {
  const id = overrides.id ?? "01923456-7890-7abc-8def-0123456789ab";
  const upload = "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0000";
  return {
    id,
    slug: "2021-toyota-land-cruiser-gxr-mu-7k3p",
    refCode: "MU-7K3P",
    status: "published",
    makeKey: "toyota",
    modelKey: "toyota-land-cruiser",
    trim: "GXR",
    modelYear: 2021,
    mileageKm: 64_000,
    priceJod: 48_500,
    fuelType: "gasoline",
    regionalSpecs: "gcc",
    customsStatus: "cleared",
    bodyType: "suv",
    transmission: "automatic",
    licenseStatus: "licensed",
    insuranceType: "comprehensive",
    paymentMethods: ["cash", "instalments"],
    seats: 7,
    colorFamily: "white",
    ownersCount: 1,
    features: ["airbags", "leather_seats", "sunroof", "carplay"],
    publishedAt: Date.parse("2026-10-20T08:00:00.000Z"),
    updatedAt: Date.parse("2026-10-21T08:00:00.000Z"),
    isNew: true,
    priceDropped: false,
    inspectionFilled: 16,
    hasSpin: true,
    hasSound: true,
    cover: {
      variants: { "480": storedPhoto(id, upload, "480", "a"), "960": storedPhoto(id, upload, "960", "b") },
      placeholder: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
      dominantColor: "#d8d4cc",
    },
    ...overrides,
  };
}

const MAKES = 24;
const MODELS = 300;
// Two bytes a letter in UTF-8, as Arabic names are
const ARABIC_LETTER = String.fromCodePoint(0x0645);
// The catalog's keys and names at their columns' lengths (make 40, model 60)
const key = (stem: string, length: number) => stem.padEnd(length, "x");
const names = (stem: string, length: number): Names => ({
  ar: ARABIC_LETTER.repeat(length),
  en: stem.padEnd(length, "n"),
});

/**
 * A trim of 60 characters, as VR-06 allows, at 4 bytes each. In the first, 15 letters that each
 * fold to "ppv" (BR-16) fill the slug to its column, and the rest fold to nothing. An Arabic trim
 * leaves the slug without one, so it is the longest only in bytes.
 */
const TRIMS = {
  latin: `${String.fromCodePoint(0x1f14e).repeat(15)}${String.fromCodePoint(0x1f525).repeat(45)}`,
  arabic: ARABIC_LETTER.repeat(60),
} as const;

/** The nth of 923,521 reference codes */
function refCode(n: number): string {
  const symbols = [0, 1, 2, 3].map(
    (place) => REF_SYMBOLS[Math.floor(n / REF_SYMBOLS.length ** place) % REF_SYMBOLS.length],
  );
  return `MU-${symbols.join("")}`;
}

/**
 * The index of `count` cars with each field at its largest: column-length keys and names, 300
 * models of 24 makes, every feature and flag, nulls where a number would be shorter, and a
 * Blob-length cover with the store's 30-character suffixes.
 */
export function largestIndex(trim: keyof typeof TRIMS, count = 1000): PublicInventoryIndex {
  const makes: Record<string, Names> = {};
  const models: Record<string, PublicModel> = {};
  for (let model = 0; model < MODELS; model += 1) {
    const makeKey = key(`make-${model % MAKES}`, 40);
    makes[makeKey] = names(`Make ${model % MAKES}`, 40);
    models[key(`model-${model}`, 60)] = { makeKey, ...names(`Model ${model}`, 60) };
  }
  const modelKeys = Object.keys(models);
  const cards = Array.from({ length: count }, (_, n) => {
    const id = `0192${String(n).padStart(4, "0")}-7890-7abc-8def-0123456789ab`;
    const modelKey = modelKeys[n % modelKeys.length] ?? "";
    const model = models[modelKey];
    const makeNames = makes[model?.makeKey ?? ""];
    const ref = refCode(n);
    const slug = carSlug({
      modelYear: 2027,
      makeNameEn: makeNames?.en ?? "",
      modelNameEn: model?.en ?? "",
      trim: TRIMS[trim],
      refCode: ref,
    });
    const upload = `0193${String(n).padStart(4, "0")}-bbbb-7ccc-8ddd-eeeeffff0000`;
    return card({
      id,
      slug,
      refCode: ref,
      status: "reserved",
      makeKey: model?.makeKey ?? "",
      modelKey,
      trim: TRIMS[trim],
      modelYear: 2027,
      mileageKm: 1_500_000,
      priceJod: 1_000_000,
      fuelType: "plugin_hybrid",
      regionalSpecs: "other",
      customsStatus: "not_cleared",
      bodyType: "truck",
      transmission: "manual",
      licenseStatus: "unlicensed",
      insuranceType: "none",
      paymentMethods: ["cash", "instalments"],
      seats: null,
      colorFamily: null,
      ownersCount: null,
      features: [...FEATURE_KEYS],
      publishedAt: Date.parse("2026-10-20T08:00:00.000Z") + n,
      updatedAt: Date.parse("2026-10-21T08:00:00.000Z") + n,
      isNew: true,
      priceDropped: true,
      inspectionFilled: null,
      hasSpin: true,
      hasSound: true,
      cover: {
        variants: { "480": storedPhoto(id, upload, "480", "s"), "960": storedPhoto(id, upload, "960", "t") },
        placeholder: "p".repeat(64),
        dominantColor: "#ffffff",
      },
    });
  });
  return { cards, makes, models };
}
