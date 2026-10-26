import { describe, expect, it } from "vitest";
import { PHOTO_VARIANTS } from "@/lib/db/public-dto";
import { nominalWidth } from "@/lib/storage/rules";

// The gallery reads the widths the upload stores a photo in (API-17, BR-20), so a name here that
// the storage rules don't make would leave the gallery a width that never comes

describe("PHOTO_VARIANTS", () => {
  it("names photo variants the storage rules make, each its own width", () => {
    for (const variant of PHOTO_VARIANTS) expect(nominalWidth("photo", variant)).toBe(Number(variant));
  });
});
