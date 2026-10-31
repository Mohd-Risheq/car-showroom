"use client";

import { type ComponentProps, useLayoutEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { handover } from "./handover";

// The 404's search field (DESIGN §7.2.11). Once the page hydrates, not-found.tsx renders the view anew
// in place of the server's (D-047), and words typed before then, as on a slow phone, would go with the
// old field. So a field on its way out leaves its words, focus and caret, and the new one on the same
// page takes them over (handover.ts), as the stage's scan line takes over its crossing.

/** What a field on its way out leaves for the one taking its place */
type Draft = { value: string; focused: boolean; start: number | null; end: number | null };

const drafts = handover<Draft>();

export function NotFoundSearch(props: ComponentProps<typeof Input>) {
  const field = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const input = field.current;
    if (input === null) return;
    const { taken, leave } = drafts.arrive();
    if (taken !== null) {
      input.value = taken.value;
      if (taken.focused) input.focus({ preventScroll: true });
      input.setSelectionRange(taken.start, taken.end);
    }
    return () => {
      const focused = document.activeElement === input;
      if (input.value === "" && !focused) return;
      leave({ value: input.value, focused, start: input.selectionStart, end: input.selectionEnd });
    };
  }, []);

  return <Input ref={field} {...props} />;
}
