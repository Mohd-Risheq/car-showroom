import "server-only";
import { REEL } from "@/features/reel/domain/support";
import { DEV_UPLOAD_PART_BYTES, MP4_ID_BYTES } from "./report";

// Which parts of an MP4 upload the report route takes, and how the first one must start. The spike
// pages load ./report to send theirs, so the reel's limits stay out of it and out of every page
// bundle, which server-only enforces.

/** How far past the reel's 20 MB cap an MP4 may go, a fifth more, so an oversized reel still arrives to be measured */
const OVER_CAP_ALLOWANCE_BYTES = REEL.maxBytes / 5;

/** The largest MP4 the route takes */
export const DEV_MP4_MAX_BYTES = REEL.maxBytes + OVER_CAP_ALLOWANCE_BYTES;

// Every MP4 starts with an ftyp box: the box's 4-byte size, then its type
const BOX_SIZE_BYTES = 4;
const FTYP = "ftyp";
const FTYP_HEADER_BYTES = BOX_SIZE_BYTES + FTYP.length;

const MP4_ID = new RegExp(`^[0-9a-f]{${MP4_ID_BYTES * 2}}$`);

/** One part of an MP4 upload, as its query string gives it */
export type Mp4Part = { id: string; offset: number; total: number; length: number };

/** The part a query string asks the MP4 route to take, or undefined for one it refuses */
export function mp4PartOf(query: URLSearchParams): Mp4Part | undefined {
  const id = query.get("id");
  const offset = wholeNumber(query.get("offset"));
  const total = wholeNumber(query.get("total"));
  if (id === null || !MP4_ID.test(id) || offset === undefined || total === undefined) return undefined;
  // The file holds at least an ftyp box header, and each part starts on a part boundary inside it
  if (
    total < FTYP_HEADER_BYTES ||
    total > DEV_MP4_MAX_BYTES ||
    offset >= total ||
    offset % DEV_UPLOAD_PART_BYTES !== 0
  ) {
    return undefined;
  }
  return { id, offset, total, length: Math.min(DEV_UPLOAD_PART_BYTES, total - offset) };
}

/** Whether the bytes start with an ftyp box header, as the first part of every MP4 does */
export function isMp4Start(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(BOX_SIZE_BYTES, FTYP_HEADER_BYTES)) === FTYP;
}

/**
 * Digits only, so a missing value, "0x10", "1e3" and "-0" are refused. A number too long to be
 * exact is past the cap, so mp4PartOf refuses it as a total, and as an offset at or past the total.
 */
function wholeNumber(text: string | null): number | undefined {
  return text !== null && /^\d+$/.test(text) ? Number(text) : undefined;
}
