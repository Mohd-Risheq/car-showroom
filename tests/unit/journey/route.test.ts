import { describe, expect, it } from "vitest";
import type { LatLng } from "@/features/journey/domain/geo";
import { hasRoute, journeySteps } from "@/features/journey/domain/route";

// What each milestone adds to the Journey's route (BR-10, FR-17)

const KENTUCKY: LatLng = [38.21, -84.5597];
const HOUSTON: LatLng = [29.673, -95.0346];
const AQABA: LatLng = [29.4673, 34.977];
const ZARQA: LatLng = [32.0972, 36.2177];
const AMMAN: LatLng = [31.9516, 35.924];

describe("journey steps", () => {
  it("draws arcs in milestone order, with a pulse where two steps share a place (FR-17's acceptance criterion)", () => {
    const steps = journeySteps([KENTUCKY, HOUSTON, HOUSTON, AQABA, ZARQA, ZARQA, AMMAN]);
    expect(steps.map((step) => step.kind)).toEqual(["start", "arc", "pulse", "arc", "arc", "pulse", "arc"]);
    expect(steps[1]).toEqual({ kind: "arc", index: 1, place: HOUSTON, from: KENTUCKY });
    expect(steps[3]).toEqual({ kind: "arc", index: 3, place: AQABA, from: HOUSTON });
    expect(steps[6]).toEqual({ kind: "arc", index: 6, place: AMMAN, from: ZARQA });
  });

  it("draws an arc only between consecutive milestones that both have a place (BR-10)", () => {
    const steps = journeySteps([null, KENTUCKY, null, AQABA, AQABA, null, AQABA]);
    expect(steps).toEqual([
      { kind: "unplaced", index: 0 },
      { kind: "start", index: 1, place: KENTUCKY },
      { kind: "unplaced", index: 2 },
      { kind: "start", index: 3, place: AQABA },
      { kind: "pulse", index: 4, place: AQABA },
      { kind: "unplaced", index: 5 },
      { kind: "start", index: 6, place: AQABA },
    ]);
  });

  it("shows the globe only with two milestones that have a place (FR-17.1, FR-17.7)", () => {
    expect(hasRoute([])).toBe(false);
    expect(hasRoute([KENTUCKY, null, null])).toBe(false);
    expect(hasRoute([KENTUCKY, null, AMMAN])).toBe(true);
    expect(hasRoute([AMMAN, AMMAN])).toBe(true);
  });
});
