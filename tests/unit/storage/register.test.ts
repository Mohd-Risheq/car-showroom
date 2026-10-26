import { afterEach, describe, expect, it, vi } from "vitest";
import type { StorageDriver } from "@/lib/storage/driver";
import { registerMedia } from "@/lib/storage/register";
import { uploadRepository } from "@/lib/storage/repository";
import { type MediaExtension, type MediaKind, RANDOM_SUFFIX_LENGTH, uploadPathname } from "@/lib/storage/rules";
import { EXIF_WITH_GPS, solid } from "../../support/media";

// API-17's storage checks (SEC-08, FR-32.2a, DECISIONS.md D-023) on a fake store with the real
// inspector and upload records: which files are refused, which are deleted with them, and what is
// logged when a deletion fails. tests/integration/upload.test.ts runs the same path over HTTP.

const fake = vi.hoisted(() => {
  const origin = "https://store.test";
  const files = new Map<string, Uint8Array>();
  const unremovable = new Set<string>();
  const driver: StorageDriver = {
    name: "local",
    readWriteToken: "vercel_blob_rw_local_test",
    publicUrl: (pathname) => `${origin}/${pathname}`,
    storedPathnameOf: (url) => (url.startsWith(`${origin}/`) ? url.slice(origin.length + 1) : undefined),
    read: async (pathname, maxBytes) => {
      const bytes = files.get(pathname);
      if (!bytes) return "missing";
      return bytes.length > maxBytes ? "too_large" : bytes;
    },
    remove: async (pathname) => {
      if (unremovable.has(pathname)) throw new Error("store unavailable");
      files.delete(pathname);
    },
  };
  return { files, unremovable, driver };
});

vi.mock("@/lib/storage/driver", () => ({ getStorageDriver: () => fake.driver }));

const CAR_ID = "0190f5a0-1111-7000-8000-000000000001";
const USER_ID = "0190f5a0-2222-7000-8000-000000000002";
const REQUEST_ID = "fra1::abc-123";
const SUFFIX = "N".repeat(RANDOM_SUFFIX_LENGTH);

type Staged = {
  clientUploadId: string;
  variants: Record<string, string>;
  stored: Record<string, string>;
  signed: Record<string, string>;
};

// Signs each variant as API-16 does, then puts its file on the fake store under a random suffix
async function stage(files: Record<string, Buffer>, ext: MediaExtension = "jpg"): Promise<Staged> {
  const clientUploadId = crypto.randomUUID();
  const staged: Staged = { clientUploadId, variants: {}, stored: {}, signed: {} };
  for (const [variant, file] of Object.entries(files)) {
    const pathname = uploadPathname({ carId: CAR_ID, kind: "photo", clientUploadId, variant, ext });
    await uploadRepository.recordExpectedPath({
      userId: USER_ID,
      carId: CAR_ID,
      kind: "photo",
      clientUploadId,
      variant,
      pathname,
    });
    const stored = pathname.replace(`.${ext}`, `-${SUFFIX}.${ext}`);
    fake.files.set(stored, new Uint8Array(file));
    staged.variants[variant] = fake.driver.publicUrl(stored);
    staged.stored[variant] = stored;
    staged.signed[variant] = pathname;
  }
  return staged;
}

const register = (staged: Staged, size: { width: number; height: number }, kind: MediaKind = "photo") =>
  registerMedia(
    { carId: CAR_ID, kind, clientUploadId: staged.clientUploadId, variants: staged.variants, ...size },
    { userId: USER_ID },
    REQUEST_ID,
  );

const jpeg = (width: number, height: number) => solid(width, height).jpeg().toBuffer();
const isStored = (staged: Staged, variant: string) => fake.files.has(staged.stored[variant] ?? "");

afterEach(() => {
  fake.files.clear();
  fake.unremovable.clear();
  vi.restoreAllMocks();
});

describe("registerMedia's storage checks", () => {
  it("registers files that pass", async () => {
    const staged = await stage({ "480": await jpeg(480, 320), "960": await jpeg(960, 640) });
    await expect(register(staged, { width: 960, height: 640 })).resolves.toMatchObject({ mediaId: expect.any(String) });
    expect((await uploadRepository.find(staged.clientUploadId))?.status).toBe("ready");
  });

  it.each([
    ["wider than its variant", 600, 400],
    ["more than twice as tall as it is wide (D-023)", 480, 961],
  ])("rejects and deletes an image %s", async (_case, width, height) => {
    const staged = await stage({ "480": await jpeg(width, height), "960": await jpeg(960, 640) });
    await expect(register(staged, { width: 960, height: 640 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "480 dimensions",
    });
    expect(isStored(staged, "480")).toBe(false);
    expect(isStored(staged, "960")).toBe(false);
  });

  it("rejects and deletes a file larger than its variant's cap", async () => {
    const staged = await stage({ "480": Buffer.alloc(153_601) });
    await expect(register(staged, { width: 480, height: 320 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "480 too large",
    });
    expect(isStored(staged, "480")).toBe(false);
  });

  it("keeps the other files when one is missing, so the client can upload it again", async () => {
    const staged = await stage({ "480": await jpeg(480, 320), "960": await jpeg(960, 640) });
    fake.files.delete(staged.stored["960"] ?? "");
    await expect(register(staged, { width: 960, height: 640 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "960 not found",
    });
    expect(isStored(staged, "480")).toBe(true);
  });

  it("refuses a kind other than the one its token was signed for", async () => {
    const staged = await stage({ "480": await jpeg(480, 320) });
    await expect(register(staged, { width: 480, height: 320 }, "spin_frame")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "upload mismatch",
    });
    expect(isStored(staged, "480")).toBe(true);
  });

  it("still rejects when a file can't be deleted, and logs it once with the signed pathname and the request ID", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const staged = await stage({
      "480": await solid(480, 320).withExif(EXIF_WITH_GPS).jpeg().toBuffer(),
      "960": await jpeg(960, 640),
    });
    fake.unremovable.add(staged.stored["480"] ?? "");

    await expect(register(staged, { width: 960, height: 640 })).rejects.toMatchObject({ code: "METADATA_PRESENT" });
    expect(isStored(staged, "960")).toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logged.mock.calls[0]?.[0]))).toEqual({
      level: "error",
      code: "media_delete_failed",
      rejection: "METADATA_PRESENT",
      pathname: staged.signed["480"],
      error: "Error: store unavailable",
      requestId: REQUEST_ID,
    });
  });
});
