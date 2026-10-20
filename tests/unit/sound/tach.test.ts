import { describe, expect, it } from "vitest";
import {
  ALPHA,
  angleFor,
  clipLevels,
  dialFor,
  IDLE,
  needleTarget,
  percentile,
  REST,
  rmsDb,
  SILENCE_DB,
  smooth,
  topFor,
} from "@/features/sound/tach";

// BR-19, FR-15.10 and DESIGN §5.3

const FRAME = 1000 / 60;

/** `count` samples of a sine at `amplitude` */
function sine(count: number, amplitude: number): Float32Array {
  return Float32Array.from({ length: count }, (_, i) => amplitude * Math.sin((2 * Math.PI * i) / 32));
}

describe("dial", () => {
  it("reads 0 to 8 with the redline from 6.5 for petrol and every hybrid, and 0 to 6 from 4.5 for diesel", () => {
    for (const fuel of ["gasoline", "hybrid", "mild_hybrid", "plugin_hybrid"] as const) {
      expect(dialFor(fuel)).toEqual({ max: 8, redline: 6.5 });
    }
    expect(dialFor("diesel")).toEqual({ max: 6, redline: 4.5 });
  });

  it("doesn't exist for electric cars", () => {
    expect(dialFor("electric")).toBeNull();
  });

  it("spans 240°, from -120° at 0 to +120° at the maximum", () => {
    const dial = { max: 8, redline: 6.5 };
    expect(angleFor(0, dial)).toBe(-120);
    expect(angleFor(4, dial)).toBe(0);
    expect(angleFor(8, dial)).toBe(120);
    expect(angleFor(REST, dial)).toBe(-120);
  });

  it("tops out at 1.5 on an idle clip, 2.5 on a cold start and the redline minus 1 on a rev", () => {
    const petrol = { max: 8, redline: 6.5 };
    const diesel = { max: 6, redline: 4.5 };
    expect(topFor("idle", petrol)).toBe(1.5);
    expect(topFor("cold_start", petrol)).toBe(2.5);
    expect(topFor("rev", petrol)).toBe(5.5);
    expect(topFor("rev", diesel)).toBe(3.5);
  });
});

describe("levels", () => {
  it("measures RMS in dBFS, with silence at the floor", () => {
    expect(rmsDb(sine(3200, 1))).toBeCloseTo(-3.01, 2);
    expect(rmsDb(new Float32Array(64).fill(0.5))).toBeCloseTo(-6.02, 2);
    expect(rmsDb(new Float32Array(64))).toBe(SILENCE_DB);
    expect(rmsDb(new Float32Array(0))).toBe(SILENCE_DB);
  });

  it("takes nearest-rank percentiles", () => {
    const values = [5, 3, 9, 1, 7, 2, 8, 4, 10, 6];
    expect(percentile(values, 10)).toBe(1);
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 99)).toBe(10);
    expect(() => percentile([], 10)).toThrow();
  });

  it("gives a clip's range as the 10th and 99th percentile of its window levels", () => {
    const window = 64;
    // 90 quiet windows and 10 loud ones, then half a window that doesn't count
    const quiet = sine(window * 90, 10 ** (-40 / 20) * Math.SQRT2);
    const loud = sine(window * 10, 10 ** (-10 / 20) * Math.SQRT2);
    const samples = new Float32Array([...quiet, ...loud, ...new Float32Array(window / 2).fill(1)]);
    const levels = clipLevels(samples, window);
    expect(levels.floorDb).toBeCloseTo(-40, 1);
    expect(levels.ceilDb).toBeCloseTo(-10, 1);
    expect(clipLevels(new Float32Array(10), window)).toEqual({ floorDb: SILENCE_DB, ceilDb: SILENCE_DB });
  });
});

describe("needle", () => {
  const levels = { floorDb: -40, ceilDb: -10 };

  it("maps the floor to idle and the ceiling to the top", () => {
    expect(needleTarget(-40, levels, 1.5)).toBe(IDLE);
    expect(needleTarget(-10, levels, 1.5)).toBe(1.5);
    expect(needleTarget(-25, levels, 5.5)).toBeCloseTo((IDLE + 5.5) / 2, 10);
  });

  it("stops at idle and at the top, so a quiet idle never swings toward the redline", () => {
    expect(needleTarget(-90, levels, 1.5)).toBe(IDLE);
    expect(needleTarget(0, levels, 1.5)).toBe(1.5);
    expect(needleTarget(SILENCE_DB, levels, 1.5)).toBe(IDLE);
  });

  it("stays finite on a clip with no dynamics", () => {
    const flat = { floorDb: -20, ceilDb: -20 };
    expect(needleTarget(-20, flat, 1.5)).toBe(IDLE);
    expect(needleTarget(-19.5, flat, 1.5)).toBeCloseTo(IDLE + 0.5 * (1.5 - IDLE), 10);
  });

  it("moves a quarter of the way per 60 Hz frame, and the same distance in two 120 Hz frames", () => {
    expect(ALPHA).toBe(0.25);
    expect(smooth(0, 1, FRAME)).toBeCloseTo(0.25, 10);
    expect(smooth(smooth(0, 1, FRAME / 2), 1, FRAME / 2)).toBeCloseTo(0.25, 10);
    expect(smooth(0, 1, 2 * FRAME)).toBeCloseTo(1 - 0.75 ** 2, 10);
    expect(smooth(0.3, 1, 0)).toBe(0.3);
    expect(smooth(0.3, 1, -5)).toBe(0.3);
  });
});
