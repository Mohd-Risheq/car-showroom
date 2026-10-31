"use client";

import { Button } from "@/components/ui/button";
import { hideDemoBanner } from "../domain/demo-banner";

// FR-02.3: hides the demo banner for the rest of the session. The button goes with the banner, so
// the focus moves on to the header's start: the next thing in reading order apart from the English
// card, which never takes the focus (DESIGN §7.1.1).
export function HideBannerButton({ label }: { label: string }) {
  return (
    <Button
      variant="quiet"
      size="compact"
      onClick={() => {
        hideDemoBanner();
        document.querySelector<HTMLElement>("[data-wordmark]")?.focus();
      }}
    >
      {label}
    </Button>
  );
}
