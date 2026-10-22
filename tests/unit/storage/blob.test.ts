import { del } from "@vercel/blob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlobStore } from "@/lib/storage/blob";

// The production store (API-17, DECISIONS.md D-022): which URLs are this store's, the guards
// that keep a real token away from the local store, and how files are read and deleted. Nothing
// leaves the machine: fetch and the SDK's del are fakes.

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

// Made up, in the shape vercel_blob_rw_{storeId}_{secret}
const TOKEN = "vercel_blob_rw_teststore_fakesecret";
const ORIGIN = "https://teststore.public.blob.vercel-storage.com";
const PATHNAME = "cars/1/photo/2-960-NoOVGDVcqSPc7VYCUAGnTzLTG2qEM2.webp";
const OVERRIDES = ["VERCEL_BLOB_API_URL", "NEXT_PUBLIC_VERCEL_BLOB_API_URL"] as const;

function respondWith(response: Response) {
  const fetchFile = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal("fetch", fetchFile);
  return fetchFile;
}

beforeEach(() => {
  for (const name of OVERRIDES) vi.stubEnv(name, undefined);
});

afterEach(() => {
  vi.mocked(del).mockReset();
});

describe("the token", () => {
  it("names the store whose public URLs the driver builds", () => {
    expect(createBlobStore(TOKEN).publicUrl(PATHNAME)).toBe(`${ORIGIN}/${PATHNAME}`);
  });

  it.each(["vercel_blob_rw_local_secret", "vercel_blob_rw", "not-a-token"])("refuses %s", (token) => {
    expect(() => createBlobStore(token)).toThrow("not a Vercel Blob store token");
  });

  it.each(OVERRIDES)("is refused while %s sends the SDK to the local store", (name) => {
    vi.stubEnv(name, "http://127.0.0.1:3000/api/blob");
    expect(() => createBlobStore(TOKEN)).toThrow(/Unset VERCEL_BLOB_API_URL/);
  });
});

describe("URLs on this store (API-17)", () => {
  it("gives the stored pathname of a plain URL on this store", () => {
    expect(createBlobStore(TOKEN).storedPathnameOf(`${ORIGIN}/${PATHNAME}`)).toBe(PATHNAME);
  });

  it.each([
    `https://other1.public.blob.vercel-storage.com/${PATHNAME}`,
    `${ORIGIN.replace("https:", "http:")}/${PATHNAME}`,
    `${ORIGIN}/${PATHNAME}?download=1`,
    `${ORIGIN}/${PATHNAME}#x`,
    `${ORIGIN.replace("https://", "https://user:pass@")}/${PATHNAME}`,
    "not a url",
  ])("refuses %s", (url) => {
    expect(createBlobStore(TOKEN).storedPathnameOf(url)).toBeUndefined();
  });
});

describe("reading and deleting", () => {
  it("reads a file whole, without following a redirect", async () => {
    const fetchFile = respondWith(new Response(new Uint8Array([1, 2, 3])));
    await expect(createBlobStore(TOKEN).read(PATHNAME, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchFile).toHaveBeenCalledWith(`${ORIGIN}/${PATHNAME}`, { redirect: "error" });
  });

  it("stops reading past the cap", async () => {
    respondWith(new Response(new Uint8Array(4)));
    await expect(createBlobStore(TOKEN).read(PATHNAME, 3)).resolves.toBe("too_large");
  });

  it("reads a missing file as missing, and throws on any other failure", async () => {
    respondWith(new Response(null, { status: 404 }));
    await expect(createBlobStore(TOKEN).read(PATHNAME, 3)).resolves.toBe("missing");
    respondWith(new Response(null, { status: 500 }));
    await expect(createBlobStore(TOKEN).read(PATHNAME, 3)).rejects.toThrow("status 500");
  });

  it("deletes a file by its URL, with the store's token", async () => {
    await createBlobStore(TOKEN).remove(PATHNAME);
    expect(del).toHaveBeenCalledWith(`${ORIGIN}/${PATHNAME}`, { token: TOKEN });
  });
});
