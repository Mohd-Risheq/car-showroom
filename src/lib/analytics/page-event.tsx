"use client";

import { useEffect } from "react";
import { track } from "./track";

// A page's own event (API-03's pages), sent once the page has hydrated: Home's, the inventory's and
// a car page's, which T-25, T-24 and T-21 place. A page sends it each time it shows, and beacon.ts
// keeps one in a page view, so the page keeps no note of what it sent: Next.js keeps a page it hides
// as it was, and shows it again in a new page view. A page the browser restores from its back-forward
// cache runs no effect again, so it counts no new view (the owner, 2026-11-01).

type PageEventProps =
  | { readonly event: "page_home" | "page_inventory"; readonly car?: never }
  | { readonly event: "car_view"; readonly car: string };

export function PageEvent({ event, car }: PageEventProps) {
  useEffect(() => {
    if (event === "car_view") track(event, car);
    else track(event);
  }, [event, car]);
  return null;
}
