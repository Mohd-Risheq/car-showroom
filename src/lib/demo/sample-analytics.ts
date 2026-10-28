import { EVENT_NAMES } from "../db/enums.ts";
import type { AppLocale } from "../i18n/locales.ts";
import { keyedRandom } from "../seeded-random.ts";
import { addDays, daysBetween } from "./seed-dates.ts";
import type { SeedTier } from "./seed-tiers.ts";

// 05-SEED-DATA §8: the demo dashboard's sample analytics. The rows come from each seed car's tier,
// age and features, are never stored, and are added to the real counts only while DEMO_MODE=true
// (T-30). Each count has its own generator, keyed by the car, the event, the day and the locale
// (§8.2), so the same inputs give the same rows on every server and request (TC-30-6). Pure, and it
// imports other modules by their relative .ts paths, as the rest of lib/demo does.

type EventName = (typeof EVENT_NAMES)[number];

/** What a car has that decides which events follow its views (§8.4, §8.5) */
export type SampleFeature = "inspection" | "audio" | "spin" | "journey" | "consumption" | "showroom";

export type SampleCar = {
  /** The car the rows count under */
  readonly id: string;
  /** The key its draws are seeded with (§8.2) */
  readonly seedKey: string;
  readonly tier: SeedTier;
  /** The Amman date it was published, or none for a car never published */
  readonly publishedOn: string | null;
  /** The Amman date it was sold, or none */
  readonly soldOn: string | null;
  /** The hero or a featured car (§8.3) */
  readonly spotlight: boolean;
  /**
   * An inspection with at least 1 filled item, engine audio, a ready spin set, at least 2 located
   * milestones, consumption data, and an in_showroom milestone
   */
  readonly has: Readonly<Record<SampleFeature, boolean>>;
};

/** A row as EventDaily holds it */
export type SampleEventRow = {
  readonly day: string;
  readonly event: EventName;
  readonly carId: string;
  readonly locale: AppLocale;
  readonly count: number;
};

type LocaleCounts = ReadonlyArray<readonly [AppLocale, number]>;
type Counts = ReadonlyMap<EventName, LocaleCounts>;
type FollowingEvent = {
  readonly event: EventName;
  readonly rate: (car: SampleCar) => number;
  readonly when?: SampleFeature;
};

// EventDaily's car for an event about no car, and the key that seeds the site's draws (§8.2, §8.5)
const NO_CAR = "00000000-0000-0000-0000-000000000000";
const SITE = "site";
// How many days, today included, the sample reaches back (§8.3)
const WINDOW_DAYS = 90;
// Each locale's share of a count (§8.3)
const SHARES = [
  ["ar", 0.78],
  ["en", 0.22],
] as const satisfies ReadonlyArray<readonly [AppLocale, number]>;
const TIER_BASE: Readonly<Record<SeedTier, number>> = { A: 12, B: 7, C: 4 };
// Each day of the week's factor, Sunday first, as Date#getUTCDay counts them (§8.3)
const WEEKDAY = [1.0, 1.0, 0.95, 1.0, 1.2, 0.6, 1.1];
const SPOTLIGHT = 1.3;
const WINDOW_SCAN_MEAN = 0.25;
// Knuth's method draws once per unit of the mean, so a larger one takes the normal approximation (§8.2)
const KNUTH_MAX_MEAN = 30;
// The site's own events and their means before the day's factor (§8.5)
const SITE_EVENTS: ReadonlyArray<{ readonly event: EventName; readonly mean: number; readonly byWeekday: boolean }> = [
  { event: "page_home", mean: 60, byWeekday: true },
  { event: "page_inventory", mean: 40, byWeekday: true },
  { event: "race_run", mean: 2, byWeekday: false },
];

/** A car's rate of WhatsApp taps per view, drawn once for the car (§8.4) */
const whatsappRate = (car: SampleCar) => 0.03 + 0.02 * keyedRandom(car.seedKey)() + (car.tier === "A" ? 0.01 : 0);
const fixed = (rate: number) => () => rate;

// The events drawn from a car's views, each with its rate per view (§8.4)
const FOLLOWING_EVENTS: readonly FollowingEvent[] = [
  { event: "sig_body_scan", rate: fixed(0.3), when: "inspection" },
  { event: "sig_sound_play", rate: fixed(0.15), when: "audio" },
  { event: "sig_spin", rate: fixed(0.2), when: "spin" },
  { event: "sig_journey", rate: fixed(0.18), when: "journey" },
  { event: "sig_cost", rate: fixed(0.12), when: "consumption" },
  { event: "garage_save", rate: fixed(0.03) },
  { event: "compare_add", rate: fixed(0.02) },
  { event: "contact_whatsapp", rate: whatsappRate },
  { event: "contact_call", rate: fixed(0.015) },
  { event: "contact_viewing", rate: fixed(0.01) },
  { event: "share_family", rate: fixed(0.01) },
  { event: "share_native", rate: fixed(0.015) },
];

/** The generator for one count (§8.2) */
const generator = (seedKey: string, event: EventName, day: string, locale: AppLocale) =>
  keyedRandom(`${seedKey}|${event}|${day}|${locale}`);

/** A Poisson draw: Knuth's method up to a mean of 30, and above it a normal one, rounded (§8.2) */
function poisson(random: () => number, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > KNUTH_MAX_MEAN) {
    // Box-Muller's cosine branch
    const first = 1 - random();
    const second = random();
    const normal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal));
  }
  const limit = Math.exp(-mean);
  let count = 0;
  let product = random();
  while (product > limit) {
    count += 1;
    product *= random();
  }
  return count;
}

/** A binomial draw, as that many trials (§8.2) */
function binomial(random: () => number, trials: number, chance: number): number {
  let count = 0;
  for (let trial = 0; trial < trials; trial += 1) if (random() < chance) count += 1;
  return count;
}

/** Each locale's Poisson draw of its share of the mean */
function perLocale(seedKey: string, event: EventName, day: string, mean: number) {
  return SHARES.map(
    ([locale, share]) => [locale, poisson(generator(seedKey, event, day, locale), mean * share)] as const,
  );
}

const weekdayFactor = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? 1;

/** The factor for a car this many days after it was published (§8.3) */
function recency(age: number): number {
  if (age < 7) return 1.6;
  if (age <= 20) return 1.2;
  if (age <= 44) return 1.0;
  return 0.8;
}

/** Whether the car is public on the day: from its publish day up to the day before it sold (§8.3) */
function publicDay(car: SampleCar, day: string): car is SampleCar & { readonly publishedOn: string } {
  return car.publishedOn !== null && car.publishedOn <= day && (car.soldOn === null || day < car.soldOn);
}

/** The site's counts on the day (§8.5) */
function siteCounts(day: string): Counts {
  return new Map(
    SITE_EVENTS.map(({ event, mean, byWeekday }) => [
      event,
      perLocale(SITE, event, day, mean * (byWeekday ? weekdayFactor(day) : 1)),
    ]),
  );
}

/** The car's counts on a day it is public (§8.3 to §8.5) */
function carCounts(car: SampleCar & { readonly publishedOn: string }, day: string): Counts {
  const spotlight = car.spotlight ? SPOTLIGHT : 1;
  const mean = TIER_BASE[car.tier] * recency(daysBetween(car.publishedOn, day)) * weekdayFactor(day) * spotlight;
  const views = perLocale(car.seedKey, "car_view", day, mean);
  const counts = new Map<EventName, LocaleCounts>([["car_view", views]]);
  for (const { event, rate, when } of FOLLOWING_EVENTS) {
    if (when !== undefined && !car.has[when]) continue;
    const perView = rate(car);
    counts.set(
      event,
      views.map(([locale, viewed]) => [locale, binomial(generator(car.seedKey, event, day, locale), viewed, perView)]),
    );
  }
  if (car.has.showroom) counts.set("window_scan", perLocale(car.seedKey, "window_scan", day, WINDOW_SCAN_MEAN));
  return counts;
}

/** The counts above 0 as rows, in EVENT_NAMES' order, then by locale */
function rowsOf(carId: string, day: string, counts: Counts): SampleEventRow[] {
  return EVENT_NAMES.flatMap((event) =>
    (counts.get(event) ?? []).flatMap(([locale, count]) => (count > 0 ? [{ day, event, carId, locale, count }] : [])),
  );
}

/**
 * The sample rows for the Amman dates from `from` to `to`, cut to the 90 days that end on `today`.
 * Only counts above 0 are rows. They come by day, the site's first and then each car in the order
 * given, then by event in EVENT_NAMES' order, then by locale. A date that isn't a calendar date
 * throws a RangeError.
 */
export function sampleEvents(cars: readonly SampleCar[], from: string, to: string, today: string): SampleEventRow[] {
  // Each day as its offset from today, so the window runs from -89 to 0
  const first = Math.max(daysBetween(today, from), 1 - WINDOW_DAYS);
  const last = Math.min(daysBetween(today, to), 0);
  const rows: SampleEventRow[] = [];
  for (let offset = first; offset <= last; offset += 1) {
    const day = addDays(today, offset);
    rows.push(...rowsOf(NO_CAR, day, siteCounts(day)));
    for (const car of cars) if (publicDay(car, day)) rows.push(...rowsOf(car.id, day, carCounts(car, day)));
  }
  return rows;
}
