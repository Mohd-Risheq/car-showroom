import { crc32 } from "node:zlib";
import sharp from "sharp";

// Media fixtures for the T-03 storage tests: real encoder output from sharp, plus byte-level
// edits for the segments and chunks a canvas encoder never writes.

// Seeded xorshift noise, so file sizes repeat from run to run
export function noise(width: number, height: number, channels: 3 | 4 = 3, seed = 7): Buffer {
  const pixels = Buffer.alloc(width * height * channels);
  let x = seed;
  for (let i = 0; i < pixels.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    pixels[i] = x & 255;
  }
  return pixels;
}

export function image(width: number, height: number, channels: 3 | 4 = 3) {
  return sharp(noise(width, height, channels), { raw: { width, height, channels } });
}

// A flat colour: real encoder output that stays far below every cap
export function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 122, g: 140, b: 68 } } });
}

export const EXIF_WITH_GPS = {
  IFD0: { Copyright: "Muftah test" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "31/1 57/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "35/1 55/1 0/1" },
};

export const XMP =
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>';

// Inserts a marker segment right after SOI
export function withJpegSegment(jpeg: Buffer, marker: number, payload: Buffer): Buffer {
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

// A JFIF APP0 payload, with an RGB thumbnail when the size is not 0
export function jfif(thumbnailWidth = 0, thumbnailHeight = 0): Buffer {
  const payload = Buffer.alloc(14 + 3 * thumbnailWidth * thumbnailHeight);
  payload.write("JFIF\0", 0, "latin1");
  payload.writeUInt16BE(0x0101, 5);
  payload.writeUInt16BE(1, 8);
  payload.writeUInt16BE(1, 10);
  payload[12] = thumbnailWidth;
  payload[13] = thumbnailHeight;
  return payload;
}

function riffChunk(id: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, "latin1");
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, Buffer.alloc(data.length % 2)]);
}

/** A WebP's VP8X flags byte: after the 12-byte RIFF header and the chunk's own 8-byte header */
export const VP8X_FLAGS_OFFSET = 20;
/** The VP8X flag that marks an animated WebP */
export const VP8X_ANIMATION = 0x02;

// Appends a chunk and corrects the RIFF size
export function withWebpChunk(webp: Buffer, fourcc: string, data: Buffer): Buffer {
  const file = Buffer.concat([webp, riffChunk(fourcc, data)]);
  file.writeUInt32LE(file.length - 8, 4);
  return file;
}

// Inserts a chunk, with its CRC, before IEND
export function withPngChunk(png: Buffer, type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "latin1");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  const iend = png.length - 12;
  return Buffer.concat([png.subarray(0, iend), chunk, png.subarray(iend)]);
}

// Silence in the audio pipeline's format (PCM, mono, 22,050 Hz, 16-bit) unless overridden
export function wav(
  options: { seconds?: number; sampleRate?: number; channels?: number; bits?: number; extra?: [string, Buffer] } = {},
): Buffer {
  const { seconds = 1, sampleRate = 22050, channels = 1, bits = 16 } = options;
  const blockAlign = channels * (bits / 8);
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * blockAlign, 8);
  fmt.writeUInt16LE(blockAlign, 12);
  fmt.writeUInt16LE(bits, 14);
  const chunks = [
    riffChunk("fmt ", fmt),
    ...(options.extra ? [riffChunk(...options.extra)] : []),
    riffChunk("data", Buffer.alloc(Math.round(seconds * sampleRate) * blockAlign)),
  ];
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), ...chunks]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
