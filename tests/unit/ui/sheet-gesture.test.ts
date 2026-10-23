import { describe, expect, it } from "vitest";
import {
  FLICK_SPEED,
  projection,
  releaseSpring,
  releaseVelocity,
  rubberBand,
  shouldDismiss,
} from "@/components/ui/sheet-gesture";
import { SPRINGS } from "@/lib/motion-tokens";

const HEIGHT = 600;

describe("the bottom sheet's release", () => {
  it("closes on a downward flick faster than 0.11 px/ms, however short the drag", () => {
    expect(FLICK_SPEED).toBe(0.11 * 1000);
    expect(shouldDismiss({ offset: 4, velocity: 111, height: HEIGHT })).toBe(true);
    expect(shouldDismiss({ offset: 4, velocity: 109, height: HEIGHT })).toBe(false);
  });

  it("closes when the release would carry the sheet past half its height", () => {
    expect(shouldDismiss({ offset: 301, velocity: 0, height: HEIGHT })).toBe(true);
    expect(shouldDismiss({ offset: 299, velocity: 0, height: HEIGHT })).toBe(false);
    // 200 px down, still moving down at 100 px/s: carried about 50 px further, so it stays
    expect(shouldDismiss({ offset: 200, velocity: 100, height: HEIGHT })).toBe(false);
    // An upward release keeps it open even well down
    expect(shouldDismiss({ offset: 400, velocity: -1000, height: HEIGHT })).toBe(false);
  });

  it("never closes a sheet pulled above its open position", () => {
    expect(shouldDismiss({ offset: -20, velocity: 2000, height: HEIGHT })).toBe(false);
    expect(shouldDismiss({ offset: 0, velocity: 2000, height: HEIGHT })).toBe(false);
  });

  it("projects as iOS scrolling decelerates", () => {
    expect(projection(1000)).toBeCloseTo(499, 0);
    expect(projection(-1000)).toBeCloseTo(-499, 0);
    expect(projection(0)).toBe(0);
  });

  it("follows a pull past the top less and less, never past the sheet's height", () => {
    expect(rubberBand(0, HEIGHT)).toBe(0);
    const near = rubberBand(50, HEIGHT);
    const far = rubberBand(500, HEIGHT);
    expect(near).toBeLessThan(50);
    expect(far - near).toBeLessThan(450 * 0.5);
    expect(rubberBand(1_000_000, HEIGHT)).toBeLessThan(HEIGHT);
  });

  it("settles with the flick spring only after a release faster than a flick, either way", () => {
    expect(releaseSpring(FLICK_SPEED + 1)).toBe(SPRINGS.sheetAfterFlick);
    expect(releaseSpring(-(FLICK_SPEED + 1))).toBe(SPRINGS.sheetAfterFlick);
    expect(releaseSpring(FLICK_SPEED)).toBe(SPRINGS.sheetAfterTap);
    expect(releaseSpring(-FLICK_SPEED)).toBe(SPRINGS.sheetAfterTap);
  });
});

describe("the velocity at a release", () => {
  it("comes from the last 100 ms of the drag, in px/s", () => {
    const samples = [
      { time: 0, offset: 0 },
      { time: 900, offset: 40 },
      { time: 950, offset: 60 },
      { time: 1000, offset: 100 },
    ];
    // 0 ms is outside the window: from 900 to 1000 ms the sheet moved 60 px
    expect(releaseVelocity(samples, 1000)).toBeCloseTo(600, 6);
    // A fast start doesn't count once the drag has slowed
    const slowed = [
      { time: 0, offset: 0 },
      { time: 50, offset: 100 },
      { time: 980, offset: 110 },
      { time: 1000, offset: 120 },
    ];
    expect(releaseVelocity(slowed, 1000)).toBeCloseTo(500, 6);
  });

  it("is zero after a pause, and for a single sample", () => {
    expect(
      releaseVelocity(
        [
          { time: 0, offset: 0 },
          { time: 10, offset: 80 },
        ],
        500,
      ),
    ).toBe(0);
    expect(releaseVelocity([{ time: 490, offset: 80 }], 500)).toBe(0);
  });
});
