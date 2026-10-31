"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { arrive, type TitleAnnouncer, titleAnnouncer } from "./arrive";
import { takeReturn } from "./return-control";

// FR-02.4: after a navigation inside the site, the focus moves to the new page's heading, or to its
// main when it has none, so a keyboard or screen reader user starts at the page's top, and the
// page's title, as its <title> has it (meta.titleTemplate), is announced. After a step back or
// forward, the control the page was left by takes the focus while it is still there, so the visitor
// goes on from their place (the owner's answer of 2026-10-31): ScrollMemory's keeper notes it and
// offers it for the arrival (return-control.ts). Next.js 16 leaves the focus where it was. Its own
// route announcer reads the title as the new page commits, and when the page's metadata streams in
// after the page, as when it wasn't prefetched, there is no title yet and it reads the h1 instead
// (D-047). So the shell announces the title itself, once the title has come and the focus has
// landed, in a polite region, so it follows the heading the focus reads out, and globals.css hides
// Next.js's announcer. The region says aria-live itself, which its role implies, as a modal sheet
// hides every other part of the page from assistive technology (Base UI's markOthers). A title the
// same as the last page's isn't announced again, as Next.js doesn't. Only a change of path counts:
// a new query, as a filter, keeps the focus on its control, and the first page load leaves both to
// the browser. The focus moves without scrolling: ScrollMemory places the page (FR-02.5). The
// focus, the wait for the title and which title counts are arrive.ts's. The arrival is an
// enhancement: should it fail, the error is reported and the page stays, with the focus where the
// browser leaves it.

export function RouteArrival() {
  return (
    <Suspense fallback={null}>
      <ArrivalOnPathChange />
    </Suspense>
  );
}

function ArrivalOnPathChange() {
  const pathname = usePathname();
  const shown = useRef(pathname);
  const announcer = useRef<TitleAnnouncer | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    announcer.current ??= titleAnnouncer(document.title);
    if (pathname === shown.current) return;
    shown.current = pathname;
    const nextTitle = announcer.current;
    try {
      const announceTitle = () => {
        const title = nextTitle(document.title);
        if (title === null) return false;
        setAnnouncement(title);
        return true;
      };
      return arrive(announceTitle, takeReturn(pathname));
    } catch (error) {
      reportError(error);
    }
  }, [pathname]);

  return (
    <p role="status" aria-live="polite" data-route-announcer className="sr-only">
      {announcement}
    </p>
  );
}
