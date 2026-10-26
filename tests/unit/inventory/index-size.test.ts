import { describe, expect, it } from "vitest";
import { SLUG_MAX_LENGTH } from "@/features/dealer/domain/slug";
import { decodeIndex, encodeIndex } from "@/features/inventory/server/index-codec";
import { largestIndex } from "../../support/cards";

// NFR-SCALE-01, SRS §11.4: the index's cache entry stays within 1 MB at 1,000 cars, here with every
// field at its largest. The entry is stored as React's Flight data, which writes these arrays and
// objects as their JSON, a string that starts with $ taking one more byte. D-043 records the
// limit as 1,000,000 bytes and what the bound assumes of the catalog.

const LIMIT = 1_000_000;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

describe("the index's cache entry at 1,000 cars", () => {
  it.each(["latin", "arabic"] as const)("fits in 1 MB with a %s trim of 60 characters", (trim) => {
    const index = largestIndex(trim);
    const wire = encodeIndex(index);
    expect(bytes(wire)).toBeLessThanOrEqual(LIMIT);
    expect(decodeIndex(wire)).toStrictEqual(index);
  });

  it("fills each slug to its column with the Latin trim", () => {
    const lengths = new Set(largestIndex("latin").cards.map((card) => card.slug.length));
    expect(lengths).toStrictEqual(new Set([SLUG_MAX_LENGTH]));
  });

  it("would not fit as keyed cards, which is why the entry is written as rows", () => {
    expect(bytes(largestIndex("latin"))).toBeGreaterThan(LIMIT);
  });
});
