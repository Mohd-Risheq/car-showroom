import { BODY_TYPES, DRIVETRAINS, FUEL_TYPES, TRANSMISSIONS } from "../db/enums.ts";
import { makeKey, modelKey } from "./fields.ts";
import { z } from "./zod.ts";

// API-22's data, as the decode maps the upstream's answer and the cache keeps it 30 days
// (vin_decode_cache.payload). Each field may be unknown.

// What in the upstream's text is no text to show (SEC-13): controls, lone surrogates and line
// separators, which jsonb refuses or a field can't hold, and the bidi controls, which reorder text
const NOT_TEXT = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}\p{Bidi_Control}]/gu;

/** A name as the upstream wrote it, without what is no text, trimmed; one left empty is unknown */
const name = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const cleaned = value.replace(NOT_TEXT, "").trim();
  return cleaned === "" ? null : cleaned;
}, z.string().max(100).nullable());

export const vinDecodePayloadSchema = z.object({
  make: name,
  makeKey: makeKey().nullable(),
  model: name,
  modelKey: modelKey().nullable(),
  year: z.int().positive().nullable(),
  bodyType: z.enum(BODY_TYPES).nullable(),
  fuelType: z.enum(FUEL_TYPES).nullable(),
  engineCc: z.int().min(0).nullable(),
  driveType: z.enum(DRIVETRAINS).nullable(),
  transmission: z.enum(TRANSMISSIONS).nullable(),
  plant: z.object({ city: name, state: name, country: name }),
});

export type VinDecodePayload = z.output<typeof vinDecodePayloadSchema>;
