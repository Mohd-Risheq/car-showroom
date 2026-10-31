import { describe, expect, it, vi } from "vitest";

// The toaster's queue (src/components/ui/toaster.tsx, D-047), with Sonner's module mocked: toast
// calls run in the order they were made, so a toast closed as it opens stays closed, and a call
// whose load of Sonner fails, as offline, is dropped while the next call loads Sonner again.

/** What Sonner's module was asked to do, how often it loaded, and how many of its loads are to fail */
const sonner = { calls: [] as string[], loads: 0, failing: 0 };

/** Sonner's module, mocked: a load fails while loads are to fail, as offline */
function sonnerModule() {
  sonner.loads += 1;
  if (sonner.failing > 0) {
    sonner.failing -= 1;
    throw new Error("Failed to load the chunk, as offline");
  }
  return {
    SonnerToaster: () => null,
    openToast: (id: string) => sonner.calls.push(`open ${id}`),
    closeToast: (id: string) => sonner.calls.push(`close ${id}`),
  };
}

/**
 * The toaster as a page first loads it, before any toast, with Sonner's first loads failing as asked.
 * Each test mocks Sonner's module afresh, as a module loaded once stays loaded.
 */
async function loadToaster(failing = 0) {
  Object.assign(sonner, { calls: [], loads: 0, failing });
  vi.resetModules();
  vi.doMock("@/components/ui/sonner-toaster", sonnerModule);
  return import("@/components/ui/toaster");
}

describe("the toaster's queue", () => {
  it("runs the toast calls in the order they were made, so a toast closed as it opens stays closed", async () => {
    const { dismissToast, showToast } = await loadToaster();
    const kept = showToast("kept");
    const closed = showToast("closed as it opens");
    dismissToast(closed);
    await vi.waitFor(() => expect(sonner.calls).toStrictEqual([`open ${kept}`, `open ${closed}`, `close ${closed}`]));
    expect(sonner.loads).toBe(1);
  });

  it("drops a call whose load of Sonner fails, as offline, and the next call loads it again", async () => {
    const { showToast } = await loadToaster(1);
    showToast("lost");
    const shown = showToast("shown");
    await vi.waitFor(() => expect(sonner.calls).toStrictEqual([`open ${shown}`]));
    expect(sonner.loads).toBe(2);
  });
});
