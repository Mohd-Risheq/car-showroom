import { describe, expect, it } from "vitest";
import { auditMetaSchema } from "@/lib/validation/audit";
import { validate } from "@/lib/validation/issues";
import { engineAudioSchema, expectedPathsSchema, mediaVariantsSchema, peaksSchema } from "@/lib/validation/media";
import { vinDecodePayloadSchema } from "@/lib/validation/vin-decode";

// The jsonb columns the system writes (SRS §6.2): each write parses, so what a reader finds has
// the shape its type promises

const ok = (schema: Parameters<typeof validate>[0], value: unknown) => validate(schema, value).ok;

describe("a media row's stored JSON", () => {
  it("holds at least one variant's URL, keyed by the variant's name", () => {
    expect(ok(mediaVariantsSchema, { "480": "https://store.example/cars/a/photo/b-480.webp" })).toBe(true);
    expect(ok(mediaVariantsSchema, { src: "/seed/cars/s01/sound/idle.wav" })).toBe(true);
    expect(ok(mediaVariantsSchema, {})).toBe(false);
    expect(ok(mediaVariantsSchema, { "480 px": "https://store.example/a.webp" })).toBe(false);
    expect(ok(mediaVariantsSchema, { "480": "" })).toBe(false);
    const url = (length: number) => `https://store.example/${"a".repeat(length - 22)}`;
    expect(ok(mediaVariantsSchema, { "480": url(2048) })).toBe(true);
    expect(ok(mediaVariantsSchema, { "480": url(2049) })).toBe(false);
    // The local store serves files from the site in development (D-022)
    expect(
      ok(mediaVariantsSchema, { "960": "http://localhost:3000/api/storage-local/files/cars/a/photo/b-960.webp" }),
    ).toBe(true);
    for (const location of ["//cdn.example/a.webp", "javascript:alert(1)", "data:image/webp;base64,AAAA", "a.webp"]) {
      expect(ok(mediaVariantsSchema, { "480": location }), location).toBe(false);
    }
  });

  it("holds a path on this site only where it opens on this site", () => {
    // A browser reads a backslash as a slash and drops a tab, so each of these opens another site
    const offSite = [String.raw`/\cdn.example/a.webp`, `/${String.fromCodePoint(9)}/cdn.example/a.webp`];
    for (const location of offSite) {
      expect(ok(mediaVariantsSchema, { "480": location }), JSON.stringify(location)).toBe(false);
    }
    // Nor does a host that doesn't parse throw
    expect(ok(mediaVariantsSchema, { "480": String.raw`/\[` })).toBe(false);
    expect(ok(mediaVariantsSchema, { src: "/seed/cars/s01/photos/front.webp" })).toBe(true);
  });

  it("holds the pathname API-16 signed for each variant", () => {
    expect(ok(expectedPathsSchema, { "960": "cars/c/photo/u-960.webp" })).toBe(true);
    expect(ok(expectedPathsSchema, { "960": "x" })).toBe(true);
    expect(ok(expectedPathsSchema, { "960": "x".repeat(950) })).toBe(true);
    expect(ok(expectedPathsSchema, { "960": "" })).toBe(false);
    expect(ok(expectedPathsSchema, { "960": "x".repeat(951) })).toBe(false);
  });

  it("holds 200 peaks from 0 to 1 (BR-19)", () => {
    expect(
      ok(
        peaksSchema,
        Array.from({ length: 200 }, (_, index) => index / 199),
      ),
    ).toBe(true);
    expect(
      ok(
        peaksSchema,
        Array.from({ length: 199 }, () => 0.5),
      ),
    ).toBe(false);
    expect(
      ok(
        peaksSchema,
        Array.from({ length: 200 }, () => 1.5),
      ),
    ).toBe(false);
    for (const wrong of [-5e-324, 1.0000000000000002]) {
      expect(
        validate(
          peaksSchema,
          Array.from({ length: 200 }, (_, index) => (index === 0 ? wrong : 0.5)),
        ),
        String(wrong),
      ).toStrictEqual({ ok: false, fieldErrors: { "0": [{ key: "validation.invalid" }] } });
    }
  });

  it("VR-16: engine audio of 5 to 30 seconds, with where it was recorded (FR-39.8)", () => {
    const clip = { durationMs: 12_000, audioSource: "this_car", audioClipType: "idle" };
    expect(validate(engineAudioSchema, clip)).toStrictEqual({ ok: true, data: clip });
    for (const durationMs of [5000, 30_000]) {
      expect(validate(engineAudioSchema, { ...clip, durationMs })).toStrictEqual({
        ok: true,
        data: { ...clip, durationMs },
      });
    }
    for (const durationMs of [4999, 30_001]) {
      expect(validate(engineAudioSchema, { ...clip, durationMs })).toStrictEqual({
        ok: false,
        fieldErrors: { durationMs: [{ key: "validation.audioLength" }] },
      });
    }
    expect(validate(engineAudioSchema, { ...clip, audioSource: undefined })).toStrictEqual({
      ok: false,
      fieldErrors: { audioSource: [{ key: "validation.audioSource" }] },
    });
  });
});

describe("a VIN decode's cached payload", () => {
  const payload = {
    make: "TOYOTA",
    makeKey: "toyota",
    model: "Camry",
    modelKey: "toyota-camry",
    year: 2019,
    bodyType: "sedan",
    fuelType: "gasoline",
    engineCc: 2487,
    driveType: "fwd",
    transmission: null,
    plant: { city: "GEORGETOWN", state: "KENTUCKY", country: "UNITED STATES (USA)" },
  };

  it("holds API-22's mapped fields, each of which may be unknown", () => {
    expect(validate(vinDecodePayloadSchema, payload)).toStrictEqual({ ok: true, data: payload });
    const unknown = Object.fromEntries(Object.keys(payload).map((key) => [key, null]));
    expect(ok(vinDecodePayloadSchema, { ...unknown, plant: { city: null, state: null, country: null } })).toBe(true);
  });

  it("keeps a name to 100 characters, an engine's size from 0 and a year from 1", () => {
    expect(ok(vinDecodePayloadSchema, { ...payload, model: "M".repeat(100) })).toBe(true);
    expect(ok(vinDecodePayloadSchema, { ...payload, model: "M".repeat(101) })).toBe(false);
    expect(ok(vinDecodePayloadSchema, { ...payload, engineCc: 0 })).toBe(true);
    expect(ok(vinDecodePayloadSchema, { ...payload, engineCc: -1 })).toBe(false);
    expect(ok(vinDecodePayloadSchema, { ...payload, year: 1 })).toBe(true);
    expect(ok(vinDecodePayloadSchema, { ...payload, year: 0 })).toBe(false);
  });

  it("refuses a value outside the enums, and a field the mapping never writes", () => {
    expect(ok(vinDecodePayloadSchema, { ...payload, bodyType: "Sedan/Saloon" })).toBe(false);
    expect(validate(vinDecodePayloadSchema, { ...payload, errorText: "0" })).toStrictEqual({ ok: true, data: payload });
  });

  it("keeps the upstream's names clean of what is no text, which jsonb would refuse (SEC-13)", () => {
    const char = (codePoint: number) => String.fromCodePoint(codePoint);
    const answer = {
      ...payload,
      make: `TOYOTA${char(0)}`,
      model: `Cam${char(0xd800)}ry`,
      plant: { city: `GEORGE${char(0x202e)}TOWN${char(10)}`, state: " KENTUCKY ", country: char(0x2066) },
    };
    expect(validate(vinDecodePayloadSchema, answer)).toStrictEqual({
      ok: true,
      data: { ...payload, plant: { ...payload.plant, country: null } },
    });
  });
});

describe("an audit row's details", () => {
  it("hold JSON values under names of 1 to 40 characters (D-043)", () => {
    expect(ok(auditMetaSchema, { carsDeleted: 3, sessions: ["a"], dryRun: false, note: null })).toBe(true);
    expect(ok(auditMetaSchema, {})).toBe(true);
    expect(ok(auditMetaSchema, { "": 1 })).toBe(false);
    expect(ok(auditMetaSchema, { n: 1 })).toBe(true);
    expect(ok(auditMetaSchema, { ["n".repeat(40)]: 1 })).toBe(true);
    expect(ok(auditMetaSchema, { ["n".repeat(41)]: 1 })).toBe(false);
    expect(ok(auditMetaSchema, { when: new Date() })).toBe(false);
  });
});
