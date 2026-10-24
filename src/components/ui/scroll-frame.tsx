import type { ComponentProps } from "react";
import { cn } from "@/lib/class-names";

// A frame that scrolls sideways when what it holds, such as a table, is wider than the screen, as
// DESIGN §7.2.3's panel table does on a phone. A table keeps each word whole when it sizes its
// columns (globals.css), so a table wider than its box goes in one. The frame takes focus, so a
// keyboard can scroll it in Safari, which doesn't focus a scroller of its own accord (axe's
// scrollable-region-focusable, WCAG 2.1.1), and as a region that takes focus it has a name.

type ScrollFrameProps = Omit<ComponentProps<"div">, "role" | "tabIndex" | "aria-label"> & {
  /** Names the frame for screen readers, from the catalog on a shipped screen */
  label: string;
};

export function ScrollFrame({ label, className, ...props }: ScrollFrameProps) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a region that scrolls takes focus, so a keyboard can scroll it
    <div {...props} role="region" aria-label={label} tabIndex={0} className={cn("overflow-x-auto", className)} />
  );
}
