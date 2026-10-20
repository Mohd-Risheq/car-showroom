import "server-only";
import { del } from "@vercel/blob";
import type { StorageDriver } from "./driver";
import { readCapped } from "./stream";

// Vercel Blob, the public store. T-37 runs the real check behind gates 3, 4 and 6.
export function createBlobStore(readWriteToken: string): StorageDriver {
  const storeId = readWriteToken.split("_")[3] ?? ""; // vercel_blob_rw_{storeId}_{secret}
  if (!storeId || storeId === "local") throw new Error("BLOB_READ_WRITE_TOKEN is not a Vercel Blob store token");
  // The API URL override sends the SDK to the local store; it must never meet a real token
  if (process.env.VERCEL_BLOB_API_URL || process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) {
    throw new Error("Unset VERCEL_BLOB_API_URL and NEXT_PUBLIC_VERCEL_BLOB_API_URL to use Vercel Blob (DECISIONS.md D-022)");
  }
  const origin = `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com`;

  return {
    name: "blob",
    readWriteToken,
    publicUrl: (storedPathname) => `${origin}/${storedPathname}`,
    storedPathnameOf(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return undefined;
      }
      const plain = !parsed.search && !parsed.hash && !parsed.username && !parsed.password;
      return plain && parsed.origin === origin ? parsed.pathname.slice(1) : undefined;
    },
    // Read whole, with no redirect followed and no more than the cap (API-17)
    async read(storedPathname, maxBytes) {
      const response = await fetch(`${origin}/${storedPathname}`, { redirect: "error" });
      if (response.status === 404) return "missing";
      if (!response.ok) throw new Error(`Storage read failed with status ${response.status}`);
      return readCapped(response.body, maxBytes);
    },
    async remove(storedPathname) {
      await del(`${origin}/${storedPathname}`, { token: readWriteToken });
    },
  };
}
