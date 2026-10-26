import { cacheLife, cacheTag } from "next/cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndex, type IndexRows } from "@/features/inventory/server/build-index";
import { loadIndexRows } from "@/features/inventory/server/index-queries";
import { getInventoryIndex } from "@/features/inventory/server/inventory-index";
import { publicDb } from "@/lib/db/client";

// getInventoryIndex (SRS §11.4): the catalog profile and the index's tags, the cars read for BR-04's
// longest window on the read-only client, the cards built at the time it runs, and the index back
// from its stored form

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ publicDb: { name: "publicDb" } }));
vi.mock("@/features/inventory/server/index-queries", () => ({ loadIndexRows: vi.fn() }));

const DEALER = "01923456-7890-7abc-8def-0000000000d1";
const NOW = new Date("2026-10-24T09:00:00.000Z");
const DAY = 86_400_000;
const MODELS = [
  {
    modelKey: "toyota-land-cruiser",
    makeKey: "toyota",
    modelNameAr: "لاند كروزر",
    modelNameEn: "Land Cruiser",
    makeNameAr: "تويوتا",
    makeNameEn: "Toyota",
  },
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getInventoryIndex", () => {
  it("reads the dealer's cars sold in the last 60 days too, and tags the index with the inventory", async () => {
    vi.useFakeTimers({ now: NOW });
    vi.mocked(loadIndexRows).mockResolvedValue({
      rules: [{ soldVisibleDays: 14 }],
      cars: [],
      covers: [],
      inspections: [],
      prices: [],
      models: MODELS,
    });
    expect(await getInventoryIndex(DEALER)).toStrictEqual({ cards: [], makes: {}, models: {} });
    const [repo, bound] = vi.mocked(loadIndexRows).mock.calls[0] ?? [];
    expect([repo?.dealerId, bound]).toStrictEqual([DEALER, new Date("2026-08-25T09:00:00.000Z")]);
    expect(repo?.db).toBe(publicDb);
    expect(vi.mocked(cacheLife).mock.calls).toStrictEqual([["catalog"]]);
    expect(vi.mocked(cacheTag).mock.calls).toStrictEqual([[`cars:${DEALER}`, `dealer:${DEALER}`]]);
  });

  it("builds the cards at the time it runs, and gives back the index it built", async () => {
    vi.useFakeTimers({ now: NOW });
    const tenDaysAgo = new Date(NOW.getTime() - 10 * DAY);
    const rows: IndexRows = {
      rules: [{ soldVisibleDays: 14 }],
      cars: [
        {
          id: "01923456-7890-7abc-8def-00000000000a",
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
          paymentMethods: ["cash"],
          seats: 7,
          colorFamily: "white",
          ownersCount: 1,
          features: [],
          publishedAt: tenDaysAgo,
          updatedAt: tenDaysAgo,
          soldAt: null,
          hasSpin: false,
          hasClip: false,
        },
      ],
      covers: [],
      inspections: [],
      prices: [],
      models: MODELS,
    };
    vi.mocked(loadIndexRows).mockResolvedValue(rows);
    const index = await getInventoryIndex(DEALER);
    // Ten days old is past FR-06.7's seven, which an earlier clock would not see
    expect(index.cards[0]?.isNew).toBe(false);
    expect(index).toStrictEqual(buildIndex(rows, NOW));
  });
});
