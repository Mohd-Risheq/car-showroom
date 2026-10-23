"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/class-names";
import { useFieldControl } from "./field";

// DESIGN §6.4's input: --surface-2 with a --line border, 2 px round (DESIGN §3.5), the focus ring
// (globals.css), and a --fail border when its field has an error. Its text never goes below 16 px
// (globals.css), so iOS Safari doesn't zoom in. inputMode and enterKeyHint are the caller's, field
// by field; a VIN or plate field also turns autocorrect and autocapitalize off, and reads left to
// right: dir="ltr" on its Field, or on the input without one.

export function Input({ id, className, "aria-describedby": describedBy, ...props }: ComponentProps<"input">) {
  const field = useFieldControl();

  return (
    <input
      aria-invalid={field?.["aria-invalid"]}
      {...props}
      // A field's id, which its label names, wins over the input's own
      id={field?.id ?? id}
      aria-describedby={[field?.["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined}
      className={cn(
        "h-11 w-full min-w-0 rounded-input border border-line bg-surface-2 px-3 text-ink placeholder:text-meta aria-invalid:border-fail disabled:opacity-40",
        // Room for the field's check at the end
        field?.valid && "pe-11",
        className,
      )}
    />
  );
}
