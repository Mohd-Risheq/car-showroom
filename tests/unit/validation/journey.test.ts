import { describe, expect, it } from "vitest";
import { validate } from "@/lib/validation/issues";
import { customPlaceSchema, journeySchema } from "@/lib/validation/journey";

// API-20's journey (FR-40): up to 10 milestones (VR-14), no month after this one in Amman, and a
// title brand for an auction (VR-15)

const NOW = new Date("2026-10-24T09:00:00Z");
const PLACE = "0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b";
const MILESTONE = { type: "shipped", placeId: PLACE, occurredMonth: "2026-08" };

function issues(milestones: object[], now = NOW): unknown {
  const result = validate(journeySchema(now), { milestones });
  return result.ok ? "ok" : result.fieldErrors;
}

describe("the journey", () => {
  it("takes milestones with a place and a month, either of which may be unknown", () => {
    expect(
      validate(journeySchema(NOW), { milestones: [MILESTONE, { type: "built", placeId: null, occurredMonth: "" }] }),
    ).toStrictEqual({
      ok: true,
      data: {
        milestones: [
          { type: "shipped", placeId: PLACE, occurredMonth: "2026-08-01" },
          { type: "built", placeId: null, occurredMonth: null },
        ],
      },
    });
  });

  it("VR-14: up to 10 milestones", () => {
    expect(issues(Array.from({ length: 10 }, () => MILESTONE))).toBe("ok");
    expect(issues(Array.from({ length: 11 }, () => MILESTONE))).toStrictEqual({
      milestones: [{ key: "validation.milestonesMax" }],
    });
  });

  it("VR-14: no month after this one in Amman", () => {
    expect(issues([{ ...MILESTONE, occurredMonth: "2026-10" }])).toBe("ok");
    expect(issues([{ ...MILESTONE, occurredMonth: "2026-11" }])).toStrictEqual({
      "milestones.0.occurredMonth": [{ key: "validation.futureDate" }],
    });
    // 21:00 UTC on 31 October is already November in Amman
    expect(issues([{ ...MILESTONE, occurredMonth: "2026-11" }], new Date("2026-10-31T21:00:00Z"))).toBe("ok");
  });

  it("VR-15: an auction needs its title brand", () => {
    const auction = { type: "auction", placeId: PLACE, occurredMonth: "2026-05", auctionHouse: "Copart" };
    expect(issues([{ ...auction, titleBrand: "clean" }])).toBe("ok");
    expect(issues([auction])).toStrictEqual({ "milestones.0.titleBrand": [{ key: "validation.titleBrand" }] });
    expect(issues([{ ...auction, titleBrand: "" }])).toStrictEqual({
      "milestones.0.titleBrand": [{ key: "validation.titleBrand" }],
    });
  });

  it("keeps notes and the auction house to their lengths", () => {
    expect(issues([{ ...MILESTONE, noteEn: "N".repeat(240) }])).toBe("ok");
    expect(issues([{ ...MILESTONE, type: "auction", titleBrand: "salvage", auctionHouse: "A".repeat(60) }])).toBe("ok");
    expect(issues([{ ...MILESTONE, noteEn: "N".repeat(241) }])).toStrictEqual({
      "milestones.0.noteEn": [{ key: "validation.maxChars", values: { max: 240 } }],
    });
    expect(
      issues([{ ...MILESTONE, type: "auction", titleBrand: "salvage", auctionHouse: "A".repeat(61) }]),
    ).toStrictEqual({
      "milestones.0.auctionHouse": [{ key: "validation.maxChars", values: { max: 60 } }],
    });
  });
});

describe("a custom place", () => {
  const PLACE_INPUT = { nameAr: "مستودع العقبة", nameEn: "Aqaba warehouse", lat: 29.5267, lng: 35.0078 };

  it("takes names and coordinates, or names alone", () => {
    expect(validate(customPlaceSchema, PLACE_INPUT)).toStrictEqual({ ok: true, data: PLACE_INPUT });
    expect(validate(customPlaceSchema, { ...PLACE_INPUT, lat: null, lng: null })).toMatchObject({ ok: true });
  });

  it("VR-23: coordinates within range, both or neither", () => {
    expect(validate(customPlaceSchema, { ...PLACE_INPUT, lat: 91 })).toStrictEqual({
      ok: false,
      fieldErrors: { lat: [{ key: "validation.coordinates" }] },
    });
    expect(validate(customPlaceSchema, { ...PLACE_INPUT, lng: null })).toStrictEqual({
      ok: false,
      fieldErrors: { lng: [{ key: "validation.coordinates" }] },
    });
  });

  it("needs both names, as the place table keeps both", () => {
    expect(validate(customPlaceSchema, { ...PLACE_INPUT, nameAr: "" })).toStrictEqual({
      ok: false,
      fieldErrors: { nameAr: [{ key: "validation.required" }] },
    });
  });

  it("keeps each name to 80 characters, as the place table does (ENT-Place)", () => {
    for (const name of ["nameAr", "nameEn"]) {
      expect(validate(customPlaceSchema, { ...PLACE_INPUT, [name]: "P".repeat(80) }), name).toStrictEqual({
        ok: true,
        data: { ...PLACE_INPUT, [name]: "P".repeat(80) },
      });
      expect(validate(customPlaceSchema, { ...PLACE_INPUT, [name]: "P".repeat(81) }), name).toStrictEqual({
        ok: false,
        fieldErrors: { [name]: [{ key: "validation.maxChars", values: { max: 80 } }] },
      });
    }
  });
});
