import type { CarCondition } from "@/lib/db/enums";
import type { MileageBand } from "@/lib/db/public-dto";
import type { MileageBands } from "@/lib/validation/settings";

// BR-06: a used car's kilometres a year since 1 January of its model year, judged against the
// dealer's bands. A car counts as at least half a year old, so its first months aren't judged on
// days. A new car shows no badge.

const DAY_MS = 86_400_000;
const DAYS_A_YEAR = 365.25;
const MIN_AGE_YEARS = 0.5;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The band, and the kilometres a year it was judged on, rounded and kept inside its band */
export type MileageCheck = { readonly band: MileageBand; readonly kmPerYear: number };

type Car = { readonly condition: CarCondition; readonly modelYear: number; readonly mileageKm: number };

/** BR-06, on today's date in Amman as Postgres's date type writes it */
export function mileageCheck(car: Car, today: string, bands: MileageBands): MileageCheck | null {
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  // The engine reads 2026-02-30 as 2 March, so only a date that reads back as written is real
  if (!CALENDAR_DATE.test(today) || Number.isNaN(todayMs) || !new Date(todayMs).toISOString().startsWith(today)) {
    throw new RangeError(`${today} is not a calendar date (YYYY-MM-DD)`);
  }
  if (car.condition === "new") return null;
  const ageYears = Math.max(MIN_AGE_YEARS, (todayMs - Date.UTC(car.modelYear, 0, 1)) / DAY_MS / DAYS_A_YEAR);
  const kmPerYear = car.mileageKm / ageYears;
  const band = kmPerYear < bands.low ? "low" : kmPerYear <= bands.high ? "typical" : "high";
  return { band, kmPerYear: shownFigure(kmPerYear, band, bands) };
}

// car.mileage.info shows the figure beside the bands, so one that rounds onto an edge, which is
// typical, takes the edge's outer neighbour: 25,000.06 is high and shows 25,001. Bands are whole
// kilometres (VR-03).
function shownFigure(kmPerYear: number, band: MileageBand, bands: MileageBands): number {
  const rounded = Math.round(kmPerYear);
  if (band === "high") return Math.max(rounded, bands.high + 1);
  return band === "low" ? Math.min(rounded, bands.low - 1) : rounded;
}
