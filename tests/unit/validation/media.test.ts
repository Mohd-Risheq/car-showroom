import { describe, expect, it } from "vitest";
import { registerMediaSchema, uploadClientPayloadSchema, uploadTokenRequestSchema } from "@/lib/validation/media";

// The upload's requests (API-16, API-17): ids read in lower case, as every id is (D-043)

const CAR = "0190A1B2-C3D4-7E5F-8A9B-0C1D2E3F4A5B";
// A client makes its upload ids with crypto.randomUUID(), a version 4 UUID
const UPLOAD = "6F1C2D3E-4A5B-4C6D-8E7F-9A0B1C2D3E4F";

describe("an upload's ids", () => {
  it("are read in lower case, so one id can't name two uploads", () => {
    expect(
      uploadClientPayloadSchema.parse({ carId: CAR, kind: "photo", clientUploadId: UPLOAD, variant: "960" }),
    ).toStrictEqual({ carId: CAR.toLowerCase(), kind: "photo", clientUploadId: UPLOAD.toLowerCase(), variant: "960" });
    expect(
      registerMediaSchema.parse({
        carId: CAR,
        kind: "photo",
        clientUploadId: UPLOAD,
        variants: { "960": "https://store.example/cars/a/photo/b-960.webp" },
      }),
    ).toMatchObject({ carId: CAR.toLowerCase(), clientUploadId: UPLOAD.toLowerCase() });
  });

  it("are refused when they aren't UUIDs", () => {
    expect(
      uploadClientPayloadSchema.safeParse({ carId: "car-1", kind: "photo", clientUploadId: UPLOAD, variant: "960" })
        .success,
    ).toBe(false);
    expect(
      registerMediaSchema.safeParse({ carId: CAR, kind: "photo", clientUploadId: "upload-1", variants: {} }).success,
    ).toBe(false);
  });
});

describe("an upload's requests", () => {
  const PAYLOAD = { carId: CAR, kind: "photo", clientUploadId: UPLOAD, variant: "960" };
  const tokenRequest = (fields: object) =>
    uploadTokenRequestSchema.safeParse({
      type: "blob.generate-client-token",
      payload: { pathname: "cars/c/photo/u-960.webp", clientPayload: null, multipart: false, ...fields },
    }).success;
  const registered = (variants: object) =>
    registerMediaSchema.safeParse({ carId: CAR, kind: "photo", clientUploadId: UPLOAD, variants }).success;
  // A storage URL of the length given
  const url = (length: number) => `https://store.example/${"a".repeat(length - 22)}`;

  it("name a variant in up to 8 characters", () => {
    expect(uploadClientPayloadSchema.safeParse({ ...PAYLOAD, variant: "v".repeat(8) }).success).toBe(true);
    expect(uploadClientPayloadSchema.safeParse({ ...PAYLOAD, variant: "v".repeat(9) }).success).toBe(false);
    expect(registered({ ["v".repeat(8)]: url(60) })).toBe(true);
    expect(registered({ ["v".repeat(9)]: url(60) })).toBe(false);
  });

  it("keep a pathname to 1 to 950 characters, and the client payload to 1,000", () => {
    expect(tokenRequest({ pathname: "p" })).toBe(true);
    expect(tokenRequest({ pathname: "p".repeat(950) })).toBe(true);
    expect(tokenRequest({ pathname: "" })).toBe(false);
    expect(tokenRequest({ pathname: "p".repeat(951) })).toBe(false);
    expect(tokenRequest({ clientPayload: "c".repeat(1000) })).toBe(true);
    expect(tokenRequest({ clientPayload: "c".repeat(1001) })).toBe(false);
  });

  it("take an image's width and height from 1 pixel", () => {
    const sized = (size: object) =>
      registerMediaSchema.safeParse({ carId: CAR, kind: "photo", clientUploadId: UPLOAD, variants: {}, ...size })
        .success;
    expect(sized({ width: 1, height: 1 })).toBe(true);
    expect(sized({ width: 0 })).toBe(false);
    expect(sized({ height: 0 })).toBe(false);
  });

  it("keep a variant's URL to 2,048 characters", () => {
    expect(url(2048)).toHaveLength(2048);
    expect(registered({ "960": url(2048) })).toBe(true);
    expect(registered({ "960": url(2049) })).toBe(false);
  });
});
