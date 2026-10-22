import "server-only";
import { registerMediaSchema } from "@/lib/validation/media";
import { getStorageDriver, type StorageDriver } from "./driver";
import { StorageError } from "./errors";
import { inspectMedia } from "./inspect";
import { uploadRepository } from "./repository";
import { extensionOf, isStoredPathnameOf, MEDIA_TYPES, maxBytesFor, nominalWidth } from "./rules";

type StoredFile = { variant: string; signedPathname: string; storedPathname: string };

// No image may be more than twice as tall as it is wide (DECISIONS.md D-023)
const MAX_HEIGHT_TO_WIDTH = 2;

// API-17 registerMedia, the storage checks (SEC-08, FR-32.2a):
//  - each URL is on this store, at the pathname API-16 signed for that variant plus the suffix;
//  - each file is read whole under its variant's cap, and its type and container are checked;
//  - no image passes its variant's nominal width, and the largest matches the declared size;
//  - a rejected upload is deleted.
// T-16's defineAction serves it as a Server Action; T-32 adds Media rows, counts (BR-20, BR-30)
// and the remaining fields.
export async function registerMedia(input: unknown, actor: { userId: string }): Promise<{ mediaId: string }> {
  const parsed = registerMediaSchema.safeParse(input);
  if (!parsed.success) throw new StorageError("VALIDATION_ERROR", "input");
  const { carId, kind, clientUploadId, variants, width, height } = parsed.data;

  const record = await uploadRepository.find(clientUploadId);
  if (!record) throw new StorageError("NOT_FOUND", "no token was issued for this upload");
  if (record.userId !== actor.userId) throw new StorageError("FORBIDDEN", "not the uploader");
  if (record.carId !== carId || record.kind !== kind) throw new StorageError("VALIDATION_ERROR", "upload mismatch");
  if (record.status === "ready") return { mediaId: record.mediaId }; // idempotent on clientUploadId

  const driver = getStorageDriver();
  if (!driver) throw new StorageError("CAP_REACHED", "uploads off");

  // Exactly the variants API-16 signed
  const signed = Object.entries(record.expectedPaths);
  if (signed.length !== Object.keys(variants).length) throw new StorageError("VALIDATION_ERROR", "variants");
  const files: StoredFile[] = signed.map(([variant, signedPathname]) => {
    const url = variants[variant];
    const storedPathname = url === undefined ? undefined : driver.storedPathnameOf(url);
    if (!storedPathname || !isStoredPathnameOf(signedPathname, storedPathname)) {
      throw new StorageError("VALIDATION_ERROR", `url of ${variant}`);
    }
    return { variant, signedPathname, storedPathname };
  });

  let largest: { nominal: number; width: number; height: number } | undefined;
  for (const file of files) {
    const ext = extensionOf(file.signedPathname);
    const maxBytes = ext && maxBytesFor(kind, file.variant, ext, { demo: false });
    if (!ext || !maxBytes) throw new StorageError("VALIDATION_ERROR", `rules of ${file.variant}`);
    const bytes = await driver.read(file.storedPathname, maxBytes);
    // A missing file is not deleted: the client can upload it again and retry
    if (bytes === "missing") throw new StorageError("VALIDATION_ERROR", `${file.variant} not found`);
    if (bytes === "too_large") return reject(driver, files, "VALIDATION_ERROR", `${file.variant} too large`);

    const result = inspectMedia(bytes, MEDIA_TYPES[ext]);
    if (!result.ok) return reject(driver, files, result.code, `${file.variant} ${result.reason}`);
    if ("width" in result) {
      const nominal = nominalWidth(kind, file.variant) ?? 0;
      if (result.width > nominal || result.height > MAX_HEIGHT_TO_WIDTH * result.width) {
        return reject(driver, files, "VALIDATION_ERROR", `${file.variant} dimensions`);
      }
      if (!largest || nominal > largest.nominal) largest = { nominal, width: result.width, height: result.height };
    }
  }
  if (largest && (largest.width !== width || largest.height !== height)) {
    return reject(driver, files, "VALIDATION_ERROR", "declared size");
  }

  await uploadRepository.markReady(clientUploadId);
  return { mediaId: record.mediaId };
}

// Offending files are deleted with the rest of the upload, then the error is thrown (FR-32.2a)
async function reject(
  driver: StorageDriver,
  files: StoredFile[],
  code: "VALIDATION_ERROR" | "METADATA_PRESENT",
  reason: string,
): Promise<never> {
  await Promise.all(files.map((file) => removeOrLog(driver, file, code)));
  throw new StorageError(code, reason);
}

// A file that stays behind may still hold what the check refused, so its failure is logged with
// the signed pathname, the prefix of the stored one. T-16's lib/log takes this line over.
async function removeOrLog(driver: StorageDriver, file: StoredFile, rejection: string): Promise<void> {
  try {
    await driver.remove(file.storedPathname);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        code: "media_delete_failed",
        rejection,
        pathname: file.signedPathname,
        error: String(error),
      }),
    );
  }
}
