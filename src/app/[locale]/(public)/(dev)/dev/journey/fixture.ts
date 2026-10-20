import type { LatLng } from "@/features/journey/domain/geo";

// Spike T-09's routes, on the seed places (SEED §7: OpenStreetMap through Nominatim, 18 Oct 2026)

const PLACES = {
  georgetown_ky: [38.21, -84.5597],
  houston: [29.673, -95.0346],
  aqaba_port: [29.4673, 34.977],
  zarqa_free_zone: [32.0972, 36.2177],
  amman: [31.9516, 35.924],
  fremont_ca: [37.5483, -121.9886],
  incheon: [37.4677, 126.6117],
} as const satisfies Record<string, LatLng>;

export type Milestone = { type: string; place: keyof typeof PLACES; month: string; note?: string };
export type JourneyRoute = { title: string; milestones: Milestone[] };

export const ROUTES: Record<"tc-17-1" | "pacific", JourneyRoute> = {
  // FR-17's acceptance criterion and TC-17-1: seven milestones, two of them pulses (Houston, Zarqa)
  "tc-17-1": {
    title: "TC-17-1: Kentucky to Amman",
    milestones: [
      { type: "built", place: "georgetown_ky", month: "2018-11" },
      { type: "auction", place: "houston", month: "2024-06", note: "Salvage title" },
      { type: "shipped", place: "houston", month: "2024-07" },
      { type: "arrived_port", place: "aqaba_port", month: "2024-08" },
      { type: "free_zone", place: "zarqa_free_zone", month: "2024-08" },
      { type: "customs_cleared", place: "zarqa_free_zone", month: "2024-09" },
      { type: "in_showroom", place: "amman", month: "2024-10" },
    ],
  },
  // Not a seed journey: Fremont to Incheon crosses the antimeridian (FR-17 edge cases)
  pacific: {
    title: "Across the antimeridian (a test route, not a seed journey)",
    milestones: [
      { type: "built", place: "fremont_ca", month: "2022-03" },
      { type: "shipped", place: "incheon", month: "2022-06" },
      { type: "arrived_port", place: "aqaba_port", month: "2022-08" },
      { type: "in_showroom", place: "amman", month: "2022-09" },
    ],
  },
};

export type RouteKey = keyof typeof ROUTES;

export const isRouteKey = (value: string | null): value is RouteKey => value !== null && value in ROUTES;

export const placesOf = (key: RouteKey): LatLng[] => ROUTES[key].milestones.map((milestone) => PLACES[milestone.place]);
