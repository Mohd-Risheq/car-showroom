import type { RefObject } from "react";
import { animateLook, backdropOpacity, type Look, showLook } from "@/lib/motion/backdrop-motion";
import { type Easing, GENTLE, prefersReducedMotion, releaseEasing } from "@/lib/motion/release-easing";
import { type Spring, SPRINGS } from "@/lib/motion-tokens";
import type { Input } from "./dialog-input";
import { releaseSpring } from "./sheet-gesture";

// How the draggable bottom sheet moves (DESIGN §4.3, §4.5 and §6.1). Its pose is its offset below
// the open position, as `translate`, and its opacity; the backdrop's opacity follows both. Every
// change runs on the Web Animations API, off the main thread, so a sheet that closes while the next
// page loads stays smooth (DESIGN §4.1), and Base UI sees the closing animation and keeps the sheet
// mounted until it ends. A spring becomes linear() easing that starts at the velocity it is given;
// without linear() (iOS Safari before 17.2) the sheet takes the drawer curve over --dur-sheet
// (release-easing.ts). A keyboard-driven change is instant, and reduced motion fades instead of
// sliding.

type Pose = { offset: number; opacity: number };

type Movement = Easing & { from: Pose; to: Pose; animations: readonly Animation[] };

const OPEN: Pose = { offset: 0, opacity: 1 };

/** How the sheet gets from one pose to another */
function easingFor(from: Pose, to: Pose, velocity: number, transition: Spring): Easing {
  return releaseEasing(to.offset - from.offset, velocity, transition);
}

function mix(from: Pose, to: Pose, progress: number): Pose {
  return {
    offset: from.offset + (to.offset - from.offset) * progress,
    opacity: from.opacity + (to.opacity - from.opacity) * progress,
  };
}

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
    const animations = animateLook(this.#sheet, this.#backdrop.current, this.#look(from), this.#look(to), easing);
    this.#movement = { ...easing, from, to, animations };
  }

  #place(pose: Pose): void {
    this.#pose = pose;
    showLook(this.#sheet, this.#backdrop.current, this.#look(pose));
  }

  /** What shows with the sheet in a pose: the backdrop full with it open, clear with it hidden */
  #look({ offset, opacity }: Pose): Look {
    return { translate: `0 ${offset}px`, opacity, backdrop: backdropOpacity(offset, this.height, opacity) };
  }
}
