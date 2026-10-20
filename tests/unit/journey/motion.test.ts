import { cubicBezier as motionBezier, spring } from "motion";
import { describe, expect, it } from "vitest";
import { cubicBezier, easeOut, MOVE_OMEGA, Spring } from "@/features/journey/motion";

// The globe's motion against Motion's own: the `move` spring and --ease-out (DESIGN §4.2, §4.3)

describe("the move spring", () => {
  it("follows Motion's spring for bounce 0 and 0.4 s, frame by frame", () => {
    const motion = spring({ keyframes: [0, 1], bounce: 0, duration: 400 });
    const ours = new Spring(0);
    ours.target = 1;
    for (let ms = 16; ms <= 1000; ms += 16) {
      ours.step(0.016);
      expect(Math.abs(ours.value - motion.next(ms).value)).toBeLessThan(2e-3);
    }
    expect(MOVE_OMEGA ** 2).toBeCloseTo(532.7, 0);
  });

  it("never overshoots, settles within 0.4 s and 0.1 ms steps alike, and stops exactly on the target", () => {
    for (const dt of [0.0001, 0.008, 0.016, 0.05]) {
      const ours = new Spring(0);
      ours.target = 2;
      let settledAt = Number.POSITIVE_INFINITY;
      for (let t = dt; t < 2; t += dt) {
        const settled = ours.step(dt);
        expect(ours.value).toBeLessThanOrEqual(2);
        if (settled) {
          settledAt = t;
          break;
        }
      }
      expect(ours.value).toBe(2);
      expect(settledAt).toBeLessThan(0.75);
    }
  });

  it("keeps its velocity when the target moves, and halts where it is", () => {
    const moving = new Spring(0);
    moving.target = 1;
    moving.step(0.1);
    const speed = moving.velocity;
    expect(speed).toBeGreaterThan(0);
    moving.target = 3;
    moving.step(0.001);
    expect(moving.velocity).toBeGreaterThan(speed * 0.9);
    moving.halt();
    expect(moving.target).toBe(moving.value);
    expect(moving.velocity).toBe(0);
    expect(moving.step(0.016)).toBe(true);
  });
});

describe("easing", () => {
  it("draws --ease-out, and any other cubic-bezier(), as Motion does", () => {
    const motion = motionBezier(0.23, 1, 0.32, 1);
    const inOut = motionBezier(0.77, 0, 0.175, 1);
    const ours = cubicBezier(0.77, 0, 0.175, 1);
    for (let x = 0; x <= 1; x += 0.01) {
      expect(easeOut(x)).toBeCloseTo(motion(x), 5);
      expect(ours(x)).toBeCloseTo(inOut(x), 5);
    }
  });
});
