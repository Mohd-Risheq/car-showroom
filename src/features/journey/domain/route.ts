import type { LatLng } from "./geo";

// What each milestone adds to the route (BR-10, FR-17). An arc joins two consecutive milestones
// that both have a place, and where they share the place it is a pulse instead. A milestone with a
// place after one without starts afresh, with no arc into it, and one without a place adds nothing.

export type JourneyStep =
  | { kind: "start"; index: number; place: LatLng }
  | { kind: "arc"; index: number; place: LatLng; from: LatLng }
  | { kind: "pulse"; index: number; place: LatLng }
  | { kind: "unplaced"; index: number };

export function journeySteps(places: ReadonlyArray<LatLng | null>): JourneyStep[] {
  return places.map((place, index): JourneyStep => {
    if (!place) return { kind: "unplaced", index };
    const from = places[index - 1];
    if (!from) return { kind: "start", index, place };
    if (from[0] === place[0] && from[1] === place[1]) return { kind: "pulse", index, place };
    return { kind: "arc", index, place, from };
  });
}

/** The globe needs two milestones with a place (FR-17.1, FR-17.7) */
export const hasRoute = (places: ReadonlyArray<LatLng | null>) => places.filter(Boolean).length >= 2;
