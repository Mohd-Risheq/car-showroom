import { describe, expect, it } from "vitest";
import { type Stage, StageGesture } from "@/features/car-page/domain/stage-gesture";
import { UNZOOMED, type Zoom } from "@/features/car-page/domain/viewer";
import { at, PHONE } from "../../support/viewer-input";

// The fullscreen viewer's gestures on its photo (FR-10.4, DESIGN §7.2.4), from pointers given as px
// from the screen's middle: two fingers pinch the photo, one pans it once it is zoomed, and a
// double tap zooms it in or back out

/** A landscape photo fitted to the phone: 720 by 540 at 2x, so 180 px either way across */
const FITTED = { width: 360, height: 270 };

const stage = (zoom: Zoom = UNZOOMED): Stage => ({ zoom, fitted: FITTED, screen: PHONE });

/** A tap of one finger, down and up where and when it is given */
function tap(gesture: StageGesture, x: number, y: number, time: number, zoom: Zoom = UNZOOMED) {
  gesture.down(at(1, x, y, time), stage(zoom));
  return gesture.up(at(1, x, y, time + 80), stage(zoom));
}

describe("a pinch", () => {
  it("zooms by the change in the fingers' distance, the photo following the point between them", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, -50, 0), stage());
    gesture.down(at(2, 50, 0), stage());
    // 100 px apart, then 200, with the point between them gone from the middle to 50 px right
    expect(gesture.move(at(2, 150, 0), stage())).toStrictEqual({ scale: 2, pan: { x: 50, y: 0 } });
  });

  it("keeps the photo's point under the fingers where they started", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, 60, 0), stage());
    gesture.down(at(2, 100, 0), stage());
    const zoom = gesture.move(at(2, 140, 0), stage());
    expect(zoom).toStrictEqual({ scale: 2, pan: { x: -60, y: 0 } });
    // The photo's point 80 px right of its middle is under the point between the fingers
    expect((zoom?.pan.x ?? 0) + 80 * 2).toBe(100);
  });

  it("holds the scale from 1x to 3x (FR-10.4)", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, -20, 0), stage());
    gesture.down(at(2, 20, 0), stage());
    expect(gesture.move(at(2, 180, 0), stage())?.scale).toBe(3);
    expect(gesture.move(at(2, -10, 0), stage())?.scale).toBe(1);
  });

  it("starts from the zoom the gesture led to, even before the viewer shows it", () => {
    const gesture = new StageGesture();
    const zoomed = { scale: 2, pan: { x: 0, y: 0 } };
    gesture.down(at(1, 0, 0), stage(zoomed));
    expect(gesture.move(at(1, 100, 0), stage(zoomed))).toStrictEqual({ scale: 2, pan: { x: 100, y: 0 } });
    // The second finger lands while the viewer still shows the zoom the pan started from
    gesture.down(at(2, 200, 0), stage(zoomed));
    const pinched = gesture.move(at(2, 300, 0), stage(zoomed));
    expect(pinched).toStrictEqual({ scale: 3, pan: { x: 125, y: 0 } });
    // The photo's point that was between the fingers, 25 px right of its middle, still is
    expect((pinched?.pan.x ?? 0) + 25 * 3).toBe(200);
  });

  it("settles at 1x when it ends a hair from it", () => {
    const gesture = new StageGesture();
    const zoomed = { scale: 2, pan: { x: 0, y: 0 } };
    gesture.down(at(1, -50, 0), stage(zoomed));
    gesture.down(at(2, 50, 0), stage(zoomed));
    const near = gesture.move(at(2, 0.2, 0), stage(zoomed));
    expect(near?.scale).toBeCloseTo(1.004, 6);
    expect(gesture.up(at(2, 0.2, 0), stage(near ?? zoomed))).toBeNull();
    expect(gesture.up(at(1, -50, 0), stage(near ?? zoomed))).toStrictEqual(UNZOOMED);
  });

  it("ends where it is anywhere else", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, -50, 0), stage());
    gesture.down(at(2, 50, 0), stage());
    const zoom = gesture.move(at(2, 150, 0), stage()) ?? UNZOOMED;
    expect(gesture.up(at(2, 150, 0), stage(zoom))).toBeNull();
    expect(gesture.up(at(1, -50, 0), stage(zoom))).toBeNull();
  });

  it("lets the finger left pan on from where the photo is, without a jump", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, -50, 0), stage());
    gesture.down(at(2, 50, 0), stage());
    const zoom = gesture.move(at(2, 150, 0), stage()) ?? UNZOOMED;
    expect(gesture.up(at(2, 150, 0), stage(zoom))).toBeNull();
    expect(gesture.move(at(1, -40, 0), stage(zoom))).toStrictEqual({ scale: 2, pan: { x: 60, y: 0 } });
  });

  it("takes no pinch from two fingers that land on one point", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, 10, 10), stage());
    gesture.down(at(2, 10, 10), stage());
    expect(gesture.move(at(2, 60, 10), stage())).toBeNull();
  });
});

describe("one finger", () => {
  it("pans a zoomed photo, held to its edges", () => {
    const gesture = new StageGesture();
    const zoomed = { scale: 2, pan: { x: 0, y: 0 } };
    gesture.down(at(1, 0, 0), stage(zoomed));
    // The photo fits the screen up and down at 2x, so it pans across alone
    expect(gesture.move(at(1, 100, 50), stage(zoomed))).toStrictEqual({ scale: 2, pan: { x: 100, y: 0 } });
    expect(gesture.move(at(1, 300, 0), stage(zoomed))).toStrictEqual({ scale: 2, pan: { x: 180, y: 0 } });
    expect(gesture.move(at(1, -300, 0), stage(zoomed))).toStrictEqual({ scale: 2, pan: { x: -180, y: 0 } });
  });

  it("leaves a photo at 1x where it is", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, 0, 0), stage());
    expect(gesture.move(at(1, 100, 0), stage())).toBeNull();
    expect(gesture.up(at(1, 100, 0), stage())).toBeNull();
  });

  it("moves nothing it isn't holding", () => {
    expect(new StageGesture().move(at(1, 100, 0), stage({ scale: 2, pan: { x: 0, y: 0 } }))).toBeNull();
  });
});

describe("a double tap", () => {
  it("zooms the photo to 2x about the point tapped", () => {
    const gesture = new StageGesture();
    expect(tap(gesture, 60, 0, 1000)).toBeNull();
    expect(tap(gesture, 62, 0, 1200)).toStrictEqual({ scale: 2, pan: { x: -62, y: 0 } });
  });

  it("zooms a zoomed photo back out to the photo fitted whole", () => {
    const gesture = new StageGesture();
    const zoomed = { scale: 3, pan: { x: 90, y: 10 } };
    expect(tap(gesture, 0, 0, 1000, zoomed)).toBeNull();
    expect(tap(gesture, 0, 0, 1200, zoomed)).toStrictEqual(UNZOOMED);
  });

  it("takes taps too far apart in time or place as two first taps", () => {
    const late = new StageGesture();
    tap(late, 0, 0, 1000);
    expect(tap(late, 0, 0, 1400)).toBeNull();
    const far = new StageGesture();
    tap(far, 0, 0, 1000);
    expect(tap(far, 40, 0, 1200)).toBeNull();
  });

  it("takes a third tap as a new first one", () => {
    const gesture = new StageGesture();
    tap(gesture, 0, 0, 1000);
    const zoom = tap(gesture, 0, 0, 1200) ?? UNZOOMED;
    expect(tap(gesture, 0, 0, 1400, zoom)).toBeNull();
  });

  it("takes no drag as a tap", () => {
    const gesture = new StageGesture();
    gesture.down(at(1, 0, 0, 1000), stage());
    gesture.move(at(1, 30, 0, 1040), stage());
    expect(gesture.up(at(1, 30, 0, 1080), stage())).toBeNull();
    // A tap where the drag went down, soon after, is a first tap
    expect(tap(gesture, 0, 0, 1200)).toBeNull();
  });

  it("takes no tap from a finger of a pinch", () => {
    const gesture = new StageGesture();
    tap(gesture, 0, 0, 1000);
    gesture.down(at(1, 0, 0, 1100), stage());
    gesture.down(at(2, 100, 0, 1120), stage());
    expect(gesture.up(at(2, 100, 0, 1150), stage())).toBeNull();
    expect(gesture.up(at(1, 0, 0, 1160), stage())).toBeNull();
  });
});

describe("a reset", () => {
  it("lets go of every pointer and tap, as when the viewer closes or steps to another photo", () => {
    const gesture = new StageGesture();
    const zoomed = { scale: 2, pan: { x: 0, y: 0 } };
    tap(gesture, 0, 0, 1000);
    gesture.down(at(2, 0, 0, 1100), stage(zoomed));
    gesture.reset();
    expect(gesture.move(at(2, 100, 0, 1120), stage(zoomed))).toBeNull();
    expect(tap(gesture, 0, 0, 1200)).toBeNull();
  });

  it("drops a pointer the browser cancelled", () => {
    const gesture = new StageGesture();
    const zoomed = { scale: 2, pan: { x: 0, y: 0 } };
    gesture.down(at(1, 0, 0), stage(zoomed));
    gesture.down(at(2, 100, 0), stage(zoomed));
    gesture.cancel(2);
    // The finger left pans on alone
    expect(gesture.move(at(1, 50, 0), stage(zoomed))).toStrictEqual({ scale: 2, pan: { x: 50, y: 0 } });
  });
});
