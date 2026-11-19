"use client";

import { useSyncExternalStore } from "react";
import { nearViewport } from "@/features/car-page/ui/near-viewport";

// The lab's islands, which share one lazy chunk, and a line that says the page has hydrated, so a
// test knows the islands are watching for their sections

export const LoadedIsland = nearViewport(
  async () => ({ default: (await import("./lab-islands")).IslandIn }),
  "SECTION_LAB",
);

export const BrokenIsland = nearViewport(
  async () => ({ default: (await import("./lab-islands")).IslandThatThrows }),
  "SECTION_LAB",
);

const subscribe = () => () => {};

/** Whether the page has hydrated */
export function Hydrated() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <p data-hydrated={hydrated} className="type-small text-muted">
      {hydrated ? "Hydrated" : "Not hydrated yet"}
    </p>
  );
}
