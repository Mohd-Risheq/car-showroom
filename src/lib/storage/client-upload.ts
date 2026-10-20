import type { PutBlobResult, UploadProgressEvent } from "@vercel/blob";
import { upload } from "@vercel/blob/client";
import { type MediaExtension, type MediaKind, MEDIA_TYPES, uploadPathname } from "./rules";

// The browser side of API-16: one variant goes straight to storage, with a token for its
// server-computed pathname. T-32's upload queue adds parallelism and retries (FR-32.3).
export function uploadVariant(input: {
  carId: string;
  kind: MediaKind;
  clientUploadId: string;
  variant: string;
  ext: MediaExtension;
  body: Blob;
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
  // Scripts and tests outside a browser need an absolute token URL and their own headers
  handleUploadUrl?: string;
  headers?: Record<string, string>;
}): Promise<PutBlobResult> {
  const { carId, kind, clientUploadId, variant, ext } = input;
  return upload(uploadPathname({ carId, kind, clientUploadId, variant, ext }), input.body, {
    access: "public",
    handleUploadUrl: input.handleUploadUrl ?? "/api/upload",
    clientPayload: JSON.stringify({ carId, kind, clientUploadId, variant }),
    contentType: MEDIA_TYPES[ext],
    multipart: false,
    ...(input.onProgress ? { onUploadProgress: input.onProgress } : {}),
    ...(input.signal ? { abortSignal: input.signal } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  });
}
