import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStore, handleLocalPut, serveLocalFile } from "@/lib/storage/local";
import { isStoredPathnameOf } from "@/lib/storage/rules";

// The local store's own decisions, with no server and no database (BUILD-PLAN §6.3, SEC-08,
// SEC-14): which files a stored pathname may name, how a PUT is held to its client token, and
// what the file route serves. tests/integration/upload.test.ts runs the same store end to end.

const SITE = "http://localhost:3000";
// Made up, in the shape of a local store's token
const READ_WRITE_TOKEN = `vercel_blob_rw_local_${"ab".repeat(32)}`;
const NOW = new Date("2026-10-18T12:00:00+03:00");

// The store is a folder inside a temporary one, beside a file a pathname must never reach
let base = "";
let root = "";

beforeAll(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "muftah-local-store-"));
  root = path.join(base, "store");
  await mkdir(root);
  await writeFile(path.join(base, "canary.webp"), "outside the store");
});

afterAll(() => rm(base, { recursive: true, force: true }));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("STORAGE_LOCAL_ROOT", root);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", READ_WRITE_TOKEN);
});

afterEach(() => {
  vi.useRealTimers();
});

// A car folder of its own for each test, so one test's file never answers another's check
const newPathname = (car = crypto.randomUUID()) => `cars/${car}/photo/${crypto.randomUUID()}-480.webp`;

async function storeFile(pathname: string, bytes: Uint8Array | string): Promise<string> {
  const file = path.join(root, pathname);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

describe("stored pathnames", () => {
  it("builds the public URL of a file, and recognises only plain URLs of its own", () => {
    const local = createLocalStore();
    const pathname = newPathname();
    const url = local.publicUrl(pathname);
    expect(url).toBe(`${SITE}/api/storage-local/files/${pathname}`);
    expect(local.storedPathnameOf(url)).toBe(pathname);
    for (const other of [
      `${url}?download=1`,
      `${url}#top`,
      url.replace("http://", "http://user:secret@"),
      url.replace(SITE, "https://evil.example"),
      url.replace("/api/storage-local/files/", "/api/other/"),
      "not a URL",
    ]) {
      expect(local.storedPathnameOf(other)).toBeUndefined();
    }
  });

  it("reads a file whole, up to a limit, and removes it", async () => {
    const local = createLocalStore();
    const pathname = newPathname();
    const file = await storeFile(pathname, new Uint8Array([1, 2, 3]));
    expect(await local.read(pathname, 3)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await local.read(pathname, 2)).toBe("too_large");
    await local.remove(pathname);
    expect(await exists(file)).toBe(false);
    expect(await local.read(pathname, 3)).toBe("missing");
  });

  it("takes an empty STORAGE_LOCAL_ROOT as unset, so the project's own files stay out of the store", async () => {
    // The working folder is the project, whose package.json the store must not reach
    expect(await exists(path.resolve("package.json"))).toBe(true);
    vi.stubEnv("STORAGE_LOCAL_ROOT", "");
    expect(await createLocalStore().read("package.json", 1_000_000)).toBe("missing");
  });

  // Each target exists, so only the pathname check stands between it and the store
  it.each([
    ["a parent folder", "../canary.webp", "canary.webp"],
    ["a folder that climbs out", "cars/../../canary.webp", "canary.webp"],
    ["a hidden file", ".hidden.webp", "store/.hidden.webp"],
    ["an empty segment", "cars//twice.webp", "store/cars/twice.webp"],
  ])("reads, serves and removes nothing through %s", async (_case, pathname, target) => {
    const file = path.join(base, target);
    if (target.startsWith("store/")) await storeFile(path.relative(root, file), "inside the store");
    const local = createLocalStore();
    expect(await local.read(pathname, 1_000)).toBe("missing");
    expect((await serveLocalFile(pathname.split("/"))).status).toBe(404);
    await local.remove(pathname);
    expect(await exists(file)).toBe(true);
  });
});

describe("a PUT, held to its client token", () => {
  type Put = { query?: string; headers?: Record<string, string>; body?: Uint8Array<ArrayBuffer> };

  const sign = (pathname: string, claims: Record<string, unknown> = {}, key = READ_WRITE_TOKEN) =>
    generateClientTokenFromReadWriteToken({
      token: key,
      pathname,
      allowedContentTypes: ["image/webp"],
      maximumSizeInBytes: 1_000,
      addRandomSuffix: true,
      validUntil: NOW.getTime() + 60_000,
      ...claims,
    });

  // The query the storage library sends to an API URL that ends in "?" (DECISIONS.md D-022)
  const query = (pathname: string) => `/?pathname=${encodeURIComponent(pathname)}`;

  function put(pathname: string, token: string, init: Put = {}): Promise<Response> {
    return handleLocalPut(
      new Request(`${SITE}/api/storage-local?${init.query ?? query(pathname)}`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "x-vercel-blob-access": "public",
          "x-content-type": "image/webp",
          ...init.headers,
        },
        body: init.body ?? new Uint8Array(10),
      }),
    );
  }

  it("writes the file under a random suffix and answers as the service does", async () => {
    const pathname = newPathname();
    const body = new Uint8Array([7, 8, 9]);
    const response = await put(pathname, await sign(pathname), { body });
    expect(response.status).toBe(200);
    const reply = (await response.json()) as { pathname: string };
    expect(isStoredPathnameOf(pathname, reply.pathname)).toBe(true);
    const url = `${SITE}/api/storage-local/files/${reply.pathname}`;
    expect(reply).toEqual({
      url,
      downloadUrl: `${url}?download=1`,
      pathname: reply.pathname,
      contentType: "image/webp",
      contentDisposition: `inline; filename="${path.posix.basename(reply.pathname)}"`,
      etag: `"${createHash("sha256").update(body).digest("hex")}"`,
    });
    expect(new Uint8Array(await readFile(path.join(root, reply.pathname)))).toEqual(body);
  });

  it.each<[string, (pathname: string) => Promise<Response>, number, string]>([
    ["no pathname", async (pathname) => put(pathname, await sign(pathname), { query: "" }), 400, "bad_request"],
    [
      "a second parameter",
      async (pathname) => put(pathname, await sign(pathname), { query: `${query(pathname)}&x=1` }),
      400,
      "bad_request",
    ],
    [
      "a token signed with another key",
      async (pathname) => put(pathname, await sign(pathname, {}, `vercel_blob_rw_local_${"cd".repeat(32)}`)),
      403,
      "forbidden",
    ],
    [
      "an expired token",
      async (pathname) => put(pathname, await sign(pathname, { validUntil: NOW.getTime() - 1 })),
      403,
      "client_token_expired",
    ],
    [
      "another pathname",
      async (pathname) => put(pathname, await sign(pathname), { query: query(newPathname()) }),
      403,
      "client_token_pathname_mismatch",
    ],
    [
      "private access",
      async (pathname) => put(pathname, await sign(pathname), { headers: { "x-vercel-blob-access": "private" } }),
      400,
      "bad_request",
    ],
    [
      "a multipart upload",
      async (pathname) => put(pathname, await sign(pathname), { headers: { "x-mpu-action": "create" } }),
      400,
      "bad_request",
    ],
    [
      "another type",
      async (pathname) => put(pathname, await sign(pathname), { headers: { "x-content-type": "image/png" } }),
      400,
      "content_type_not_allowed",
    ],
    [
      "a file over the cap",
      async (pathname) => put(pathname, await sign(pathname), { body: new Uint8Array(1_001) }),
      413,
      "file_too_large",
    ],
  ])("refuses %s, and writes nothing", async (_case, request, status, code) => {
    const car = crypto.randomUUID();
    const response = await request(newPathname(car));
    const body = (await response.json()) as { error: { code: string } };
    expect({ status: response.status, code: body.error.code }).toEqual({ status, code });
    expect(await exists(path.join(root, "cars", car))).toBe(false);
  });

  it("keeps a file that exists unless the token allows an overwrite", async () => {
    const pathname = newPathname();
    const once = await sign(pathname, { addRandomSuffix: false });
    expect((await put(pathname, once, { body: new Uint8Array([1]) })).status).toBe(200);
    const again = await put(pathname, once, { body: new Uint8Array([2]) });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: { code: "bad_request", message: "the blob already exists" } });
    const overwrite = await sign(pathname, { addRandomSuffix: false, allowOverwrite: true });
    expect((await put(pathname, overwrite, { body: new Uint8Array([3]) })).status).toBe(200);
    expect(new Uint8Array(await readFile(path.join(root, pathname)))).toEqual(new Uint8Array([3]));
  });
});

describe("the file route", () => {
  it("serves a stored file sandboxed and never sniffed (SEC-08)", async () => {
    const pathname = newPathname();
    await storeFile(pathname, new Uint8Array([4, 5]));
    const response = await serveLocalFile(pathname.split("/"));
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/webp",
      "content-disposition": "inline",
      "cache-control": "public, max-age=2592000",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5]));
  });

  it("answers 404 for a missing file and for a type the store doesn't take", async () => {
    expect((await serveLocalFile(newPathname().split("/"))).status).toBe(404);
    await storeFile("notes.txt", "not media");
    expect((await serveLocalFile(["notes.txt"])).status).toBe(404);
  });
});
