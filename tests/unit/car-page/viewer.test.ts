import { describe, expect, it } from "vitest";
import {
  canZoomIn,
  canZoomOut,
  clampPan,
  fitRect,
  isDoubleTap,
  isUnzoomed,
  MAX_ZOOM,
  panFromKey,
  pinchScale,
  settleSpring,
  slotsAround,
  swipeStep,
  UNZOOMED,
  zoomAbout,
  zoomIn,
  zoomOut,
  zoomTo,
} from "@/features/car-page/domain/viewer";
import { SPRINGS } from "@/lib/motion-tokens";
import { PHONE, press } from "../../support/viewer-input";

// The fullscreen viewer's geometry (FR-10, DESIGN §7.2.4): the photos it holds, a photo fitted
// whole to the screen, zoom up to 3x by pinch, double tap and buttons (FR-10.4, SC 2.5.1), panning
// held to the photo's edges, by a drag or the arrow keys, and a swipe that steps in the reading
// direction (DESIGN §4.6)

const DESKTOP = { width: 1440, height: 900 };

describe("slotsAround", () => {
  it("holds the photo in view and the one each side of it, whose files load ahead (FR-10.5)", () => {
    expect(slotsAround(4, 10)).toStrictEqual([
      { index: 3, offset: -1 },
      { index: 4, offset: 0 },
      { index: 5, offset: 1 },
    ]);
  });

  it("holds none before the first photo or past the last", () => {
    expect(slotsAround(0, 10)).toStrictEqual([
      { index: 0, offset: 0 },
      { index: 1, offset: 1 },
    ]);
    expect(slotsAround(9, 10)).toStrictEqual([
      { index: 8, offset: -1 },
      { index: 9, offset: 0 },
    ]);
  });

  it("holds one photo alone", () => {
    expect(slotsAround(0, 1)).toStrictEqual([{ index: 0, offset: 0 }]);
  });
});

describe("fitRect", () => {
  it("fits a landscape photo to the screen's width on a phone", () => {
    expect(fitRect({ width: 1200, height: 900 }, PHONE)).toStrictEqual({ width: 360, height: 270 });
  });

  it("letterboxes a portrait photo whole, never cropping it (FR-10's edge case)", () => {
    expect(fitRect({ width: 960, height: 1280 }, DESKTOP)).toStrictEqual({ width: 675, height: 900 });
    expect(fitRect({ width: 960, height: 1280 }, PHONE)).toStrictEqual({ width: 360, height: 480 });
  });

  it("fills a screen of the photo's own shape", () => {
    expect(fitRect({ width: 1200, height: 900 }, { width: 800, height: 600 })).toStrictEqual({
      width: 800,
      height: 600,
    });
  });
});

describe("isUnzoomed", () => {
  it("holds for a photo at 1x and unpanned, whichever object holds that zoom", () => {
    expect(isUnzoomed(UNZOOMED)).toBe(true);
    expect(isUnzoomed({ scale: 1, pan: { x: 0, y: 0 } })).toBe(true);
  });

  it("fails for a photo scaled, however little, or panned", () => {
    expect(isUnzoomed({ scale: 1.005, pan: { x: 0, y: 0 } })).toBe(false);
    expect(isUnzoomed({ scale: 1, pan: { x: 0.5, y: 0 } })).toBe(false);
    expect(isUnzoomed({ scale: 1, pan: { x: 0, y: -0.5 } })).toBe(false);
  });
});

describe("zoomIn and zoomOut", () => {
  it("step through 1x, 2x and 3x, and stay at the ends (SC 2.5.1)", () => {
    expect(zoomIn(1)).toBe(2);
    expect(zoomIn(2)).toBe(3);
    expect(zoomIn(MAX_ZOOM)).toBe(3);
    expect(zoomOut(3)).toBe(2);
    expect(zoomOut(2)).toBe(1);
    expect(zoomOut(1)).toBe(1);
  });

  it("go to the next step from a pinch's scale between them", () => {
    expect(zoomIn(1.4)).toBe(2);
    expect(zoomIn(2.6)).toBe(3);
    expect(zoomOut(2.6)).toBe(2);
    expect(zoomOut(1.4)).toBe(1);
  });
});

describe("canZoomIn and canZoomOut", () => {
  it("say whether the buttons can go further: in to 3x, and out to 1x (DESIGN §7.2.4)", () => {
    expect(canZoomIn(1)).toBe(true);
    expect(canZoomIn(2.5)).toBe(true);
    expect(canZoomIn(MAX_ZOOM)).toBe(false);
    expect(canZoomOut(MAX_ZOOM)).toBe(true);
    expect(canZoomOut(1.5)).toBe(true);
    expect(canZoomOut(1)).toBe(false);
  });

  it("count a pinch a hair from an end as at it", () => {
    expect(canZoomIn(2.995)).toBe(false);
    expect(canZoomOut(1.005)).toBe(false);
  });
});

describe("zoomTo", () => {
  const fitted = { width: 360, height: 270 };

  it("zooms about the point, which keeps the photo's point under it", () => {
    expect(zoomTo(UNZOOMED, 2, { x: 60, y: 0 }, fitted, PHONE)).toStrictEqual({ scale: 2, pan: { x: -60, y: 0 } });
  });

  it("holds the pan to the photo's edges", () => {
    // At 2x the photo reaches 180 px either way across, and fits the screen up and down
    expect(zoomTo(UNZOOMED, 2, { x: 150, y: 100 }, fitted, PHONE)).toStrictEqual({
      scale: 2,
      pan: { x: -150, y: 0 },
    });
    expect(zoomTo(UNZOOMED, 3, { x: 150, y: 0 }, fitted, PHONE)).toStrictEqual({ scale: 3, pan: { x: -300, y: 0 } });
  });

  it("zooms back out to the photo fitted whole", () => {
    expect(zoomTo({ scale: 2, pan: { x: -60, y: 0 } }, 1, { x: 0, y: 0 }, fitted, PHONE)).toStrictEqual(UNZOOMED);
  });
});

describe("pinchScale", () => {
  it("scales by the change in the fingers' distance", () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 200, 250)).toBe(2.5);
  });

  it("holds the scale from 1x to 3x (FR-10.4)", () => {
    expect(pinchScale(1, 200, 100)).toBe(1);
    expect(pinchScale(2, 100, 400)).toBe(MAX_ZOOM);
  });
});

describe("clampPan", () => {
  const fitted = { width: 360, height: 270 };

  it("keeps a photo at 1x where it is", () => {
    expect(clampPan({ x: 40, y: -30 }, fitted, 1, PHONE)).toStrictEqual({ x: 0, y: 0 });
  });

  it("lets a zoomed photo move as far as its edges, and no further", () => {
    // At 2x the photo is 720 by 540: 180 px either way across, and shorter than the screen
    expect(clampPan({ x: 500, y: 100 }, fitted, 2, PHONE)).toStrictEqual({ x: 180, y: 0 });
    expect(clampPan({ x: -500, y: -100 }, fitted, 2, PHONE)).toStrictEqual({ x: -180, y: 0 });
    // At 3x it is 1080 by 810: 15 px either way up and down
    expect(clampPan({ x: 100, y: -90 }, fitted, 3, PHONE)).toStrictEqual({ x: 100, y: -15 });
  });
});

describe("panFromKey", () => {
  // At 2x the photo is 2400 by 1800: 480 px either way across and 450 up and down
  const fitted = { width: 1200, height: 900 };
  const zoomed = (x: number, y: number) => ({ scale: 2, pan: { x, y } });

  it("moves a zoomed photo a tenth of the screen, so the side the key names comes into view", () => {
    expect(panFromKey(press("ArrowRight"), zoomed(0, 0), fitted, DESKTOP)).toStrictEqual(zoomed(-144, 0));
    expect(panFromKey(press("ArrowLeft"), zoomed(0, 0), fitted, DESKTOP)).toStrictEqual(zoomed(144, 0));
    expect(panFromKey(press("ArrowDown"), zoomed(0, 0), fitted, DESKTOP)).toStrictEqual(zoomed(0, -90));
    expect(panFromKey(press("ArrowUp"), zoomed(0, 0), fitted, DESKTOP)).toStrictEqual(zoomed(0, 90));
  });

  it("goes no further than the photo's edges", () => {
    expect(panFromKey(press("ArrowRight"), zoomed(-400, 0), fitted, DESKTOP)).toStrictEqual(zoomed(-480, 0));
    expect(panFromKey(press("ArrowRight"), zoomed(-480, 0), fitted, DESKTOP)).toStrictEqual(zoomed(-480, 0));
    expect(panFromKey(press("ArrowUp"), zoomed(0, 400), fitted, DESKTOP)).toStrictEqual(zoomed(0, 450));
  });

  it("takes an arrow that can't move the photo all the same, so a zoomed photo never steps", () => {
    // At 2x on a phone the photo is 720 by 540, shorter than the screen
    expect(panFromKey(press("ArrowDown"), zoomed(0, 0), { width: 360, height: 270 }, PHONE)).toStrictEqual(
      zoomed(0, 0),
    );
  });

  it("leaves the arrows to the steps at 1x, and another key or an arrow held with Alt, Ctrl or Cmd alone", () => {
    expect(panFromKey(press("ArrowRight"), UNZOOMED, fitted, DESKTOP)).toBeNull();
    // A pinch that ended a hair past 1x has settled at 1x
    expect(panFromKey(press("ArrowRight"), { scale: 1.005, pan: { x: 0, y: 0 } }, fitted, DESKTOP)).toBeNull();
    for (const key of ["Enter", " ", "Home", "PageDown", "a"]) {
      expect(panFromKey(press(key), zoomed(0, 0), fitted, DESKTOP), key).toBeNull();
    }
    for (const held of ["altKey", "ctrlKey", "metaKey"] as const) {
      expect(panFromKey(press("ArrowRight", { [held]: true }), zoomed(0, 0), fitted, DESKTOP), held).toBeNull();
    }
  });
});

describe("zoomAbout", () => {
  it("keeps the point under the finger where it is", () => {
    const point = { x: 60, y: -40 };
    const pan = zoomAbout({ x: 0, y: 0 }, point, 1, 2);
    expect(pan).toStrictEqual({ x: -60, y: 40 });
    // The photo's point under the finger, before (at 1x, no pan) and after
    expect((point.x - pan.x) / 2).toBe(point.x);
    expect((point.y - pan.y) / 2).toBe(point.y);
  });

  it("keeps it there zooming out too", () => {
    const point = { x: 10, y: 10 };
    const before = { x: -60, y: 40 };
    const pan = zoomAbout(before, point, 2, 1);
    expect(pan).toStrictEqual({ x: -25, y: 25 });
    expect(pan.x + (point.x - before.x) / 2).toBe(point.x);
    expect(pan.y + (point.y - before.y) / 2).toBe(point.y);
  });
});

describe("isDoubleTap", () => {
  const first = { time: 1000, x: 100, y: 200 };

  it("takes a second tap within 300 ms and 24 px", () => {
    expect(isDoubleTap(first, { time: 1250, x: 110, y: 215 })).toBe(true);
  });

  it("takes a later or farther tap as a new one", () => {
    expect(isDoubleTap(first, { time: 1301, x: 100, y: 200 })).toBe(false);
    expect(isDoubleTap(first, { time: 1100, x: 125, y: 200 })).toBe(false);
  });
});

describe("swipeStep", () => {
  const width = PHONE.width;

  it("goes on when the photo is dragged against the reading direction past half the screen", () => {
    expect(swipeStep(-200, 0, width, "ltr")).toBe(1);
    expect(swipeStep(200, 0, width, "rtl")).toBe(1);
  });

  it("goes back when it is dragged with the reading direction", () => {
    expect(swipeStep(200, 0, width, "ltr")).toBe(-1);
    expect(swipeStep(-200, 0, width, "rtl")).toBe(-1);
  });

  it("goes on after a flick, however short", () => {
    expect(swipeStep(-30, -400, width, "ltr")).toBe(1);
    expect(swipeStep(30, 400, width, "rtl")).toBe(1);
  });

  it("stays after a short, slow drag", () => {
    expect(swipeStep(-60, -20, width, "ltr")).toBe(0);
    expect(swipeStep(60, 20, width, "rtl")).toBe(0);
  });

  it("goes on after a slow release whose momentum carries the photo past half the screen", () => {
    // 150 px is short of half of 360, and 100 px/s is no flick, but would carry the photo 50 px on
    expect(swipeStep(-150, -100, 360, "ltr")).toBe(1);
    expect(swipeStep(150, 100, 360, "rtl")).toBe(1);
    // Where it would carry the photo 50 px on from 100 px, it stays
    expect(swipeStep(-100, -100, 360, "ltr")).toBe(0);
  });
});

describe("settleSpring", () => {
  it("bounces a little after a flick, and not after a slow release (DESIGN §4.3)", () => {
    expect(settleSpring(-400)).toBe(SPRINGS.flick);
    expect(settleSpring(400)).toBe(SPRINGS.flick);
    expect(settleSpring(60)).toBe(SPRINGS.move);
    expect(settleSpring(0)).toBe(SPRINGS.move);
  });
});
