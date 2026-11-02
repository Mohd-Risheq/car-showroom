import type { ComponentProps } from "react";
import { cn } from "@/lib/class-names";

// A section's heading on a reading page (SCR-14): the privacy page's MDX and the Credits page's
// tables. The space above a heading is at least twice the space below it (DESIGN §3.4): 48 px above
// it, and 16 px below it to a paragraph or a list, or 24 px to a table.

export function ReadingHeading({ className, children, ...props }: ComponentProps<"h2">) {
  return (
    <h2 {...props} className={cn("mt-12 type-lead", className)}>
      {children}
    </h2>
  );
}
