import { SPRINGS } from "@/lib/motion-tokens";

// The draggable bottom sheet's release rules (DESIGN §6.1), apart from the component so they can be
// tested. Offsets are px below the sheet's open position, and velocities px/s, downward positive.

/** A release faster than 0.11 px/ms closes the sheet, however far it was dragged (DESIGN §6.1) */
export const FLICK_SPEED = 110;

/** iOS's normal scrolling deceleration, which says where a released sheet would come to rest */
const DECELERATION = 0.998;

/** How stiffly a pull past the open position resists: iOS's rubber band */
const RESISTANCE = 0.55;

/** How far back a release's velocity looks, in ms: a pause before letting go leaves none */
export const VELOCITY_WINDOW = 100;

/** Where the sheet was during a drag, and when (the pointer event's timeStamp) */
export type Sample = { time: number; offset: number };

/** The velocity at a release at `now`, from the drag's samples in the window before it */
export function releaseVelocity(samples: readonly Sample[], now: number): number {
  const recent = samples.filter((sample) => now - sample.time <= VELOCITY_WINDOW);
  const first = recent[0];
  const last = recent.at(-1);
  if (!first || !last || last.time === first.time) return 0;
  return ((last.offset - first.offset) / (last.time - first.time)) * 1000;
}

/** How much further a release at this velocity would carry the sheet */
export function projection(velocity: number): number {
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
}

type Release = { offset: number; velocity: number; height: number };

/**
 * Whether a release closes the sheet: a downward flick, or a release that would carry it past half
 * its height. A sheet pulled above its open position never closes.
 */
export function shouldDismiss({ offset, velocity, height }: Release): boolean {
  if (offset <= 0) return false;
  return velocity > FLICK_SPEED || offset + projection(velocity) > height / 2;
}

/**
 * The offset shown for a drag that goes `distance` past the open position: the sheet follows less
 * the further it is pulled, and never more than `height` (DESIGN §6.1's rubber band)
 */
export function rubberBand(distance: number, height: number): number {
  return (distance * height * RESISTANCE) / (height + RESISTANCE * distance);
}

/** The spring that settles a released sheet: it bounces a little after a flick, not after a tap */
export function releaseSpring(velocity: number) {
  return Math.abs(velocity) > FLICK_SPEED ? SPRINGS.sheetAfterFlick : SPRINGS.sheetAfterTap;
}
