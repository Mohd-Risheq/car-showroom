import { describe, expect, it } from "vitest";
import {
  backingSize,
  bitmapBytes,
  containRect,
  dragPosition,
  fitInside,
  frameAt,
  keyStep,
  loadOrder,
  nearestLoaded,
  pixelsPerFrame,
  projectRelease,
  releaseTarget,
  releaseVelocity,
  sameSize,
  spreadOrder,
  wrapFrame,
} from "@/features/spin/domain/ring";

// The spin viewer's maths (FR-16, BR-17, DESIGN §5.4). Frame rate and memory are measured in
// the browsers (spike T-05).

describe("ring positions", () => {
  it("wraps any integer, negatives included, onto the ring", () => {
    expect(wrapFrame(0, 36)).toBe(0);
    expect(wrapFrame(37, 36)).toBe(1);
    expect(wrapFrame(-1, 36)).toBe(35);
    expect(wrapFrame(-73, 36)).toBe(35);
    expect(frameAt(35.6, 36)).toBe(0);
    expect(frameAt(-0.6, 36)).toBe(35);
  });

  it("rotates one frame per width / (frames × 0.66) px, toward the right showing the next frames", () => {
    expect(pixelsPerFrame(396, 36)).toBeCloseTo(16.667, 3);
    expect(dragPosition(4, 50, 36, 396)).toBeCloseTo(7, 6);
    expect(dragPosition(4, -50, 36, 396)).toBeCloseTo(1, 6);
    // A full-width drag turns 0.66 of the way round, whatever the frame count
    expect(dragPosition(0, 396, 72, 396) / 72).toBeCloseTo(0.66, 6);
  });

  it("maps the arrow keys physically: Right is the next frame, Shift moves 5", () => {
    expect(keyStep("ArrowRight", false)).toBe(1);
    expect(keyStep("ArrowLeft", false)).toBe(-1);
    expect(keyStep("ArrowRight", true)).toBe(5);
    expect(keyStep("ArrowLeft", true)).toBe(-5);
    expect(keyStep("ArrowUp", false)).toBe(0);
  });
});

describe("release", () => {
  const samples = (times: number[], positions: number[]) =>
    times.map((time, k) => ({ time, position: positions[k] ?? 0 }));

  it("takes the velocity from the last 5 samples, in frames per second", () => {
    const moves = samples([0, 16, 32, 48, 64, 80, 96], [0, 0, 1, 2, 3, 4, 5]);
    expect(releaseVelocity(moves, 100)).toBeCloseTo(62.5, 6);
  });

  it("releases with no velocity when the finger stopped before lifting", () => {
    expect(releaseVelocity(samples([0, 16, 32], [0, 1, 2]), 300)).toBe(0);
    expect(releaseVelocity(samples([10], [3]), 20)).toBe(0);
    expect(releaseVelocity([], 0)).toBe(0);
  });

  it("projects with d / (1 − d) = 499 ms and rests on the nearest whole frame", () => {
    expect(projectRelease(10, 1000)).toBeCloseTo(509, 6);
    expect(projectRelease(10, -100)).toBeCloseTo(-39.9, 6);
    expect(releaseTarget(10.2, 0)).toBe(10);
    expect(releaseTarget(10.2, 60)).toBe(40);
    expect(releaseTarget(-3.4, -10)).toBe(-8);
  });
});

describe("loading order", () => {
  it("spreads positions round the ring so any prefix covers it evenly", () => {
    const order = spreadOrder(36);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 36 }, (_, k) => k));
    expect(order.slice(0, 4)).toEqual([0, 18, 9, 27]);
    // After 2^k picks, no gap round the ring is wider than 36 / 2^k, rounded up
    for (const picks of [2, 4, 8, 16]) {
      const taken = [...order.slice(0, picks)].sort((a, b) => a - b);
      const gaps = taken.map((value, k) => (taken[k + 1] ?? (taken[0] ?? 0) + 36) - value);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(Math.ceil(36 / picks));
    }
  });

  it("loads at most 36 evenly spaced frames first, and the rest on the first interaction", () => {
    const small = loadOrder(24);
    expect(small.firstPass).toHaveLength(24);
    expect(small.rest).toEqual([]);

    const large = loadOrder(72);
    expect(large.firstPass).toHaveLength(36);
    expect(large.firstPass.every((index) => index % 2 === 0)).toBe(true);
    expect(large.rest).toHaveLength(36);
    expect(new Set([...large.firstPass, ...large.rest]).size).toBe(72);

    // A count that doesn't divide 360 (FR-16 edge case) still gets 36 distinct first frames
    const odd = loadOrder(50);
    expect(new Set(odd.firstPass).size).toBe(36);
    expect(new Set([...odd.firstPass, ...odd.rest]).size).toBe(50);
  });

  it("shows the nearest loaded frame, searching both ways round the ring", () => {
    const loaded = new Set([0, 18]);
    const isLoaded = (index: number) => loaded.has(index);
    expect(nearestLoaded(2, 36, isLoaded)).toBe(0);
    expect(nearestLoaded(34, 36, isLoaded)).toBe(0);
    expect(nearestLoaded(-3, 36, isLoaded)).toBe(0);
    expect(nearestLoaded(15, 36, isLoaded)).toBe(18);
    expect(nearestLoaded(5, 36, () => false)).toBe(-1);
  });
});

describe("sizes and memory", () => {
  it("decodes a portrait frame at its letterboxed size, never upscaling", () => {
    expect(fitInside({ width: 480, height: 720 }, { width: 480, height: 320 })).toEqual({ width: 213, height: 320 });
    expect(fitInside({ width: 480, height: 320 }, { width: 480, height: 320 })).toEqual({ width: 480, height: 320 });
    expect(fitInside({ width: 480, height: 320 }, { width: 1170, height: 780 })).toEqual({ width: 480, height: 320 });
  });

  it("compares sizes by width and height", () => {
    expect(sameSize({ width: 480, height: 320 }, { width: 480, height: 320 })).toBe(true);
    expect(sameSize({ width: 480, height: 320 }, { width: 320, height: 480 })).toBe(false);
    expect(sameSize({ width: 480, height: 320 }, { width: 480, height: 321 })).toBe(false);
  });

  it("draws centred and letterboxed", () => {
    expect(containRect({ width: 480, height: 720 }, { width: 960, height: 640 })).toEqual({
      x: (960 - 640 * (480 / 720)) / 2,
      y: 0,
      width: 640 * (480 / 720),
      height: 640,
    });
  });

  it("sizes the canvas by device pixel ratio, at most 1280 px wide", () => {
    expect(backingSize(390, 260, 3)).toEqual({ width: 1170, height: 780 });
    expect(backingSize(1200, 800, 2)).toEqual({ width: 1280, height: 853 });
  });

  it("keeps the worst case BR-17 allows inside NFR-PERF-07 (60 MB)", () => {
    const lowRes = 72 * bitmapBytes({ width: 480, height: 320 });
    const highRes = bitmapBytes({ width: 1280, height: 853 });
    expect(lowRes + highRes).toBeLessThanOrEqual(60 * 1024 * 1024);
    const portrait = 72 * bitmapBytes(fitInside({ width: 480, height: 720 }, { width: 480, height: 320 }));
    expect(portrait + highRes).toBeLessThanOrEqual(60 * 1024 * 1024);
    // Decoded at full size, the same portrait set alone would break the budget
    expect(72 * bitmapBytes({ width: 480, height: 720 })).toBeGreaterThan(60 * 1024 * 1024);
  });
});
