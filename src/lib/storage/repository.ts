import "server-only";
import type { MediaKind } from "./rules";

// Pending and registered uploads: ENT-Media's status, client_upload_id and expected_paths.
// T-03 keeps them in memory; T-32 moves them to Media rows with dealer scoping and the ledger.

export type UploadRecord = {
  mediaId: string;
  userId: string;
  carId: string;
  kind: MediaKind;
  clientUploadId: string;
  expectedPaths: Readonly<Record<string, string>>; // variant: the pathname API-16 signed
  status: "pending" | "ready";
};

export type RecordPathResult = { ok: true } | { ok: false; reason: "forbidden" | "conflict" };

export interface UploadRepository {
  find(clientUploadId: string): Promise<UploadRecord | undefined>;
  // Adds one variant's signed pathname, creating the pending record on first use
  recordExpectedPath(input: {
    userId: string;
    carId: string;
    kind: MediaKind;
    clientUploadId: string;
    variant: string;
    pathname: string;
  }): Promise<RecordPathResult>;
  markReady(clientUploadId: string): Promise<void>;
}

// One map per process, shared by every route bundle and kept across dev reloads
const STORE = Symbol.for("muftah.storage.uploads");

function records(): Map<string, UploadRecord> {
  const holder = globalThis as typeof globalThis & { [STORE]?: Map<string, UploadRecord> };
  holder[STORE] ??= new Map();
  return holder[STORE];
}

// Each method reads and writes without awaiting in between, so two token requests for the
// same upload can't overwrite each other
export const uploadRepository: UploadRepository = {
  async find(clientUploadId) {
    return records().get(clientUploadId);
  },
  async recordExpectedPath({ userId, carId, kind, clientUploadId, variant, pathname }) {
    const existing = records().get(clientUploadId);
    if (!existing) {
      records().set(clientUploadId, {
        mediaId: crypto.randomUUID(),
        userId,
        carId,
        kind,
        clientUploadId,
        expectedPaths: { [variant]: pathname },
        status: "pending",
      });
      return { ok: true };
    }
    if (existing.userId !== userId) return { ok: false, reason: "forbidden" };
    const signed = existing.expectedPaths[variant];
    const sameUpload = existing.carId === carId && existing.kind === kind && existing.status === "pending";
    if (!sameUpload || (signed !== undefined && signed !== pathname)) return { ok: false, reason: "conflict" };
    records().set(clientUploadId, { ...existing, expectedPaths: { ...existing.expectedPaths, [variant]: pathname } });
    return { ok: true };
  },
  async markReady(clientUploadId) {
    const existing = records().get(clientUploadId);
    if (existing) records().set(clientUploadId, { ...existing, status: "ready" });
  },
};
