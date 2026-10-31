"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

// DESIGN §7.1.1: the header sticks to the top, and once the page has scrolled 80 px it turns
// --surface-1 and, from 768 px, moves up 12 px while its row moves down 6, so it reads as 52 px tall
// with nothing below it moving. A transform, not a height, so the page never shifts (CLS); under
// reduced motion only the colour changes. On a screen under 480 px tall it scrolls away with the page,
// and on one under 600 px tall, 640 px from 768 px wide, while the English offer shows (DESIGN §8.4,
// globals.css). An 80 px marker at the top of the page says when to compact: absolutely placed, with
// no positioned ancestor, so it measures from the top of the document whatever sits above the header.

/**
 * Whether the page has scrolled past the marker, which compacts the header. A batch can hold more
 * than one entry, oldest first, when the page crosses the marker and back before the observer is
 * told, so the newest decides.
 */
export function scrolledPast(entries: readonly Pick<IntersectionObserverEntry, "isIntersecting">[]): boolean {
  return entries.at(-1)?.isIntersecting === false;
}

export function HeaderBand({ children }: { children: ReactNode }) {
  const marker = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const element = marker.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => setCompact(scrolledPast(entries)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={marker} aria-hidden="true" className="pointer-events-none absolute top-0 h-20 w-px" />
      <header
        data-site-header
        data-compact={compact || undefined}
        className="sticky top-0 z-30 bg-bg transition-[background-color,translate] duration-(--dur-pop) ease-out data-compact:bg-surface-1 short:static md:motion-safe:data-compact:-translate-y-(--header-compact-shift)"
      >
        {children}
      </header>
    </>
  );
}
