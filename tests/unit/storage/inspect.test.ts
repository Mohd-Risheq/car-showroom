import { describe, expect, it } from "vitest";
import { inspectMedia } from "@/lib/storage/inspect";
import type { MediaType } from "@/lib/storage/rules";
import {
  EXIF_WITH_GPS,
  image,
  jfif,
  VP8X_ANIMATION,
  VP8X_FLAGS_OFFSET,
  wav,
  withJpegSegment,
  withPngChunk,
  withWebpChunk,
  XMP,
} from "../../support/media";
import { randomBelow, seededRandom } from "../../support/random";

// API-17 container checks and FR-32.2a metadata rejection (TC-32-2), on real encoder output

const latin1 = (text: string) => Buffer.from(text, "latin1");
const accepted = (width: number, height: number) => ({ ok: true, width, height });
const rejected = (code: "METADATA_PRESENT" | "VALIDATION_ERROR", reason: string) => ({ ok: false, code, reason });

describe("JPEG", () => {
  it("accepts baseline, progressive, ICC, JFIF and Adobe files", async () => {
    const baseline = await image(64, 48).jpeg({ quality: 82 }).toBuffer();
    expect(inspectMedia(baseline, "image/jpeg")).toEqual(accepted(64, 48));
    const progressive = await image(64, 48).jpeg({ progressive: true }).toBuffer();
    expect(inspectMedia(progressive, "image/jpeg")).toEqual(accepted(64, 48));
    const icc = await image(64, 48).withIccProfile("srgb").jpeg().toBuffer();
    expect(inspectMedia(icc, "image/jpeg")).toEqual(accepted(64, 48));
    expect(inspectMedia(withJpegSegment(baseline, 0xe0, jfif()), "image/jpeg")).toEqual(accepted(64, 48));
    const adobe = withJpegSegment(baseline, 0xee, latin1("Adobe\0\x64\0\0\0\0\x01"));
    expect(inspectMedia(adobe, "image/jpeg")).toEqual(accepted(64, 48));
  });

  it("rejects EXIF, GPS and XMP (APP1), IPTC (APP13) and comments", async () => {
    const exif = await image(64, 48).withExif(EXIF_WITH_GPS).jpeg().toBuffer();
    expect(inspectMedia(exif, "image/jpeg")).toEqual(rejected("METADATA_PRESENT", "jpeg.app1"));
    const xmp = await image(64, 48).withXmp(XMP).jpeg().toBuffer();
    expect(inspectMedia(xmp, "image/jpeg")).toEqual(rejected("METADATA_PRESENT", "jpeg.app1"));
    const clean = await image(64, 48).jpeg().toBuffer();
    const iptc = withJpegSegment(clean, 0xed, latin1("Photoshop 3.0\x008BIM"));
    expect(inspectMedia(iptc, "image/jpeg")).toEqual(rejected("METADATA_PRESENT", "jpeg.app13"));
    const comment = withJpegSegment(clean, 0xfe, latin1("taken at the showroom"));
    expect(inspectMedia(comment, "image/jpeg")).toEqual(rejected("METADATA_PRESENT", "jpeg.com"));
  });

  it("rejects thumbnails, extra pictures, other application segments and trailing data", async () => {
    const clean = await image(64, 48).jpeg().toBuffer();
    const cases: [Buffer, string][] = [
      [withJpegSegment(clean, 0xe0, jfif(2, 2)), "jpeg.app0"],
      [withJpegSegment(clean, 0xe0, latin1("JFXX\0\x13")), "jpeg.app0"],
      [withJpegSegment(clean, 0xe2, latin1("MPF\0II*\0")), "jpeg.app2"],
      [withJpegSegment(clean, 0xe3, latin1("Meta\0")), "jpeg.app3"],
      [withJpegSegment(clean, 0xef, latin1("Ducky\0")), "jpeg.app15"],
      [Buffer.concat([clean, latin1("hidden after the end")]), "jpeg.trailing-data"],
    ];
    for (const [file, reason] of cases) {
      expect(inspectMedia(file, "image/jpeg")).toEqual(rejected("METADATA_PRESENT", reason));
    }
  });

  it("rejects frame types no canvas encoder writes, and other formats", async () => {
    const clean = await image(64, 48).jpeg().toBuffer();
    const lossless = Buffer.from(clean);
    lossless[clean.indexOf(Buffer.from([0xff, 0xc0])) + 1] = 0xc3;
    expect(inspectMedia(lossless, "image/jpeg")).toEqual(rejected("VALIDATION_ERROR", "jpeg.segment"));
    const png = await image(64, 48).png().toBuffer();
    expect(inspectMedia(png, "image/jpeg")).toEqual(rejected("VALIDATION_ERROR", "jpeg.magic"));
  });
});

describe("WebP", () => {
  it("accepts lossy, lossless, alpha and ICC files", async () => {
    for (const file of [
      await image(64, 48).webp({ quality: 82 }).toBuffer(),
      await image(64, 48).webp({ lossless: true }).toBuffer(),
      await image(64, 48, 4).webp({ quality: 82 }).toBuffer(),
      await image(64, 48).withIccProfile("srgb").webp().toBuffer(),
    ]) {
      expect(inspectMedia(file, "image/webp")).toEqual(accepted(64, 48));
    }
  });

  it("rejects EXIF and XMP, by flag or by chunk", async () => {
    const exif = await image(64, 48).withExif(EXIF_WITH_GPS).webp().toBuffer();
    expect(inspectMedia(exif, "image/webp")).toEqual(rejected("METADATA_PRESENT", "webp.vp8x-metadata"));
    const xmp = await image(64, 48).withXmp(XMP).webp().toBuffer();
    expect(inspectMedia(xmp, "image/webp")).toEqual(rejected("METADATA_PRESENT", "webp.vp8x-metadata"));
    // The same files with the VP8X flags cleared still carry the chunks
    const unflagged = Buffer.from(exif);
    unflagged[VP8X_FLAGS_OFFSET] = 0;
    expect(inspectMedia(unflagged, "image/webp")).toEqual(rejected("METADATA_PRESENT", "webp.exif"));
    const unflaggedXmp = Buffer.from(xmp);
    unflaggedXmp[VP8X_FLAGS_OFFSET] = 0;
    expect(inspectMedia(unflaggedXmp, "image/webp")).toEqual(rejected("METADATA_PRESENT", "webp.xmp"));
  });

  it("rejects other chunks, a wrong RIFF size and animation", async () => {
    const lossy = await image(64, 48).webp({ quality: 82 }).toBuffer();
    const extra = withWebpChunk(lossy, "ABCD", latin1("hidden"));
    expect(inspectMedia(extra, "image/webp")).toEqual(rejected("METADATA_PRESENT", "webp.chunk"));
    const oversized = Buffer.concat([lossy, Buffer.alloc(2)]);
    expect(inspectMedia(oversized, "image/webp")).toEqual(rejected("VALIDATION_ERROR", "webp.riff-size"));
    const alpha = await image(64, 48, 4).webp({ quality: 82 }).toBuffer();
    const animated = Buffer.from(alpha);
    animated.writeUInt8(animated.readUInt8(VP8X_FLAGS_OFFSET) | VP8X_ANIMATION, VP8X_FLAGS_OFFSET);
    expect(inspectMedia(animated, "image/webp")).toEqual(rejected("VALIDATION_ERROR", "webp.animation"));
  });
});

describe("PNG", () => {
  it("accepts plain and ICC files", async () => {
    expect(inspectMedia(await image(64, 48).png().toBuffer(), "image/png")).toEqual(accepted(64, 48));
    const icc = await image(64, 48).withIccProfile("srgb").png().toBuffer();
    expect(inspectMedia(icc, "image/png")).toEqual(accepted(64, 48));
  });

  it("rejects eXIf and text chunks, other chunks and trailing data", async () => {
    const exif = await image(64, 48).withExif(EXIF_WITH_GPS).png().toBuffer();
    expect(inspectMedia(exif, "image/png")).toEqual(rejected("METADATA_PRESENT", "png.eXIf"));
    const xmp = await image(64, 48).withXmp(XMP).png().toBuffer();
    expect(inspectMedia(xmp, "image/png")).toEqual(rejected("METADATA_PRESENT", "png.zTXt"));
    const clean = await image(64, 48).png().toBuffer();
    const cases: [Buffer, string][] = [
      [withPngChunk(clean, "tEXt", latin1("Comment\0showroom")), "png.tEXt"],
      [withPngChunk(clean, "iTXt", latin1("Author\0\0\0\0\0Sami")), "png.iTXt"],
      [withPngChunk(clean, "tIME", Buffer.alloc(7)), "png.chunk"],
      [Buffer.concat([clean, latin1("hidden")]), "png.trailing-data"],
    ];
    for (const [file, reason] of cases) {
      expect(inspectMedia(file, "image/png")).toEqual(rejected("METADATA_PRESENT", reason));
    }
  });
});

describe("WAV", () => {
  it("accepts PCM mono 22,050 Hz 16-bit up to 30 s", () => {
    expect(inspectMedia(wav({ seconds: 1 }), "audio/wav")).toEqual({ ok: true, durationMs: 1000 });
    expect(inspectMedia(wav({ seconds: 30 }), "audio/wav")).toEqual({ ok: true, durationMs: 30000 });
  });

  it("rejects other formats, metadata chunks, a wrong data size and clips over 30 s", () => {
    expect(inspectMedia(wav({ channels: 2 }), "audio/wav")).toEqual(rejected("VALIDATION_ERROR", "wav.format"));
    expect(inspectMedia(wav({ sampleRate: 44100 }), "audio/wav")).toEqual(rejected("VALIDATION_ERROR", "wav.format"));
    expect(inspectMedia(wav({ bits: 8 }), "audio/wav")).toEqual(rejected("VALIDATION_ERROR", "wav.format"));
    const list = wav({ extra: ["LIST", latin1("INFOISFT\x05\0\0\0Lavf\0\0")] });
    expect(inspectMedia(list, "audio/wav")).toEqual(rejected("METADATA_PRESENT", "wav.chunk"));
    const short = wav();
    short.writeUInt32LE(short.readUInt32LE(40) - 2, 40); // the data chunk claims 2 bytes fewer
    expect(inspectMedia(short, "audio/wav")).toEqual(rejected("VALIDATION_ERROR", "wav.data-size"));
    expect(inspectMedia(wav({ seconds: 30.5 }), "audio/wav")).toEqual(rejected("VALIDATION_ERROR", "wav.duration"));
  });
});

describe("PDF", () => {
  it("checks the magic bytes only", () => {
    expect(inspectMedia(latin1("%PDF-1.7\n%..."), "application/pdf")).toEqual({ ok: true });
    expect(inspectMedia(latin1("<html>"), "application/pdf")).toEqual(rejected("VALIDATION_ERROR", "pdf.magic"));
  });
});

describe("damaged files", () => {
  // Every prefix of a file is rejected without an exception
  it("rejects every truncation", async () => {
    const files: [Buffer, MediaType][] = [
      [await image(32, 24).jpeg({ progressive: true }).toBuffer(), "image/jpeg"],
      [await image(32, 24, 4).withIccProfile("srgb").webp().toBuffer(), "image/webp"],
      [await image(32, 24).png().toBuffer(), "image/png"],
      [wav({ seconds: 0.01 }), "audio/wav"],
    ];
    for (const [file, type] of files) {
      for (let length = 0; length < file.length; length++) {
        expect(inspectMedia(file.subarray(0, length), type).ok).toBe(false);
      }
    }
  });

  // Random byte changes may leave a valid file, but never throw
  it("never throws on corrupted bytes", async () => {
    const files: [Buffer, MediaType][] = [
      [await image(32, 24).jpeg().toBuffer(), "image/jpeg"],
      [await image(32, 24).webp({ lossless: true }).toBuffer(), "image/webp"],
      [await image(32, 24).png().toBuffer(), "image/png"],
      [wav({ seconds: 0.01 }), "audio/wav"],
    ];
    const random = seededRandom(99);
    const values = new Set<number>();
    for (const [file, type] of files) {
      for (let round = 0; round < 2000; round++) {
        const damaged = Buffer.from(file);
        const value = randomBelow(random, 256);
        values.add(value);
        damaged[randomBelow(random, damaged.length)] = value;
        expect(() => inspectMedia(damaged, type)).not.toThrow();
      }
    }
    // Every byte value was written somewhere, so the parsers met every marker and odd length
    expect(values.size).toBe(256);
  });
});
