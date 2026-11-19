import { supportsFlags } from "motion";
import { describe, expect, it } from "vitest";
import { SheetMotion } from "@/components/ui/sheet-motion";
import { cssEasing, CURVES, DURATIONS } from "@/lib/motion-tokens";
import {
  latest,
  preferReducedMotion,
  type RecordedAnimation,
  recordingElement,
  withMotionDefaults,
} from "../../support/motion";

// How the draggable bottom sheet moves (DESIGN §4.1, §4.5 and §6.1). Node has no Web Animations, so
// the sheet below records each animation it is given (motion.ts), and a test moves one's clock.

const HEIGHT = 600;

/** A sheet that records its animations, and its motion */
function fakeSheet() {
  const { element, animations, style } = recordingElement(HEIGHT);
  return { motion: new SheetMotion(element, { current: null }), animations, style };
}

/** Where an animation of the sheet starts: px below its place, as its translate's "0 <offset>px" */
const fromOf = ({ keyframes }: RecordedAnimation) =>
  Number.parseFloat(String(keyframes.translate?.[0]).split(" ")[1] ?? "");

withMotionDefaults();

describe("the bottom sheet's motion", () => {
  it("opens on a spring, as linear() easing, from below the screen", () => {
    const { motion, animations } = fakeSheet();
    motion.open("pointer");
    expect(fromOf(latest(animations))).toBe(HEIGHT);
    expect(latest(animations).timing.easing).toMatch(/^linear\(0, /);
  });

  it("carries its velocity through a reversal, so it first goes on the way it was going", () => {
    const { motion, animations } = fakeSheet();
    motion.open("pointer");
    latest(animations).currentTime = 100;
    // Flicked down while it opens, then reopened while it closes
    motion.close("pointer", 1500);
    latest(animations).currentTime = 50;
    motion.open("pointer");
    const reopening = latest(animations);
    reopening.currentTime = 1;
    expect(motion.grab()).toBeGreaterThan(fromOf(reopening));
  });

  it("fades over 200 ms with the out curve under reduced motion, without sliding", () => {
    preferReducedMotion(true);
    const { motion, animations } = fakeSheet();
    const gentle = { duration: DURATIONS.pop, easing: cssEasing(CURVES.out) };
    motion.open("pointer");
    expect(fromOf(latest(animations))).toBe(0);
    expect(latest(animations).timing).toStrictEqual(gentle);
    motion.close("pointer", 1500);
    expect(fromOf(latest(animations))).toBe(0);
    expect(latest(animations).timing).toStrictEqual(gentle);
  });

  it("takes the drawer curve over --dur-sheet where the browser lacks linear() easing", () => {
    supportsFlags.linearEasing = false;
    const { motion, animations } = fakeSheet();
    motion.open("pointer");
    expect(latest(animations).timing).toEqual({ duration: DURATIONS.sheet, easing: cssEasing(CURVES.drawer) });
  });

  it("changes at once from the keyboard", () => {
    const { motion, animations, style } = fakeSheet();
    motion.open("keyboard");
    expect(animations).toEqual([]);
    expect(style).toEqual({ translate: "0 0px", opacity: "1" });
  });
});
