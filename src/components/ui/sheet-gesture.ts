import { FLICK_SPEED } from "@/lib/motion/drag-release";
import { SPRINGS } from "@/lib/motion-tokens";

// The draggable bottom sheet's spring after a release (DESIGN §6.1), apart from the component so it
// can be tested. The release's rules, which the fullscreen viewer's swipes share, are drag-release.ts.

/** The spring that settles a released sheet: it bounces a little after a flick, not after a tap */
export function releaseSpring(velocity: number) {
  return Math.abs(velocity) > FLICK_SPEED ? SPRINGS.sheetAfterFlick : SPRINGS.sheetAfterTap;
}
