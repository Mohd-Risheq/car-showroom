import "server-only";
import { isDeployment } from "@/lib/deployment";
import { createBlobStore } from "./blob";
import { createLocalStore } from "./local";

// The storage backend behind lib/storage (SRS §15.1 STORAGE_DRIVER, BUILD-PLAN §6.3)
export interface StorageDriver {
  readonly name: "local" | "blob";
  // Signs client upload tokens in handleUpload (API-16)
  readonly readWriteToken: string;
  publicUrl(storedPathname: string): string;
  // The stored pathname of a URL on this store, or undefined for any other URL
  storedPathnameOf(url: string): string | undefined;
  read(storedPathname: string, maxBytes: number): Promise<Uint8Array | "missing" | "too_large">;
  remove(storedPathname: string): Promise<void>;
}

// The local store and its routes exist only with STORAGE_DRIVER=local, and never on a deployment
export function isLocalStorageEnabled(): boolean {
  return process.env.STORAGE_DRIVER === "local" && !isDeployment();
}

// Null means uploads are off: no driver is set and no token is present (BR-46, TC-32-9)
export function getStorageDriver(): StorageDriver | null {
  const driver = process.env.STORAGE_DRIVER;
  if (driver === "local") {
    if (isDeployment()) throw new Error("STORAGE_DRIVER=local refuses to run on a deployment (BUILD-PLAN §6.3)");
    return createLocalStore();
  }
  if (driver) throw new Error("STORAGE_DRIVER must be unset or local (SRS §15.1)");
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? createBlobStore(token) : null;
}
