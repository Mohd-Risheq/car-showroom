import { describe, expect, it } from "vitest";
import { PAGE_VIEWPORT } from "@/styles/viewport";

// SRS §9.4's viewport, in both root layouts: the page runs under the notch and the home indicator,
// Android's on-screen keyboard resizes the layout (iOS's, only the visual viewport), and zoom is
// never disabled. tests/e2e/smoke.spec.ts reads it on the pages.

describe("the page's viewport", () => {
  it("is the device's width at scale 1, covering the safe areas, resized by Android's keyboard", () => {
    expect(PAGE_VIEWPORT).toStrictEqual({
      width: "device-width",
      initialScale: 1,
      viewportFit: "cover",
      interactiveWidget: "resizes-content",
    });
  });

  it("never limits zoom", () => {
    expect(PAGE_VIEWPORT).not.toHaveProperty("maximumScale");
    expect(PAGE_VIEWPORT).not.toHaveProperty("userScalable");
  });
});
