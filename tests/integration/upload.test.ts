import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { BlobFileTooLargeError, type UploadProgressEvent } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken, getPayloadFromClientToken } from "@vercel/blob/client";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { GET as getFile } from "@/app/api/storage-local/files/[...path]/route";
import { PUT as putFile } from "@/app/api/storage-local/route";
import { POST as requestToken } from "@/app/api/upload/route";
import { createPasswordUser } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { uploadVariant } from "@/lib/storage/client-upload";
import { registerMedia } from "@/lib/storage/register";
import { uploadRepository } from "@/lib/storage/repository";
import { isStoredPathnameOf, type MediaExtension, uploadPathname } from "@/lib/storage/rules";
import { EXIF_WITH_GPS, image, solid } from "../support/media";
import { startRouteServer } from "../support/route-server";

// API-16 tokens, the local store and API-17 registration, with the storage library's real
// upload() over HTTP (FR-32, SEC-08, SEC-14). T-37 repeats the round trip on Vercel Blob.

const siteOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;
const authOrigin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;
const storeRoot = path.join(process.cwd(), ".storage-local");
const run = crypto.randomUUID();
const password = `t03-password-${run}`;
const carId = crypto.randomUUID();
const uncappedCarId = crypto.randomUUID(); // never written: the refused uploads use it
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let server: Awaited<ReturnType<typeof startRouteServer>>;
const users: Record<"owner" | "staff", { id: string; cookie: string }> = {
  owner: { id: "", cookie: "" },
  staff: { id: "", cookie: "" },
};

async function signIn(email: string): Promise<string> {
  const response = await authPost(
    new Request(`${authOrigin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: authOrigin, "content-type": "application/json", "user-agent": "Muftah-T03-test/1.0" },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token="));
  return cookie?.split(";")[0] ?? "";
}

beforeAll(async () => {
  for (const role of ["owner", "staff"] as const) {
    const email = `t03-${role}-${run}@example.test`;
    const created = await createPasswordUser({ email, name: `T-03 ${role}`, password, role, mustChangePassword: false });
    users[role] = { id: created.id, cookie: await signIn(email) };
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
  // The server-side override wins over NEXT_PUBLIC_VERCEL_BLOB_API_URL (DECISIONS.md D-022)
  process.env.VERCEL_BLOB_API_URL = `${server.origin}/api/storage-local?`;
});

// Deleting the users cascades to their sessions and accounts
afterAll(async () => {
  delete process.env.VERCEL_BLOB_API_URL;
  await server?.close();
  await rm(path.join(storeRoot, "cars", carId), { recursive: true, force: true });
  const ids = Object.values(users).map(({ id }) => id).filter(Boolean);
  if (ids.length) await db.delete(user).where(inArray(user.id, ids));
});

type Variant = { clientUploadId: string; variant: string; ext: MediaExtension };

const photoPath = (input: Variant, car = carId) => uploadPathname({ carId: car, kind: "photo", ...input });

const tokenEvent = (pathname: string, clientPayload: unknown, multipart = false) => ({
  type: "blob.generate-client-token",
  payload: { pathname, clientPayload: JSON.stringify(clientPayload), multipart },
});

const photoEvent = (input: Variant, car = carId) =>
  tokenEvent(photoPath(input, car), { carId: car, kind: "photo", clientUploadId: input.clientUploadId, variant: input.variant });

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

function withEnv<T>(changes: Record<string, string | undefined>, work: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(changes).map((name) => [name, process.env[name]]));
  const apply = (values: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  apply(changes);
  return work().finally(() => apply(saved));
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

  it("refuses cross-site, signed-out and off-pathname requests", async () => {
    const input = { clientUploadId: crypto.randomUUID(), variant: "480", ext: "jpg" } as const;
    const payload = { carId, kind: "photo", clientUploadId: input.clientUploadId, variant: "480" };
    const pathname = photoPath(input);
    const owner = asOwner();
    const cases: [string, Promise<Response>, number, string][] = [
      ["signed out", tokenRequest(photoEvent(input), { origin: siteOrigin }), 401, "UNAUTHENTICATED"],
      [
        "cross-site",
        tokenRequest(photoEvent(input), { cookie: owner.cookie, origin: "https://evil.example", fetchSite: "cross-site" }),
        403,
        "FORBIDDEN",
      ],
      ["no origin", tokenRequest(photoEvent(input), { cookie: owner.cookie }), 403, "FORBIDDEN"],
      ["another pathname", tokenRequest(tokenEvent(`cars/${carId}/photo/any.jpg`, payload), owner), 400, "VALIDATION_ERROR"],
      ["unknown kind", tokenRequest(tokenEvent(pathname, { ...payload, kind: "video" }), owner), 400, "VALIDATION_ERROR"],
      ["unknown variant", tokenRequest(photoEvent({ ...input, variant: "720" }), owner), 400, "VALIDATION_ERROR"],
      ["type outside the kind", tokenRequest(photoEvent({ ...input, ext: "png" }), owner), 400, "VALIDATION_ERROR"],
      [
        "logo",
        tokenRequest(tokenEvent(`cars/${carId}/logo/${input.clientUploadId}-src.png`, { ...payload, kind: "logo", variant: "src" }), owner),
        400,
        "VALIDATION_ERROR",
      ],
      ["multipart", tokenRequest(tokenEvent(pathname, payload, true), owner), 400, "VALIDATION_ERROR"],
      ["form post", tokenRequest("pathname=x", { ...owner, contentType: "application/x-www-form-urlencoded" }), 400, "VALIDATION_ERROR"],
      ["upload callback", tokenRequest({ type: "blob.upload-completed", payload: {} }, owner), 400, "VALIDATION_ERROR"],
    ];
    for (const [name, pending, status, code] of cases) {
      const response = await pending;
      const body = (await response.json()) as { error: { code: string } };
      expect({ name, status: response.status, code: body.error.code }).toEqual({ name, status, code });
    }
    expect(await uploadRepository.find(input.clientUploadId)).toBeUndefined();
  });

  it("answers with the error envelope: a code and a request ID, nothing else (SRS §8.1)", async () => {
    const response = await tokenRequest({}, { origin: siteOrigin });
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED", requestId: expect.stringMatching(UUID) } });
  });

  it("keeps an upload's tokens to the user who started it, and each variant to one pathname", async () => {
    const clientUploadId = crypto.randomUUID();
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "480", ext: "webp" }), asOwner())).status).toBe(200);
    const staff = { cookie: users.staff.cookie, origin: siteOrigin };
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "960", ext: "webp" }), staff)).status).toBe(403);
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "480", ext: "jpg" }), asOwner())).status).toBe(400);
    const otherCar = photoEvent({ clientUploadId, variant: "960", ext: "webp" }, uncappedCarId);
    expect((await tokenRequest(otherCar, asOwner())).status).toBe(400);
    // A new token for the same variant and pathname is fine: it replaces an expired one (FR-32)
    expect((await tokenRequest(photoEvent({ clientUploadId, variant: "480", ext: "webp" }), asOwner())).status).toBe(200);
  });

  it("refuses with CAP_REACHED and records nothing when no storage is configured (TC-32-9)", async () => {
    const input = { clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" } as const;
    const response = await withEnv({ STORAGE_DRIVER: undefined, BLOB_READ_WRITE_TOKEN: undefined }, () =>
      tokenRequest(photoEvent(input), asOwner()),
    );
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

  it("enforces the client token on every PUT", async () => {
    const pathname = photoPath({ clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" }, uncappedCarId);
    const readWriteToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";
    const sign = (claims: Record<string, unknown> = {}) =>
      generateClientTokenFromReadWriteToken({
        token: readWriteToken,
        pathname,
        allowedContentTypes: ["image/webp"],
        maximumSizeInBytes: 1_000,
        addRandomSuffix: true,
        validUntil: Date.now() + 60_000,
        ...claims,
      });
    const put = (
      token: string,
      init: { query?: string; headers?: Record<string, string>; body?: Uint8Array<ArrayBuffer> } = {},
    ) =>
      putFile(
        new Request(`${siteOrigin}/api/storage-local?${init.query ?? `/?pathname=${encodeURIComponent(pathname)}`}`, {
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

    const valid = await sign();
    const tampered = valid.slice(0, -5) + (valid.at(-5) === "A" ? "B" : "A") + valid.slice(-4);
    const otherPath = photoPath({ clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" }, uncappedCarId);
    const cases: [string, Promise<Response>, number, string][] = [
      ["tampered token", put(tampered), 403, "forbidden"],
      ["expired token", put(await sign({ validUntil: Date.now() - 1 })), 403, "client_token_expired"],
      ["another pathname", put(valid, { query: `/?pathname=${encodeURIComponent(otherPath)}` }), 403, "client_token_pathname_mismatch"],
      ["another type", put(valid, { headers: { "x-content-type": "image/png" } }), 400, "content_type_not_allowed"],
      ["over the cap", put(valid, { body: new Uint8Array(1_001) }), 413, "file_too_large"],
      ["private access", put(valid, { headers: { "x-vercel-blob-access": "private" } }), 400, "bad_request"],
      ["multipart", put(valid, { headers: { "x-mpu-action": "create" } }), 400, "bad_request"],
      ["no pathname", put(valid, { query: "" }), 400, "bad_request"],
      ["a second parameter", put(valid, { query: `/?pathname=${encodeURIComponent(pathname)}&x=1` }), 400, "bad_request"],
    ];
    for (const [name, pending, status, code] of cases) {
      const response = await pending;
      const body = (await response.json()) as { error: { code: string } };
      expect({ name, status: response.status, code: body.error.code }).toEqual({ name, status, code });
    }
    await expect(stat(path.join(storeRoot, "cars", uncappedCarId))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("is not found on deployments or without STORAGE_DRIVER=local", async () => {
    for (const env of [{ VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }, { STORAGE_DRIVER: undefined }]) {
      await withEnv(env, async () => {
        const put = await putFile(new Request(`${siteOrigin}/api/storage-local?/?pathname=a.webp`, { method: "PUT", body: "x" }));
        expect(put.status).toBe(404);
        const get = await getFile(new Request(`${siteOrigin}/api/storage-local/files/a.webp`), {
          params: Promise.resolve({ path: ["a.webp"] }),
        });
        expect(get.status).toBe(404);
      });
    }
    const event = photoEvent({ clientUploadId: crypto.randomUUID(), variant: "480", ext: "webp" });
    await withEnv({ VERCEL_ENV: "production" }, async () => {
      await expect(tokenRequest(event, asOwner())).rejects.toThrow("refuses to run on a deployment");
    });
  });

  it("serves nothing outside the store folder", async () => {
    for (const segments of [["..", "package.json"], ["cars", "..", "..", "package.json"], [".env.local"], ["%2e%2e", "x.webp"]]) {
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
    const files = Object.values(variants).map((url) => path.join(storeRoot, new URL(url).pathname.split("/files/")[1] ?? ""));
    for (const file of files) await expect(stat(file)).resolves.toBeTruthy();

    const input = { carId, kind: "photo", clientUploadId, variants, width: 960, height: 640 };
    await expect(registerMedia(input, { userId: users.owner.id })).rejects.toMatchObject({
      code: "METADATA_PRESENT",
      status: 422,
    });
    for (const file of files) await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await uploadRepository.find(clientUploadId))?.status).toBe("pending");
  });

  it("rejects a WebP that still carries XMP, by its chunk", async () => {
    const clientUploadId = crypto.randomUUID();
    const variants = await uploadPhoto(clientUploadId, { "480": await solid(480, 320).withXmp("<x:xmpmeta/>").webp().toBuffer() }, "webp");
    const input = { carId, kind: "photo", clientUploadId, variants, width: 480, height: 320 };
    await expect(registerMedia(input, { userId: users.owner.id })).rejects.toMatchObject({ code: "METADATA_PRESENT" });
  });

  it("accepts only the signed pathnames on this store, for their uploader, at the declared size", async () => {
    const clientUploadId = crypto.randomUUID();
    const variants = await uploadPhoto(clientUploadId, { "480": await solid(480, 320).jpeg().toBuffer() });
    const url = variants["480"] ?? "";
    const stored = path.join(storeRoot, new URL(url).pathname.split("/files/")[1] ?? "");
    const register = (urls: Record<string, string>, extra: Record<string, unknown> = {}, userId = users.owner.id) =>
      registerMedia({ carId, kind: "photo", clientUploadId, variants: urls, width: 480, height: 320, ...extra }, { userId });

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
    await expect(register({ "480": url }, { carId: uncappedCarId })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
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
