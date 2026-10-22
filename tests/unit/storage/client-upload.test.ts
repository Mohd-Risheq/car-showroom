import { upload } from "@vercel/blob/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadVariant } from "@/lib/storage/client-upload";
import { uploadPathname } from "@/lib/storage/rules";

// The request API-16 expects from the browser: the server-computed pathname, a public single
// request (never multipart) and a client payload with exactly the fields the token route checks.
// The storage library's upload() is a fake; tests/integration/upload.test.ts sends it for real.

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const input = {
  carId: "0190f5a0-1111-7000-8000-000000000001",
  kind: "photo",
  clientUploadId: "6b0c3f4e-2222-4000-8000-000000000002",
  variant: "960",
  ext: "webp",
} as const;
const body = new Blob([new Uint8Array(4)]);
const pathname = uploadPathname(input);
const clientPayload = JSON.stringify({
  carId: input.carId,
  kind: input.kind,
  clientUploadId: input.clientUploadId,
  variant: input.variant,
});

beforeEach(() => {
  vi.mocked(upload).mockReset();
});

describe("uploadVariant", () => {
  it("asks the site's token route for a public upload of one variant, in one request", async () => {
    await uploadVariant({ ...input, body });
    // Strict, so an option left undefined counts as one sent
    expect(vi.mocked(upload).mock.calls).toStrictEqual([
      [
        pathname,
        body,
        {
          access: "public",
          handleUploadUrl: "/api/upload",
          clientPayload,
          contentType: "image/webp",
          multipart: false,
        },
      ],
    ]);
  });

  it("passes on progress, cancelling, and the token URL and headers a script outside a browser needs", async () => {
    const onProgress = vi.fn();
    const signal = new AbortController().signal;
    const headers = { cookie: "session=1", origin: "http://localhost:3000" };
    await uploadVariant({
      ...input,
      body,
      onProgress,
      signal,
      handleUploadUrl: "http://127.0.0.1:4000/api/upload",
      headers,
    });
    expect(vi.mocked(upload).mock.calls).toStrictEqual([
      [
        pathname,
        body,
        {
          access: "public",
          handleUploadUrl: "http://127.0.0.1:4000/api/upload",
          clientPayload,
          contentType: "image/webp",
          multipart: false,
          onUploadProgress: onProgress,
          abortSignal: signal,
          headers,
        },
      ],
    ]);
  });
});
