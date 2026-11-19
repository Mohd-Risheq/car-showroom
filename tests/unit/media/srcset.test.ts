import { describe, expect, it } from "vitest";
import { largestVariant, smallestVariant, srcSetOf } from "@/lib/media/srcset";

// A photo's widths as the browser picks among them (BR-20): each stored variant with its width, the
// narrowest first, as a photo narrower than a width has no file of it

describe("srcSetOf", () => {
  it("lists every stored width, the narrowest first", () => {
    expect(
      srcSetOf({ "1200": "/seed/s05/1-1200.webp", "480": "/seed/s05/1-480.webp", "960": "/seed/s05/1-960.webp" }),
    ).toBe("/seed/s05/1-480.webp 480w, /seed/s05/1-960.webp 960w, /seed/s05/1-1200.webp 1200w");
  });

  it("lists the one width of a narrow photo", () => {
    expect(srcSetOf({ "480": "https://store.example/cars/c1/photo/p1-480.webp" })).toBe(
      "https://store.example/cars/c1/photo/p1-480.webp 480w",
    );
  });
});

describe("largestVariant", () => {
  it("is the widest file the photo has, which a zoomed photo shows (FR-10.4)", () => {
    expect(largestVariant({ "480": "/a-480.webp", "2560": "/a-2560.webp", "1600": "/a-1600.webp" })).toBe(
      "/a-2560.webp",
    );
    expect(largestVariant({ "480": "/b-480.webp" })).toBe("/b-480.webp");
  });
});

describe("smallestVariant", () => {
  it("is the narrowest file the photo has, for a browser that reads no srcset", () => {
    expect(smallestVariant({ "1200": "/a-1200.webp", "480": "/a-480.webp", "960": "/a-960.webp" })).toBe("/a-480.webp");
    expect(smallestVariant({ "2560": "/b-2560.webp", "1600": "/b-1600.webp" })).toBe("/b-1600.webp");
  });
});
