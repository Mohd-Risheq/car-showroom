import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { BlobFileTooLargeError, type UploadProgressEvent } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken, getPayloadFromClientToken } from "@vercel/blob/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getFile } from "@/app/api/storage-local/files/[...path]/route";
import { PUT as putFile } from "@/app/api/storage-local/route";
import { POST as requestToken } from "@/app/api/upload/route";
import { uploadVariant } from "@/lib/storage/client-upload";
import { registerMedia } from "@/lib/storage/register";
import { uploadRepository } from "@/lib/storage/repository";
import { isStoredPathnameOf, type MediaExtension, uploadPathname } from "@/lib/storage/rules";
import { createTestUser, deleteTestUsers, signIn } from "../support/auth";
import { requireEnv } from "../support/env";
import { EXIF_WITH_GPS, image, solid } from "../support/media";
import { startRouteServer } from "../support/route-server";

// API-16 tokens, the local store and API-17 registration, with the storage library's real
// upload() over HTTP (FR-32, SEC-08, SEC-14). T-37 repeats the round trip on Vercel Blob.

const siteOrigin = new URL(requireEnv("NEXT_PUBLIC_SITE_URL")).origin;
// A temporary folder per file (tests/support/storage-root.ts)
const storeRoot = requireEnv(
  "STORAGE_LOCAL_ROOT",
  "tests/support/storage-root.ts, a setup file of the integration project",
);
const carId = crypto.randomUUID();
const uncappedCarId = crypto.randomUUID(); // never written: the refused uploads use it
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let server: Awaited<ReturnType<typeof startRouteServer>>;
const users: Record<"owner" | "staff", { id: string; cookie: string }> = {
  owner: { id: "", cookie: "" },
  staff: { id: "", cookie: "" },
};

beforeAll(async () => {
  for (const role of ["owner", "staff"] as const) {
    const created = await createTestUser(role);
    users[role] = { id: created.id, cookie: await signIn(created) };
  }
  server = await startRouteServer([
    { method: "POST", path: "/api/upload", handle: (request) => requestToken(request) },
    { method: "PUT", path: "/api/storage-local", handle: (request) => putFile(request) },
    {
      method: "GET",
      path: "/api/storage-local/files",
      prefix: true,
      handle: (request, segments) => getFile(request, { params: Promise.resolve({ path: segments }) }),
    },
  ]);
});

// The server-side override wins over NEXT_PUBLIC_VERCEL_BLOB_API_URL (DECISIONS.md D-022). Stubbed
// before each test, because the project restores stubbed variables before each one.
beforeEach(() => {
  vi.stubEnv("VERCEL_BLOB_API_URL", `${server.origin}/api/storage-local?`);
});

afterAll(async () => {
  await server?.close();
  await deleteTestUsers();
});

type Variant = { clientUploadId: string; variant: string; ext: MediaExtension };

const photoPath = (input: Variant, car = carId) => uploadPathname({ carId: car, kind: "photo", ...input });

const tokenEvent = (pathname: string, clientPayload: unknown, multipart = false) => ({
  type: "blob.generate-client-token",
  payload: { pathname, clientPayload: JSON.stringify(clientPayload), multipart },
});

const photoEvent = (input: Variant, car = carId) =>
  tokenEvent(photoPath(input, car), {
    carId: car,
    kind: "photo",
    clientUploadId: input.clientUploadId,
    variant: input.variant,
  });

function tokenRequest(
  body: unknown,
  init: { cookie?: string; origin?: string; fetchSite?: string; contentType?: string } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": init.contentType ?? "application/json" });
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.origin) headers.set("origin", init.origin);
  if (init.fetchSite) headers.set("sec-fetch-site", init.fetchSite);
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return requestToken(new Request(`${siteOrigin}/api/upload`, { method: "POST", headers, body: payload }));
}

const asOwner = () => ({ cookie: users.owner.cookie, origin: siteOrigin });

function upload(input: Variant & { file: Buffer; onProgress?: (event: UploadProgressEvent) => void }) {
  return uploadVariant({
    carId,
    kind: "photo",
    clientUploadId: input.clientUploadId,
    variant: input.variant,
    ext: input.ext,
    body: new Blob([new Uint8Array(input.file)]),
    handleUploadUrl: `${server.origin}/api/upload`,
    headers: { cookie: users.owner.cookie, origin: siteOrigin },
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
  });
}

describe("upload tokens (API-16)", () => {
  it("scopes a token to the computed pathname, the variant's type and cap, and 10 minutes", async () => {
    const input = { clientUploadId: crypto.randomUUID(), variant: "960", ext: "webp" } as const;
    const before = Date.now();
    const response = await tokenRequest(photoEvent(input), asOwner());
    expect(response.status).toBe(200);
    const { type, clientToken } = (await response.json()) as { type: string; clientToken: string };
    expect(type).toBe("blob.generate-client-token");
    const claims = getPayloadFromClientToken(clientToken);
    expect(claims).toMatchObject({
      pathname: photoPath(input),
      allowedContentTypes: ["image/webp"],
      maximumSizeInBytes: 307_200,
      addRandomSuffix: true,
      allowOverwrite: false,
    });
    expect(claims.validUntil).toBeGreaterThanOrEqual(before + 600_000);
    expect(claims.validUntil).toBeLessThanOrEqual(Date.now() + 600_000);
    expect(claims).not.toHaveProperty("onUploadCompleted");
  });

  describe("refuses, and records nothing for", () => {
    type Attempt = { input: Variant; payload: Record<string, string>; pathname: string };
    // Each case asks inside its own test, once beforeAll has signed the owner in, and for an
    // upload of its own, so one wrong answer fails that case only
    it.each<[string, (attempt: Attempt) => Promise<Response>, number, string]>([
      [
        "a signed-out request",
        ({ input }) => tokenRequest(photoEvent(input), { origin: siteOrigin }),
        401,
        "UNAUTHENTICATED",
      ],
      [
        "a cross-site request",
        ({ input }) =>
          tokenRequest(photoEvent(input), {
            cookie: users.owner.cookie,
            origin: "https://evil.example",
            fetchSite: "cross-site",
          }),
        403,
        "FORBIDDEN",
      ],
      [
        "a request with no origin",
        ({ input }) => tokenRequest(photoEvent(input), { cookie: users.owner.cookie }),
        403,
        "FORBIDDEN",
      ],
      [
        "another pathname",
        ({ payload }) => tokenRequest(tokenEvent(`cars/${carId}/photo/any.jpg`, payload), asOwner()),
        400,
        "VALIDATION_ERROR",
      ],
      [
        "an unknown kind",
        ({ payload, pathname }) => tokenRequest(tokenEvent(pathname, { ...payload, kind: "video" }), asOwner()),
        400,
        "VALIDATION_ERROR",
      ],
      [
        "an unknown variant",
        ({ input }) => tokenRequest(photoEvent({ ...input, variant: "720" }), asOwner()),
        400,
        "VALIDATION_ERROR",
      ],
      [
        "a type outside the kind",
        ({ input }) => tokenRequest(photoEvent({ ...input, ext: "png" }), asOwner()),
        400,
        "VALIDATION_ERROR",
      ],
      [
        "a logo",
        ({ input, payload }) =>
          tokenRequest(
            tokenEvent(`cars/${carId}/logo/${input.clientUploadId}-src.png`, {
              ...payload,
              kind: "logo",
              variant: "src",
            }),
            asOwner(),
          ),
        400,
        "VALIDATION_ERROR",
      ],
      [
        "a multipart upload",
        ({ payload, pathname }) => tokenRequest(tokenEvent(pathname, payload, true), asOwner()),
        400,
        "VALIDATION_ERROR",
      ],
      [
        "a form post",
        () => tokenRequest("pathname=x", { ...asOwner(), contentType: "application/x-www-form-urlencoded" }),
        400,
        "VALIDATION_ERROR",
      ],
      [
        "an upload callback",
        () => tokenRequest({ type: "blob.upload-completed", payload: {} }, asOwner()),
        400,
        "VALIDATION_ERROR",
      ],
    ])("%s", async (_case, request, status, code) => {
      const input = { clientUploadId: crypto.randomUUID(), variant: "480", ext: "jpg" } as const;
      const payload = { carId, kind: "photo", clientUploadId: input.clientUploadId, variant: "480" };
      const response = await request({ input, payload, pathname: photoPath(input) });
      const body = (await response.json()) as { error: { code: string } };
      expect({ status: response.status, code: body.error.code }).toEqual({ status, code });
      expect(await uploadRepository.find(input.clientUploadId)).toBeUndefined();
    });
  });

  it("refuses a user who must still change their password (FR-29.6)", async () => {
    const onboarding = await createTestUser("staff", { mustChangePassword: true });
    const input = { clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" } as const;
    const response = await tokenRequest(photoEvent(input), { cookie: await signIn(onboarding), origin: siteOrigin });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(await uploadRepository.find(input.clientUploadId)).toBeUndefined();
  });

  it("reads at most 4 KB of a token request", async () => {
    const json = JSON.stringify(photoEvent({ clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" }));
    // Trailing spaces keep the JSON valid, so only the size decides
    const padded = (bytes: number) => json + " ".repeat(bytes - Buffer.byteLength(json));
    expect((await tokenRequest(padded(4096), asOwner())).status).toBe(200);
    const response = await tokenRequest(padded(4097), asOwner());
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("answers with the error envelope: a code and a request ID, nothing else (SRS §8.1)", async () => {
    const response = await tokenRequest({}, { origin: siteOrigin });
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", requestId: expect.stringMatching(UUID) },
    });
  });

  it("keeps an upload's tokens to the user who started it, and each variant to one pathname", async () => {
    const clientUploadId = crypto.randomUUID();
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "480", ext: "webp" }), asOwner())).status).toBe(
      200,
    );
    const staff = { cookie: users.staff.cookie, origin: siteOrigin };
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "960", ext: "webp" }), staff)).status).toBe(403);
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "480", ext: "jpg" }), asOwner())).status).toBe(
      400,
    );
    const otherCar = photoEvent({ clientUploadId, variant: "960", ext: "webp" }, uncappedCarId);
    expect((await tokenRequest(otherCar, asOwner())).status).toBe(400);
    // A new token for the same variant and pathname is fine: it replaces an expired one (FR-32)
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "480", ext: "webp" }), asOwner())).status).toBe(
      200,
    );
  });

  it("refuses with CAP_REACHED and records nothing when no storage is configured (TC-32-9)", async () => {
    const input = { clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" } as const;
    vi.stubEnv("STORAGE_DRIVER", undefined);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", undefined);
    const response = await tokenRequest(photoEvent(input), asOwner());
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("CAP_REACHED");
    expect(await uploadRepository.find(input.clientUploadId)).toBeUndefined();
  });
});

describe("the local store (BUILD-PLAN §6.3)", () => {
  it("takes a variant larger than the Server Action body limit straight from upload()", async () => {
    const file = await image(2560, 800).webp({ quality: 82 }).toBuffer();
    expect(file.length).toBeGreaterThan(1_048_576); // Next.js serverActions.bodySizeLimit, 1 MB
    expect(file.length).toBeLessThan(2_000_000);
    const input = { clientUploadId: crypto.randomUUID(), variant: "2560", ext: "webp" } as const;
    const progress: number[] = [];
    const result = await upload({ ...input, file, onProgress: ({ percentage }) => progress.push(percentage) });

    expect(isStoredPathnameOf(photoPath(input), result.pathname)).toBe(true);
    expect(result.url).toBe(`${siteOrigin}/api/storage-local/files/${result.pathname}`);
    expect(result.contentType).toBe("image/webp");
    expect(progress[0]).toBe(0);
    await vi.waitFor(() => expect(progress.at(-1)).toBe(100)); // the last event is throttled
    expect((await readFile(path.join(storeRoot, result.pathname))).equals(file)).toBe(true);

    const served = await fetch(result.url.replace(siteOrigin, server.origin));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(Buffer.from(await served.arrayBuffer()).equals(file)).toBe(true);
  });

  it("stops an upload over its variant's cap", async () => {
    const file = await image(480, 400).jpeg({ quality: 100 }).toBuffer();
    expect(file.length).toBeGreaterThan(153_600);
    const input = { clientUploadId: crypto.randomUUID(), variant: "480", ext: "jpg" } as const;
    await expect(upload({ ...input, file })).rejects.toBeInstanceOf(BlobFileTooLargeError);
  });

  describe("enforces the client token on every PUT", () => {
    type Put = { query?: string; headers?: Record<string, string>; body?: Uint8Array<ArrayBuffer> };
    // A car folder of its own for each case, so a file written by mistake fails that case only
    type Attempt = {
      pathname: string;
      otherPathname: string;
      sign: (claims?: Record<string, unknown>) => Promise<string>;
      put: (token: string, init?: Put) => Promise<Response>;
    };

    // The local store's PUT query, as the storage library sends it
    const query = (pathname: string) => `/?pathname=${encodeURIComponent(pathname)}`;

    function attemptFor(car: string): Attempt {
      const newPathname = () => photoPath({ clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" }, car);
      const pathname = newPathname();
      return {
        pathname,
        otherPathname: newPathname(),
        sign: (claims = {}) =>
          generateClientTokenFromReadWriteToken({
            token: requireEnv("BLOB_READ_WRITE_TOKEN"),
            pathname,
            allowedContentTypes: ["image/webp"],
            maximumSizeInBytes: 1_000,
            addRandomSuffix: true,
            validUntil: Date.now() + 60_000,
            ...claims,
          }),
        put: (token, init = {}) =>
          putFile(
            new Request(`${siteOrigin}/api/storage-local?${init.query ?? query(pathname)}`, {
              method: "PUT",
              headers: {
                authorization: `Bearer ${token}`,
                "x-vercel-blob-access": "public",
                "x-content-type": "image/webp",
                ...init.headers,
              },
              body: init.body ?? new Uint8Array(10),
            }),
          ),
      };
    }

    // A token with one character changed
    const tamper = (token: string) => token.slice(0, -5) + (token.at(-5) === "A" ? "B" : "A") + token.slice(-4);

    it.each<[string, (attempt: Attempt) => Promise<Response>, number, string]>([
      ["a tampered token", async ({ sign, put }) => put(tamper(await sign())), 403, "forbidden"],
      [
        "an expired token",
        async ({ sign, put }) => put(await sign({ validUntil: Date.now() - 1 })),
        403,
        "client_token_expired",
      ],
      [
        "another pathname",
        async ({ otherPathname, sign, put }) => put(await sign(), { query: query(otherPathname) }),
        403,
        "client_token_pathname_mismatch",
      ],
      [
        "another type",
        async ({ sign, put }) => put(await sign(), { headers: { "x-content-type": "image/png" } }),
        400,
        "content_type_not_allowed",
      ],
      [
        "a file over the cap",
        async ({ sign, put }) => put(await sign(), { body: new Uint8Array(1_001) }),
        413,
        "file_too_large",
      ],
      [
        "private access",
        async ({ sign, put }) => put(await sign(), { headers: { "x-vercel-blob-access": "private" } }),
        400,
        "bad_request",
      ],
      [
        "a multipart upload",
        async ({ sign, put }) => put(await sign(), { headers: { "x-mpu-action": "create" } }),
        400,
        "bad_request",
      ],
      ["no pathname", async ({ sign, put }) => put(await sign(), { query: "" }), 400, "bad_request"],
      [
        "a second parameter",
        async ({ pathname, sign, put }) => put(await sign(), { query: `${query(pathname)}&x=1` }),
        400,
        "bad_request",
      ],
    ])("refuses %s, and writes nothing", async (_case, request, status, code) => {
      const car = crypto.randomUUID();
      const response = await request(attemptFor(car));
      const body = (await response.json()) as { error: { code: string } };
      expect({ status: response.status, code: body.error.code }).toEqual({ status, code });
      await expect(stat(path.join(storeRoot, "cars", car))).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it.each<[string, Record<string, string | undefined>]>([
    ["on a production deployment", { VERCEL_ENV: "production" }],
    ["on a preview deployment", { VERCEL_ENV: "preview" }],
    ["without STORAGE_DRIVER=local", { STORAGE_DRIVER: undefined }],
  ])("is not found %s", async (_case, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const put = await putFile(
      new Request(`${siteOrigin}/api/storage-local?/?pathname=a.webp`, { method: "PUT", body: "x" }),
    );
    expect(put.status).toBe(404);
    const get = await getFile(new Request(`${siteOrigin}/api/storage-local/files/a.webp`), {
      params: Promise.resolve({ path: ["a.webp"] }),
    });
    expect(get.status).toBe(404);
  });

  it("won't sign a token for the local store on a deployment (BUILD-PLAN §6.3)", async () => {
    const event = photoEvent({ clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" });
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(tokenRequest(event, asOwner())).rejects.toThrow("refuses to run on a deployment");
  });

  it("serves nothing outside the store folder", async () => {
    for (const segments of [
      ["..", "package.json"],
      ["cars", "..", "..", "package.json"],
      [".env.local"],
      ["%2e%2e", "x.webp"],
    ]) {
      const response = await getFile(new Request(`${siteOrigin}/api/storage-local/files/x`), {
        params: Promise.resolve({ path: segments }),
      });
      expect(response.status).toBe(404);
    }
  });
});

describe("registration (API-17)", () => {
  async function uploadPhoto(clientUploadId: string, variants: Record<string, Buffer>, ext: MediaExtension = "jpg") {
    const urls: Record<string, string> = {};
    for (const [variant, file] of Object.entries(variants)) {
      urls[variant] = (await upload({ clientUploadId, variant, ext, file })).url;
    }
    return urls;
  }

  it("registers an upload whose files pass, once (idempotent on clientUploadId)", async () => {
    const clientUploadId = crypto.randomUUID();
    const variants = await uploadPhoto(clientUploadId, {
      "480": await solid(480, 320).jpeg().toBuffer(),
      "960": await solid(960, 640).jpeg().toBuffer(),
    });
    const input = { carId, kind: "photo", clientUploadId, variants, width: 960, height: 640 };
    const first = await registerMedia(input, { userId: users.owner.id });
    expect(first.mediaId).toMatch(UUID);
    expect(await registerMedia(input, { userId: users.owner.id })).toEqual(first);
    expect((await uploadRepository.find(clientUploadId))?.status).toBe("ready");
  });

  it("rejects and deletes an upload that still carries EXIF and GPS data (FR-32.2a, TC-32-2)", async () => {
    const clientUploadId = crypto.randomUUID();
    const variants = await uploadPhoto(clientUploadId, {
      "480": await solid(480, 320).jpeg().toBuffer(),
      "960": await solid(960, 640).withExif(EXIF_WITH_GPS).jpeg().toBuffer(),
    });
    const files = Object.values(variants).map((url) =>
      path.join(storeRoot, new URL(url).pathname.split("/files/")[1] ?? ""),
    );
    for (const file of files) await expect(stat(file)).resolves.toBeTruthy();

    const input = { carId, kind: "photo", clientUploadId, variants, width: 960, height: 640 };
    await expect(registerMedia(input, { userId: users.owner.id })).rejects.toMatchObject({
      code: "METADATA_PRESENT",
      status: 422,
    });
    for (const file of files) await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await uploadRepository.find(clientUploadId))?.status).toBe("pending");
  });

  // sharp sets the VP8X metadata flag with the chunk; inspect.test.ts covers the chunk alone
  it("rejects a WebP that still carries XMP, by its VP8X metadata flag", async () => {
    const clientUploadId = crypto.randomUUID();
    const variants = await uploadPhoto(
      clientUploadId,
      { "480": await solid(480, 320).withXmp("<x:xmpmeta/>").webp().toBuffer() },
      "webp",
    );
    const input = { carId, kind: "photo", clientUploadId, variants, width: 480, height: 320 };
    await expect(registerMedia(input, { userId: users.owner.id })).rejects.toMatchObject({
      code: "METADATA_PRESENT",
      message: "480 webp.vp8x-metadata",
    });
  });

  it("accepts only the signed pathnames on this store, for their uploader, at the declared size", async () => {
    const clientUploadId = crypto.randomUUID();
    const variants = await uploadPhoto(clientUploadId, { "480": await solid(480, 320).jpeg().toBuffer() });
    const url = variants["480"] ?? "";
    const stored = path.join(storeRoot, new URL(url).pathname.split("/files/")[1] ?? "");
    const register = (urls: Record<string, string>, extra: Record<string, unknown> = {}, userId = users.owner.id) =>
      registerMedia(
        { carId, kind: "photo", clientUploadId, variants: urls, width: 480, height: 320, ...extra },
        { userId },
      );

    const foreignUpload = photoPath({ clientUploadId: crypto.randomUUID(), variant: "480", ext: "jpg" });
    for (const urls of [
      { "480": url.replace(siteOrigin, "https://evil.example") },
      { "480": `${url}?download=1` },
      { "480": url.replace(/cars\/.*$/, foreignUpload.replace(".jpg", "-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.jpg")) },
      { "480": url.replace("cars/", "cars%2F") },
      { "480": url, "960": url },
      {},
    ]) {
      await expect(register(urls)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    await expect(register({ "480": url }, {}, users.staff.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(register({ "480": url }, { carId: uncappedCarId })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(stat(stored)).resolves.toBeTruthy(); // nothing was deleted so far

    // A size that doesn't match the file rejects the upload and deletes it
    await expect(register({ "480": url }, { width: 481 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(stat(stored)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses an upload no token was issued for", async () => {
    const input = { carId, kind: "photo", clientUploadId: crypto.randomUUID(), variants: {}, width: 1, height: 1 };
    await expect(registerMedia(input, { userId: users.owner.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
