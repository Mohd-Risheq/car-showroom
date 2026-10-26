import type { RateLimit } from "./limit";

// SRS §8.3's limits, by the id each route has there, for the routes limited so far: each task adds
// its routes' rows. defineAction counts an action's calls per user. §8.3 also counts per network
// (API-04), per demo session (API-15, API-31) and failures alone (API-32), which the tasks that build
// those actions add. API-18's five media actions share their one row.
export const ROUTE_LIMITS = {
  "API-17": { max: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimit>;

export type LimitedRoute = keyof typeof ROUTE_LIMITS;
