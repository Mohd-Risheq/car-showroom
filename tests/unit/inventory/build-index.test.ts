import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildIndex,
  type IndexCarRow,
  type IndexInspectionRow,
  type IndexRows,
} from "@/features/inventory/server/build-index";
import { PANEL_IDS } from "@/lib/db/enums";
import { card, storedPhoto } from "../../support/cards";

// getInventoryIndex's rows to the index (SRS §11.4): the cars the public sees at this moment, each
// card picked field by field, newest first, with the names of the makes and models in stock

const NOW = new Date("2026-10-24T09:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ID = { a: "01923456-7890-7abc-8def-00000000000a", b: "01923456-7890-7abc-8def-00000000000b" } as const;
const UPLOAD = "0192aaaa-bbbb-7ccc-8ddd-eeeeffff0000";

function carRow(overrides: Partial<IndexCarRow> = {}): IndexCarRow {
  return {
    id: ID.a,
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
    paymentMethods: ["instalments", "cash"],
    seats: 7,
    colorFamily: "white",
    ownersCount: 1,
    features: ["carplay", "sunroof", "leather_seats", "airbags"],
    publishedAt: new Date("2026-10-20T08:00:00.000Z"),
    updatedAt: new Date("2026-10-21T08:00:00.000Z"),
    soldAt: null,
    hasSpin: true,
    hasClip: true,
    ...overrides,
  };
}

const inspected = (carId: string, overrides: Partial<IndexInspectionRow> = {}): IndexInspectionRow => ({
  carId,
  updatedAt: new Date("2026-10-19T08:00:00.000Z"),
  panelStates: PANEL_IDS.map(() => "original"),
  chassisState: "sound",
  engineState: "sound",
  gearboxState: "sound",
  ...overrides,
});

const MODELS = [
  {
    modelKey: "toyota-land-cruiser",
    makeKey: "toyota",
    modelNameAr: "لاند كروزر",
    modelNameEn: "Land Cruiser",
    makeNameAr: "تويوتا",
    makeNameEn: "Toyota",
  },
  {
    modelKey: "kia-sportage",
    makeKey: "kia",
    modelNameAr: "سبورتاج",
    modelNameEn: "Sportage",
    makeNameAr: "كيا",
    makeNameEn: "Kia",
  },
];

function rows(overrides: Partial<IndexRows> = {}): IndexRows {
  return {
    rules: [{ soldVisibleDays: 14 }],
    cars: [carRow()],
    covers: [
      {
        carId: ID.a,
        variant480: storedPhoto(ID.a, UPLOAD, "480", "a"),
        variant960: storedPhoto(ID.a, UPLOAD, "960", "b"),
        placeholder: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
        dominantColor: "#d8d4cc",
      },
    ],
    inspections: [inspected(ID.a, { updatedAt: new Date("2026-10-21T08:00:00.000Z") })],
    prices: [],
    models: MODELS,
    ...overrides,
  };
}

const idsOf = (built: ReturnType<typeof buildIndex>) => built.cards.map((each) => each.id);

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("buildIndex", () => {
  it("picks each card's fields from its rows, features and payment methods in the catalog's order", () => {
    expect(buildIndex(rows(), NOW).cards).toStrictEqual([card({ id: ID.a })]);
  });

  it("puts the newest car first, a tie going to the larger id", () => {
    const at = new Date("2026-10-01T00:00:00.000Z");
    const built = buildIndex(
      rows({
        cars: [
          carRow({ id: ID.a, publishedAt: at }),
          carRow({ id: ID.b, publishedAt: at }),
          carRow({ id: "01923456-7890-7abc-8def-00000000000c", publishedAt: ago(DAY) }),
        ],
      }),
      NOW,
    );
    expect(idsOf(built)).toStrictEqual(["01923456-7890-7abc-8def-00000000000c", ID.b, ID.a]);
  });

  it("shows published and reserved cars, and a sold car until its window ends (BR-04)", () => {
    const built = buildIndex(
      rows({
        cars: [
          carRow({ id: ID.a, status: "reserved" }),
          carRow({ id: ID.b, status: "sold", soldAt: ago(14 * DAY - 60_000) }),
          // The statement reads the longest window there is, so memory decides: past 14 days
          carRow({ id: "01923456-7890-7abc-8def-00000000000c", status: "sold", soldAt: ago(14 * DAY) }),
          carRow({ id: "01923456-7890-7abc-8def-00000000000d", status: "draft", publishedAt: null }),
          carRow({ id: "01923456-7890-7abc-8def-00000000000e", status: "archived" }),
        ],
      }),
      NOW,
    );
    // Published at the same moment, so the larger id comes first
    expect(built.cards.map(({ id, status }) => [id, status])).toStrictEqual([
      [ID.b, "sold"],
      [ID.a, "reserved"],
    ]);
  });

  it("reads the window from the dealer's rules, so a window of 0 hides a sale at once", () => {
    const sold = carRow({ status: "sold", soldAt: ago(60_000) });
    expect(idsOf(buildIndex(rows({ cars: [sold], rules: [{ soldVisibleDays: 0 }] }), NOW))).toStrictEqual([]);
    expect(idsOf(buildIndex(rows({ cars: [sold], rules: [{ soldVisibleDays: 1 }] }), NOW))).toStrictEqual([ID.a]);
  });

  it("refuses to guess the window without the dealer's live settings row", () => {
    expect(() => buildIndex(rows({ rules: [] }), NOW)).toThrow(/settings/);
  });

  it("badges a car new for 7 days, and a price drop under 14 days old (FR-06.7, BR-05)", () => {
    const drop = { carId: ID.a, oldPriceJod: 50_000, newPriceJod: 48_500, changedAt: ago(13 * DAY) };
    const fresh = buildIndex(rows({ cars: [carRow({ publishedAt: ago(7 * DAY) })], prices: [drop] }), NOW).cards[0];
    expect(fresh).toMatchObject({ isNew: true, priceDropped: true });
    const old = buildIndex(
      rows({ cars: [carRow({ publishedAt: ago(8 * DAY) })], prices: [{ ...drop, changedAt: ago(14 * DAY) }] }),
      NOW,
    ).cards[0];
    expect(old).toMatchObject({ isNew: false, priceDropped: false });
    // BR-05 reads the latest change alone, which a rise can be
    const rise = { ...drop, oldPriceJod: 48_000, changedAt: ago(DAY) };
    expect(buildIndex(rows({ prices: [rise] }), NOW).cards[0]?.priceDropped).toBe(false);
  });

  it("counts the inspection's known items (BR-07), or none without an inspection", () => {
    const partial = inspected(ID.a, {
      panelStates: PANEL_IDS.map((_, index) => (index < 5 ? "repainted" : "unknown")),
      engineState: "unknown",
    });
    expect(buildIndex(rows({ inspections: [partial] }), NOW).cards[0]?.inspectionFilled).toBe(7);
    expect(buildIndex(rows({ inspections: [] }), NOW).cards[0]?.inspectionFilled).toBeNull();
  });

  it("takes the later of the car's and its inspection's changes as the card's (FR-28.3's lastmod)", () => {
    const later = new Date("2026-10-23T08:00:00.000Z");
    const built = buildIndex(rows({ inspections: [inspected(ID.a, { updatedAt: later })] }), NOW);
    expect(built.cards[0]?.updatedAt).toBe(later.getTime());
    const without = buildIndex(rows({ inspections: [] }), NOW);
    expect(without.cards[0]?.updatedAt).toBe(Date.parse("2026-10-21T08:00:00.000Z"));
  });

  it("shows an engine clip, never on an electric car (FR-15.10)", () => {
    const sound = (row: Partial<IndexCarRow>) => buildIndex(rows({ cars: [carRow(row)] }), NOW).cards[0]?.hasSound;
    expect(sound({})).toBe(true);
    expect(sound({ hasClip: false })).toBe(false);
    expect(sound({ fuelType: "electric" })).toBe(false);
  });

  it("shows a ready spin apart from an engine clip", () => {
    expect(buildIndex(rows({ cars: [carRow({ hasSpin: false })] }), NOW).cards[0]).toMatchObject({
      hasSpin: false,
      hasSound: true,
    });
  });

  it("covers a card with its photo's card widths, or none, the card then showing the silhouette (FR-06)", () => {
    const narrow = {
      carId: ID.a,
      variant480: "/seed/s05-480.webp",
      variant960: null,
      placeholder: null,
      dominantColor: null,
    };
    expect(buildIndex(rows({ covers: [narrow] }), NOW).cards[0]?.cover).toStrictEqual({
      variants: { "480": "/seed/s05-480.webp" },
      placeholder: null,
      dominantColor: null,
    });
    const noCardWidth = { ...narrow, variant480: null };
    expect(buildIndex(rows({ covers: [noCardWidth] }), NOW).cards[0]?.cover).toBeNull();
    expect(buildIndex(rows({ covers: [] }), NOW).cards[0]?.cover).toBeNull();
  });

  it("drops a feature key outside the catalog, and logs it", () => {
    const logged = vi.spyOn(console, "warn").mockImplementation(() => {});
    const built = buildIndex(rows({ cars: [carRow({ features: ["jetpack", "abs"] })] }), NOW);
    expect(built.cards[0]?.features).toStrictEqual(["abs"]);
    expect(JSON.parse(String(logged.mock.calls[0]?.[0]))).toStrictEqual({
      level: "warn",
      code: "public_car_feature_unknown",
      carId: ID.a,
      feature: "jetpack",
    });
  });

  it("leaves out a public car missing a fact its card reads, or its names, and logs it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const built = buildIndex(
      rows({
        cars: [
          carRow({ id: ID.a, priceJod: null, insuranceType: null }),
          carRow({ id: ID.b, modelKey: "kia-sportage" }),
          carRow({ id: "01923456-7890-7abc-8def-00000000000c", modelKey: "toyota-hilux" }),
        ],
      }),
      NOW,
    );
    expect(built.cards).toStrictEqual([]);
    expect(logged.mock.calls.map(([line]) => JSON.parse(String(line)))).toStrictEqual([
      { level: "error", code: "public_car_incomplete", carId: ID.a, missing: "priceJod insuranceType" },
      // The model is a Kia's, so the car's make has none of its names
      { level: "error", code: "public_car_incomplete", carId: ID.b, missing: "names" },
      {
        level: "error",
        code: "public_car_incomplete",
        carId: "01923456-7890-7abc-8def-00000000000c",
        missing: "names",
      },
    ]);
  });

  it("names the makes and models of the cards it keeps, and no other", () => {
    const sold = carRow({ id: ID.b, modelKey: "kia-sportage", makeKey: "kia", status: "sold", soldAt: ago(20 * DAY) });
    const built = buildIndex(rows({ cars: [carRow(), sold] }), NOW);
    expect(built.makes).toStrictEqual({ toyota: { ar: "تويوتا", en: "Toyota" } });
    expect(built.models).toStrictEqual({
      "toyota-land-cruiser": { makeKey: "toyota", ar: "لاند كروزر", en: "Land Cruiser" },
    });
  });

  it("keeps what it reads for the cars it leaves out off the cards it keeps", () => {
    const sold = carRow({ id: ID.b, status: "sold", soldAt: ago(20 * DAY) });
    const built = buildIndex(
      rows({
        cars: [carRow(), sold],
        inspections: [inspected(ID.a), inspected(ID.b)],
        prices: [{ carId: ID.b, oldPriceJod: 9_000, newPriceJod: 8_000, changedAt: ago(DAY) }],
      }),
      NOW,
    );
    expect(idsOf(built)).toStrictEqual([ID.a]);
    // B's drop is a day old, so it would badge A's card if it reached it
    expect(built.cards[0]?.priceDropped).toBe(false);
  });
});
