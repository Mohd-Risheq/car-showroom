import { describe, expect, it } from "vitest";
import {
  extensionOf,
  isStoredPathnameOf,
  maxBytesFor,
  nominalWidth,
  RANDOM_SUFFIX_LENGTH,
  uploadPathname,
} from "@/lib/storage/rules";

// API-16 caps and types (SEC-08), BR-20 demo variants, and the stored pathname shape (API-17)

const dealer = { demo: false };
const demo = { demo: true };

describe("upload caps", () => {
  it("caps each variant in binary units", () => {
    expect(maxBytesFor("photo", "480", "webp", dealer)).toBe(153_600);
    expect(maxBytesFor("photo", "1600", "jpg", dealer)).toBe(1_048_576);
    expect(maxBytesFor("photo", "2560", "webp", dealer)).toBe(2_097_152);
    expect(maxBytesFor("spin_frame", "480", "jpg", dealer)).toBe(28_672);
    expect(maxBytesFor("spin_frame", "1280", "webp", dealer)).toBe(819_200);
    expect(maxBytesFor("engine_audio", "src", "wav", dealer)).toBe(1_468_006);
    expect(maxBytesFor("inspection_report", "src", "png", dealer)).toBe(2_097_152);
    expect(maxBytesFor("inspection_report", "src", "pdf", dealer)).toBe(10_485_760);
    expect(maxBytesFor("og_image", "src", "jpg", dealer)).toBe(512_000);
    expect(maxBytesFor("blueprint", "src", "png", dealer)).toBe(614_400);
    expect(maxBytesFor("logo", "src", "webp", dealer)).toBe(512_000);
  });

  it("refuses types outside each kind's allow-list, and SVG everywhere", () => {
    expect(maxBytesFor("photo", "960", "png", dealer)).toBeUndefined();
    expect(maxBytesFor("photo", "960", "pdf", dealer)).toBeUndefined();
    expect(maxBytesFor("og_image", "src", "webp", dealer)).toBeUndefined();
    expect(maxBytesFor("blueprint", "src", "jpg", dealer)).toBeUndefined();
    expect(maxBytesFor("logo", "src", "jpg", dealer)).toBeUndefined();
    expect(maxBytesFor("engine_audio", "src", "webp", dealer)).toBeUndefined();
    expect(extensionOf("cars/a/logo/b-src.svg")).toBeUndefined();
  });

  it("refuses unknown variants, including object keys", () => {
    for (const variant of ["720", "src", "constructor", "__proto__", "toString"]) {
      expect(maxBytesFor("photo", variant, "webp", dealer)).toBeUndefined();
    }
    expect(maxBytesFor("og_image", "480", "jpg", dealer)).toBeUndefined();
    expect(nominalWidth("photo", "hasOwnProperty")).toBeUndefined();
  });

  it("gives a demo session photos at 480 and 960 and spin frames at 480 only (BR-20, BR-30)", () => {
    expect(maxBytesFor("photo", "960", "webp", demo)).toBe(307_200);
    expect(maxBytesFor("photo", "1200", "webp", demo)).toBeUndefined();
    expect(maxBytesFor("spin_frame", "480", "webp", demo)).toBe(28_672);
    expect(maxBytesFor("spin_frame", "1280", "webp", demo)).toBeUndefined();
    expect(maxBytesFor("og_image", "src", "jpg", demo)).toBeUndefined();
    expect(maxBytesFor("blueprint", "src", "webp", demo)).toBeUndefined();
    expect(maxBytesFor("inspection_report", "src", "pdf", demo)).toBeUndefined();
  });
});

describe("pathnames", () => {
  const carId = "0190f5a0-1111-7000-8000-000000000001";
  const clientUploadId = "6b0c3f4e-2222-4000-8000-000000000002";
  const signed = uploadPathname({ carId, kind: "photo", clientUploadId, variant: "960", ext: "webp" });

  it("builds the one pathname API-16 signs", () => {
    expect(signed).toBe(`cars/${carId}/photo/${clientUploadId}-960.webp`);
    expect(extensionOf(signed)).toBe("webp");
    expect(nominalWidth("photo", "960")).toBe(960);
    expect(nominalWidth("og_image", "src")).toBe(2560);
  });

  it("matches a stored pathname only with a letters-and-digits suffix before the extension", () => {
    const base = `cars/${carId}/photo/${clientUploadId}-960`;
    const suffix = "NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2"; // the length Vercel Blob uses
    expect(suffix).toHaveLength(RANDOM_SUFFIX_LENGTH);
    expect(isStoredPathnameOf(signed, `${base}-${suffix}.webp`)).toBe(true);
    for (const stored of [
      signed, // no suffix
      `${base}-${suffix}.jpg`, // another extension
      `${base}-short.webp`,
      `${base}-${"a".repeat(65)}.webp`,
      `${base}-${suffix.slice(0, 10)}/${suffix.slice(10)}.webp`,
      `${base}-${suffix.slice(0, 10)}.${suffix.slice(11)}.webp`,
      `cars/${carId}/photo/${clientUploadId}-480-${suffix}.webp`,
    ]) {
      expect(isStoredPathnameOf(signed, stored)).toBe(false);
    }
  });
});
