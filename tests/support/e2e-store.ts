// The local store an e2e run's server uploads to (SRS §16.1): a new folder in the temporary folder
// for each run, which the server makes on its first upload and the global teardown removes. A store
// named by hand in MUFTAH_E2E_STORE is used, and kept unless it has the name this module gives.
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PREFIX = "muftah-e2e-store-";

/** The run's store. The runner's first evaluation of the config names it, and the workers inherit it */
export function e2eStore(): string {
  return (process.env.MUFTAH_E2E_STORE ??= path.join(os.tmpdir(), `${PREFIX}${crypto.randomUUID()}`));
}

/** Playwright's global teardown: removes the run's store, never a folder named by hand */
export default function removeE2eStore(): void {
  const store = process.env.MUFTAH_E2E_STORE;
  if (store === undefined || path.dirname(store) !== os.tmpdir() || !path.basename(store).startsWith(PREFIX)) return;
  rmSync(store, { recursive: true, force: true });
}
