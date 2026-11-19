// How a dragged element's release goes on (DESIGN §6.1), shared by the draggable bottom sheet
// (bottom-sheet.tsx, sheet-gesture.ts) and the fullscreen viewer's swipes, which DESIGN §7.2.4 gives
// no rules of their own (swipe-gesture.ts, viewer.ts): the velocity at a release, how far its
// momentum would carry it, a flick, the dismissal of what a pull down takes away, and the rubber
// band past an edge. Offsets are px, and velocities px/s, downward or onward positive.

/** A release faster than 0.11 px/ms is a flick, however short the drag (DESIGN §6.1) */
export const FLICK_SPEED = 110;

/** iOS's normal scrolling deceleration, which says where a released element would come to rest */
const DECELERATION = 0.998;

/** How stiffly a pull past an edge resists: iOS's rubber band */
const RESISTANCE = 0.55;

/** How far back a release's velocity looks, in ms: a pause before letting go leaves none */
export const VELOCITY_WINDOW = 100;

/** Where the element was during a drag, and when (the pointer event's timeStamp) */
export type Sample = { time: number; offset: number };

/** The velocity at a release at `now`, from the drag's samples in the window before it */
export function releaseVelocity(samples: readonly Sample[], now: number): number {
  const recent = samples.filter((sample) => now - sample.time <= VELOCITY_WINDOW);
  const first = recent[0];
  const last = recent.at(-1);
  if (!first || !last || last.time === first.time) return 0;
  return ((last.offset - first.offset) / (last.time - first.time)) * 1000;
}

/** How much further a release at this velocity would carry the element */
export function projection(velocity: number): number {
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
}

type Release = { offset: number; velocity: number; height: number };

/**
 * Whether a release takes away what a pull down drags, the sheet or the viewer's photo: a downward
 * flick, or a release that would carry it past half its height. Pulled above its place, it stays.
 */
export function shouldDismiss({ offset, velocity, height }: Release): boolean {
  if (offset <= 0) return false;
  return velocity > FLICK_SPEED || offset + projection(velocity) > height / 2;
}

/**
 * The offset shown for a drag that goes `distance` past an edge: the element follows less the
 * further it is pulled, and never more than `size` (DESIGN §6.1's rubber band)
 */
export function rubberBand(distance: number, size: number): number {
  return (distance * size * RESISTANCE) / (size + RESISTANCE * distance);
}
