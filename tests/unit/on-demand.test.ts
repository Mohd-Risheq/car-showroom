import { afterEach, describe, expect, it, vi } from "vitest";
import { onDemand } from "@/lib/on-demand";

// D-047: a part a page loads on demand, as the fullscreen viewer and the menu sheet are, is handed
// on once it is in. A load that fails, as offline, counts under the part's code (NFR-OBS-02) and
// opens nothing, and the next ask loads it again.

const reportClientError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/track", () => ({ reportClientError }));

afterEach(() => {
  reportClientError.mockReset();
});

describe("onDemand", () => {
  it("hands the part on once it is in, and reports nothing", async () => {
    const use = vi.fn();
    onDemand(() => Promise.resolve("part"), "CHUNK_VIEWER")(use);
    await vi.waitFor(() => expect(use).toHaveBeenCalledExactlyOnceWith("part"));
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("counts a failed load under the part's code, with its error, and hands nothing on", async () => {
    const error = new TypeError("Failed to fetch dynamically imported module");
    const use = vi.fn();
    onDemand(() => Promise.reject(error), "CHUNK_MENU")(use);
    await vi.waitFor(() => expect(reportClientError).toHaveBeenCalledExactlyOnceWith("CHUNK_MENU", error));
    expect(use).not.toHaveBeenCalled();
  });

  it("loads the part again at the next ask after a failed load", async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue("part");
    const use = vi.fn();
    const loadPart = onDemand(load, "CHUNK_VIEWER");
    loadPart(use);
    await vi.waitFor(() => expect(reportClientError).toHaveBeenCalledOnce());
    loadPart(use);
    await vi.waitFor(() => expect(use).toHaveBeenCalledExactlyOnceWith("part"));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
