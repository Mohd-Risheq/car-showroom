import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSettings, type SettingsRow } from "@/features/settings/server/build-settings";
import type { PublicSettingsDTO } from "@/lib/db/public-dto";

// getSettings's row to the settings the public pages read (SRS §11.4, FR-27, FR-35): each public
// field by name, the dealer's rules for the other two functions left out, and BR-12's public note

const NOW = new Date("2026-10-24T09:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const LOGO = "01923456-7890-7abc-8def-0000000000f9";
const OPEN = [{ open: "09:00", close: "21:00", overnight: false }];
const WEEK = { sat: OPEN, sun: OPEN, mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: "closed" } as const;
const BASELINE = { suv: 11, sedan: 8, hatchback: 7, pickup: 12, coupe: 9, convertible: 9.5, van: 12, truck: 16 };

function settingsRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    brandNameAr: "مفتاح",
    brandNameEn: "Muftah",
    taglineAr: null,
    taglineEn: "Every car, inspected",
    storyAr: "قصتنا",
    storyEn: null,
    accentPreset: "mint",
    whatsappE164: "+962790000001",
    phoneE164: null,
    email: "hello@example.com",
    addressAr: "عمان",
    addressEn: "Amman",
    lat: 31.95,
    lng: 35.91,
    social: { instagram: "https://instagram.com/muftah" },
    hours: WEEK,
    ramadan: null,
    closures: [{ date: "2026-12-25", note_ar: null, note_en: "Closed for the holiday" }],
    fuelPrice90: 1.05,
    fuelPrice95: 1.36,
    fuelPrice98: 1.51,
    fuelPriceDiesel: 0.9,
    elecHomeOffpeakKwh: 0.108,
    elecHomePeakKwh: 0.16,
    elecPublicKwh: 0.133,
    baselineLPer100km: BASELINE,
    pricesUpdatedAt: ago(10 * DAY),
    heroCarId: "01923456-7890-7abc-8def-0000000000c1",
    heroMediaId: null,
    heroMarks: { front: 0.1, rear: 0.9, wheelFront: 0.25, wheelRear: 0.75, ground: 0.8 },
    featuredCarIds: ["01923456-7890-7abc-8def-0000000000c2"],
    updatedAt: new Date("2026-10-22T08:00:00.000Z"),
    logoId: LOGO,
    logoVariants: { src: "/seed/logo.webp" },
    logoWidth: 512,
    logoHeight: 128,
    ...overrides,
  };
}

const build = (overrides: Partial<SettingsRow> = {}) => buildSettings([settingsRow(overrides)], NOW);

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("buildSettings", () => {
  it("picks each public field, and none of the dealer's rules", () => {
    const expected: PublicSettingsDTO = {
      brandName: { ar: "مفتاح", en: "Muftah" },
      tagline: { ar: null, en: "Every car, inspected" },
      story: { ar: "قصتنا", en: null },
      logo: { src: "/seed/logo.webp", width: 512, height: 128 },
      accentPreset: "mint",
      whatsappE164: "+962790000001",
      phoneE164: null,
      email: "hello@example.com",
      address: { ar: "عمان", en: "Amman" },
      location: { lat: 31.95, lng: 35.91 },
      social: { instagram: "https://instagram.com/muftah" },
      hours: WEEK,
      ramadan: null,
      closures: [{ date: "2026-12-25", note: { ar: null, en: "Closed for the holiday" } }],
      showcase: {
        heroCarId: "01923456-7890-7abc-8def-0000000000c1",
        heroMediaId: null,
        heroMarks: { front: 0.1, rear: 0.9, wheelFront: 0.25, wheelRear: 0.75, ground: 0.8 },
        featuredCarIds: ["01923456-7890-7abc-8def-0000000000c2"],
      },
      prices: {
        fuel90: 1.05,
        fuel95: 1.36,
        fuel98: 1.51,
        diesel: 0.9,
        elecHomeOffpeakKwh: 0.108,
        elecHomePeakKwh: 0.16,
        elecPublicKwh: 0.133,
        baselineLPer100km: BASELINE,
        updatedAt: ago(10 * DAY).getTime(),
        stale: false,
      },
      updatedAt: Date.parse("2026-10-22T08:00:00.000Z"),
    };
    expect(build()).toStrictEqual(expected);
  });

  it("notes prices older than 45 days, or never set, as stale (BR-12)", () => {
    expect(build({ pricesUpdatedAt: ago(45 * DAY) }).prices.stale).toBe(false);
    expect(build({ pricesUpdatedAt: ago(45 * DAY + 1) }).prices.stale).toBe(true);
    expect(build({ pricesUpdatedAt: null }).prices).toMatchObject({ updatedAt: null, stale: true });
  });

  it("places the showroom only with both coordinates (VR-23)", () => {
    expect(build({ lat: null, lng: null }).location).toBeNull();
  });

  it("shows no logo without a ready one, and leaves out, logged, a logo it can't size", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const without = { logoId: null, logoVariants: null, logoWidth: null, logoHeight: null };
    expect(build(without).logo).toBeNull();
    expect(logged).not.toHaveBeenCalled();
    expect(build({ logoHeight: null }).logo).toBeNull();
    expect(build({ logoVariants: { "480": "/seed/logo-480.webp" } }).logo).toBeNull();
    expect(logged.mock.calls.map(([line]) => JSON.parse(String(line)))).toStrictEqual([
      { level: "error", code: "public_media_incomplete", mediaId: LOGO },
      { level: "error", code: "public_media_incomplete", mediaId: LOGO },
    ]);
  });

  it("refuses to build without the dealer's live settings row", () => {
    expect(() => buildSettings([], NOW)).toThrow(/settings/);
  });
});
