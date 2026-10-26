import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FEATURE_KEYS } from "@/lib/db/feature-keys";
import { car } from "@/lib/db/schema";
import { carPairIssues, carPatchSchema, seedOffsetsSchema } from "@/lib/validation/car";
import { validate } from "@/lib/validation/issues";

// API-11's patch (SRS §7.1, TC-31-7): each field of the wizard's steps 1 to 4 under its rule, and
// nothing the server owns (VR-29)

const NOW = new Date("2026-10-24T09:00:00Z");
const char = (codePoint: number) => String.fromCodePoint(codePoint);
const arabicIndic = (digits: string) => digits.replace(/\d/g, (digit) => char(0x0660 + Number(digit)));

/** The patch's value for one field, or the field's first issue */
function field(name: string, value: unknown, now = NOW): unknown {
  const result = validate(carPatchSchema(now), { [name]: value });
  return result.ok ? (result.data as Record<string, unknown>)[name] : result.fieldErrors[name]?.[0];
}

// The fields of steps 1 to 4 (FR-31)
const PATCH_FIELDS = [
  ...["vin", "vinPublic", "makeKey", "modelKey", "trim", "modelYear", "bodyType", "fuelType", "transmission"],
  ...["drivetrain", "engineCc", "powerHp", "seats", "exteriorColorNameAr", "exteriorColorNameEn"],
  ...["exteriorColorHex", "paintFinish", "colorFamily", "interiorColorNameAr", "interiorColorNameEn"],
  ...["lengthMm", "wheelbaseMm"],
  ...["regionalSpecs", "customsStatus", "licenseStatus", "licenseExpiry", "insuranceType", "paymentMethods"],
  ...["condition", "ownersCount", "warrantyUntil", "mileageKm"],
  "features",
  ...["priceJod", "descriptionAr", "descriptionEn", "recommendedOctane", "consumptionLPer100km"],
  ...["consumptionKwhPer100km", "consumptionSource", "batterySohPct", "batterySohSource", "phevElectricSharePct"],
];

// What the server sets: keys, scope, status and its times, media, the version and the step
const SERVER_OWNED = [
  ...["id", "dealerId", "demoSessionId", "seedKey", "seedOffsets", "copiedFromCarId", "clientDraftId"],
  ...["refCode", "slug", "status", "coverMediaId", "ogMediaId", "blueprintMediaId", "platesConfirmed"],
  ...["publishedAt", "soldAt", "archivedAt", "createdBy", "version", "draftStep", "createdAt", "updatedAt"],
];

describe("the car patch", () => {
  it("takes the fields of steps 1 to 4, and every other column is the server's", () => {
    expect(Object.keys(carPatchSchema(NOW).shape).sort()).toStrictEqual([...PATCH_FIELDS].sort());
    const columns = Object.keys(getTableColumns(car));
    expect(columns.filter((name) => !PATCH_FIELDS.includes(name)).sort()).toStrictEqual([...SERVER_OWNED].sort());
  });

  it("drops every field the server owns, the slug and reference code among them (VR-29)", () => {
    const sample: Record<string, unknown> = {
      refCode: "MU-3HK8",
      slug: "2019-toyota-land-cruiser-gxr-mu-3hk8",
      status: "published",
      dealerId: "0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b",
      version: 9,
      publishedAt: NOW.toISOString(),
    };
    for (const name of SERVER_OWNED) sample[name] ??= "x";
    expect(validate(carPatchSchema(NOW), { ...sample, priceJod: 14500 })).toStrictEqual({
      ok: true,
      data: { priceJod: 14500 },
    });
  });

  it("leaves out what it doesn't change, and clears a field sent empty", () => {
    expect(validate(carPatchSchema(NOW), {})).toStrictEqual({ ok: true, data: {} });
    expect(validate(carPatchSchema(NOW), { mileageKm: "", trim: null })).toStrictEqual({
      ok: true,
      data: { mileageKm: null, trim: null },
    });
  });
});

describe("the rules of SRS §7.1", () => {
  it("VR-01: a whole price from 300 to 1,000,000 JOD, in any digits (TC-31-4)", () => {
    expect(field("priceJod", 300)).toBe(300);
    expect(field("priceJod", 1_000_000)).toBe(1_000_000);
    expect(field("priceJod", arabicIndic("14500"))).toBe(14500);
    expect(field("priceJod", 299)).toStrictEqual({ key: "validation.price" });
    expect(field("priceJod", 1_000_001)).toStrictEqual({ key: "validation.price" });
    expect(field("priceJod", 14500.5)).toStrictEqual({ key: "validation.integer" });
  });

  it("VR-02: a model year from 1990 to next year in Amman", () => {
    expect(field("modelYear", 1990)).toBe(1990);
    expect(field("modelYear", 1989)).toStrictEqual({ key: "validation.year", values: { maxYear: 2027 } });
    expect(field("modelYear", 2027)).toBe(2027);
    expect(field("modelYear", 2028)).toStrictEqual({ key: "validation.year", values: { maxYear: 2027 } });
    // 21:00 UTC on 31 December is already New Year's Day in Amman
    const newYear = new Date("2026-12-31T21:00:00Z");
    expect(field("modelYear", 2028, newYear)).toBe(2028);
    expect(field("modelYear", 2028, new Date("2026-12-31T20:59:59Z"))).toStrictEqual({
      key: "validation.year",
      values: { maxYear: 2027 },
    });
  });

  it("VR-03: whole kilometres from 0 to 1,500,000", () => {
    expect(field("mileageKm", 0)).toBe(0);
    expect(field("mileageKm", 1_500_000)).toBe(1_500_000);
    expect(field("mileageKm", -1)).toStrictEqual({ key: "validation.km" });
    expect(field("mileageKm", 1_500_001)).toStrictEqual({ key: "validation.km" });
  });

  it("VR-04: a VIN in capitals, with its check digit an error only in North America (BR-23)", () => {
    expect(field("vin", " 4t1b31hk3ku190069 ")).toBe("4T1B31HK3KU190069");
    expect(field("vin", "4T1B31HK3KU19006")).toStrictEqual({ key: "validation.vin" });
    expect(field("vin", "4T1B31HK3KU19O069")).toStrictEqual({ key: "validation.vin" });
    expect(field("vin", "4T1B31HK4KU190069")).toStrictEqual({ key: "validation.vinCheckDigit" });
    // The warning outside North America travels beside the parse (checkVin), and the VIN is kept
    expect(field("vin", "KMHE24L26HA998152")).toBe("KMHE24L26HA998152");
    expect(field("vin", "")).toBeNull();
    expect(field("vin", 4_190_069)).toStrictEqual({ key: "validation.invalid" });
  });

  it("VR-06: a printable trim of up to 60 characters", () => {
    expect(field("trim", "GXR")).toBe("GXR");
    expect(field("trim", "G".repeat(60))).toBe("G".repeat(60));
    expect(field("trim", "G".repeat(61))).toStrictEqual({ key: "validation.maxChars", values: { max: 60 } });
    expect(field("trim", "GXR\nV8")).toStrictEqual({ key: "validation.invalid" });
  });

  it("VR-07: descriptions of up to 3,000 characters each, on several lines", () => {
    expect(field("descriptionEn", "One owner.\r\nFull service history.")).toBe("One owner.\nFull service history.");
    expect(field("descriptionAr", "س".repeat(3000))).toBe("س".repeat(3000));
    expect(field("descriptionAr", "س".repeat(3001))).toStrictEqual({
      key: "validation.maxChars",
      values: { max: 3000 },
    });
    expect(field("descriptionEn", "D".repeat(3000))).toBe("D".repeat(3000));
    expect(field("descriptionEn", "D".repeat(3001))).toStrictEqual({
      key: "validation.maxChars",
      values: { max: 3000 },
    });
  });

  it("VR-08: catalog keys only, each once, up to 80", () => {
    expect(field("features", ["abs", "sunroof"])).toStrictEqual(["abs", "sunroof"]);
    expect(field("features", [])).toStrictEqual([]);
    expect(field("features", [...FEATURE_KEYS])).toStrictEqual([...FEATURE_KEYS]);
    expect(field("features", ["abs", "flux_capacitor"])).toStrictEqual({ key: "validation.invalid" });
    expect(field("features", ["abs", "abs"])).toStrictEqual({ key: "validation.invalid" });
    expect(
      field(
        "features",
        Array.from({ length: 81 }, () => "abs"),
      ),
    ).toStrictEqual({ key: "validation.invalid" });
  });

  it("VR-10 and VR-11: consumption within its range, to one decimal", () => {
    expect(field("consumptionLPer100km", "7.25")).toBe(7.3);
    expect(field("consumptionLPer100km", 1)).toBe(1);
    expect(field("consumptionLPer100km", 40)).toBe(40);
    for (const wrong of [0.9, 40.1]) {
      expect(field("consumptionLPer100km", wrong), String(wrong)).toStrictEqual({
        key: "validation.range",
        values: { min: 1, max: 40 },
      });
    }
    expect(field("consumptionKwhPer100km", 15.5)).toBe(15.5);
    expect(field("consumptionKwhPer100km", 5)).toBe(5);
    expect(field("consumptionKwhPer100km", 60)).toBe(60);
    for (const wrong of [4.9, 60.1]) {
      expect(field("consumptionKwhPer100km", wrong), String(wrong)).toStrictEqual({
        key: "validation.range",
        values: { min: 5, max: 60 },
      });
    }
  });

  it("VR-13: whole percentages from 0 to 100", () => {
    for (const name of ["batterySohPct", "phevElectricSharePct"]) {
      expect(field(name, 0)).toBe(0);
      expect(field(name, 100)).toBe(100);
      expect(field(name, -1)).toStrictEqual({ key: "validation.percent" });
      expect(field(name, 101)).toStrictEqual({ key: "validation.percent" });
      expect(field(name, 92.5)).toStrictEqual({ key: "validation.integer" });
    }
  });

  it("VR-31: a length and a wheelbase in millimetres within their ranges", () => {
    expect(field("lengthMm", 2500)).toBe(2500);
    expect(field("lengthMm", 6500)).toBe(6500);
    expect(field("lengthMm", 2499)).toStrictEqual({ key: "validation.dimension" });
    expect(field("lengthMm", 6501)).toStrictEqual({ key: "validation.dimension" });
    expect(field("wheelbaseMm", 1800)).toBe(1800);
    expect(field("wheelbaseMm", 4200)).toBe(4200);
    expect(field("wheelbaseMm", 1799)).toStrictEqual({ key: "validation.dimension" });
    expect(field("wheelbaseMm", 4201)).toStrictEqual({ key: "validation.dimension" });
  });

  it("checks the other columns' bounds (SRS §6.2)", () => {
    const ranges = [
      { name: "engineCc", min: 0, max: 10_000, wrong: [-1, 10_001] },
      { name: "powerHp", min: 30, max: 2000, wrong: [29, 2001] },
      { name: "seats", min: 2, max: 15, wrong: [1, 16] },
      { name: "ownersCount", min: 1, max: 20, wrong: [0, 21] },
    ];
    for (const { name, min, max, wrong } of ranges) {
      expect(field(name, min), name).toBe(min);
      expect(field(name, max), name).toBe(max);
      for (const value of wrong) {
        expect(field(name, value), `${name} ${value}`).toStrictEqual({ key: "validation.range", values: { min, max } });
      }
    }
    expect(field("recommendedOctane", 95)).toBe(95);
    expect(field("recommendedOctane", 91)).toStrictEqual({ key: "validation.invalid" });
    expect(field("exteriorColorHex", "#A1B2C3")).toBe("#a1b2c3");
    expect(field("exteriorColorHex", "#abc")).toStrictEqual({ key: "validation.invalid" });
    for (const name of ["exteriorColorNameAr", "exteriorColorNameEn", "interiorColorNameAr", "interiorColorNameEn"]) {
      expect(field(name, "P".repeat(40)), name).toBe("P".repeat(40));
      expect(field(name, "P".repeat(41)), name).toStrictEqual({ key: "validation.maxChars", values: { max: 40 } });
    }
    expect(field("makeKey", "land-rover")).toBe("land-rover");
    expect(field("makeKey", "Land Rover")).toStrictEqual({ key: "validation.invalid" });
    expect(field("modelKey", "toyota-camry")).toBe("toyota-camry");
    // As long as car.make_key and car.model_key hold
    expect(field("makeKey", "m".repeat(40))).toBe("m".repeat(40));
    expect(field("makeKey", "m".repeat(41))).toStrictEqual({ key: "validation.invalid" });
    expect(field("modelKey", "m".repeat(60))).toBe("m".repeat(60));
    expect(field("modelKey", "m".repeat(61))).toStrictEqual({ key: "validation.invalid" });
  });

  it("takes the enums' values only, and needs one for a column that can't be empty", () => {
    expect(field("bodyType", "suv")).toBe("suv");
    expect(field("bodyType", "SUV")).toStrictEqual({ key: "validation.invalid" });
    expect(field("bodyType", "")).toBeNull();
    expect(field("condition", "new")).toBe("new");
    expect(field("condition", null)).toStrictEqual({ key: "validation.required" });
    expect(field("vinPublic", true)).toBe(true);
    expect(field("vinPublic", null)).toStrictEqual({ key: "validation.required" });
  });

  it("takes payment methods as information only, at least one, each once (C-04)", () => {
    expect(field("paymentMethods", ["cash", "instalments"])).toStrictEqual(["cash", "instalments"]);
    expect(field("paymentMethods", [])).toStrictEqual({ key: "validation.required" });
    expect(field("paymentMethods", ["cash", "cash"])).toStrictEqual({ key: "validation.invalid" });
    expect(field("paymentMethods", ["loan"])).toStrictEqual({ key: "validation.invalid" });
  });

  it("stores a licence's expiry as the first day of its month, and a warranty as a day", () => {
    expect(field("licenseExpiry", "2027-03")).toBe("2027-03-01");
    expect(field("licenseExpiry", "2027-03-15")).toStrictEqual({ key: "validation.invalid" });
    expect(field("warrantyUntil", "2028-06-30")).toBe("2028-06-30");
  });
});

describe("the rules over two fields", () => {
  it("check a patch that holds both fields", () => {
    expect(validate(carPatchSchema(NOW), { lengthMm: 4000, wheelbaseMm: 4000 })).toStrictEqual({
      ok: false,
      fieldErrors: { wheelbaseMm: [{ key: "validation.wheelbaseShorter" }] },
    });
    expect(validate(carPatchSchema(NOW), { lengthMm: 4000, wheelbaseMm: 3999 })).toStrictEqual({
      ok: true,
      data: { lengthMm: 4000, wheelbaseMm: 3999 },
    });
    expect(validate(carPatchSchema(NOW), { batterySohPct: 92, batterySohSource: null })).toStrictEqual({
      ok: false,
      fieldErrors: { batterySohSource: [{ key: "validation.sohSource" }] },
    });
    expect(
      validate(carPatchSchema(NOW), {
        lengthMm: 4500,
        wheelbaseMm: 2700,
        batterySohPct: 92,
        batterySohSource: "car_display",
      }),
    ).toMatchObject({ ok: true });
  });

  it("leave a patch with one of the two to the stored row, which carPairIssues checks", () => {
    expect(validate(carPatchSchema(NOW), { batterySohPct: 92 })).toStrictEqual({
      ok: true,
      data: { batterySohPct: 92 },
    });
    expect(carPairIssues({ batterySohPct: 92, batterySohSource: null })).toStrictEqual({
      batterySohSource: [{ key: "validation.sohSource" }],
    });
    expect(carPairIssues({ lengthMm: 4000, wheelbaseMm: 4100 })).toStrictEqual({
      wheelbaseMm: [{ key: "validation.wheelbaseShorter" }],
    });
    expect(carPairIssues({ lengthMm: null, wheelbaseMm: 4600, batterySohPct: null })).toStrictEqual({});
  });
});

describe("the seed's offsets (05-SEED-DATA §9.1)", () => {
  it("parse a seed car's ages in days and months", () => {
    expect(
      validate(seedOffsetsSchema, {
        published: -9,
        priceChanges: [{ days: -3, from: 15000, to: 14500 }],
        licenseExpiryMonths: 7,
        milestones: { arrived_port: -38 },
      }),
    ).toStrictEqual({
      ok: true,
      data: {
        published: -9,
        priceChanges: [{ days: -3, from: 15000, to: 14500 }],
        licenseExpiryMonths: 7,
        milestones: { arrived_port: -38 },
      },
    });
    expect(validate(seedOffsetsSchema, {})).toStrictEqual({ ok: true, data: { priceChanges: [], milestones: {} } });
    // Today, and a licence that runs out next month, are the nearest each may be
    expect(validate(seedOffsetsSchema, { published: 0, licenseExpiryMonths: 1 })).toStrictEqual({
      ok: true,
      data: { published: 0, licenseExpiryMonths: 1, priceChanges: [], milestones: {} },
    });
  });

  it("hold a price change's prices to VR-01, as a price change's row does", () => {
    for (const price of [300, 1_000_000]) {
      const priceChanges = [
        { days: -3, from: price, to: 14500 },
        { days: -2, from: 14500, to: price },
      ];
      expect(validate(seedOffsetsSchema, { priceChanges }), String(price)).toMatchObject({ ok: true });
    }
    for (const price of [299, 1_000_001]) {
      for (const change of [
        { days: -3, from: price, to: 14500 },
        { days: -3, from: 14500, to: price },
      ]) {
        expect(validate(seedOffsetsSchema, { priceChanges: [change] }), JSON.stringify(change)).toMatchObject({
          ok: false,
        });
      }
    }
  });

  it("refuse a date in the future", () => {
    expect(validate(seedOffsetsSchema, { published: 1 })).toMatchObject({ ok: false });
    expect(validate(seedOffsetsSchema, { milestones: { shipped: 2 } })).toMatchObject({ ok: false });
    expect(validate(seedOffsetsSchema, { licenseExpiryMonths: 0 })).toMatchObject({ ok: false });
  });
});
