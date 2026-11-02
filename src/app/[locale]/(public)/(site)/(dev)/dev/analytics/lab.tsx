"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { PageEvent } from "@/lib/analytics/page-event";
import { track } from "@/lib/analytics/track";

/**
 * A car page's events on a page that stands in for one: its view, the spin and a WhatsApp tap, and a
 * tap whose handler throws, as an error nothing catches (UNCAUGHT). Each tap's error has its number,
 * as WebKit's inspector folds an error that repeats the last into a count, which Playwright drops.
 */
export function AnalyticsLab({ car }: { car: string }) {
  const taps = useRef(0);
  return (
    <div className="flex flex-wrap gap-4">
      <PageEvent event="car_view" car={car} />
      <Button variant="secondary" onClick={() => track("sig_spin", car)}>
        Spin
      </Button>
      <Button variant="secondary" onClick={() => track("contact_whatsapp", car)}>
        WhatsApp
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          taps.current += 1;
          throw new Error(`The analytics lab's tap ${taps.current} failed`);
        }}
      >
        Fail
      </Button>
    </div>
  );
}
