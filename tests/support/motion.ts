import { supportsFlags } from "motion";
import { afterEach, beforeEach, vi } from "vitest";

// What the unit tests of a motion on the Web Animations API need that Node lacks: an element that
// records the animations it is given, and the person's motion preference. Each test starts with no
// preference and with Motion's own switch for tests set as the browser has linear() easing.

/** An animation an element was given: a test moves its clock, or ends it as the browser would */
export type RecordedAnimation = {
  readonly keyframes: Record<string, (string | number)[]>;
  readonly timing: KeyframeAnimationOptions;
  currentTime: number;
  cancelled: boolean;
  cancel: () => void;
  onfinish: (() => void) | null;
};

/** An element of the height given that records its animations and its inline style */
export function recordingElement(height: number) {
  const animations: RecordedAnimation[] = [];
  const style = { translate: "", opacity: "" };
  const element = {
    offsetHeight: height,
    style,
    animate(keyframes: RecordedAnimation["keyframes"], timing: KeyframeAnimationOptions) {
      const animation: RecordedAnimation = {
        keyframes,
        timing,
        currentTime: 0,
        cancelled: false,
        cancel: () => {
          animation.cancelled = true;
        },
        onfinish: null,
      };
      animations.push(animation);
      return animation;
    },
  };
  // A motion reads an element's height and style and calls animate(), all an HTMLElement has, which
  // has much more besides
  return { element: element as unknown as HTMLElement, animations, style };
}

/** The animation an element was given last */
export function latest(animations: readonly RecordedAnimation[]): RecordedAnimation {
  const animation = animations.at(-1);
  if (!animation) throw new Error("the element hasn't animated");
  return animation;
}

/** The person's motion preference, as matchMedia answers */
export function preferReducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
}

/** Starts each test with no motion preference, in a browser that has linear() easing */
export function withMotionDefaults(): void {
  beforeEach(() => {
    preferReducedMotion(false);
    supportsFlags.linearEasing = true;
  });
  afterEach(() => {
    delete supportsFlags.linearEasing;
  });
}
