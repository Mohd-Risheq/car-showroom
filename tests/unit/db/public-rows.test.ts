import { afterEach, describe, expect, it, vi } from "vitest";
import { liveSettingsRow, publicFile } from "@/lib/db/public-rows";

// What the builders of SRS §11.4's public reads share: the dealer's one live settings row, and an
// image a page shows whole

const MEDIA = "01923456-7890-7abc-8def-0000000000f9";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("liveSettingsRow", () => {
  it("takes the dealer's one live row", () => {
    expect(liveSettingsRow([{ soldVisibleDays: 14 }])).toStrictEqual({ soldVisibleDays: 14 });
  });

  it("refuses none, and refuses two, which only a scope fault would let through (SEC-04)", () => {
    expect(() => liveSettingsRow([])).toThrow(/settings/);
    expect(() => liveSettingsRow([{ soldVisibleDays: 14 }, { soldVisibleDays: 60 }])).toThrow(/settings/);
  });
});

describe("publicFile", () => {
  it("gives a ready image's address and size", () => {
    expect(publicFile(MEDIA, { src: "/seed/logo.png" }, 512, 128)).toStrictEqual({
      src: "/seed/logo.png",
      width: 512,
      height: 128,
    });
  });

  it("leaves out, logged, an image without its address or its size", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(publicFile(MEDIA, { "480": "/seed/logo-480.webp" }, 512, 128)).toBeNull();
    expect(publicFile(MEDIA, null, 512, 128)).toBeNull();
    expect(publicFile(MEDIA, { src: "/seed/logo.png" }, null, 128)).toBeNull();
    expect(publicFile(MEDIA, { src: "/seed/logo.png" }, 512, null)).toBeNull();
    expect(logged.mock.calls.map(([line]) => JSON.parse(String(line)))).toStrictEqual(
      Array.from({ length: 4 }, () => ({ level: "error", code: "public_media_incomplete", mediaId: MEDIA })),
    );
  });
});
