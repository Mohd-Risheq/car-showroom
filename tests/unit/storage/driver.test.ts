import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorageDriver, isLocalStorageEnabled } from "@/lib/storage/driver";

// Which store lib/storage runs (SRS §15.1 STORAGE_DRIVER, BUILD-PLAN §6.3): the local store only
// with STORAGE_DRIVER=local and never on a deployment, Vercel Blob when its token is set, and no
// uploads with neither (BR-46).

// Made up, in the shapes the two stores take
const LOCAL_TOKEN = `vercel_blob_rw_local_${"ab".repeat(32)}`;
const BLOB_TOKEN = "vercel_blob_rw_teststore_fakesecret";
const SETTINGS = [
  "STORAGE_DRIVER",
  "BLOB_READ_WRITE_TOKEN",
  "VERCEL_ENV",
  "VERCEL_BLOB_API_URL",
  "NEXT_PUBLIC_VERCEL_BLOB_API_URL",
] as const;

beforeEach(() => {
  for (const name of SETTINGS) vi.stubEnv(name, undefined);
});

function stubEnv(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

describe("getStorageDriver", () => {
  it("runs the local store with STORAGE_DRIVER=local", () => {
    stubEnv({ STORAGE_DRIVER: "local", BLOB_READ_WRITE_TOKEN: LOCAL_TOKEN });
    expect(getStorageDriver()?.name).toBe("local");
  });

  it.each(["preview", "production"])("refuses the local store on a %s deployment", (deployment) => {
    stubEnv({ STORAGE_DRIVER: "local", BLOB_READ_WRITE_TOKEN: LOCAL_TOKEN, VERCEL_ENV: deployment });
    expect(() => getStorageDriver()).toThrow("STORAGE_DRIVER=local refuses to run on a deployment");
  });

  it("keeps a real store's token away from the local store", () => {
    stubEnv({ STORAGE_DRIVER: "local", BLOB_READ_WRITE_TOKEN: BLOB_TOKEN });
    expect(() => getStorageDriver()).toThrow("The local store needs a local BLOB_READ_WRITE_TOKEN");
  });

  it("refuses any other STORAGE_DRIVER", () => {
    stubEnv({ STORAGE_DRIVER: "blob", BLOB_READ_WRITE_TOKEN: BLOB_TOKEN });
    expect(() => getStorageDriver()).toThrow("STORAGE_DRIVER must be unset or local");
  });

  it("runs Vercel Blob when only its token is set", () => {
    stubEnv({ BLOB_READ_WRITE_TOKEN: BLOB_TOKEN });
    expect(getStorageDriver()?.name).toBe("blob");
  });

  it("turns uploads off when neither is set (BR-46)", () => {
    expect(getStorageDriver()).toBeNull();
  });
});

describe("isLocalStorageEnabled", () => {
  it.each<[string, Record<string, string>, boolean]>([
    ["is on with STORAGE_DRIVER=local", { STORAGE_DRIVER: "local" }, true],
    ["is on under vercel dev", { STORAGE_DRIVER: "local", VERCEL_ENV: "development" }, true],
    ["is off on a preview deployment", { STORAGE_DRIVER: "local", VERCEL_ENV: "preview" }, false],
    ["is off on a production deployment", { STORAGE_DRIVER: "local", VERCEL_ENV: "production" }, false],
    ["is off without STORAGE_DRIVER", {}, false],
  ])("%s", (_case, values, enabled) => {
    stubEnv(values);
    expect(isLocalStorageEnabled()).toBe(enabled);
  });
});
