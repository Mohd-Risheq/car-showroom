import { z } from "zod";
import { MEDIA_KINDS } from "@/lib/storage/rules";

// Shared media schemas (SRS §7.1, SEC-13). T-16 brings the rest of lib/validation.

// The client payload of an upload token request (API-16)
export const uploadClientPayloadSchema = z.object({
  carId: z.uuid(),
  kind: z.enum(MEDIA_KINDS),
  clientUploadId: z.uuid(),
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
  carId: z.uuid(),
  kind: z.enum(MEDIA_KINDS),
  clientUploadId: z.uuid(),
  variants: z.record(z.string().max(8), z.url().max(2048)),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type RegisterMediaInput = z.infer<typeof registerMediaSchema>;
