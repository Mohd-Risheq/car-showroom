import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/class-names";

// DESIGN §6.4: an error shows where the data was, saying what happened and what to do, with a way
// to try again. It stays in ink: --fail is for inspection and validation states only (DESIGN §10.1).

type InlineErrorProps = {
  /** What happened and what to do */
  children: ReactNode;
  /** The button that tries again */
  retry: ReactElement;
  /**
   * Whether the error stops the person going on, which alone interrupts a screen reader (SRS §10.4,
   * 4.1.3). Any other error appears inside a polite live region (role="status") that the section
   * keeps mounted, as a region added together with its text isn't reliably announced.
   */
  blocking: boolean;
  className?: string;
};

export function InlineError({ children, retry, blocking, className }: InlineErrorProps) {
  return (
    <div role={blocking ? "alert" : undefined} className={cn("flex flex-col items-start gap-3", className)}>
      <p className="flex items-start gap-2">
        <WarningCircleIcon aria-hidden="true" className="size-icon shrink-0 text-muted" />
        {children}
      </p>
      {retry}
    </div>
  );
}
