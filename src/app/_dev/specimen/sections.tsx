import { calcGeneratorDuration, spring } from "motion";
import type { ReactNode } from "react";
import {
  CSS_MOTION_VARIABLES,
  type Curve,
  CURVES,
  SCRUB_CATCH_UP,
  springPhysics,
  SPRINGS,
  TRACK_SPRING,
} from "@/lib/motion-tokens";
import { Caption } from "./caption";
import type { StepSamples } from "./copy";
import { Measure } from "./measure";

// The token specimens' sections (T-13), shared by the public and dealer pages. Each shows tokens as
// components take them, through the Tailwind theme, beside what the browser computes for them.
// Development chrome is English, in the system monospace, so it never reads as part of a specimen;
// samples are in the page's language.

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6">
      <h2 id={id} lang="en" dir="ltr" className="font-mono text-sm text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

// Whole class names, so Tailwind finds them in this file
const COLOURS = {
  bg: "bg-bg",
  "surface-1": "bg-surface-1",
  "surface-2": "bg-surface-2",
  "surface-3": "bg-surface-3",
  line: "bg-line",
  ink: "bg-ink",
  muted: "bg-muted",
  meta: "bg-meta",
  scan: "bg-scan",
  "on-scan": "bg-on-scan",
  accent: "bg-accent",
  "on-accent": "bg-on-accent",
  warn: "bg-warn",
  fail: "bg-fail",
} as const;

/** Every colour token, in the theme of the page */
export function Swatches() {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
      {Object.entries(COLOURS).map(([name, swatch]) => (
        <li key={name} className="grid gap-1" data-colour={name}>
          <div className={`h-12 border border-line ${swatch}`} />
          <Measure properties={["background-color"]} colour />
          <Caption>--{name}</Caption>
        </li>
      ))}
    </ul>
  );
}

const ACCENTS = ["scan_cyan", "electric_blue", "mint", "ivory", "violet"] as const;

/** The dealer's accent presets for the public site: each replaces --scan, with --on-scan text on it */
export function Accents() {
  return (
    <ul className="flex flex-wrap gap-4">
      {ACCENTS.map((accent) => (
        // scan_cyan is the accent :root sets
        <li key={accent} data-accent={accent === "scan_cyan" ? undefined : accent} className="grid gap-1">
          <div className="flex h-12 items-center bg-scan px-4 font-mono text-sm text-on-scan">{accent}</div>
          <Measure properties={["background-color"]} colour />
        </li>
      ))}
    </ul>
  );
}

const STEPS = [
  ["display", "type-display"],
  ["head", "type-head"],
  ["lead", "type-lead"],
  ["body", "type-body"],
  ["small", "type-small"],
] as const satisfies ReadonlyArray<readonly [keyof StepSamples, string]>;

/** DESIGN §3.3's public steps, with the size, line height, weight and HEXP each computes to here */
export function TypeSteps({ samples }: { samples: StepSamples }) {
  return (
    <div className="grid gap-8">
      {STEPS.map(([step, className]) => (
        <div key={step} className="grid gap-1" data-step={step}>
          <Caption>{className}</Caption>
          <p className={className}>{samples[step]}</p>
          <Measure properties={["font-size", "line-height", "font-weight", "font-variation-settings"]} />
        </div>
      ))}
      <div className="grid gap-1">
        <Caption>figures</Caption>
        <p className="figures">14,500 · 71,000 · 2019</p>
        <Measure properties={["font-stretch", "font-weight", "font-variant-numeric"]} />
      </div>
    </div>
  );
}

const SIZES = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
} as const;

const WEIGHTS = { normal: "font-normal", medium: "font-medium", semibold: "font-semibold" } as const;

/** The dealer workspace's fixed scale and the three weights (DESIGN §3.3) */
export function WorkspaceType({ sample }: { sample: string }) {
  return (
    <div className="grid gap-6">
      {Object.entries({ ...SIZES, ...WEIGHTS }).map(([name, className]) => (
        <div key={name} className="grid gap-1" data-size={name}>
          <Caption>{className}</Caption>
          <p className={className}>{sample}</p>
          <Measure properties={["font-size", "line-height", "font-weight"]} />
        </div>
      ))}
    </div>
  );
}

const SPACES = {
  page: "w-(--spacing-page)",
  gutter: "w-(--spacing-gutter)",
  section: "w-(--spacing-section)",
  icon: "w-(--spacing-icon)",
  "icon-lg": "w-(--spacing-icon-lg)",
} as const;

const SCALE = { 1: "w-1", 2: "w-2", 3: "w-3", 4: "w-4", 6: "w-6", 8: "w-8", 12: "w-12", 16: "w-16" } as const;

const CONTAINERS = { content: "max-w-content", measure: "max-w-measure" } as const;

/** DESIGN §3.4: the 4 px base, the page's own measures at this width, and the content widths */
export function Spacing() {
  return (
    <div className="grid gap-8">
      <ul className="grid gap-3">
        {Object.entries(SPACES).map(([name, width]) => (
          <li key={name} className="grid gap-1">
            <Caption>--spacing-{name}</Caption>
            <div className={`h-3 bg-scan ${width}`} />
            <Measure properties={["width"]} />
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap items-end gap-6">
        {Object.entries(SCALE).map(([step, width]) => (
          <li key={step} className="grid gap-1">
            <Caption>{width}</Caption>
            <div className={`h-3 bg-muted ${width}`} />
            <Measure properties={["width"]} />
          </li>
        ))}
      </ul>
      <ul className="grid gap-3">
        {Object.entries(CONTAINERS).map(([name, width]) => (
          <li key={name} className="grid gap-1">
            <Caption>{width}</Caption>
            <div className={width} />
            <Measure properties={["max-width"]} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** DESIGN §3.5 and §3.7: radius, aspect ratios, the overlay shadow and the focus ring */
export function Shapes() {
  return (
    <ul className="flex flex-wrap items-start gap-8">
      <li className="grid gap-1">
        <Caption>rounded-input</Caption>
        <div className="h-11 w-40 rounded-input border border-line bg-surface-2" />
        <Measure properties={["border-radius"]} />
      </li>
      <li className="grid gap-1">
        <Caption>rounded-full</Caption>
        <div className="h-11 w-40 rounded-full border border-line" />
        <Measure properties={["border-radius"]} />
      </li>
      <li className="grid gap-1">
        <Caption>aspect-card</Caption>
        <div className="aspect-card w-40 bg-surface-3" />
        <Measure properties={["aspect-ratio"]} />
      </li>
      <li className="grid gap-1">
        <Caption>aspect-hero</Caption>
        <div className="aspect-hero w-40 bg-surface-3" />
        <Measure properties={["aspect-ratio"]} />
      </li>
      <li className="grid gap-1">
        <Caption>shadow-overlay</Caption>
        <div className="h-20 w-40 bg-surface-2 shadow-overlay surface-edge" />
        <Measure properties={["box-shadow"]} />
      </li>
      <li className="grid gap-1">
        <Caption>focus ring</Caption>
        {/* The ring globals.css draws on keyboard focus, drawn here without focus */}
        <div className="h-11 w-40 rounded-full border border-line outline-(length:--focus-ring-width) outline-offset-(--focus-ring-offset) outline-accent outline-solid" />
        <Measure properties={["outline", "outline-offset"]} />
      </li>
    </ul>
  );
}

const PLOT = 64;

/** A cubic-bezier as an SVG path from (0, 0) to (1, 1), y up */
function curvePath([x1, y1, x2, y2]: Curve): string {
  const point = (x: number, y: number) => `${x * PLOT},${(1 - y) * PLOT}`;
  return `M${point(0, 0)} C${point(x1, y1)} ${point(x2, y2)} ${point(1, 1)}`;
}

/** A spring from rest over one and a half times the time it takes to settle, as SVG points */
function springPoints(physics: { stiffness: number; damping: number; mass?: number }): string {
  const generator = spring({ keyframes: [0, 1], ...physics });
  const end = calcGeneratorDuration(generator) * 1.5;
  return Array.from({ length: 49 }, (_, index) => {
    const progress = index / 48;
    return `${progress * PLOT},${(1 - generator.next(progress * end).value) * PLOT}`;
  }).join(" ");
}

function Plot({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={`-12 -12 ${PLOT + 24} ${PLOT + 24}`}
      className="size-24 border border-line text-scan"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      {children}
    </svg>
  );
}

/** DESIGN §4.2 to §4.4 from src/lib/motion-tokens.ts, beside the CSS variables that mirror them */
export function MotionTokens() {
  return (
    <div className="grid gap-8" lang="en" dir="ltr">
      <table className="font-mono text-xs">
        <thead>
          <tr>
            <th scope="col" className="pe-6 text-start font-normal text-muted">
              token
            </th>
            <th scope="col" className="pe-6 text-start font-normal text-muted">
              motion-tokens.ts
            </th>
            <th scope="col" className="text-start font-normal text-muted">
              computed
            </th>
          </tr>
        </thead>
        <tbody>
          {CSS_MOTION_VARIABLES.map(([variable, value]) => (
            <tr key={variable}>
              <th scope="row" className="pe-6 text-start font-normal">
                {variable}
              </th>
              <td className="pe-6">{value}</td>
              <td>
                <Measure properties={[variable]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-wrap gap-8">
        {Object.entries(CURVES).map(([name, curve]) => (
          <li key={name} className="grid content-start gap-1">
            <Plot>
              <path d={curvePath(curve)} />
            </Plot>
            <Caption>CURVES.{name}</Caption>
          </li>
        ))}
        {Object.entries(SPRINGS).map(([name, transition]) => (
          <li key={name} className="grid content-start gap-1">
            <Plot>
              <polyline points={springPoints(springPhysics(transition))} />
            </Plot>
            <Caption>SPRINGS.{name}</Caption>
            <Caption>
              bounce {transition.bounce}, {transition.duration} s
            </Caption>
          </li>
        ))}
        <li className="grid content-start gap-1">
          <Plot>
            <polyline points={springPoints(TRACK_SPRING)} />
          </Plot>
          <Caption>TRACK_SPRING</Caption>
          <Caption>
            stiffness {TRACK_SPRING.stiffness}, damping {TRACK_SPRING.damping}
          </Caption>
        </li>
      </ul>
      {/* GSAP takes it, in seconds, so no CSS variable mirrors it */}
      <div className="grid gap-1">
        <Caption>SCRUB_CATCH_UP</Caption>
        <Caption>{SCRUB_CATCH_UP} ms</Caption>
      </div>
    </div>
  );
}

/** DESIGN §4.5 and §7.2.1: the one translucent surface, over the scan colour, opaque when transparency is reduced */
export function Placard({ sample }: { sample: string }) {
  return (
    <div className="relative h-48 max-w-measure overflow-hidden bg-surface-3 p-6">
      <p className="type-head text-scan">{sample}</p>
      <div className="absolute inset-x-8 bottom-6 grid gap-1 bg-surface-1/(--placard-opacity) p-4" data-placard>
        <Measure properties={["--placard-opacity", "background-color"]} />
        <Caption>bg-surface-1/(--placard-opacity)</Caption>
      </div>
    </div>
  );
}
