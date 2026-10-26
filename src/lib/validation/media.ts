import { AUDIO_CLIP_TYPES, AUDIO_SOURCES } from "../db/enums.ts";
import { MEDIA_KINDS } from "../storage/rules.ts";
import { AUDIO_DURATION_MS, PEAKS_COUNT } from "./bounds.ts";
import { integer, recordId } from "./fields.ts";
import { z } from "./zod.ts";

// The media schemas (SRS §7.1, SEC-13): the upload's requests, and the JSON a media row keeps

// The client payload of an upload token request (API-16). Its ids are read in lower case, as every
// id is, so one id can't name two uploads.
export const uploadClientPayloadSchema = z.object({
  carId: recordId(),
  kind: z.enum(MEDIA_KINDS),
  clientUploadId: recordId(),
  variant: z.string().max(8),
});

export type UploadClientPayload = z.infer<typeof uploadClientPayloadSchema>;

// The token request the storage client library sends to API-16. Upload-completed callbacks
// are not used, so no other event type is accepted.
export const uploadTokenRequestSchema = z.object({
  type: z.literal("blob.generate-client-token"),
  payload: z.object({
    pathname: z.string().min(1).max(950),
    clientPayload: z.string().max(1000).nullable(),
    multipart: z.literal(false),
  }),
});

// API-17 input, as far as T-03's storage checks go. T-32 adds the group, alt text, colour,
// placeholder and audio fields.
export const registerMediaSchema = z.object({
  carId: recordId(),
  kind: z.enum(MEDIA_KINDS),
  clientUploadId: recordId(),
  variants: z.record(z.string().max(8), z.url().max(2048)),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type RegisterMediaInput = z.infer<typeof registerMediaSchema>;

// A variant's name: a width such as 960, or src for a kind with one file (BR-20)
const variantName = z.string().regex(/^[0-9a-z]{1,8}$/);

// A stand-in for this site's origin to resolve a path against: .invalid names no real host (RFC 2606)
const SITE = "https://site.invalid";

/** Where a variant is served: a storage URL, or a path on this site for the seed's own files */
function isServedAt(location: string): boolean {
  try {
    // Resolved as a browser would, which reads /\host and /<tab>/host as //host, another site
    if (location.startsWith("/")) return new URL(location, SITE).origin === SITE;
    const { protocol } = new URL(location);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** media.variants: at least one variant, each where it is served */
export const mediaVariantsSchema = z
  .record(
    variantName,
    z
      .string()
      .max(2048)
      .refine((location) => isServedAt(location)),
  )
  .refine((variants) => Object.keys(variants).length > 0);

/** media.expected_paths: the pathname API-16 signed for each variant */
export const expectedPathsSchema = z.record(variantName, z.string().min(1).max(950));

/** media.peaks: the clip's 200 peaks, each from 0 to 1 (BR-19) */
export const peaksSchema = z.array(z.number().min(0).max(1)).length(PEAKS_COUNT);

/** An engine clip's fields (FR-39.8). VR-16's size cap is the storage rules'. */
export const engineAudioSchema = z.object({
  // VR-16
  durationMs: integer({ ...AUDIO_DURATION_MS, issue: { key: "validation.audioLength" } }),
  audioSource: z.enum(AUDIO_SOURCES, { error: "validation.audioSource" }),
  audioClipType: z.enum(AUDIO_CLIP_TYPES),
});

export type MediaVariants = z.output<typeof mediaVariantsSchema>;
export type ExpectedPaths = z.output<typeof expectedPathsSchema>;
export type Peaks = z.output<typeof peaksSchema>;
