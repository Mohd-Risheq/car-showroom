import type { RefObject } from "react";
import { animateLook, backdropOpacity, type Look, showLook } from "@/lib/motion/backdrop-motion";
import { releaseEasing } from "@/lib/motion/release-easing";
import type { Spring } from "@/lib/motion-tokens";

// How the fullscreen gallery's photos follow a swipe and settle after it (DESIGN §4.1, §4.3 and
// §7.2.4), on the Web Animations API as the bottom sheet moves (backdrop-motion.ts). The track
// holds the photo in view and the one each side of it, offset by `translate`, and the viewer's
// black behind it clears as a pull down takes the photo away. React writes neither element's style,
// so a render mid-drag leaves the photos where the finger has them. A settle starts at the
// release's velocity, on a spring (release-easing.ts).

/** Where the track is: px from its place, to the right and down */
type Offset = { readonly x: number; readonly y: number };

export const AT_REST: Offset = { x: 0, y: 0 };

type Movement = { readonly animations: readonly Animation[]; readonly arrive: (() => void) | undefined };

/** One mounted track's motion, from its first showing until it leaves the page */
export class TrackMotion {
  readonly #track: HTMLElement;
  readonly #backdrop: RefObject<HTMLElement | null>;
  #offset: Offset = AT_REST;
  #movement: Movement | null = null;

  constructor(track: HTMLElement, backdrop: RefObject<HTMLElement | null>) {
    this.#track = track;
    this.#backdrop = backdrop;
  }

  /** Shows the track at an offset, following a drag */
  drag(offset: Offset): void {
    this.#cancel();
    this.#place(offset);
  }

  /**
   * Moves the track from where it is to an offset, along one axis, from `velocity` px/s, and calls
   * `arrive` once it gets there
   */
  settle(to: Offset, velocity: number, transition: Spring, arrive?: () => void): void {
    this.#cancel();
    const from = this.#offset;
    const distance = to.x - from.x || to.y - from.y;
    // The end goes inline first: the animations show the way there, and leave it when they end
    this.#place(to);
    if (distance === 0) {
      arrive?.();
      return;
    }
    const easing = releaseEasing(distance, velocity, transition);
    const animations = animateLook(this.#track, this.#backdrop.current, this.#look(from), this.#look(to), easing);
    const movement = { animations, arrive };
    this.#movement = movement;
    animations[0].onfinish = () => {
      if (this.#movement !== movement) return;
      this.#movement = null;
      arrive?.();
    };
  }

  /** Ends a movement at once where it was going, arriving there, as when a finger lands mid-flight */
  land(): void {
    const movement = this.#movement;
    if (!movement) return;
    this.#cancel();
    movement.arrive?.();
  }

  /**
   * Puts the track back at rest at once, with no arrival, as a button, a key or a new screen size
   * moves on
   */
  reset(): void {
    this.#cancel();
    this.#place(AT_REST);
  }

  #cancel(): void {
    const movement = this.#movement;
    this.#movement = null;
    for (const animation of movement?.animations ?? []) animation.cancel();
  }

  #place(offset: Offset): void {
    this.#offset = offset;
    showLook(this.#track, this.#backdrop.current, this.#look(offset));
  }

  /** How the track shows at an offset: the black clears as a pull down takes the photo away */
  #look({ x, y }: Offset): Look {
    return { translate: `${x}px ${y}px`, backdrop: backdropOpacity(y, this.#track.offsetHeight) };
  }
}
