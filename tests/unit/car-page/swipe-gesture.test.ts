import { describe, expect, it } from "vitest";
import { type SwipeStage, SwipeGesture } from "@/features/car-page/domain/swipe-gesture";
import { UNZOOMED, type Zoom } from "@/features/car-page/domain/viewer";
import { at, PHONE } from "../../support/viewer-input";

// A finger's drag of a photo fitted whole in the fullscreen viewer (FR-10.3, DESIGN §7.2.4), from
// pointers given as px from the screen's middle: across, it brings in the photo beside it, from the
// right in English and from the left in Arabic; down, it closes the viewer

/** A photo with one each side of it, unless the stage says otherwise */
const stage = (overrides: Partial<SwipeStage> = {}): SwipeStage => ({
  zoom: UNZOOMED,
  screen: PHONE,
  dir: "ltr",
  previous: true,
  next: true,
  ...overrides,
});

/** A finger's drag from the middle, in even steps 10 ms apart, released `pause` ms after its last */
function drag(gesture: SwipeGesture, x: number, y: number, on = stage(), pause = 0) {
  gesture.down(at(1, 0, 0, 1000), on);
  for (let step = 1; step <= 10; step += 1) gesture.move(at(1, (x * step) / 10, (y * step) / 10, 1000 + step * 10), on);
  return gesture.up(at(1, x, y, 1100 + pause), on);
}

describe("a swipe across", () => {
  it("follows the finger once it has gone past a tap's reach", () => {
    const gesture = new SwipeGesture();
    gesture.down(at(1, 0, 0), stage());
    expect(gesture.move(at(1, -8, 0), stage())).toBeNull();
    expect(gesture.move(at(1, -120, 10), stage())).toStrictEqual({ axis: "across", offset: -120 });
  });

  it("brings in the next photo when dragged against the reading direction past half the screen", () => {
    expect(drag(new SwipeGesture(), -220, 0, stage(), 200)).toMatchObject({ axis: "across", move: 1, offset: -220 });
    expect(drag(new SwipeGesture(), 220, 0, stage({ dir: "rtl" }), 200)).toMatchObject({ axis: "across", move: 1 });
    expect(drag(new SwipeGesture(), 220, 0, stage(), 200)).toMatchObject({ axis: "across", move: -1 });
  });

  it("goes on after a flick, however short, and puts the photo back after a short, slow drag", () => {
    expect(drag(new SwipeGesture(), -40, 0)).toMatchObject({ move: 1 });
    expect(drag(new SwipeGesture(), -60, 0, stage(), 200)).toMatchObject({ move: 0, velocity: 0 });
  });

  it("gives less the further it is pulled where there is no photo that way, and stays", () => {
    const gesture = new SwipeGesture();
    const last = stage({ next: false });
    gesture.down(at(1, 0, 0), last);
    const pulled = gesture.move(at(1, -220, 0), last);
    expect(pulled?.offset).toBeLessThan(0);
    expect(pulled?.offset).toBeGreaterThan(-220);
    // Even a flick that way leaves the photo where it is
    expect(drag(new SwipeGesture(), -100, 0, last)).toMatchObject({ move: 0 });
    expect(drag(new SwipeGesture(), 100, 0, stage({ dir: "rtl", next: false }))).toMatchObject({ move: 0 });
    expect(drag(new SwipeGesture(), 100, 0, stage({ previous: false }))).toMatchObject({ move: 0 });
  });

  it("keeps the axis it took, even as the finger turns", () => {
    const gesture = new SwipeGesture();
    gesture.down(at(1, 0, 0), stage());
    gesture.move(at(1, -40, 0), stage());
    expect(gesture.move(at(1, -60, 300), stage())).toStrictEqual({ axis: "across", offset: -60 });
  });
});

describe("a swipe down", () => {
  it("follows the finger, and closes the viewer past half the screen or after a flick", () => {
    const gesture = new SwipeGesture();
    gesture.down(at(1, 0, 0), stage());
    expect(gesture.move(at(1, 10, 200), stage())).toStrictEqual({ axis: "down", offset: 200 });
    expect(drag(new SwipeGesture(), 0, 420, stage(), 200)).toMatchObject({ axis: "down", closes: true });
    expect(drag(new SwipeGesture(), 0, 60)).toMatchObject({ axis: "down", closes: true });
    expect(drag(new SwipeGesture(), 0, 200, stage(), 200)).toMatchObject({ axis: "down", closes: false });
  });

  it("does nothing for a drag up", () => {
    const gesture = new SwipeGesture();
    gesture.down(at(1, 0, 0), stage());
    expect(gesture.move(at(1, 0, -200), stage())).toBeNull();
    expect(gesture.up(at(1, 0, -200), stage())).toBeNull();
  });
});

describe("what is no swipe", () => {
  it("leaves a tap alone", () => {
    const gesture = new SwipeGesture();
    gesture.down(at(1, 0, 0), stage());
    expect(gesture.up(at(1, 4, 2), stage())).toBeNull();
  });

  it("leaves a zoomed photo to its pan", () => {
    const zoomed: Zoom = { scale: 2, pan: { x: 0, y: 0 } };
    expect(drag(new SwipeGesture(), -220, 0, stage({ zoom: zoomed }), 200)).toBeNull();
  });

  it("ends with a second finger, which pinches, and puts the photo back", () => {
    const gesture = new SwipeGesture();
    gesture.down(at(1, 0, 0), stage());
    gesture.move(at(1, -100, 0), stage());
    expect(gesture.down(at(2, 50, 0), stage())).toMatchObject({ axis: "across", move: 0, velocity: 0 });
    expect(gesture.move(at(1, -150, 0), stage())).toBeNull();
  });

  it("takes no swipe from the finger a pinch leaves, nor from one that lands beside it", () => {
    const gesture = new SwipeGesture();
    gesture.down(at(1, 0, 0), stage());
    gesture.down(at(2, 100, 0), stage());
    gesture.up(at(2, 100, 0), stage());
    expect(gesture.move(at(1, -200, 0), stage())).toBeNull();
    gesture.down(at(3, 0, 0), stage());
    expect(gesture.move(at(3, -200, 0), stage())).toBeNull();
    expect(gesture.up(at(1, -200, 0), stage())).toBeNull();
    expect(gesture.up(at(3, -200, 0), stage())).toBeNull();
    // Once every finger has lifted, the next drag is a swipe again
    expect(drag(gesture, -220, 0, stage(), 200)).toMatchObject({ move: 1 });
  });

  it("puts the photo back when the browser cancels the finger, and forgets every finger on a reset", () => {
    const cancelled = new SwipeGesture();
    cancelled.down(at(1, 0, 0), stage());
    cancelled.move(at(1, -200, 0), stage());
    expect(cancelled.cancel(1)).toMatchObject({ axis: "across", move: 0 });
    expect(cancelled.move(at(1, -220, 0), stage())).toBeNull();

    const reset = new SwipeGesture();
    reset.down(at(1, 0, 0), stage());
    reset.reset();
    expect(reset.move(at(1, -200, 0), stage())).toBeNull();
    expect(drag(reset, -220, 0, stage(), 200)).toMatchObject({ move: 1 });
  });
});
