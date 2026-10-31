"use client";

import { useLayoutEffect, useRef } from "react";
import { handover } from "./handover";

// DESIGN §7.2.11: the 404's stage, an empty bay drawn in data lines, which the scan line crosses once
// and closes, from its back to its open side. Under reduced motion the line rests there from the
// start. Blueprint lines are physical, so the drawing never mirrors (DESIGN §7.1).
//
// The server renders this view, and once the page hydrates, not-found.tsx renders the same view in
// its place (D-047), which would start the crossing again. The new line takes over the crossing's
// start time instead, so the swap doesn't show (handover.ts). A later visit crosses afresh.

/** The start time of the crossing a line on its way out had begun */
const crossings = handover<CSSNumberish>();

export function NotFoundStage() {
  const line = useRef<SVGLineElement>(null);

  useLayoutEffect(() => {
    const element = line.current;
    if (element === null) return;
    const { taken, leave } = crossings.arrive();
    const [animation] = element.getAnimations();
    if (animation !== undefined && taken !== null) animation.startTime = taken;
    return () => {
      // A crossing yet to begin, as on a page that has just come, has no start time to hand over
      const startTime = element.getAnimations()[0]?.startTime ?? null;
      if (startTime !== null) leave(startTime);
    };
  }, []);

  return (
    <div aria-hidden="true" className="flex justify-center bg-surface-1 py-10">
      <svg viewBox="0 0 320 160" className="block h-auto w-full max-w-80 overflow-visible">
        <path
          d="M110 140V20H210V140"
          fill="none"
          className="stroke-line stroke-(length:--line-data) [vector-effect:non-scaling-stroke]"
        />
        <line
          ref={line}
          x1="70"
          x2="250"
          y1="140"
          y2="140"
          className="stroke-scan stroke-(length:--line-scan) [--scan-from:-75%] transform-view [vector-effect:non-scaling-stroke] motion-safe:animate-scan-cross"
        />
      </svg>
    </div>
  );
}
