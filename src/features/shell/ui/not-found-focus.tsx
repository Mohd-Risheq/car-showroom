"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";
import { handover } from "./handover";

// The 404's view, which keeps the keyboard's place among its controls (DESIGN §7.2.11). Once the
// page hydrates, not-found.tsx renders the view anew in place of the server's (D-047), and a link or
// button the keyboard reached before then, as on a slow phone, would go with the old view and leave
// the focus on the body. So a view on its way out notes which of its controls had the focus, and the
// one taking its place on the same page focuses the same control (handover.ts). The search field
// carries its own focus, with its words and caret (not-found-search.tsx).

/** The view's links and buttons, which the server's view and the one taking its place hold in the same order */
const CONTROLS = "a[href], button";

/** The control a view on its way out had the focus on, by its place among the view's controls */
const focusedControls = handover<number>();

export function NotFoundFocus({ className, children }: { className: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const view = root.current;
    if (view === null) return;
    const { taken, leave } = focusedControls.arrive();
    if (taken !== null) view.querySelectorAll<HTMLElement>(CONTROLS)[taken]?.focus({ preventScroll: true });
    return () => {
      const index = Array.from(view.querySelectorAll(CONTROLS)).findIndex(
        (control) => control === document.activeElement,
      );
      if (index !== -1) leave(index);
    };
  }, []);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
