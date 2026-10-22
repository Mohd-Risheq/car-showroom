import type { MediaType } from "./rules";

// Container checks for an uploaded file, without decoding pixels (API-17, FR-32.2a, SEC-08).
// Every truncated or malformed file is a rejection, never an exception.

export type InspectFailure = { ok: false; code: "METADATA_PRESENT" | "VALIDATION_ERROR"; reason: string };
export type InspectResult =
  { ok: true; width: number; height: number } | { ok: true; durationMs: number } | { ok: true } | InspectFailure;

type Size = { width: number; height: number };

const metadata = (reason: string): InspectFailure => ({ ok: false, code: "METADATA_PRESENT", reason });
const malformed = (reason: string): InspectFailure => ({ ok: false, code: "VALIDATION_ERROR", reason });

export function inspectMedia(bytes: Uint8Array, type: MediaType): InspectResult {
  try {
    switch (type) {
      case "image/jpeg":
        return inspectJpeg(bytes);
      case "image/webp":
        return inspectWebp(bytes);
      case "image/png":
        return inspectPng(bytes);
      case "audio/wav":
        return inspectWav(bytes);
      case "application/pdf":
        return ascii(bytes, 0, 5) === "%PDF-" ? { ok: true } : malformed("pdf.magic");
    }
  } catch (error) {
    // A read past the end of the file. Anything else is a bug, never a rejection.
    if (error instanceof RangeError) return malformed("truncated");
    throw error;
  }
}

function byteAt(b: Uint8Array, i: number): number {
  const value = b[i];
  if (value === undefined) throw new RangeError("read past the end");
  return value;
}

const u16be = (b: Uint8Array, i: number) => (byteAt(b, i) << 8) | byteAt(b, i + 1);
const u16le = (b: Uint8Array, i: number) => byteAt(b, i) | (byteAt(b, i + 1) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | (byteAt(b, i + 2) << 16);
const u32le = (b: Uint8Array, i: number) => (u24le(b, i) | (byteAt(b, i + 3) << 24)) >>> 0;
const u32be = (b: Uint8Array, i: number) => ((u16be(b, i) << 16) | u16be(b, i + 2)) >>> 0;

function ascii(b: Uint8Array, i: number, length: number): string {
  let text = "";
  for (let k = 0; k < length; k++) text += String.fromCharCode(byteAt(b, i + k));
  return text;
}

// JPEG marker codes, the byte after 0xFF (ITU-T T.81, table B.1)
const MARKER_PREFIX = 0xff;
const JPEG = {
  STUFFED: 0x00, // a data byte 0xFF inside a scan, not a marker
  TEM: 0x01,
  SOF0: 0xc0, // baseline DCT
  SOF1: 0xc1, // extended sequential DCT
  SOF2: 0xc2, // progressive DCT
  DHT: 0xc4,
  RST0: 0xd0,
  RST7: 0xd7,
  SOI: 0xd8,
  EOI: 0xd9,
  SOS: 0xda,
  DQT: 0xdb,
  DRI: 0xdd,
  APP0: 0xe0,
  APP1: 0xe1, // Exif and XMP
  APP2: 0xe2,
  APP13: 0xed, // Photoshop IPTC
  APP14: 0xee,
  APP15: 0xef,
  COM: 0xfe,
} as const;

// JPEG: every marker segment, skipping scan data, and nothing after EOI. A canvas encoder writes
// JFIF (APP0, no thumbnail), an ICC profile (APP2) and Adobe (APP14) segments at most.
function inspectJpeg(b: Uint8Array): InspectResult {
  if (byteAt(b, 0) !== MARKER_PREFIX || byteAt(b, 1) !== JPEG.SOI || byteAt(b, 2) !== MARKER_PREFIX)
    return malformed("jpeg.magic");
  let i = 2;
  let size: Size | undefined;
  let scanned = false;
  for (;;) {
    if (byteAt(b, i) !== MARKER_PREFIX) return malformed("jpeg.marker");
    while (byteAt(b, i) === MARKER_PREFIX) i++; // fill bytes before a marker
    const marker = byteAt(b, i++);
    if (marker === JPEG.EOI) {
      if (!size || !scanned) return malformed("jpeg.no-image");
      return i === b.length ? { ok: true, ...size } : metadata("jpeg.trailing-data");
    }
    // Markers without a length: none of them belongs here
    if (marker === JPEG.STUFFED || marker === JPEG.TEM || (marker >= JPEG.RST0 && marker <= JPEG.SOI))
      return malformed("jpeg.marker");
    const end = i + u16be(b, i);
    const data = i + 2;
    if (end < data || end > b.length) return malformed("jpeg.length");
    if (marker === JPEG.APP1) return metadata("jpeg.app1");
    if (marker === JPEG.APP13) return metadata("jpeg.app13");
    if (marker === JPEG.COM) return metadata("jpeg.com");
    if (marker >= JPEG.APP0 && marker <= JPEG.APP15) {
      const reason = appSegmentProblem(b, marker, data, end);
      if (reason) return metadata(reason);
    } else if (marker === JPEG.SOF0 || marker === JPEG.SOF1 || marker === JPEG.SOF2) {
      // Baseline, extended or progressive DCT: precision, height, width, component count
      if (size) return malformed("jpeg.second-frame");
      if (end - data < 6) return malformed("jpeg.sof");
      size = { height: u16be(b, data + 1), width: u16be(b, data + 3) };
      if (!size.width || !size.height) return malformed("jpeg.size");
    } else if (marker === JPEG.SOS) {
      if (!size) return malformed("jpeg.scan-before-frame");
      i = nextMarkerAfterScan(b, end);
      scanned = true;
      continue;
    } else if (marker !== JPEG.DHT && marker !== JPEG.DQT && marker !== JPEG.DRI) {
      // Only DHT, DQT and DRI remain allowed; lossless, arithmetic and hierarchical files are not
      return malformed("jpeg.segment");
    }
    i = end;
  }
}

function appSegmentProblem(b: Uint8Array, marker: number, data: number, end: number): string | undefined {
  const length = end - data;
  if (marker === JPEG.APP0) {
    // JFIF with a 0×0 thumbnail; a JFXX extension or a thumbnail could hold the uncropped photo
    const plainJfif =
      length === 14 && ascii(b, data, 5) === "JFIF\0" && byteAt(b, data + 12) === 0 && byteAt(b, data + 13) === 0;
    return plainJfif ? undefined : "jpeg.app0";
  }
  if (marker === JPEG.APP2) return length >= 12 && ascii(b, data, 12) === "ICC_PROFILE\0" ? undefined : "jpeg.app2";
  if (marker === JPEG.APP14) return length >= 5 && ascii(b, data, 5) === "Adobe" ? undefined : "jpeg.app14";
  return `jpeg.app${marker - JPEG.APP0}`;
}

// Entropy-coded data runs to the first 0xFF that is neither a stuffed 0xFF00 nor a restart marker
function nextMarkerAfterScan(b: Uint8Array, start: number): number {
  let i = start;
  for (;;) {
    i = b.indexOf(MARKER_PREFIX, i);
    if (i < 0) throw new RangeError("unterminated scan");
    const next = byteAt(b, i + 1);
    if (next !== JPEG.STUFFED && (next < JPEG.RST0 || next > JPEG.RST7)) return i;
    i += 2;
  }
}

// WebP: every RIFF chunk, the RIFF size equal to the file size, and only image chunks
const WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP"]);
const VP8X_ICC = 0x20;
const VP8X_ALPHA = 0x10;
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;
const VP8X_ANIMATION = 0x02;

function inspectWebp(b: Uint8Array): InspectResult {
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return malformed("webp.magic");
  if (u32le(b, 4) + 8 !== b.length) return malformed("webp.riff-size");
  const seen: string[] = [];
  let canvas: Size | undefined;
  let frame: Size | undefined;
  let flags = 0;
  for (let i = 12; i < b.length;) {
    const fourcc = ascii(b, i, 4);
    const length = u32le(b, i + 4);
    const data = i + 8;
    const next = data + length + (length % 2);
    if (next > b.length) return malformed("webp.truncated");
    if (fourcc === "EXIF" || fourcc === "XMP ") return metadata(`webp.${fourcc.trim().toLowerCase()}`);
    if (!WEBP_CHUNKS.has(fourcc)) return metadata("webp.chunk");
    if (seen.includes(fourcc) || frame) return malformed("webp.order");
    if (fourcc === "VP8X") {
      if (seen.length > 0 || length !== 10) return malformed("webp.vp8x");
      flags = byteAt(b, data);
      if (flags & (VP8X_EXIF | VP8X_XMP)) return metadata("webp.vp8x-metadata");
      if (flags & VP8X_ANIMATION) return malformed("webp.animation");
      canvas = { width: 1 + u24le(b, data + 4), height: 1 + u24le(b, data + 7) };
    } else if (fourcc === "ICCP") {
      if (!canvas || !(flags & VP8X_ICC) || seen.length !== 1) return malformed("webp.iccp");
    } else if (fourcc === "ALPH") {
      if (!canvas || !(flags & VP8X_ALPHA)) return malformed("webp.alph");
    } else {
      frame = fourcc === "VP8 " ? vp8Size(b, data, length) : vp8lSize(b, data, length);
      if (!frame) return malformed("webp.bitstream");
      if (fourcc === "VP8L" && seen.includes("ALPH")) return malformed("webp.alph");
    }
    seen.push(fourcc);
    i = next;
  }
  if (!frame) return malformed("webp.no-image");
  if (canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) return malformed("webp.canvas");
  return { ok: true, ...frame };
}

// A lossy key frame: frame tag, start code 9D 01 2A, then 14-bit width and height
function vp8Size(b: Uint8Array, data: number, length: number): Size | undefined {
  if (length < 10 || byteAt(b, data) & 0x01) return undefined;
  if (byteAt(b, data + 3) !== 0x9d || byteAt(b, data + 4) !== 0x01 || byteAt(b, data + 5) !== 0x2a) return undefined;
  const size = { width: u16le(b, data + 6) & 0x3fff, height: u16le(b, data + 8) & 0x3fff };
  return size.width && size.height ? size : undefined;
}

// A lossless header: signature 0x2F, then width - 1 and height - 1 in 14 bits each, version 0
function vp8lSize(b: Uint8Array, data: number, length: number): Size | undefined {
  if (length < 5 || byteAt(b, data) !== 0x2f) return undefined;
  const bits = u32le(b, data + 1);
  if (bits >>> 29 !== 0) return undefined;
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

// PNG (logos, blueprints, report images): every chunk, IEND at the end of the file. The text
// and EXIF chunks are named by API-17; other chunks a canvas encoder never writes are refused too.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_METADATA_CHUNKS = new Set(["eXIf", "iTXt", "tEXt", "zTXt"]);
const PNG_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "cHRM",
  "gAMA",
  "iCCP",
  "sBIT",
  "sRGB",
  "cICP",
  "mDCV",
  "cLLI",
  "bKGD",
  "pHYs",
]);

function inspectPng(b: Uint8Array): InspectResult {
  if (!PNG_SIGNATURE.every((value, k) => byteAt(b, k) === value)) return malformed("png.magic");
  let size: Size | undefined;
  let hasData = false;
  for (let i = 8; ;) {
    const length = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    const next = i + 12 + length; // length, type, data, CRC
    if (next > b.length) return malformed("png.truncated");
    if ((i === 8) !== (type === "IHDR")) return malformed("png.ihdr");
    if (PNG_METADATA_CHUNKS.has(type)) return metadata(`png.${type}`);
    if (!PNG_CHUNKS.has(type)) return metadata("png.chunk");
    if (type === "IHDR") {
      if (length !== 13) return malformed("png.ihdr");
      size = { width: u32be(b, i + 8), height: u32be(b, i + 12) };
      if (!size.width || !size.height) return malformed("png.size");
    } else if (type === "IDAT") {
      hasData = true;
    } else if (type === "IEND") {
      if (length !== 0 || !size || !hasData) return malformed("png.iend");
      return next === b.length ? { ok: true, ...size } : metadata("png.trailing-data");
    }
    i = next;
  }
}

// WAV from the audio pipeline: a "fmt " chunk in BR-19's format, then a "data" chunk that ends
// the file, at most 30 s long (FR-39.2). Any other chunk may carry metadata.
export const WAV_FORMAT = { pcm: 1, channels: 1, sampleRate: 22_050, bitsPerSample: 16 } as const;
const WAV_BLOCK_ALIGN = WAV_FORMAT.channels * (WAV_FORMAT.bitsPerSample / 8);
const WAV_BYTES_PER_SECOND = WAV_FORMAT.sampleRate * WAV_BLOCK_ALIGN;
const WAV_MAX_SECONDS = 30;

function inspectWav(b: Uint8Array): InspectResult {
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WAVE") return malformed("wav.magic");
  if (u32le(b, 4) + 8 !== b.length) return malformed("wav.riff-size");
  let format = false;
  for (let i = 12; i < b.length;) {
    const id = ascii(b, i, 4);
    const length = u32le(b, i + 4);
    const data = i + 8;
    if (id === "fmt ") {
      if (format || length !== 16) return malformed("wav.fmt");
      const pcm =
        u16le(b, data) === WAV_FORMAT.pcm &&
        u16le(b, data + 2) === WAV_FORMAT.channels &&
        u32le(b, data + 4) === WAV_FORMAT.sampleRate;
      const layout =
        u32le(b, data + 8) === WAV_BYTES_PER_SECOND &&
        u16le(b, data + 12) === WAV_BLOCK_ALIGN &&
        u16le(b, data + 14) === WAV_FORMAT.bitsPerSample;
      if (!pcm || !layout) return malformed("wav.format");
      format = true;
    } else if (id === "data") {
      if (!format) return malformed("wav.order");
      if (data + length !== b.length || length % WAV_BLOCK_ALIGN !== 0) return malformed("wav.data-size");
      if (length > WAV_MAX_SECONDS * WAV_BYTES_PER_SECOND) return malformed("wav.duration");
      return { ok: true, durationMs: Math.round((length / WAV_BYTES_PER_SECOND) * 1000) };
    } else {
      return metadata("wav.chunk");
    }
    i = data + length + (length % 2);
  }
  return malformed("wav.no-data");
}
