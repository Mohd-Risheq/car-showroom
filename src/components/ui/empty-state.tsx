import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/class-names";

// DESIGN §6.4: one Phosphor icon, one sentence, one action. No illustrations of people or cars.

type EmptyStateProps = {
  /** A Phosphor icon, shown at 24 px */
  icon: ReactElement;
  /** The sentence */
  children: ReactNode;
  /** The one thing to do next: a button or a link */
  action: ReactElement;
  className?: string;
};

export function EmptyState({ icon, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-4 text-center", className)}>
      <span aria-hidden="true" className="text-(length:--spacing-icon-lg) text-muted">
        {icon}
      </span>
      <p className="max-w-measure">{children}</p>
      {action}
    </div>
  );
}
