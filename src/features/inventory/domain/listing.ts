import type { CarStatus } from "@/lib/db/enums";
import type { PublicStatus } from "@/lib/db/public-dto";

// The time rules of the public inventory. The cached functions compute them when they build the
// index and the car page (SRS §11.4), and the nightly job expires those entries, so a rule that
// passes a boundary overnight shows by morning. Days are elapsed 24-hour periods, as the
// fixed-clock cases of BR-12 count them (TC-18-4, TC-35-7).

const DAY_MS = 86_400_000;
const PRICE_NOTE_DAYS = 30;
const PRICE_BADGE_DAYS = 14;
const NEW_DAYS = 7;

const ageMs = (since: Date, now: Date) => now.getTime() - since.getTime();

/** BR-04: a sale before this instant has ended its car's window; SQL reads it as `sold_at > cutoff` */
export function soldCutoff(now: Date, soldVisibleDays: number): Date {
  return new Date(now.getTime() - soldVisibleDays * DAY_MS);
}

type Listed = { readonly status: CarStatus; readonly soldAt: Date | null };

/** BR-04, FR-09.1: published and reserved cars are public, and a sold car until its window ends */
export function isPublic<T extends Listed>(car: T, cutoff: Date): car is T & { readonly status: PublicStatus } {
  if (car.status === "published" || car.status === "reserved") return true;
  return car.status === "sold" && car.soldAt !== null && car.soldAt > cutoff;
}

export type PriceChange = { readonly oldPriceJod: number; readonly newPriceJod: number; readonly changedAt: Date };
/** "Price reduced from {fromJod} on {on}" on the car page; `badge` is the cards' "Price dropped" */
export type PriceDrop = { readonly fromJod: number; readonly on: Date; readonly badge: boolean };

/** BR-05: what the car's latest price change shows, if it was a drop in the last 30 days */
export function priceDrop(latest: PriceChange | null, now: Date): PriceDrop | null {
  if (latest === null || latest.newPriceJod >= latest.oldPriceJod) return null;
  const age = ageMs(latest.changedAt, now);
  if (age > PRICE_NOTE_DAYS * DAY_MS) return null;
  return { fromJod: latest.oldPriceJod, on: latest.changedAt, badge: age < PRICE_BADGE_DAYS * DAY_MS };
}

/** FR-06.7: the New badge, for a car published in the last 7 days */
export function isNewArrival(publishedAt: Date | null, now: Date): boolean {
  return publishedAt !== null && ageMs(publishedAt, now) <= NEW_DAYS * DAY_MS;
}
