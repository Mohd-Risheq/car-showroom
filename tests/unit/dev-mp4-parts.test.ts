import { describe, expect, it } from "vitest";
import { DEV_MP4_MAX_BYTES, isMp4Start, mp4PartOf } from "@/app/_dev/mp4-parts";
import { DEV_UPLOAD_PART_BYTES } from "@/app/_dev/report";
import { REEL } from "@/features/reel/domain/support";

// Which parts of an MP4 upload the report route takes, as their query strings give them, and how
// the first part must start

const PART = DEV_UPLOAD_PART_BYTES;

describe("mp4PartOf", () => {
  const ID = "0123456789ab";
  const query = (fields: Record<string, string>) => new URLSearchParams(fields);

  it("takes the first part of a small file whole", () => {
    expect(mp4PartOf(query({ id: ID, offset: "0", total: "16" }))).toStrictEqual({
      id: ID,
      offset: 0,
      total: 16,
      length: 16,
    });
  });

  it("takes a file as small as an ftyp box header", () => {
    expect(mp4PartOf(query({ id: ID, offset: "0", total: "8" }))?.length).toBe(8);
  });

  it("expects a full part except at the end", () => {
    const total = String(2 * PART + 5);
    expect(mp4PartOf(query({ id: ID, offset: String(PART), total }))?.length).toBe(PART);
    expect(mp4PartOf(query({ id: ID, offset: String(2 * PART), total }))?.length).toBe(5);
  });

  it("takes files up to its cap, above the reel's own", () => {
    expect(DEV_MP4_MAX_BYTES).toBeGreaterThan(REEL.maxBytes);
    expect(Number.isSafeInteger(DEV_MP4_MAX_BYTES)).toBe(true);
    expect(mp4PartOf(query({ id: ID, offset: "0", total: String(DEV_MP4_MAX_BYTES) }))).toBeDefined();
    expect(mp4PartOf(query({ id: ID, offset: "0", total: String(DEV_MP4_MAX_BYTES + 1) }))).toBeUndefined();
  });

  it.each([
    ["no offset", { id: ID, total: "16" }],
    ["an empty offset", { id: ID, offset: "", total: "16" }],
    ["a hexadecimal offset", { id: ID, offset: "0x0", total: "16" }],
    ["an exponent", { id: ID, offset: "0", total: "1e3" }],
    ["a sign", { id: ID, offset: "-0", total: "16" }],
    ["a decimal point", { id: ID, offset: "0.0", total: "16" }],
    ["a space", { id: ID, offset: " 0", total: "16" }],
    ["no total", { id: ID, offset: "0" }],
    ["a total too small for an ftyp box", { id: ID, offset: "0", total: "7" }],
    ["an offset off a part boundary", { id: ID, offset: "1", total: "16" }],
    ["an offset at the end", { id: ID, offset: String(PART), total: String(PART) }],
    ["no id", { offset: "0", total: "16" }],
    ["a short id", { id: "0123456789a", offset: "0", total: "16" }],
    ["an id in capitals", { id: "0123456789AB", offset: "0", total: "16" }],
    ["an id with a path", { id: "../../x/y/z", offset: "0", total: "16" }],
  ])("refuses %s", (_case, fields) => {
    expect(mp4PartOf(query(fields))).toBeUndefined();
  });
});

describe("isMp4Start", () => {
  // A box header: its size, then its type, here followed by the start of an ftyp box's brand
  const box = (type: string) => new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode(`${type}isom`)]);

  it("takes bytes that start with an ftyp box header", () => {
    expect(isMp4Start(box("ftyp"))).toBe(true);
    expect(isMp4Start(box("ftyp").subarray(0, 8))).toBe(true);
  });

  it.each([
    ["another box first", box("moov")],
    ["the type where the size goes", new TextEncoder().encode("ftypisom")],
    ["fewer bytes than the header", box("ftyp").subarray(0, 7)],
    ["no bytes", new Uint8Array(0)],
  ])("refuses %s", (_case, bytes) => {
    expect(isMp4Start(bytes)).toBe(false);
  });
});
