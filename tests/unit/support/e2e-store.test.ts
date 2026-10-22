import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import removeE2eStore, { e2eStore } from "../../support/e2e-store.ts";

// The local store an e2e run's server uploads to (SRS §16.1): a new temporary folder per run, which
// the global teardown removes, while a store named by hand is used and kept

describe("e2eStore", () => {
  it("names a new temporary folder once, and leaves making it to the server", () => {
    vi.stubEnv("MUFTAH_E2E_STORE", undefined);
    const store = e2eStore();
    expect(path.dirname(store)).toBe(os.tmpdir());
    expect(path.basename(store)).toMatch(/^muftah-e2e-store-[0-9a-f-]{36}$/);
    expect(e2eStore()).toBe(store);
    expect(existsSync(store)).toBe(false);
  });

  it("uses a store named by hand", () => {
    vi.stubEnv("MUFTAH_E2E_STORE", "/srv/muftah-store");
    expect(e2eStore()).toBe("/srv/muftah-store");
  });
});

describe("removeE2eStore", () => {
  it("removes the run's store with what was uploaded to it", () => {
    vi.stubEnv("MUFTAH_E2E_STORE", undefined);
    const store = e2eStore();
    onTestFinished(() => rmSync(store, { recursive: true, force: true }));
    mkdirSync(path.join(store, "cars"), { recursive: true });
    writeFileSync(path.join(store, "cars", "photo.jpg"), "bytes");
    removeE2eStore();
    expect(existsSync(store)).toBe(false);
  });

  it("keeps a store named by hand", () => {
    const kept = mkdtempSync(path.join(os.tmpdir(), "muftah-kept-store-"));
    onTestFinished(() => rmSync(kept, { recursive: true, force: true }));
    vi.stubEnv("MUFTAH_E2E_STORE", kept);
    removeE2eStore();
    expect(existsSync(kept)).toBe(true);
  });

  it("does nothing when the run made no store", () => {
    vi.stubEnv("MUFTAH_E2E_STORE", undefined);
    expect(() => removeE2eStore()).not.toThrow();
    vi.stubEnv("MUFTAH_E2E_STORE", path.join(os.tmpdir(), "muftah-e2e-store-never-made"));
    expect(() => removeE2eStore()).not.toThrow();
  });
});
