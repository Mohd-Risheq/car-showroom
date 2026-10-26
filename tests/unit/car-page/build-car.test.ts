import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CarPageCarRow,
  type CarPageInspectionRow,
  type CarPageMediaRow,
  type CarPageRows,
  resolveCarPage,
} from "@/features/car-page/server/build-car";
import { PANEL_IDS } from "@/lib/db/enums";
import type { PublicCarDTO } from "@/lib/db/public-dto";

// getCarPage's rows to its result (SRS §11.4, FR-09.1, FR-09.2, BR-16): the car for a public live
// slug, its current slug for an earlier one, or nothing, with the tags that refresh the entry

const NOW = new Date("2026-10-24T09:00:00.000Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const DEALER = "01923456-7890-7abc-8def-0000000000d1";
const CAR = "01923456-7890-7abc-8def-0000000000c1";
const MEDIA = {
  cover: "01923456-7890-7abc-8def-0000000000f1",
  second: "01923456-7890-7abc-8def-0000000000f2",
  first: "01923456-7890-7abc-8def-0000000000f3",
  og: "01923456-7890-7abc-8def-0000000000f4",
  report: "01923456-7890-7abc-8def-0000000000f5",
  clip: "01923456-7890-7abc-8def-0000000000f6",
  otherClip: "01923456-7890-7abc-8def-0000000000f7",
} as const;
const TAGS = { car: [`car:${CAR}`, `dealer:${DEALER}`], miss: [`cars:${DEALER}`, `dealer:${DEALER}`] };

function carRow(overrides: Partial<CarPageCarRow> = {}): CarPageCarRow {
  return {
    id: CAR,
    slug: "2021-toyota-land-cruiser-gxr-mu-7k3p",
    refCode: "MU-7K3P",
    status: "published",
    condition: "used",
    makeKey: "toyota",
    modelKey: "toyota-land-cruiser",
    makeNameAr: "تويوتا",
    makeNameEn: "Toyota",
    modelNameAr: "لاند كروزر",
    modelNameEn: "Land Cruiser",
    trim: "GXR",
    modelYear: 2021,
    priceJod: 48_500,
    customsStatus: "cleared",
    mileageKm: 64_000,
    fuelType: "gasoline",
    transmission: "automatic",
    regionalSpecs: "gcc",
    bodyType: "suv",
    drivetrain: "four_wd",
    engineCc: 4000,
    seats: 7,
    ownersCount: 1,
    licenseStatus: "licensed",
    licenseExpiry: "2027-03-01",
    insuranceType: "comprehensive",
    exteriorColorNameAr: "أبيض لؤلؤي",
    exteriorColorNameEn: "Pearl white",
    interiorColorNameAr: null,
    interiorColorNameEn: "Beige",
    batterySohPct: null,
    batterySohSource: null,
    warrantyUntil: null,
    vin: null,
    features: ["carplay", "jetpack", "airbags"],
    descriptionAr: "وصف",
    descriptionEn: null,
    lengthMm: 4950,
    wheelbaseMm: 2850,
    consumptionLPer100km: 12.5,
    consumptionKwhPer100km: null,
    recommendedOctane: 95,
    phevElectricSharePct: null,
    colorFamily: "white",
    exteriorColorHex: "#f4f2ee",
    paintFinish: "pearl",
    coverMediaId: MEDIA.cover,
    ogMediaId: MEDIA.og,
    publishedAt: new Date("2026-10-20T08:00:00.000Z"),
    soldAt: null,
    ...overrides,
  };
}

function photo(id: string, sortOrder: number, overrides: Partial<CarPageMediaRow> = {}): CarPageMediaRow {
  return {
    id,
    kind: "photo",
    sortOrder,
    photoGroup: "exterior",
    altAr: null,
    altEn: `photo ${sortOrder}`,
    width: 2560,
    height: 1707,
    placeholder: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
    dominantColor: "#d8d4cc",
    variants: { "480": `/p/${id}-480.webp`, "2560": `/p/${id}-2560.webp`, src: "/p/odd.webp" },
    mime: "image/webp",
    audioSource: null,
    ...overrides,
  };
}

const file = (id: string, kind: CarPageMediaRow["kind"], overrides: Partial<CarPageMediaRow> = {}) =>
  photo(id, 0, { kind, photoGroup: null, altEn: null, variants: { src: `/f/${id}` }, ...overrides });

function panelRows(overrides: Partial<CarPageInspectionRow> = {}): CarPageInspectionRow[] {
  const inspection = {
    inspectedOn: null,
    updatedAt: new Date("2026-10-23T22:30:00.000Z"),
    testCenterName: "Amman test centre",
    reportMediaId: MEDIA.report,
    chassisState: "sound",
    engineState: "notes",
    gearboxState: "unknown",
    chassisNoteAr: null,
    chassisNoteEn: null,
    engineNoteAr: "صوت خفيف",
    engineNoteEn: "Light tick",
    gearboxNoteAr: null,
    gearboxNoteEn: null,
  } as const;
  // The hood is repainted, with a close-up; the roof is plastic; the trunk has no row
  return PANEL_IDS.filter((panelId) => panelId !== "trunk").map((panelId) => ({
    ...inspection,
    panelId,
    panelState: panelId === "hood" ? "repainted" : "original",
    microns: panelId === "roof" ? null : panelId === "hood" ? 240 : 120,
    panelNoteAr: null,
    panelNoteEn: panelId === "hood" ? "Resprayed" : null,
    closeupMediaId: panelId === "hood" ? MEDIA.second : panelId === "door_front_left" ? MEDIA.og : null,
    ...overrides,
  }));
}

function rows(overrides: Partial<CarPageRows> = {}): CarPageRows {
  return {
    rules: [
      {
        soldVisibleDays: 14,
        mileageBands: { low: 12_000, high: 25_000 },
        micronBands: { factoryMax: 180, refinishMax: 300 },
      },
    ],
    car: [carRow()],
    history: [],
    media: [
      photo(MEDIA.second, 2),
      photo(MEDIA.first, 1, { photoGroup: "interior" }),
      photo(MEDIA.cover, 3, { altAr: "الغلاف" }),
      file(MEDIA.og, "og_image", { width: 1200, height: 630 }),
      file(MEDIA.report, "inspection_report", { mime: "application/pdf", width: null, height: null }),
      file(MEDIA.otherClip, "engine_audio", { sortOrder: 2, audioSource: "this_car", width: null, height: null }),
      file(MEDIA.clip, "engine_audio", { sortOrder: 1, audioSource: "same_engine", width: null, height: null }),
    ],
    inspection: panelRows(),
    price: [{ oldPriceJod: 50_000, newPriceJod: 48_500, changedAt: ago(3 * DAY) }],
    journey: [
      { sortOrder: 1, type: "shipped" },
      { sortOrder: 0, type: "built" },
    ],
    spin: [{ frameCount: 36 }],
    ...overrides,
  };
}

const resolve = (value: CarPageRows = rows()) => resolveCarPage(DEALER, value, NOW);
const carOf = (value: CarPageRows) => {
  const { result } = resolve(value);
  if (result.kind !== "car") throw new Error(`no car: ${JSON.stringify(result)}`);
  return result.car;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("resolveCarPage: the car", () => {
  it("picks each field of a public car, and nothing else", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const expected: PublicCarDTO = {
      id: CAR,
      slug: "2021-toyota-land-cruiser-gxr-mu-7k3p",
      refCode: "MU-7K3P",
      status: "published",
      condition: "used",
      makeName: { ar: "تويوتا", en: "Toyota" },
      modelName: { ar: "لاند كروزر", en: "Land Cruiser" },
      trim: "GXR",
      modelYear: 2021,
      priceJod: 48_500,
      priceDrop: { fromJod: 50_000, on: ago(3 * DAY).getTime(), badge: true },
      customsStatus: "cleared",
      mileageKm: 64_000,
      // 64,000 km over 5.81 years
      mileageCheck: { band: "low", kmPerYear: 11_016, low: 12_000, high: 25_000 },
      fuelType: "gasoline",
      transmission: "automatic",
      regionalSpecs: "gcc",
      bodyType: "suv",
      drivetrain: "four_wd",
      engineCc: 4000,
      seats: 7,
      ownersCount: 1,
      licenseStatus: "licensed",
      licenseExpiry: "2027-03-01",
      insuranceType: "comprehensive",
      exteriorColorName: { ar: "أبيض لؤلؤي", en: "Pearl white" },
      interiorColorName: { ar: null, en: "Beige" },
      battery: null,
      warrantyUntil: null,
      vin: null,
      features: ["airbags", "carplay"],
      description: { ar: "وصف", en: null },
      lengthMm: 4950,
      wheelbaseMm: 2850,
      ogImage: { src: `/f/${MEDIA.og}`, width: 1200, height: 630 },
      consumption: { lPer100km: 12.5, kwhPer100km: null },
      recommendedOctane: 95,
      phevElectricSharePct: null,
      colorFamily: "white",
      exteriorColorHex: "#f4f2ee",
      paintFinish: "pearl",
      photos: [MEDIA.cover, MEDIA.first, MEDIA.second].map((id) => ({
        id,
        group: id === MEDIA.first ? "interior" : "exterior",
        alt: {
          ar: id === MEDIA.cover ? "الغلاف" : null,
          en: `photo ${id === MEDIA.cover ? 3 : id === MEDIA.first ? 1 : 2}`,
        },
        width: 2560,
        height: 1707,
        placeholder: "3OcRJYB4d3h/iIeHeEh3eIhw+j3A",
        dominantColor: "#d8d4cc",
        variants: { "480": `/p/${id}-480.webp`, "2560": `/p/${id}-2560.webp` },
      })),
      inspection: {
        declaredOn: "2026-10-24",
        testCenterName: "Amman test centre",
        report: { src: `/f/${MEDIA.report}`, format: "pdf", width: null, height: null },
        // 12 known panels, and the chassis and engine
        filled: 14,
        panels: PANEL_IDS.map((panelId) => ({
          panelId,
          state: panelId === "trunk" ? "unknown" : panelId === "hood" ? "repainted" : "original",
          microns: panelId === "trunk" || panelId === "roof" ? null : panelId === "hood" ? 240 : 120,
          band: panelId === "trunk" || panelId === "roof" ? null : panelId === "hood" ? "refinish" : "factory",
          note: { ar: null, en: panelId === "hood" ? "Resprayed" : null },
          // A close-up only when the photo is in the gallery
          closeupPhotoId: panelId === "hood" ? MEDIA.second : null,
        })),
        mechanical: {
          chassis: { state: "sound", note: { ar: null, en: null } },
          engine: { state: "notes", note: { ar: "صوت خفيف", en: "Light tick" } },
          gearbox: { state: "unknown", note: { ar: null, en: null } },
        },
      },
      sound: { source: "same_engine" },
      spin: { frameCount: 36 },
      journey: [{ type: "built" }, { type: "shipped" }],
    };
    expect(resolve()).toStrictEqual({ result: { kind: "car", car: expected }, tags: TAGS.car });
  });

  it("shows the VIN the statement gives, which it gives only when the dealer shows it (BR-43)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(carOf(rows({ car: [carRow({ vin: "JTMHV05J604123456" })] })).vin).toBe("JTMHV05J604123456");
  });

  it("shows a sold car for its window, then answers that it is gone, with its body type (BR-04)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const sold = (soldAt: Date) => resolve(rows({ car: [carRow({ status: "sold", soldAt })] }));
    expect(sold(ago(14 * DAY - 60_000)).result).toMatchObject({ kind: "car", car: { status: "sold" } });
    expect(sold(ago(14 * DAY))).toStrictEqual({
      result: { kind: "notFound", gone: { bodyType: "suv" } },
      tags: TAGS.car,
    });
  });

  it("answers that an archived car is gone, so a republish refreshes it through its own tag", () => {
    const archived = resolve(rows({ car: [carRow({ status: "archived" })] }));
    expect(archived).toStrictEqual({ result: { kind: "notFound", gone: { bodyType: "suv" } }, tags: TAGS.car });
  });

  it("answers a draft's slug exactly as a slug no car has, so nothing tells that the draft exists", () => {
    const draft = resolve(rows({ car: [carRow({ status: "draft", publishedAt: null })] }));
    const unknown = resolve(rows({ car: [] }));
    expect(draft).toStrictEqual({ result: { kind: "notFound", gone: null }, tags: TAGS.miss });
    expect(unknown).toStrictEqual(draft);
    const archivedDraft = resolve(rows({ car: [carRow({ status: "archived", publishedAt: null })] }));
    expect(archivedDraft).toStrictEqual(draft);
  });

  it("answers that a public car missing a fact its page reads is not found, and logs it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolve(rows({ car: [carRow({ priceJod: null })] }))).toStrictEqual({
      result: { kind: "notFound", gone: null },
      tags: TAGS.car,
    });
    expect(resolve(rows({ car: [carRow({ modelNameEn: null })] })).result).toStrictEqual({
      kind: "notFound",
      gone: null,
    });
    expect(logged.mock.calls.map(([line]) => JSON.parse(String(line)))).toStrictEqual([
      { level: "error", code: "public_car_incomplete", carId: CAR, missing: "priceJod" },
      { level: "error", code: "public_car_incomplete", carId: CAR, missing: "names" },
    ]);
  });

  it("refuses to guess the sold window without the dealer's live settings row", () => {
    expect(() => resolve(rows({ rules: [] }))).toThrow(/settings/);
  });
});

describe("resolveCarPage: an earlier slug (BR-16)", () => {
  const history = (overrides = {}) => ({
    id: CAR,
    slug: "2021-toyota-land-cruiser-mu-7k3p",
    status: "published" as const,
    soldAt: null,
    publishedAt: new Date("2026-10-20T08:00:00.000Z"),
    bodyType: "suv" as const,
    ...overrides,
  });

  it("sends a public car's earlier slug to its current one", () => {
    expect(resolve(rows({ car: [], history: [history()] }))).toStrictEqual({
      result: { kind: "redirect", slug: "2021-toyota-land-cruiser-mu-7k3p" },
      tags: TAGS.car,
    });
  });

  it("answers that a car no longer public is gone, by its earlier slug too", () => {
    expect(resolve(rows({ car: [], history: [history({ status: "archived" })] }))).toStrictEqual({
      result: { kind: "notFound", gone: { bodyType: "suv" } },
      tags: TAGS.car,
    });
  });

  it("lets a live slug win over an earlier one, without falling through to it", () => {
    const archived = rows({ car: [carRow({ status: "archived" })], history: [history()] });
    expect(resolve(archived).result).toStrictEqual({ kind: "notFound", gone: { bodyType: "suv" } });
  });
});

describe("resolveCarPage: the car's sections", () => {
  it("leaves out a photo the gallery can't size, and logs it", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const car = carOf(rows({ media: [photo(MEDIA.cover, 0, { width: null }), photo(MEDIA.first, 1)] }));
    expect(car.photos.map((each) => each.id)).toStrictEqual([MEDIA.first]);
    expect(JSON.parse(String(logged.mock.calls[0]?.[0]))).toStrictEqual({
      level: "error",
      code: "public_media_incomplete",
      mediaId: MEDIA.cover,
    });
  });

  it("orders the photos by the dealer's order and then id, with the cover first only when it is one", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const media = [photo(MEDIA.second, 1), photo(MEDIA.first, 1), photo(MEDIA.og, 0)];
    const car = carOf(rows({ car: [carRow({ coverMediaId: MEDIA.report })], media }));
    expect(car.photos.map((each) => each.id)).toStrictEqual([MEDIA.og, MEDIA.second, MEDIA.first]);
  });

  it("takes a link preview or a report only from a file of that kind", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const car = carOf(
      rows({
        car: [carRow({ ogMediaId: MEDIA.first })],
        inspection: panelRows({ reportMediaId: MEDIA.og }),
      }),
    );
    expect(car.ogImage).toBeNull();
    expect(car.inspection?.report).toStrictEqual(null);
    const image = carOf(
      rows({
        media: [
          ...rows().media.filter((each) => each.id !== MEDIA.report),
          file(MEDIA.report, "inspection_report", { mime: "image/jpeg" }),
        ],
      }),
    );
    expect(image.inspection?.report).toStrictEqual({
      src: `/f/${MEDIA.report}`,
      format: "image",
      width: 2560,
      height: 1707,
    });
  });

  it("dates an inspection by its own date when it has one", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(carOf(rows({ inspection: panelRows({ inspectedOn: "2026-10-01" }) })).inspection?.declaredOn).toBe(
      "2026-10-01",
    );
    expect(carOf(rows({ inspection: [] })).inspection).toBeNull();
  });

  it("plays no engine on an electric car (FR-15.10), and nothing without a clip", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(carOf(rows({ car: [carRow({ fuelType: "electric" })] })).sound).toBeNull();
    const silent = rows().media.filter((each) => each.kind !== "engine_audio");
    expect(carOf(rows({ media: silent })).sound).toBeNull();
  });

  it("checks a used car's mileage and not a new one's (BR-06), and reads battery health with its source", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = carOf(
      rows({ car: [carRow({ condition: "new", batterySohPct: 97, batterySohSource: "diagnostic_scan" })] }),
    );
    expect(fresh.mileageCheck).toBeNull();
    expect(fresh.battery).toStrictEqual({ pct: 97, source: "diagnostic_scan" });
  });

  it("notes no drop for a price that rose, nor a spin or journey the car hasn't (BR-05)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const car = carOf(
      rows({ price: [{ oldPriceJod: 48_000, newPriceJod: 48_500, changedAt: ago(DAY) }], spin: [], journey: [] }),
    );
    expect([car.priceDrop, car.spin, car.journey]).toStrictEqual([null, null, []]);
  });
});
