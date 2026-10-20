import type { Size } from "./ring";

// Fetches one spin frame and decodes it into an ImageBitmap, in whichever thread calls it: the
// page, or the decode worker (decode.worker.ts). Kept apart from decode.ts so the worker's
// bundle doesn't include the code that starts the worker.

export type DecodeRequest = { url: string; resize: Size | null; quality: ResizeQuality };
export type Decoded = { bitmap: ImageBitmap; encodedBytes: number; fetchMs: number; decodeMs: number };

export async function fetchAndDecode(request: DecodeRequest, signal: AbortSignal): Promise<Decoded> {
  const started = performance.now();
  const response = await fetch(request.url, { signal });
  if (!response.ok) throw new Error(`frame request failed: ${response.status}`);
  const blob = await response.blob();
  const fetched = performance.now();
  const options: ImageBitmapOptions = request.resize
    ? { resizeWidth: request.resize.width, resizeHeight: request.resize.height, resizeQuality: request.quality }
    : {};
  const bitmap = await createImageBitmap(blob, options);
  return { bitmap, encodedBytes: blob.size, fetchMs: fetched - started, decodeMs: performance.now() - fetched };
}
