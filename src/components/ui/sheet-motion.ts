import type { Dialog } from "@base-ui/react/dialog";
import {
  calcGeneratorDuration,
  cubicBezier,
  generateLinearEasing,
  maxGeneratorDuration,
  spring,
  supportsLinearEasing,
} from "motion";
import type { RefObject } from "react";
import { type Curve, CURVES, cssEasing, DURATIONS, type Spring, SPRINGS, springPhysics } from "@/lib/motion-tokens";
import { releaseSpring } from "./sheet-gesture";

// How the draggable bottom sheet moves (DESIGN §4.3, §4.5 and §6.1). Its pose is its offset below
// the open position, as `translate`, and its opacity; the backdrop's opacity follows both. Every
// change runs on the Web Animations API, off the main thread, so a sheet that closes while the next
// page loads stays smooth (DESIGN §4.1), and Base UI sees the closing animation and keeps the sheet
// mounted until it ends. A spring becomes linear() easing that starts at the velocity it is given;
// without linear() (iOS Safari before 17.2) the sheet takes the drawer curve over --dur-sheet.
// A keyboard-driven change is instant, and reduced motion fades instead of sliding.

/** How a change was asked for: a keyboard-driven change doesn't animate (DESIGN §4.2, --dur-instant) */
export type Input = "keyboard" | "pointer";

/**
 * The input behind an open or close Base UI reports, where its event tells: Escape is a key and a
 * press outside the sheet a pointer, and a press of the trigger or the close button is a key when its
 * click counts no presses, as a click a key makes does. Null where the event doesn't tell, as for the
 * close a drag's release asks for.
 */
export function inputOf({ reason, event }: Pick<Dialog.Root.ChangeEventDetails, "reason" | "event">): Input | null {
  switch (reason) {
    case "escape-key":
      return "keyboard";
    case "outside-press":
      return "pointer";
    case "trigger-press":
    case "close-press":
      return event instanceof KeyboardEvent || (event instanceof MouseEvent && event.detail === 0)
        ? "keyboard"
        : "pointer";
    default:
      return null;
  }
}

type Pose = { offset: number; opacity: number };

/** A move's easing: its progress at each fraction of its duration, and the same as a CSS timing function */
type Easing = { progressAt: (fraction: number) => number; timingFunction: string; duration: number };

type Movement = Easing & { from: Pose; to: Pose; animations: Animation[] };

const OPEN: Pose = { offset: 0, opacity: 1 };

/** A curve over a duration, as CSS and as a function of progress */
function curveEasing(curve: Curve, duration: number): Easing {
  return { progressAt: cubicBezier(...curve), timingFunction: cssEasing(curve), duration };
}

/** Reduced motion's 200 ms crossfade, which also returns a released sheet without a spring (DESIGN §4.5) */
const GENTLE = curveEasing(CURVES.out, DURATIONS.pop);

/** The sheet where the browser lacks linear() easing */
const DRAWER = curveEasing(CURVES.drawer, DURATIONS.sheet);

/** A spring between two poses as linear() easing, starting at `velocity` px/s */
function springEasing(from: Pose, to: Pose, velocity: number, transition: Spring): Easing {
  const distance = to.offset - from.offset;
  // Over 0 to 100, as Motion's own linear() springs run, with the velocity scaled to match
  const generator = spring({
    keyframes: [0, 100],
    velocity: distance === 0 ? 0 : (velocity / distance) * 100,
    ...springPhysics(transition),
  });
  const duration = Math.min(calcGeneratorDuration(generator), maxGeneratorDuration);
  const progressAt = (fraction: number) => generator.next(fraction * duration).value / 100;
  return { progressAt, timingFunction: generateLinearEasing(progressAt, duration), duration };
}

function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How the sheet gets from one pose to another */
function easingFor(from: Pose, to: Pose, velocity: number, transition: Spring): Easing {
  if (prefersReducedMotion()) return GENTLE;
  if (!supportsLinearEasing()) return DRAWER;
  return springEasing(from, to, velocity, transition);
}

function mix(from: Pose, to: Pose, progress: number): Pose {
  return {
    offset: from.offset + (to.offset - from.offset) * progress,
    opacity: from.opacity + (to.opacity - from.opacity) * progress,
  };
}

const translate = ({ offset }: Pose) => `0 ${offset}px`;

/** One mounted sheet's motion, from its first showing until it leaves the page */
export class SheetMotion {
  readonly #sheet: HTMLElement;
  readonly #backdrop: RefObject<HTMLElement | null>;
  /** Where the sheet is, or is heading while it moves; null before it first shows */
  #pose: Pose | null = null;
  #movement: Movement | null = null;

  constructor(sheet: HTMLElement, backdrop: RefObject<HTMLElement | null>) {
    this.#sheet = sheet;
    this.#backdrop = backdrop;
  }

  /** The distance from open to hidden */
  get height(): number {
    return this.#sheet.offsetHeight;
  }

  /** Shows the sheet: up from below the screen, or from where it is when it reopens on its way out */
  open(input: Input): void {
    const current = this.#stop();
    if (input === "keyboard") {
      this.#place(OPEN);
    } else if (prefersReducedMotion()) {
      this.#animate({ offset: 0, opacity: current?.pose.opacity ?? 0 }, OPEN, GENTLE);
    } else {
      const from = current?.pose ?? { offset: this.height, opacity: 1 };
      this.#animate(from, OPEN, easingFor(from, OPEN, current?.velocity ?? 0, SPRINGS.sheetAfterTap));
    }
  }

  /** Hides the sheet, with a drag's release velocity, or the velocity it had when it was moving */
  close(input: Input, velocity?: number): void {
    const current = this.#stop();
    // From the keyboard the sheet stays put, and Base UI removes it at once
    if (!current || input === "keyboard") return;
    const { pose } = current;
    if (prefersReducedMotion()) {
      this.#animate(pose, { ...pose, opacity: 0 }, GENTLE);
    } else {
      const speed = velocity ?? current.velocity;
      const hidden = { ...pose, offset: this.height };
      this.#animate(pose, hidden, easingFor(pose, hidden, speed, releaseSpring(speed)));
    }
  }

  /** Brings the sheet back to its open position after a release that doesn't close it */
  settle(velocity: number): void {
    const current = this.#stop();
    if (!current) return;
    this.#animate(current.pose, OPEN, easingFor(current.pose, OPEN, velocity, releaseSpring(velocity)));
  }

  /** Holds the sheet where it is, even mid-flight, for a drag to take it from there; returns its offset */
  grab(): number {
    return this.#stop()?.pose.offset ?? 0;
  }

  /** Shows the sheet at `offset`, following a drag */
  drag(offset: number): void {
    this.#place({ offset, opacity: 1 });
  }

  /** Ends any animation where it has got to; returns that pose and its velocity, or null before the sheet first shows */
  #stop(): { pose: Pose; velocity: number } | null {
    const movement = this.#movement;
    if (!movement) return this.#pose && { pose: this.#pose, velocity: 0 };
    this.#movement = null;
    const time = movement.animations[0]?.currentTime;
    const elapsed = typeof time === "number" ? Math.min(time, movement.duration) : 0;
    const at = (ms: number) =>
      mix(movement.from, movement.to, movement.progressAt(Math.min(ms / movement.duration, 1)));
    const pose = at(elapsed);
    // In px/s, over the curve's next millisecond
    const velocity = (at(elapsed + 1).offset - pose.offset) * 1000;
    for (const animation of movement.animations) animation.cancel();
    this.#place(pose);
    return { pose, velocity };
  }

  #animate(from: Pose, to: Pose, easing: Easing): void {
    // The end pose goes inline first: the animations show the way there, and leave it when they end
    this.#place(to);
    if (from.offset === to.offset && from.opacity === to.opacity) return;
    const height = this.height;
    const timing = { duration: easing.duration, easing: easing.timingFunction };
    const animations = [
      this.#sheet.animate({ translate: [translate(from), translate(to)], opacity: [from.opacity, to.opacity] }, timing),
    ];
    const backdrop = this.#backdrop.current;
    if (backdrop) animations.push(backdrop.animate({ opacity: [dim(from, height), dim(to, height)] }, timing));
    this.#movement = { ...easing, from, to, animations };
  }

  #place(pose: Pose): void {
    this.#pose = pose;
    this.#sheet.style.translate = translate(pose);
    this.#sheet.style.opacity = String(pose.opacity);
    const backdrop = this.#backdrop.current;
    if (backdrop) backdrop.style.opacity = String(dim(pose, this.height));
  }
}

/** The backdrop's opacity for a pose: full with the sheet open, clear with it hidden */
function dim({ offset, opacity }: Pose, height: number): number {
  if (height <= 0) return opacity;
  return opacity * Math.min(Math.max(1 - offset / height, 0), 1);
}
