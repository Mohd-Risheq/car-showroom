import { afterEach, describe, expect, it, vi } from "vitest";

// Motion's features (src/lib/motion/motion-features.tsx) load as a chunk of their own. Where it fails
// to load, as offline, the failure counts as CHUNK_MOTION (NFR-OBS-02, D-038), and the promise
// LazyMotion waits on never settles, which leaves it no rejection to drop unhandled.

const reportClientError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/track", () => ({ reportClientError }));

/** The loader as a page first loads it, with the chunk's load failing or not */
async function loadFeaturesOf({ failing }: { failing: boolean }) {
  vi.resetModules();
  if (failing) {
    vi.doMock("@/lib/motion/dom-animation", () => {
      throw new Error("Failed to load the chunk, as offline");
    });
  }
  return (await import("@/lib/motion/motion-features")).loadFeatures;
}

afterEach(() => {
  vi.doUnmock("@/lib/motion/dom-animation");
  reportClientError.mockReset();
});

describe("Motion's features", () => {
  it("count a failed load as CHUNK_MOTION and leave LazyMotion waiting", async () => {
    const loadFeatures = await loadFeaturesOf({ failing: true });
    let settled = false;
    const settle = () => {
      settled = true;
    };
    loadFeatures().then(settle, settle);
    await vi.waitFor(() => expect(reportClientError).toHaveBeenCalledWith("CHUNK_MOTION"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    expect(reportClientError).toHaveBeenCalledTimes(1);
  });

  it("are LazyMotion's once the chunk loads, and nothing is reported", async () => {
    const loadFeatures = await loadFeaturesOf({ failing: false });
    const { features } = await import("@/lib/motion/dom-animation");
    await expect(loadFeatures()).resolves.toBe(features);
    expect(reportClientError).not.toHaveBeenCalled();
  });
});
