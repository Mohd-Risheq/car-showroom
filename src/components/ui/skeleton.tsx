import type { ComponentProps } from "react";
import { cn } from "@/lib/class-names";

// DESIGN §6.4: a --surface-2 block shaped like what will load, square unless that is round. It
// pulses gently twice over --dur-pulse and then holds still, and under reduced motion it never
// pulses. No shimmer. It is hidden from screen readers: the region that is loading says so with
// aria-busy.

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={cn("animate-skeleton bg-surface-2 motion-reduce:animate-none", className)}
    />
  );
}
