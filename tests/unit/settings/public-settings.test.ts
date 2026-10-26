import { cacheLife, cacheTag } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSettings, type SettingsRow } from "@/features/settings/server/build-settings";
import { getSettings } from "@/features/settings/server/public-settings";
import { loadSettingsRows } from "@/features/settings/server/settings-queries";
import { publicDb } from "@/lib/db/client";

// getSettings (SRS §11.4): the catalog profile and the dealer's tag, which every settings change
// and the nightly jobs update, the read-only client, and BR-12's note judged at the time it runs

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ publicDb: { name: "publicDb" } }));
vi.mock("@/features/settings/server/settings-queries", () => ({ loadSettingsRows: vi.fn() }));

const DEALER = "01923456-7890-7abc-8def-0000000000d1";
const NOW = new Date("2026-10-24T09:00:00.000Z");
const DAY = 86_400_000;
const OPEN = [{ open: "09:00", close: "21:00", overnight: false }];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getSettings", () => {
  it("reads the dealer's settings through the public repository, tagged with the dealer", async () => {
    vi.mocked(loadSettingsRows).mockResolvedValue([]);
    // A dealer without a live settings row is a fault the page reports
    await expect(getSettings(DEALER)).rejects.toThrow(/settings/);
    const [repo] = vi.mocked(loadSettingsRows).mock.calls[0] ?? [];
    expect(repo?.dealerId).toBe(DEALER);
    expect(repo?.db).toBe(publicDb);
    expect(vi.mocked(cacheLife).mock.calls).toStrictEqual([["catalog"]]);
    expect(vi.mocked(cacheTag).mock.calls).toStrictEqual([[`dealer:${DEALER}`]]);
  });

  it("judges the prices' age at the time it runs, and gives back the settings it built (BR-12)", async () => {
    vi.useFakeTimers({ now: NOW });
    // Set exactly 45 days before: not yet past BR-12's 45
    const row = setAt(NOW.getTime() - 45 * DAY);
    vi.mocked(loadSettingsRows).mockResolvedValue([row]);
    const settings = await getSettings(DEALER);
    expect(settings.prices.stale).toBe(false);
    expect(settings).toStrictEqual(buildSettings([row], NOW));
  });

  it("counts prices set a millisecond earlier as stale at that time (BR-12)", async () => {
    vi.useFakeTimers({ now: NOW });
    vi.mocked(loadSettingsRows).mockResolvedValue([setAt(NOW.getTime() - 45 * DAY - 1)]);
    expect((await getSettings(DEALER)).prices.stale).toBe(true);
  });
});

// The row last changed when the prices were set. The two cases sit on BR-12's 45-day edge at the
// faked clock, so only the clock read as the function runs gives both results; one read earlier or
// later, even at module load, fails one of them
function setAt(time: number): SettingsRow {
  const set = new Date(time);
  return {
    brandNameAr: "مفتاح",
    brandNameEn: "Muftah",
    taglineAr: null,
    taglineEn: null,
    storyAr: null,
    storyEn: null,
    accentPreset: "mint",
    whatsappE164: null,
    phoneE164: null,
    email: null,
    addressAr: null,
    addressEn: null,
    lat: null,
    lng: null,
    social: {},
    hours: { sat: OPEN, sun: OPEN, mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: "closed" },
    ramadan: null,
    closures: [],
    fuelPrice90: 1.05,
    fuelPrice95: 1.36,
    fuelPrice98: null,
    fuelPriceDiesel: 0.9,
    elecHomeOffpeakKwh: null,
    elecHomePeakKwh: null,
    elecPublicKwh: null,
    baselineLPer100km: {
      suv: 11,
      sedan: 8,
      hatchback: 7,
      pickup: 12,
      coupe: 9,
      convertible: 9.5,
      van: 12,
      truck: 16,
    },
    pricesUpdatedAt: set,
    heroCarId: null,
    heroMediaId: null,
    heroMarks: null,
    featuredCarIds: [],
    updatedAt: set,
    logoId: null,
    logoVariants: null,
    logoWidth: null,
    logoHeight: null,
  };
}
