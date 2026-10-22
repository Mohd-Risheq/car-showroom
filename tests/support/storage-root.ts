import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

// Each integration test file keeps its local store in a temporary folder, removed after the
// file, so a run never writes into the developer's .storage-local/ (src/lib/storage/local.ts).
const root = await mkdtemp(path.join(os.tmpdir(), "muftah-store-"));
process.env.STORAGE_LOCAL_ROOT = root;
afterAll(() => rm(root, { recursive: true, force: true }));
