import {
  calcGeneratorDuration,
  cubicBezier,
  generateLinearEasing,
  maxGeneratorDuration,
  spring,
  supportsLinearEasing,
} from "motion";
import { type Curve, CURVES, cssEasing, DURATIONS, type Spring, springPhysics } from "@/lib/motion-tokens";

// How a gesture's release moves on the Web Animations API (DESIGN §4.1, §4.3 and §4.5), as the
// bottom sheet and the fullscreen gallery's photos do. A spring becomes linear() easing that starts
// at the velocity it is given; without linear() (iOS Safari before 17.2) the move takes the drawer
// curve over --dur-sheet, and with reduced motion the out curve over --dur-pop, with no spring.

/**
 * A move's easing: its progress at each fraction of its duration, and the same as a CSS timing
 * function
 */
export type Easing = { progressAt: (fraction: number) => number; timingFunction: string; duration: number };

/** A curve over a duration, as CSS and as a function of progress */
function curveEasing(curve: Curve, duration: number): Easing {
  return { progressAt: cubicBezier(...curve), timingFunction: cssEasing(curve), duration };
}

/**
 * Reduced motion's 200 ms crossfade, which also returns a released drag without a spring (DESIGN
 * §4.5)
 */
export const GENTLE = curveEasing(CURVES.out, DURATIONS.pop);

/** A release where the browser lacks linear() easing */
const DRAWER = curveEasing(CURVES.drawer, DURATIONS.sheet);

/** A spring over `distance` px as linear() easing, starting at `velocity` px/s */
function springEasing(distance: number, velocity: number, transition: Spring): Easing {
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

export function prefersReducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** How a release gets over `distance` px, from `velocity` px/s, on the spring given */
export function releaseEasing(distance: number, velocity: number, transition: Spring): Easing {
  if (prefersReducedMotion()) return GENTLE;
  if (!supportsLinearEasing()) return DRAWER;
  return springEasing(distance, velocity, transition);
}
