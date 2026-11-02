"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { reportClientError } from "@/lib/analytics/track";

// SRS §11.8: a component that animates through Motion's React API uses `m` inside this boundary,
// never the full `motion` component (ESLint holds that, and the boundary is strict, so a `motion`
// component inside it throws). Motion's animation features arrive as a chunk of their own once the
// boundary mounts, so only pages where something animates load them. Drag and layout animation
// (domMax) join when a feature first needs them. Under reduced motion, transforms and layout
// properties jump to their end while opacity and colour still animate (DESIGN §4.5); Motion's own
// default ignores the preference.

// Where the chunk fails to load, `m` elements keep the state they rendered in, and the failure
// counts (NFR-OBS-02). A promise that never settles leaves LazyMotion no rejection to drop unhandled.
export const loadFeatures = () =>
  import("./dom-animation").then(
    (module) => module.features,
    () => {
      reportClientError("CHUNK_MOTION");
      return new Promise<never>(() => {});
    },
  );

export function MotionFeatures({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
