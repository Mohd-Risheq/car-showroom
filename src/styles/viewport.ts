import type { Viewport } from "next";

// SRS §9.4's viewport, in both root layouts. The page runs under the notch and the home indicator,
// and env(safe-area-inset-*) pads its content back out. With interactive-widget, Android's
// on-screen keyboard shrinks the layout viewport, so what is fixed to the bottom of the screen
// rises above it there; iOS shrinks only the visual viewport, which keyboard.ts reads. Zoom is
// never disabled.
export const PAGE_VIEWPORT = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
} as const satisfies Viewport;
