"use client";

import { useEffect, useState } from "react";
import { SCRUB_MEDIA } from "@/lib/motion-tokens";
import type { GsapScrub, GsapScrubProps } from "./gsap";

// A section's desktop scroll scrub (SRS §11.8, DESIGN §4.4). GSAP and ScrollTrigger load once, as one
// shared lazy chunk (src/lib/motion/gsap.ts), when the first scrubbed section comes within one
// viewport on a screen that matches SCRUB_MEDIA, so phones never request them. Until the scrub runs,
// and wherever it doesn't, the section shows the state it was rendered in, which is its end state.

/** Loads GSAP's chunk when the section comes near on a screen that scrubs, then runs its scrub there */
export function Scrub({ target, build }: GsapScrubProps) {
  const [Loaded, setLoaded] = useState<typeof GsapScrub | null>(null);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const media = matchMedia(SCRUB_MEDIA);
    let near = false;
    let cancelled = false;
    const stop = () => {
      observer.disconnect();
      media.removeEventListener("change", load);
    };
    const load = () => {
      if (!near || !media.matches) return;
      stop();
      import("./gsap").then(
        (chunk) => {
          if (!cancelled) setLoaded(() => chunk.GsapScrub);
        },
        () => {
          // Without its chunk the section keeps its end state. T-20 reports the failure once, as a
          // client_error event (NFR-OBS-02).
        },
      );
    };
    // Within one viewport above or below the screen
    const observer = new IntersectionObserver(
      (entries) => {
        near = entries.some((entry) => entry.isIntersecting);
        load();
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
    media.addEventListener("change", load);
    return () => {
      cancelled = true;
      stop();
    };
  }, [target]);

  return Loaded ? <Loaded target={target} build={build} /> : null;
}
