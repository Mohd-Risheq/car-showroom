import type { MechState, PanelState } from "@/lib/db/enums";

// BR-07: an inspection is as complete as the number of its items with a known state, of 13 panels
// and 3 mechanical items. The cards' badge and filter and the car page's label read the count.

/** The items an inspection states: 13 panels and the chassis, engine and gearbox */
export const INSPECTION_ITEMS = 16;

/** BR-07: how many of the items have a known state */
export function inspectionFilled(states: readonly (PanelState | MechState)[]): number {
  return states.filter((state) => state !== "unknown").length;
}
