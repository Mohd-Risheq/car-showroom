import { describe, expect, it } from "vitest";
import { decodeIndex, encodeIndex, INDEX_WIRE_VERSION, type IndexWire } from "@/features/inventory/server/index-codec";
import { FEATURE_GROUPS, FEATURE_KEYS } from "@/lib/db/feature-keys";
import type { PublicCardDTO, PublicInventoryIndex } from "@/lib/db/public-dto";
import { card, STORE_ORIGIN, storedPhoto } from "../../support/cards";

// The index's cache entry (SRS §11.4, NFR-SCALE-01): rows of positions, enum indexes and bit masks,
// names once each, and the store's origin once, so 1,000 cars fit in 1 MB. Decoding gives back
// exactly the index that was encoded.

const NAMES = {
  makes: { toyota: { ar: "تويوتا", en: "Toyota" }, kia: { ar: "كيا", en: "Kia" } },
  models: {
    "toyota-land-cruiser": { makeKey: "toyota", ar: "لاند كروزر", en: "Land Cruiser" },
    "kia-sportage": { makeKey: "kia", ar: "سبورتاج", en: "Sportage" },
  },
};

const index = (cards: PublicCardDTO[]): PublicInventoryIndex => ({ cards, ...NAMES });
const roundTrip = (value: PublicInventoryIndex) => decodeIndex(encodeIndex(value));
const ids = ["01923456-7890-7abc-8def-000000000001", "01923456-7890-7abc-8def-000000000002"] as const;

describe("encodeIndex and decodeIndex", () => {
  it("give back every field of every card, with the names", () => {
    const cards = [
      card({ id: ids[0] }),
      card({
        id: ids[1],
        slug: "2019-kia-sportage-mu-24q7",
        refCode: "MU-24Q7",
        status: "sold",
        makeKey: "kia",
        modelKey: "kia-sportage",
        trim: null,
        modelYear: 2019,
        mileageKm: 1_500_000,
        priceJod: 1_000_000,
        fuelType: "plugin_hybrid",
        regionalSpecs: "other",
        customsStatus: "not_cleared",
        bodyType: "truck",
        transmission: "manual",
        licenseStatus: "unlicensed",
        insuranceType: "none",
        paymentMethods: [],
        seats: null,
        colorFamily: null,
        ownersCount: null,
        features: [],
        isNew: false,
        priceDropped: true,
        inspectionFilled: null,
        hasSpin: false,
        hasSound: false,
        cover: null,
      }),
    ];
    expect(roundTrip(index(cards))).toStrictEqual(index(cards));
  });

  it("keeps every feature key and every enum value", () => {
    const all = card({ features: [...FEATURE_KEYS] });
    expect(roundTrip(index([all])).cards[0]?.features).toStrictEqual(FEATURE_KEYS);
    for (const status of ["published", "reserved", "sold"] as const) {
      expect(roundTrip(index([card({ status })])).cards[0]?.status).toBe(status);
    }
    // Slots of one width and the flags, each set apart, so no two can trade places unseen
    const apart = [
      card({ id: ids[0], customsStatus: "not_cleared", isNew: true, hasSpin: false, hasSound: false }),
      card({ id: ids[1], transmission: "manual", isNew: false, hasSpin: true, hasSound: false }),
    ];
    expect(roundTrip(index(apart))).toStrictEqual(index(apart));
  });

  it("gives back an empty index", () => {
    const empty = { cards: [], makes: {}, models: {} };
    expect(roundTrip(empty)).toStrictEqual(empty);
  });

  it("writes the layout this version reads, so a change to it comes with a new version", () => {
    const wire = encodeIndex(index([card({ id: ids[0], hasSpin: false })]));
    expect(wire.v).toBe(INDEX_WIRE_VERSION);
    expect(wire.mediaOrigin).toBe(STORE_ORIGIN);
    expect(wire.makes).toStrictEqual({ toyota: ["تويوتا", "Toyota"], kia: ["كيا", "Kia"] });
    expect(wire.models).toStrictEqual({
      "toyota-land-cruiser": ["toyota", "لاند كروزر", "Land Cruiser"],
      "kia-sportage": ["kia", "سبورتاج", "Sportage"],
    });
    expect(wire.rows).toStrictEqual([
      [
        ids[0],
        "2021-toyota-land-cruiser-gxr-mu-7k3p",
        0,
        1,
        "toyota-land-cruiser",
        "GXR",
        2021,
        64_000,
        48_500,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        0b11,
        7,
        0,
        1,
        // airbags and leather_seats; sunroof; carplay
        0b110,
        1 << 12,
        1 << 10,
        Date.parse("2026-10-20T08:00:00.000Z"),
        Date.parse("2026-10-21T08:00:00.000Z"),
        // New and sound
        0b1001,
        16,
        [
          "~0192aaaa-bbbb-7ccc-8ddd-eeeeffff0000-",
          `480-a${"x".repeat(29)}.webp`,
          `960-b${"x".repeat(29)}.webp`,
          "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
          "#d8d4cc",
        ],
      ],
    ]);
  });

  it("writes a reference code only when the slug doesn't end with it (BR-16)", () => {
    const own = card({ slug: "2021-toyota-land-cruiser-gxr-mu-24q7", refCode: "MU-7K3P" });
    expect(encodeIndex(index([own])).rows[0]?.[2]).toBe("MU-7K3P");
    expect(roundTrip(index([own])).cards[0]?.refCode).toBe("MU-7K3P");
  });

  it("writes the store's origin once, and each cover under its own car's folder there", () => {
    const wire = encodeIndex(index([card({ id: ids[0] }), card({ id: ids[1] })]));
    const covers = wire.rows.map((row) => row[27]?.[0]);
    expect(covers).toStrictEqual(["~0192aaaa-bbbb-7ccc-8ddd-eeeeffff0000-", "~0192aaaa-bbbb-7ccc-8ddd-eeeeffff0000-"]);
  });

  it("writes in full a cover outside the car's folder: the seed's own paths, another origin, mixed places", () => {
    const seed = card({
      id: ids[0],
      cover: {
        variants: { "480": "/seed/cars/s05/photo-01-480.webp", "960": "/seed/cars/s05/photo-01-960.webp" },
        placeholder: null,
        dominantColor: null,
      },
    });
    const elsewhere = card({
      id: ids[1],
      cover: {
        variants: {
          "480": storedPhoto(ids[1], "u", "480", "c", "https://other.example"),
          "960": "/seed/cars/s06/photo-01-960.webp",
        },
        placeholder: null,
        dominantColor: "#000000",
      },
    });
    const value = index([seed, elsewhere]);
    const wire = encodeIndex(value);
    expect(wire.mediaOrigin).toBe("https://other.example");
    expect(wire.rows.map((row) => row[27]?.[0])).toStrictEqual(["/seed/cars/s05/photo-01-", ""]);
    expect(decodeIndex(wire)).toStrictEqual(value);
  });

  it("reads no origin from a site path, though its query may hold ://", () => {
    const seed = card({
      id: ids[0],
      cover: {
        variants: { "480": "/seed/cars/s05/photo-01-480.webp?from=https://example.com" },
        placeholder: null,
        dominantColor: null,
      },
    });
    const wire = encodeIndex(index([seed]));
    expect(wire.mediaOrigin).toBeNull();
    expect(decodeIndex(wire)).toStrictEqual(index([seed]));
  });

  it("gives back a cover with one card width or none", () => {
    const narrow = card({
      id: ids[0],
      cover: { variants: { "480": storedPhoto(ids[0], "u", "480", "d") }, placeholder: null, dominantColor: null },
    });
    const bare = card({ id: ids[1], cover: { variants: {}, placeholder: "p", dominantColor: null } });
    expect(roundTrip(index([narrow, bare]))).toStrictEqual(index([narrow, bare]));
  });

  it("takes the origin most covers are at", () => {
    const at = (id: string, origin: string) =>
      card({
        id,
        cover: {
          variants: { "480": storedPhoto(id, "u", "480", "e", origin) },
          placeholder: null,
          dominantColor: null,
        },
      });
    const cards = [
      at(ids[0], "https://b.example"),
      at(ids[1], "https://a.example"),
      at("01923456-7890-7abc-8def-000000000003", "https://b.example"),
    ];
    expect(encodeIndex(index(cards)).mediaOrigin).toBe("https://b.example");
    // A tie goes to the origin first in sort order, so one index always encodes the same way
    expect(encodeIndex(index(cards.slice(0, 2))).mediaOrigin).toBe("https://a.example");
  });

  it("refuses what it can't write: a feature or a status outside the catalog, a model of another make, a missing name", () => {
    // @ts-expect-error: a key the catalog doesn't have
    expect(() => encodeIndex(index([card({ features: ["jetpack"] })]))).toThrow(/jetpack/);
    // @ts-expect-error: a status the public never sees
    expect(() => encodeIndex(index([card({ status: "draft" })]))).toThrow(/draft/);
    // The model's make is the car's (car_model_fk), so the rows leave the make to the model
    expect(() => encodeIndex(index([card({ makeKey: "kia" })]))).toThrow(/toyota-land-cruiser/);
    expect(() => encodeIndex({ ...index([card()]), models: {} })).toThrow(/toyota-land-cruiser/);
    expect(() => encodeIndex({ ...index([card()]), makes: {} })).toThrow(/toyota/);
  });

  it("refuses an entry of another version, or a row it can't read", () => {
    const wire = encodeIndex(index([card()]));
    expect(() => decodeIndex({ ...wire, v: 2 } as unknown as IndexWire)).toThrow(/version/);
    const [row] = wire.rows;
    if (row === undefined) throw new Error("no row");
    const status = [...row.slice(0, 3), 9, ...row.slice(4)] as unknown as IndexWire["rows"][number];
    expect(() => decodeIndex({ ...wire, rows: [status] })).toThrow(/status/);
    const fuel = [...row.slice(0, 9), 99, ...row.slice(10)] as unknown as IndexWire["rows"][number];
    expect(() => decodeIndex({ ...wire, rows: [fuel] })).toThrow(/fuelType/);
    expect(() => decodeIndex({ ...wire, models: {} })).toThrow(/toyota-land-cruiser/);
  });
});

describe("FEATURE_GROUPS", () => {
  it("keeps each group to 31 keys, so its mask stays a positive 32-bit number", () => {
    for (const keys of Object.values(FEATURE_GROUPS)) expect(keys.length).toBeLessThanOrEqual(31);
  });
});
