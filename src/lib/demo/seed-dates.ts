import { keyedRandom } from "../seeded-random.ts";
import type { SeedOffsets } from "../validation/car.ts";

// 05-SEED-DATA §9: a seed car stores ages, not dates, so the demo never ages. These turn a car's
// offsets into its dates for one day in Amman. The seed writes them, and T-35's nightly job writes
// them again each day from that day, never from the day before, so a missed or repeated run is
// harmless. Pure, and it imports other modules by their relative .ts paths, so the seed scripts
// load it under plain Node.

const DAY_MS = 24 * 60 * 60 * 1000;
// Amman keeps UTC+3 all year (SRS §17.2)
const AMMAN_UTC_OFFSET = "+03:00";
// A car's events happen from 09:00 up to 20:00 (§9.2)
const FIRST_MINUTE = 9 * 60;
const MINUTES_OPEN = 11 * 60;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A journey milestone whose month is an offset rather than fixed (§9.1) */
export type OffsetMilestone = keyof SeedOffsets["milestones"];

export type SeedPriceChange = { readonly changedAt: Date; readonly oldPriceJod: number; readonly newPriceJod: number };

/** A seed car's dates on one day, each null when the car has no such offset */
export type SeedDates = {
  readonly publishedAt: Date | null;
  readonly soldAt: Date | null;
  /** YYYY-MM-DD */
  readonly inspectedOn: string | null;
  /** The first day of its month, as the column holds it */
  readonly licenseExpiry: string | null;
  /** Each offset milestone's month, as its first day */
  readonly milestoneMonths: Readonly<Partial<Record<OffsetMilestone, string>>>;
  /** In the record's order, which is the order they happened in */
  readonly priceChanges: readonly SeedPriceChange[];
};

function dayStart(day: string): number {
  const instant = Date.parse(`${day}T00:00:00Z`);
  // The engine reads 2026-02-30 as 2 March, so only a real date comes back as written
  if (!CALENDAR_DATE.test(day) || Number.isNaN(instant) || !new Date(instant).toISOString().startsWith(day)) {
    throw new RangeError(`${JSON.stringify(day)} is not a calendar date (YYYY-MM-DD)`);
  }
  return instant;
}

/** The date this many days after the date, or before it for a negative number: 2026-10-09 */
export function addDays(day: string, days: number): string {
  return new Date(dayStart(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** How many days the second date falls after the first, negative when it falls before */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayStart(to) - dayStart(from)) / DAY_MS);
}

/** The first day of the month this many months after the date's month: 2027-03-01 */
export function monthAfter(day: string, months: number): string {
  const date = new Date(dayStart(day));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)).toISOString().slice(0, 10);
}

/** The minute of the day, 09:00 to 19:59, at which a seed car's dated events happen, the same every day (§9.2) */
export function seedTimeOfDay(seedKey: string): number {
  return FIRST_MINUTE + Math.floor(keyedRandom(`${seedKey}|time_of_day`)() * MINUTES_OPEN);
}

/** The instant at this minute of the date in Amman */
export function ammanInstant(day: string, minute: number): Date {
  if (!Number.isInteger(minute) || minute < 0 || minute >= 24 * 60)
    throw new RangeError(`Not a minute of a day: ${minute}`);
  dayStart(day);
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return new Date(`${day}T${time}:00${AMMAN_UTC_OFFSET}`);
}

/** A seed car's dates on the day `today` in Amman (§9.2) */
export function anchorSeedDates(offsets: SeedOffsets, seedKey: string, today: string): SeedDates {
  const minute = seedTimeOfDay(seedKey);
  const instant = (days: number | undefined) =>
    days === undefined ? null : ammanInstant(addDays(today, days), minute);
  const milestoneMonths = Object.fromEntries(
    Object.entries(offsets.milestones).flatMap(([type, days]) =>
      days === undefined ? [] : [[type, monthAfter(addDays(today, days), 0)]],
    ),
  );
  return {
    publishedAt: instant(offsets.published),
    soldAt: instant(offsets.sold),
    inspectedOn: offsets.inspectedOn === undefined ? null : addDays(today, offsets.inspectedOn),
    licenseExpiry: offsets.licenseExpiryMonths === undefined ? null : monthAfter(today, offsets.licenseExpiryMonths),
    milestoneMonths,
    priceChanges: offsets.priceChanges.map(({ days, from, to }) => ({
      changedAt: ammanInstant(addDays(today, days), minute),
      oldPriceJod: from,
      newPriceJod: to,
    })),
  };
}
