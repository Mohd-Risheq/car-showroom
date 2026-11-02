"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect } from "react";
import { notePath, watchUncaughtErrors } from "./track";

// FR-47's client in the public site's layout, beside RouteArrival. Each navigation to a new pathname
// starts a page view, and a new query alone doesn't (FR-47.6): the note is a layout effect, which
// runs before every passive effect of its commit, so the events a page sends from its effects count
// in the new view. Once the page has hydrated, the errors nothing caught count (NFR-OBS-02).
export function Analytics() {
  return (
    <Suspense fallback={null}>
      <PageViews />
    </Suspense>
  );
}

function PageViews() {
  const pathname = usePathname();
  useLayoutEffect(() => notePath(pathname), [pathname]);
  useEffect(() => watchUncaughtErrors(), []);
  return null;
}
