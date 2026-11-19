import { PHOTO_VARIANTS, type PhotoVariant } from "@/lib/db/public-dto";

// A photo's stored widths, for the browser to pick the one its layout needs (BR-20): each variant
// with its width, the narrowest first. A photo narrower than a width has no file of it, as BR-20
// never upscales.

type Variants = Readonly<Partial<Record<PhotoVariant, string>>>;

/** The img's srcset */
export function srcSetOf(variants: Variants): string {
  return PHOTO_VARIANTS.flatMap((width) => {
    const src = variants[width];
    return src === undefined ? [] : [`${src} ${width}w`];
  }).join(", ");
}

/** The widest file the photo has, which a zoomed photo shows (FR-10.4) */
export function largestVariant(variants: Variants): string {
  return firstFile(variants, PHOTO_VARIANTS.toReversed());
}

/** The narrowest file the photo has, for a browser that reads no srcset */
export function smallestVariant(variants: Variants): string {
  return firstFile(variants, PHOTO_VARIANTS);
}

/** The photo's file at the first of the widths it has */
function firstFile(variants: Variants, widths: readonly PhotoVariant[]): string {
  const src = widths.map((width) => variants[width]).find((value) => value !== undefined);
  // The car page keeps only photos with a file (build-car.ts)
  if (src === undefined) throw new Error("A photo without a file reached the gallery");
  return src;
}
