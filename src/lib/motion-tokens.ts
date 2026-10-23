// The motion tokens of DESIGN §4.2 to §4.4, the one source of motion values (SRS §11.8):
// - src/styles/tokens.css mirrors the durations and curves as the CSS variables CSS_MOTION_VARIABLES
//   lists, and tests/unit/motion-tokens.test.ts fails when the two differ;
// - the lazy GSAP chunk registers CURVES as CustomEase eases (src/lib/motion/gsap.ts);
// - Motion takes SPRINGS as they are, and CURVES as cubic-bezier arrays.
// Durations are in milliseconds, as CSS and the Web Animations API take them. Motion and GSAP take seconds.

/** DESIGN §4.2's durations. Each is the CSS variable --dur-<name> (mediaHover is --dur-media-hover). */
export const DURATIONS = {
  /** Keyboard-driven changes, admin navigation, second and later tooltips */
  instant: 0,
  /** Every pressable element, with PRESS_SCALE */
  press: 120,
  /** Tooltips, the microns popover, hotspot labels */
  tip: 125,
  /** Hover colour and opacity, with CSS `ease`, on a fine pointer only */
  hover: 150,
  /** Popovers, reduced-motion crossfades */
  pop: 200,
  /** Dialogs; the page-transition cap */
  modal: 250,
  /** Car card image scale(1.02) on hover, with the out curve */
  mediaHover: 300,
  /** Non-draggable sheets only, with the drawer curve. Draggable sheets use SPRINGS.sheet. */
  sheet: 500,
  /** Content entrances on scroll and the hero "lights on" fade, once, with the out curve */
  reveal: 600,
} as const;

/** The pause between grouped entrances, which never blocks input: --stagger and --stagger-tight */
export const STAGGERS = {
  /** Grouped entrances */
  default: 60,
  /** Dense sets: Showroom Floor bays (DESIGN §5.14) */
  tight: 30,
} as const;

/** The scale a pressable element takes while pressed, over DURATIONS.press: --press-scale */
export const PRESS_SCALE = 0.97;

/**
 * DESIGN §4.2's signature tokens, each used only by the DESIGN §5 moment it names. Each is the CSS
 * variable --dur-<name> (scanAuto is --dur-scan-auto).
 */
export const SIGNATURE_DURATIONS = {
  /** Gear-shift transition, old page, from 0 (§5.10) */
  shiftOut: 120,
  /** Gear-shift transition, new page, from SHIFT_IN_DELAY; the transition ends at 250 ms (§5.10) */
  shiftIn: 180,
  /** Push to Start ring sequence (§5.8) */
  ignition: 280,
  /** Number roll, with the out curve (§5.9) */
  odometer: 800,
  /** One Drag Race lap, with the in-out curve (§5.7) */
  lap: 900,
  /** Spin discovery nudge, once, with the in-out curve (§5.4) */
  nudge: 900,
  /** The Blueprint Reveal wipe (in-out curve) and the Paint Chip shimmer (§5.11, §5.12) */
  showcase: 1000,
  /** Skeleton pulse, with CSS `ease-in-out`, PULSE_CYCLES times (§6.4) */
  pulse: 1200,
  /** Body Scan timed run on phones, with the in-out curve (§5.2) */
  scanAuto: 2400,
  /** Hero spotlight sweep on touch, once, with the in-out curve (§5.1) */
  sweep: 2500,
} as const;

/** When the gear shift's new page starts: --delay-shift-in */
export const SHIFT_IN_DELAY = 70;

/** One turn of the loading spinner, Tailwind's own period, as DESIGN §6.4 sets none: --dur-spin */
export const SPINNER_TURN = 1000;

/** How many times a skeleton pulses before it holds still: --pulse-cycles */
export const PULSE_CYCLES = 2;

export type Curve = readonly [x1: number, y1: number, x2: number, y2: number];

/** DESIGN §4.2's curves, as cubic-bezier points. Each is the CSS variable --ease-<name> (inOut is --ease-in-out). */
export const CURVES = {
  /** The default for entrances and exits. Never ease-in on UI. */
  out: [0.23, 1, 0.32, 1],
  /** On-screen movement from A to B */
  inOut: [0.77, 0, 0.175, 1],
  /** Sheets */
  drawer: [0.32, 0.72, 0, 1],
} as const satisfies Record<string, Curve>;

/** A curve as CSS writes it, for the Web Animations API, which can't read a CSS variable */
export function cssEasing([x1, y1, x2, y2]: Curve): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** Each token tokens.css mirrors, as its CSS variable and its value as CSS writes it */
export const CSS_MOTION_VARIABLES: ReadonlyArray<readonly [variable: string, value: string]> = [
  ...Object.entries({ ...DURATIONS, ...SIGNATURE_DURATIONS, spin: SPINNER_TURN }).map(
    ([name, milliseconds]) => [`--dur-${kebab(name)}`, `${milliseconds}ms`] as const,
  ),
  ["--stagger", `${STAGGERS.default}ms`],
  ["--stagger-tight", `${STAGGERS.tight}ms`],
  ["--delay-shift-in", `${SHIFT_IN_DELAY}ms`],
  ["--press-scale", String(PRESS_SCALE)],
  ["--pulse-cycles", String(PULSE_CYCLES)],
  ...Object.entries(CURVES).map(([name, curve]) => [`--ease-${kebab(name)}`, cssEasing(curve)] as const),
];

export type Spring = { type: "spring"; bounce: number; duration: number };

/** DESIGN §4.3's springs, as Motion takes them (durations in seconds). Bounce never goes above 0.3. */
export const SPRINGS = {
  /** Programmatic moves: globe rotation, the Body Scan's end state */
  move: { type: "spring", bounce: 0, duration: 0.4 },
  /** Release after a flick (spin, sheet) */
  flick: { type: "spring", bounce: 0.2, duration: 0.4 },
  /** The draggable bottom sheet, after a flick */
  sheetAfterFlick: { type: "spring", bounce: 0.2, duration: 0.3 },
  /** The draggable bottom sheet, after a tap or a slow drag */
  sheetAfterTap: { type: "spring", bounce: 0, duration: 0.3 },
} as const satisfies Record<string, Spring>;

/** DESIGN §4.3's `track`: following the pointer (the spotlight, the loupe), per axis with useSpring. Critically damped. */
export const TRACK_SPRING = { stiffness: 100, damping: 20 } as const;

/**
 * DESIGN §4.4: where a scroll scrub runs, with GSAP. Elsewhere GSAP never loads: a phone, a coarse
 * pointer or a narrow window gets the feature's timed WAAPI version, and reduced motion its end state.
 */
export const SCRUB_MEDIA =
  "(hover: hover) and (pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)";

/** DESIGN §4.4: how long a scrub takes to catch up with the scroll position, which smooths wheel steps */
export const SCRUB_CATCH_UP = 500;

/** How close a spring with a duration is to its target when that duration ends: 0.1%, as in Motion */
const SETTLED = 0.001;

/** Where e^-x (1 + x), the envelope of a spring that doesn't bounce, falls to SETTLED */
const UNBOUNCED_SETTLE = 9.233413;

/**
 * A spring as the stiffness and damping Motion resolves its bounce and duration to, with a mass of
 * 1: the same curve from rest. Motion drops the starting velocity of a spring given by duration
 * (D-027), so a gesture's release, which carries its velocity (DESIGN §4.1), takes these instead.
 */
export function springPhysics({ bounce, duration }: Spring) {
  const dampingRatio = 1 - bounce;
  // The undamped radians the spring turns through before it is within SETTLED of its target
  const settle =
    dampingRatio < 1
      ? Math.log(dampingRatio / (Math.sqrt(1 - dampingRatio ** 2) * SETTLED)) / dampingRatio
      : UNBOUNCED_SETTLE;
  const frequency = settle / duration;
  return { stiffness: frequency ** 2, damping: 2 * dampingRatio * frequency, mass: 1 };
}

/** Milliseconds as the seconds Motion takes */
export function seconds(milliseconds: number): number {
  return milliseconds / 1000;
}
