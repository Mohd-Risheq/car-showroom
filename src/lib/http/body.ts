import { AppError } from "@/lib/errors/app-error";

// Reads a body whole, but stops as soon as it passes the cap, so an oversized body is never held
// in memory: request bodies (API-16, API-30, API-34) and stored files (API-17)
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | "too_large"> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** A request's media type, in lower case and without its parameters, or "" when it sends none */
export function mediaTypeOf(headers: Headers): string {
  return headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * A JSON request body, read under the cap. Text that isn't JSON reads as undefined, which the
 * handler's schema then refuses.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (mediaTypeOf(request.headers) !== "application/json") throw new AppError("VALIDATION_ERROR", "not JSON");
  const body = await readCapped(request.body, maxBytes);
  if (body === "too_large") throw new AppError("VALIDATION_ERROR", "too large");
  return parseJson(new TextDecoder().decode(body));
}

/** The value JSON text holds, or undefined for text that isn't JSON */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
