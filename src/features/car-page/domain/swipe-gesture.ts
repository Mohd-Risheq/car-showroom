import { releaseVelocity, rubberBand, type Sample, shouldDismiss } from "@/lib/motion/drag-release";
import { nextSide } from "./gallery";
import { type PointerAt, TAP_SLOP } from "./stage-gesture";
import { canZoomOut, type Point, type Size, swipeStep, type Zoom } from "./viewer";

// A finger's drag of a photo fitted whole in the fullscreen viewer (FR-10.3, DESIGN §7.2.4).
// Across, it brings in the photo beside it, which waits on the right in English and on the left in
// Arabic (nextSide); where no photo waits that way, the photos give less the further they are
// pulled, as the bottom sheet does past its open position. Down, it closes the viewer on the
// sheet's rules (drag-release.ts): a flick, or a release that would carry the photo past half the
// screen (DESIGN §6.1). The drag takes its axis once the finger has gone past a tap's reach, and
// keeps it; a drag up does nothing. Only the first finger of a gesture on a photo fitted whole
// drags: a second ends the drag and pinches (stage-gesture.ts), and the finger a pinch leaves never
// drags. Pure, as stage-gesture.ts is.

/**
 * What a swipe reads of the viewer: the photo's zoom, the screen, and whether a photo waits each
 * way
 */
export type SwipeStage = {
  readonly zoom: Zoom;
  readonly screen: Size;
  readonly dir: "rtl" | "ltr";
  readonly previous: boolean;
  readonly next: boolean;
};

type Axis = "across" | "down";

/** Where a drag has the photos: px along its axis */
export type Swipe = { readonly axis: Axis; readonly offset: number };

/** How a drag ends: across, with the step it takes, if any; down, closing the viewer or not */
export type SwipeEnd =
  | { readonly axis: "across"; readonly move: -1 | 0 | 1; readonly offset: number; readonly velocity: number }
  | { readonly axis: "down"; readonly closes: boolean; readonly offset: number; readonly velocity: number };

type Drag = { readonly id: number; readonly from: Point; axis: Axis | "none" | null; readonly samples: Sample[] };

export class SwipeGesture {
  /** The pointers down, of a drag or of a pinch */
  readonly #down = new Set<number>();
  #drag: Drag | null = null;

  /**
   * A pointer down: the first of a gesture on a photo fitted whole starts a drag, and a second ends
   * it
   */
  down({ id, x, y }: PointerAt, { zoom }: SwipeStage): SwipeEnd | null {
    const first = this.#down.size === 0;
    this.#down.add(id);
    if (!first) return this.#halt();
    this.#drag = canZoomOut(zoom.scale) ? null : { id, from: { x, y }, axis: null, samples: [] };
    return null;
  }

  /** Where a pointer's move takes the photos, or null where it drags nothing */
  move({ id, x, y, time }: PointerAt, stage: SwipeStage): Swipe | null {
    const drag = this.#drag;
    if (drag?.id !== id) return null;
    const across = x - drag.from.x;
    const down = y - drag.from.y;
    if (drag.axis === null) {
      if (Math.hypot(across, down) <= TAP_SLOP) return null;
      drag.axis = axisOf(across, down);
    }
    if (drag.axis === "none") return null;
    const offset = drag.axis === "across" ? acrossOffset(across, stage) : downOffset(down, stage.screen.height);
    drag.samples.push({ time, offset });
    return { axis: drag.axis, offset };
  }

  /** How a pointer's release ends its drag, or null where it dragged nothing */
  up({ id, time }: PointerAt, { screen, dir, previous, next }: SwipeStage): SwipeEnd | null {
    this.#down.delete(id);
    const drag = this.#drag;
    if (drag?.id !== id) return null;
    this.#drag = null;
    const offset = drag.samples.at(-1)?.offset;
    if (drag.axis === null || drag.axis === "none" || offset === undefined) return null;
    const velocity = releaseVelocity(drag.samples, time);
    if (drag.axis === "down") {
      return { axis: "down", closes: shouldDismiss({ offset, velocity, height: screen.height }), offset, velocity };
    }
    const step = swipeStep(offset, velocity, screen.width, dir);
    const move = (step === 1 && next) || (step === -1 && previous) ? step : 0;
    return { axis: "across", move, offset, velocity };
  }

  /** Drops a pointer the browser cancelled: a drag it held puts the photos back */
  cancel(id: number): SwipeEnd | null {
    this.#down.delete(id);
    return this.#drag?.id === id ? this.#halt() : null;
  }

  /** Forgets every pointer, as when the viewer closes or shows another photo */
  reset(): void {
    this.#down.clear();
    this.#drag = null;
  }

  /** Ends the drag under way with no step, which puts the photos back */
  #halt(): SwipeEnd | null {
    const drag = this.#drag;
    this.#drag = null;
    const offset = drag?.samples.at(-1)?.offset;
    if (drag === null || offset === undefined) return null;
    return drag.axis === "down"
      ? { axis: "down", closes: false, offset, velocity: 0 }
      : { axis: "across", move: 0, offset, velocity: 0 };
  }
}

/**
 * The axis a drag takes once past a tap's reach: the one it went further along, where a drag up
 * takes none
 */
function axisOf(across: number, down: number): Axis | "none" {
  if (Math.abs(across) > Math.abs(down)) return "across";
  return down > 0 ? "down" : "none";
}

/** A drag's offset across, held back where no photo waits that way */
function acrossOffset(distance: number, { screen, dir, previous, next }: SwipeStage): number {
  // A drag away from the side the next photo waits on brings it in
  const waits = Math.sign(distance) === -nextSide(dir) ? next : previous;
  return waits ? distance : Math.sign(distance) * rubberBand(Math.abs(distance), screen.width);
}

/** A drag's offset down: above where it started, the photo gives less the further it is pulled */
function downOffset(distance: number, height: number): number {
  return distance >= 0 ? distance : -rubberBand(-distance, height);
}
