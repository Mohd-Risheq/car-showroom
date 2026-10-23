"use client";

import { m } from "motion/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BuildScrub } from "@/lib/motion/gsap";
import { MotionFeatures } from "@/lib/motion/motion-features";
import { Scrub } from "@/lib/motion/scrub";
import { SPRINGS } from "@/lib/motion-tokens";
import { Caption } from "./caption";

// SRS §11.8's two lazy motion pieces on the public specimen: a scroll scrub, through GSAP's desktop
// chunk, and a spring, through Motion's features.

/** S01's length (05-SEED-DATA §5.4), which the hero's length line labels */
const S01_LENGTH_MM = "4,950";

/** Draws the line from nothing as the demo rises from the bottom of the screen to its middle */
const drawLine: BuildScrub = ({ gsap, element }) => {
  gsap.fromTo(
    "[data-scrub-line]",
    { strokeDashoffset: 1 },
    {
      strokeDashoffset: 0,
      ease: "none",
      // GSAP rounds pixel values to whole pixels, and the paths are one unit long (pathLength)
      autoRound: false,
      scrollTrigger: { trigger: element, start: "top bottom", end: "center center" },
    },
  );
};

/**
 * The hero's length line in small (DESIGN §3.7, §5.1): 1 px with 6 px open arrowheads, drawn by the
 * scroll on a screen that scrubs and drawn already everywhere else
 */
export function ScrubDemo({ unit }: { unit: string }) {
  const demo = useRef<HTMLDivElement>(null);

  return (
    <div ref={demo} className="grid gap-4" data-demo="Scrub">
      <Caption>Scrub, where SCRUB_MEDIA matches</Caption>
      <svg width={320} height={24} viewBox="0 0 320 24" className="text-line" aria-hidden="true">
        {["M7 6.5 1 12.5l6 6", "M1 12.5h318", "m313 6.5 6 6-6 6"].map((d) => (
          <path key={d} d={d} data-scrub-line pathLength={1} strokeDasharray={1} fill="none" stroke="currentColor" />
        ))}
      </svg>
      <p className="type-small text-muted">
        <span className="figures">{S01_LENGTH_MM}</span> {unit}
      </p>
      <Scrub target={demo} build={drawLine} />
    </div>
  );
}

/** `m` inside MotionFeatures: the bar moves with SPRINGS.move once Motion's features have arrived */
export function SpringDemo({ label }: { label: string }) {
  const [moved, setMoved] = useState(false);

  return (
    <MotionFeatures>
      <div className="grid max-w-measure gap-4" data-demo="Spring">
        <Caption>m inside MotionFeatures, with SPRINGS.move</Caption>
        <m.div
          data-spring-bar
          className="h-2 origin-left bg-scan rtl:origin-right"
          initial={false}
          animate={{ scaleX: moved ? 1 : 0.25 }}
          transition={SPRINGS.move}
        />
        <Button className="justify-self-start" onClick={() => setMoved((value) => !value)}>
          {label}
        </Button>
      </div>
    </MotionFeatures>
  );
}
