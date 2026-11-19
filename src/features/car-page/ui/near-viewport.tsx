"use client";

import { catchError, type ErrorInfo } from "next/error";
import { type ComponentType, lazy, type ReactNode, Suspense, useEffect, useRef, useState, useTransition } from "react";
import type { ClientErrorCode } from "@/lib/analytics/client-errors";
import { reportClientError } from "@/lib/analytics/track";
import { NEAR_SCREEN_MARGIN } from "@/lib/near-screen";

// FR-09.7: a car page section's interactive part, its island, loads its code, and the media that
// code asks for, only once the section comes within one viewport of the screen. Until the island is
// in, and in a browser without script, what the server rendered in its place stands in: the
// section's static form, or a skeleton of the island's size (DESIGN §6.4). An island that fails in
// the browser, as its code fails to load or it throws, leaves the section's one muted line in its
// place, under the section's heading (DESIGN §7.2.3), and the failure counts once (NFR-OBS-02). A
// section that keeps its static form when its island fails, as FR-14 and FR-17 ask, catches that
// failure in its island.

type IslandProps<P> = {
  /** What the island renders from */
  island: P;
  /** What stands in the island's place until it is in: the section's static form, or a skeleton */
  children: ReactNode;
  /** The section's line if the island fails: car.sectionError */
  failure: string;
};

/** The section's line in its frame, in place of an island that failed, which counts once */
const IslandBoundary = catchError(function IslandFailed(
  { failure, code }: { failure: string; code: ClientErrorCode },
  { error }: ErrorInfo,
) {
  useEffect(() => reportClientError(code, error), [code, error]);
  return <p className="type-small text-muted">{failure}</p>;
});

/**
 * A section's island, which loads its code from load once the section comes near the screen, and
 * reports its failure under code
 */
export function nearViewport<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
  code: ClientErrorCode,
): (props: IslandProps<P>) => ReactNode {
  const Island = lazy(load);
  return function NearViewport({ island, children, failure }: IslandProps<P>) {
    const slot = useRef<HTMLDivElement>(null);
    const [near, setNear] = useState(false);
    const [loading, startTransition] = useTransition();

    useEffect(() => {
      const element = slot.current;
      if (!element) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          // As a transition, the stand-in stays until the island is ready to take its place
          startTransition(() => setNear(true));
        },
        { rootMargin: NEAR_SCREEN_MARGIN },
      );
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    return (
      <div ref={slot} aria-busy={loading || undefined}>
        <IslandBoundary failure={failure} code={code}>
          <Suspense fallback={children}>{near ? <Island {...island} /> : children}</Suspense>
        </IslandBoundary>
      </div>
    );
  };
}
