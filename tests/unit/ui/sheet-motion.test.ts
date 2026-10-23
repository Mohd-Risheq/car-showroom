import { supportsFlags } from "motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputOf, SheetMotion } from "@/components/ui/sheet-motion";
import { cssEasing, CURVES, DURATIONS } from "@/lib/motion-tokens";

// How the draggable bottom sheet moves (DESIGN §4.1, §4.5 and §6.1). Node has no Web Animations, so
// the sheet below records each animation it is given, and a test moves an animation's clock.

const HEIGHT = 600;

type Recorded = { from: number; timing: KeyframeAnimationOptions; currentTime: number; cancel: () => void };

/** A sheet that records its animations, and its motion */
function fakeSheet() {
  const animations: Recorded[] = [];
  const style = { translate: "", opacity: "" };
  const sheet = {
    offsetHeight: HEIGHT,
    style,
    // The sheet animates translate from "0 <offset>px"
    animate({ translate: [from = ""] }: { translate: string[] }, timing: KeyframeAnimationOptions) {
      const animation = { from: Number.parseFloat(from.split(" ")[1] ?? ""), timing, currentTime: 0, cancel: () => {} };
      animations.push(animation);
      return animation;
    },
  };
  return { motion: new SheetMotion(sheet as unknown as HTMLElement, { current: null }), animations, style };
}

/** The animation the sheet was given last */
function latest(animations: Recorded[]): Recorded {
  const animation = animations.at(-1);
  if (!animation) throw new Error("the sheet hasn't animated");
  return animation;
}

/** The person's motion preference, as matchMedia answers the sheet's one query */
function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
}

beforeEach(() => {
  preferReducedMotion(false);
  // Motion's own switch for tests: the browser has linear() easing
  supportsFlags.linearEasing = true;
});

afterEach(() => {
  delete supportsFlags.linearEasing;
});

describe("the bottom sheet's motion", () => {
  it("opens on a spring, as linear() easing, from below the screen", () => {
    const { motion, animations } = fakeSheet();
    motion.open("pointer");
    expect(latest(animations).from).toBe(HEIGHT);
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
    expect(motion.grab()).toBeGreaterThan(reopening.from);
  });

  it("fades over 200 ms with the out curve under reduced motion, without sliding", () => {
    preferReducedMotion(true);
    const { motion, animations } = fakeSheet();
    const gentle = { duration: DURATIONS.pop, easing: cssEasing(CURVES.out) };
    motion.open("pointer");
    expect(latest(animations)).toMatchObject({ from: 0, timing: gentle });
    motion.close("pointer", 1500);
    expect(latest(animations)).toMatchObject({ from: 0, timing: gentle });
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

describe("the input behind a change Base UI reports", () => {
  // Node has no UI events: these stand in for the browser's, with what inputOf reads
  class FakeMouseEvent extends Event {
    readonly detail: number;
    constructor(type: string, detail: number) {
      super(type);
      this.detail = detail;
    }
  }
  class FakeKeyboardEvent extends Event {}

  beforeEach(() => {
    vi.stubGlobal("MouseEvent", FakeMouseEvent);
    vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a key for a press of the trigger or the close button whose click counts no presses", () => {
    for (const reason of ["trigger-press", "close-press"] as const) {
      expect(inputOf({ reason, event: new FakeMouseEvent("click", 0) })).toBe("keyboard");
      expect(inputOf({ reason, event: new FakeKeyboardEvent("keydown") })).toBe("keyboard");
      expect(inputOf({ reason, event: new FakeMouseEvent("click", 1) })).toBe("pointer");
    }
  });

  it("is a key for Escape, and a pointer for a press outside, whatever its event counts", () => {
    expect(inputOf({ reason: "escape-key", event: new FakeKeyboardEvent("keydown") })).toBe("keyboard");
    expect(inputOf({ reason: "outside-press", event: new FakeMouseEvent("pointerdown", 0) })).toBe("pointer");
  });

  it("isn't known where the event doesn't tell, as for the close a drag's release asks for", () => {
    expect(inputOf({ reason: "imperative-action", event: new Event("close") })).toBeNull();
  });
});
