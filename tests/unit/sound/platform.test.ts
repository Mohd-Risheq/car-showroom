import { describe, expect, it } from "vitest";
import { needsSilentHint } from "@/features/sound/domain/platform";

// FR-15.12 and TC-15-1. The user agents are those of Safari 18 on each device.

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_MOBILE =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

describe("the silent-switch hint", () => {
  it("shows on iPhone and iPad", () => {
    expect(needsSilentHint(IPHONE, 5)).toBe(true);
    expect(needsSilentHint(IPAD_MOBILE, 5)).toBe(true);
  });

  it("shows on iPadOS, which reports a Mac, by its touch points", () => {
    expect(needsSilentHint(MAC, 5)).toBe(true);
    expect(needsSilentHint(MAC, 0)).toBe(false);
  });

  it("doesn't show elsewhere, touch screens included", () => {
    expect(needsSilentHint(ANDROID, 5)).toBe(false);
    expect(needsSilentHint(WINDOWS, 10)).toBe(false);
  });
});
