import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";
import { CURVES, SCRUB_CATCH_UP, SCRUB_MEDIA, seconds } from "@/lib/motion-tokens";

// GSAP and ScrollTrigger, as the one shared lazy chunk that runs the desktop scroll scrubs (SRS
// §11.8). Only src/lib/motion/scrub.tsx loads this module, with import(), and only on a screen where
// scrubs run, so no other module imports GSAP (ESLint holds that).

gsap.registerPlugin(ScrollTrigger, CustomEase, useGSAP);

// DESIGN §4.2's curves, by their names in motion-tokens.ts: ease "out", "inOut" or "drawer"
for (const [name, curve] of Object.entries(CURVES)) CustomEase.create(name, curve.join(","));

// Every trigger here is a scrub, and each catches up with the scroll over the same time (DESIGN §4.4)
ScrollTrigger.defaults({ scrub: seconds(SCRUB_CATCH_UP) });

/**
 * ScrollTrigger measures where each scrub starts and ends, so it measures again after the layout
 * moves (DESIGN §4.4): when the page's height changes, as it does when fonts load late, an image
 * arrives or content renders after hydration, and when a locale switch changes its language and
 * direction. Its safe refresh waits 200 ms for the layout to settle and for the scroll to end, so
 * the scrubs on a page share one measure. Returns a function that stops watching.
 */
export function watchLayout(): () => void {
  const refresh = () => ScrollTrigger.refresh(true);
  const resize = new ResizeObserver(refresh);
  const language = new MutationObserver(refresh);
  resize.observe(document.body);
  language.observe(document.documentElement, { attributeFilter: ["lang", "dir"] });
  return () => {
    resize.disconnect();
    language.disconnect();
  };
}

/** What a section's scrub is built with: GSAP and ScrollTrigger, registered, and the section */
export type ScrubTools = { gsap: typeof gsap; ScrollTrigger: typeof ScrollTrigger; element: HTMLElement };

/**
 * Builds a section's scrub: its tweens and triggers, whose scroll triggers take a scrub by default.
 * It runs each time the screen starts to match SCRUB_MEDIA, and what it made is reverted each time
 * the screen stops, so the section returns to the state it was rendered in. Selector text finds
 * elements inside the section. It returns nothing, or a cleanup for anything else it started.
 */
export type BuildScrub = (tools: ScrubTools) => void | (() => void);

export type GsapScrubProps = {
  /** The scrubbed section */
  target: RefObject<HTMLElement | null>;
  /** Kept the same between renders: a new function builds the scrub again */
  build: BuildScrub;
};

/**
 * Runs a section's scrub while the screen matches SCRUB_MEDIA. useGSAP reverts it on unmount, and
 * runs the cleanup its callback returns, which stops watching the layout.
 */
export function GsapScrub({ target, build }: GsapScrubProps): null {
  useGSAP(
    () => {
      const element = target.current;
      if (!element) return;
      gsap.matchMedia().add(SCRUB_MEDIA, () => build({ gsap, ScrollTrigger, element }));
      return watchLayout();
    },
    { scope: target, dependencies: [target, build], revertOnUpdate: true },
  );
  return null;
}
