import { describe, expect, it } from "vitest";
import { EVENT_NAMES } from "@/lib/db/enums";
import { type SampleCar, type SampleEventRow, type SampleFeature, sampleEvents } from "@/lib/demo/sample-analytics";
import { addDays, daysBetween } from "@/lib/demo/seed-dates";
import { SEED_TIERS, type SeedTier } from "@/lib/demo/seed-tiers";
import { LOCALES } from "@/lib/i18n/locales";
import { keyedRandom } from "@/lib/seeded-random";
import { ROOT } from "../../../scripts/checks/files.ts";
import { readSeedFiles, type SeedFiles } from "../../../scripts/checks/seed-files.ts";

// 05-SEED-DATA §8: the demo dashboard's sample analytics, the same rows for the same inputs

// ENT-EventDaily's car for an event about no car
const SITE = "00000000-0000-0000-0000-000000000000";
// SRS §16's test clock, a Sunday in Amman
const TODAY = "2026-10-18";
const EVERY_FEATURE: SampleCar["has"] = {
  inspection: true,
  audio: true,
  spin: true,
  journey: true,
  consumption: true,
  showroom: true,
};
// The event each feature allows (§8.4, §8.5)
const FEATURE_EVENTS = [
  ["inspection", "sig_body_scan"],
  ["audio", "sig_sound_play"],
  ["spin", "sig_spin"],
  ["journey", "sig_journey"],
  ["consumption", "sig_cost"],
  ["showroom", "window_scan"],
] as const satisfies ReadonlyArray<readonly [SampleFeature, string]>;
const SITE_EVENTS: readonly string[] = ["page_home", "page_inventory", "race_run"];
const NEVER_SAMPLED = ["demo_dealer_entered", "car_published", "share_kit_generate", "reel_generated", "client_error"];

/** A Tier B car with every feature, published long before the days read, unless changed */
const sampleCar = (id: string, changes: Partial<SampleCar> = {}): SampleCar => ({
  id,
  seedKey: id,
  tier: "B",
  publishedOn: "2026-01-01",
  soldOn: null,
  spotlight: false,
  has: EVERY_FEATURE,
  ...changes,
});

/** A row as one line: its day, the site or its car, its event and locale, and its count */
const line = ({ day, carId, event, locale, count }: SampleEventRow) =>
  `${day} ${carId === SITE ? "site" : carId} ${event} ${locale} ${count}`;
const daysOf = (rows: readonly SampleEventRow[]) => Array.from(new Set(rows.map(({ day }) => day)));
const eventsOf = (rows: readonly SampleEventRow[]) => new Set(rows.map(({ event }) => event));
const rowsOfCar = (rows: readonly SampleEventRow[], carId: string) => rows.filter((row) => row.carId === carId);

/** Each car's and the site's count of each event, summed over the rows' days */
function totalsOf(rows: readonly SampleEventRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const { carId, event, count } of rows) {
    const key = `${carId === SITE ? "site" : carId} ${event}`;
    totals[key] = (totals[key] ?? 0) + count;
  }
  return totals;
}

describe("sampleEvents", () => {
  it("gives a Tier A car and the site the rows an independent reading of §8 gives, over three days", () => {
    // Worked out from §8's text by a separate implementation with its own copy of the generator.
    // Thursday to Saturday, with the car 5 to 7 days old, so the weekday and recency factors change,
    // and the site's Arabic page counts are above 30, so drawn by the normal approximation, except
    // on Friday.
    const car = sampleCar("car-1", { seedKey: "s01", tier: "A", publishedOn: "2026-10-10", spotlight: true });
    expect(sampleEvents([car], "2026-10-15", "2026-10-17", TODAY).map(line)).toStrictEqual([
      "2026-10-15 site page_home ar 52",
      "2026-10-15 site page_home en 21",
      "2026-10-15 site page_inventory ar 41",
      "2026-10-15 site page_inventory en 14",
      "2026-10-15 site race_run ar 2",
      "2026-10-15 car-1 car_view ar 28",
      "2026-10-15 car-1 car_view en 9",
      "2026-10-15 car-1 sig_body_scan ar 10",
      "2026-10-15 car-1 sig_body_scan en 3",
      "2026-10-15 car-1 sig_sound_play ar 7",
      "2026-10-15 car-1 sig_spin ar 4",
      "2026-10-15 car-1 sig_spin en 1",
      "2026-10-15 car-1 sig_journey ar 4",
      "2026-10-15 car-1 sig_journey en 1",
      "2026-10-15 car-1 sig_cost ar 1",
      "2026-10-15 car-1 sig_cost en 3",
      "2026-10-15 car-1 contact_whatsapp ar 1",
      "2026-10-15 car-1 share_native ar 2",
      "2026-10-15 car-1 window_scan ar 1",
      "2026-10-15 car-1 garage_save ar 1",
      "2026-10-15 car-1 garage_save en 2",
      "2026-10-15 car-1 compare_add ar 1",
      "2026-10-16 site page_home ar 35",
      "2026-10-16 site page_home en 8",
      "2026-10-16 site page_inventory ar 25",
      "2026-10-16 site page_inventory en 7",
      "2026-10-16 site race_run ar 1",
      "2026-10-16 site race_run en 1",
      "2026-10-16 car-1 car_view ar 9",
      "2026-10-16 car-1 car_view en 2",
      "2026-10-16 car-1 sig_body_scan ar 1",
      "2026-10-16 car-1 sig_spin ar 4",
      "2026-10-16 car-1 sig_spin en 1",
      "2026-10-16 car-1 sig_journey ar 3",
      "2026-10-16 car-1 sig_journey en 1",
      "2026-10-16 car-1 sig_cost ar 3",
      "2026-10-16 car-1 contact_call ar 1",
      "2026-10-17 site page_home ar 57",
      "2026-10-17 site page_home en 18",
      "2026-10-17 site page_inventory ar 39",
      "2026-10-17 site page_inventory en 10",
      "2026-10-17 site race_run ar 2",
      "2026-10-17 car-1 car_view ar 14",
      "2026-10-17 car-1 car_view en 8",
      "2026-10-17 car-1 sig_body_scan ar 3",
      "2026-10-17 car-1 sig_body_scan en 1",
      "2026-10-17 car-1 sig_sound_play ar 4",
      "2026-10-17 car-1 sig_spin ar 3",
      "2026-10-17 car-1 sig_spin en 1",
      "2026-10-17 car-1 sig_journey ar 2",
      "2026-10-17 car-1 sig_journey en 2",
      "2026-10-17 car-1 sig_cost en 2",
      "2026-10-17 car-1 contact_whatsapp ar 1",
    ]);
  });

  it("gives a Tier A car and the site the same reading's totals over the 90 days", () => {
    // The car is published on the window's first day, so its days cross every recency band, and it
    // has views enough that a change to any rate shows in a total
    const car = sampleCar("car-1", { seedKey: "s01", tier: "A", publishedOn: addDays(TODAY, -89), spotlight: true });
    expect(totalsOf(sampleEvents([car], "2026-01-01", TODAY, TODAY))).toStrictEqual({
      "site page_home": 5351,
      "site page_inventory": 3619,
      "site race_run": 169,
      "car-1 car_view": 1359,
      "car-1 sig_body_scan": 405,
      "car-1 sig_sound_play": 192,
      "car-1 sig_spin": 280,
      "car-1 sig_journey": 231,
      "car-1 sig_cost": 167,
      "car-1 contact_whatsapp": 58,
      "car-1 contact_call": 22,
      "car-1 contact_viewing": 16,
      "car-1 share_family": 19,
      "car-1 share_native": 15,
      "car-1 window_scan": 14,
      "car-1 garage_save": 37,
      "car-1 compare_add": 22,
    });
  });

  it("gives a Tier B and a Tier C car, neither spotlit, the same reading's views and WhatsApp taps over the 90 days", () => {
    // Their totals hold the Tier B and C bases (§8.3) and the WhatsApp rate's bonus for Tier A alone
    // (§8.4), which the Tier A car's can't tell apart
    const cars = [
      sampleCar("car-b", { seedKey: "s03", tier: "B", publishedOn: addDays(TODAY, -89) }),
      sampleCar("car-c", { seedKey: "s06", tier: "C", publishedOn: addDays(TODAY, -89) }),
    ];
    const rows = sampleEvents(cars, "2026-01-01", TODAY, TODAY);
    const read = rows.filter(({ event }) => event === "car_view" || event === "contact_whatsapp");
    expect(totalsOf(read)).toStrictEqual({
      "car-b car_view": 627,
      "car-b contact_whatsapp": 26,
      "car-c car_view": 368,
      "car-c contact_whatsapp": 13,
    });
  });

  it("gives the same rows for the same inputs, and a later today adds its own day and changes none before it", () => {
    const cars = [sampleCar("car-a", { tier: "A", spotlight: true }), sampleCar("car-b", { tier: "C" })];
    const rows = sampleEvents(cars, "2026-10-01", "2026-10-31", TODAY);
    expect(sampleEvents(cars, "2026-10-01", "2026-10-31", TODAY)).toStrictEqual(rows);
    const tomorrow = addDays(TODAY, 1);
    const later = sampleEvents(cars, "2026-10-01", "2026-10-31", tomorrow);
    expect(later.filter(({ day }) => day <= TODAY)).toStrictEqual(rows);
    expect(daysOf(later).at(-1)).toBe(tomorrow);
  });

  it("draws by the seed key, so another id moves a car's rows and another key draws others", () => {
    const rows = sampleEvents([sampleCar("car-a", { seedKey: "s01" })], "2026-10-12", TODAY, TODAY);
    const moved = sampleEvents([sampleCar("car-b", { seedKey: "s01" })], "2026-10-12", TODAY, TODAY);
    expect(moved).toStrictEqual(rows.map((row) => (row.carId === SITE ? row : { ...row, carId: "car-b" })));
    const redrawn = sampleEvents([sampleCar("car-a", { seedKey: "s02" })], "2026-10-12", TODAY, TODAY);
    expect(rowsOfCar(redrawn, "car-a")).not.toStrictEqual(rowsOfCar(rows, "car-a"));
  });

  it("reaches back 90 days, today among them, and no further either way", () => {
    const days = daysOf(sampleEvents([], "2026-01-01", "2026-12-31", TODAY));
    expect(days).toHaveLength(90);
    expect(days[0]).toBe(addDays(TODAY, -89));
    expect(days.at(-1)).toBe(TODAY);
    expect(sampleEvents([], addDays(TODAY, 1), "2026-12-31", TODAY)).toStrictEqual([]);
    expect(sampleEvents([], "2026-01-01", addDays(TODAY, -90), TODAY)).toStrictEqual([]);
    expect(sampleEvents([], TODAY, addDays(TODAY, -1), TODAY)).toStrictEqual([]);
  });

  it("counts a car from its publish day up to the day before it sold, and never one not published", () => {
    const sold = sampleCar("car-sold", { tier: "A", spotlight: true, publishedOn: "2026-10-10", soldOn: "2026-10-14" });
    const draft = sampleCar("car-draft", { publishedOn: null });
    const rows = sampleEvents([sold, draft], "2026-10-01", TODAY, TODAY);
    expect(daysOf(rowsOfCar(rows, "car-sold"))).toStrictEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
    expect(rowsOfCar(rows, "car-draft")).toStrictEqual([]);
  });

  it.each(FEATURE_EVENTS)("leaves out %s's event, %s, for a car without it, and no other", (feature, event) => {
    const has = { ...EVERY_FEATURE, [feature]: false };
    const seen = eventsOf(sampleEvents([sampleCar("car-a", { has })], "2026-08-01", TODAY, TODAY));
    const featureEvents = FEATURE_EVENTS.map(([, allowed]) => allowed);
    expect(featureEvents.filter((allowed) => seen.has(allowed))).toStrictEqual(
      featureEvents.filter((allowed) => allowed !== event),
    );
  });

  it("samples every event §8 names, and none of the five it never samples", () => {
    const cars = [sampleCar("car-a", { tier: "A" }), sampleCar("car-b"), sampleCar("car-c", { tier: "C" })];
    const seen = eventsOf(sampleEvents(cars, "2026-01-01", TODAY, TODAY));
    expect(EVENT_NAMES.filter((event) => !seen.has(event))).toStrictEqual(NEVER_SAMPLED);
  });

  it("gives the site's events to the zero UUID and every other event to its car", () => {
    const rows = sampleEvents([sampleCar("car-a")], "2026-10-01", TODAY, TODAY);
    const site = rowsOfCar(rows, SITE);
    const ofCar = rowsOfCar(rows, "car-a");
    expect(site.length + ofCar.length).toBe(rows.length);
    expect(EVENT_NAMES.filter((event) => eventsOf(site).has(event))).toStrictEqual(SITE_EVENTS);
    expect(ofCar.filter(({ event }) => SITE_EVENTS.includes(event))).toStrictEqual([]);
  });

  it("lists whole counts above 0, by day, then the site and each car in order, then by event and locale", () => {
    // Given out of alphabetical order, so the order kept is the one given
    const cars = [sampleCar("car-b", { tier: "C" }), sampleCar("car-a", { tier: "A" })];
    const rows = sampleEvents(cars, "2026-10-01", TODAY, TODAY);
    const owners = [SITE, "car-b", "car-a"];
    const rank = (index: number) => String(index).padStart(2, "0");
    const keys = rows.map(
      ({ day, carId, event, locale }) =>
        `${day} ${rank(owners.indexOf(carId))} ${rank(EVENT_NAMES.indexOf(event))} ${LOCALES.indexOf(locale)}`,
    );
    expect(keys).toStrictEqual(keys.toSorted());
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.filter(({ count }) => !Number.isInteger(count) || count < 1)).toStrictEqual([]);
  });

  it("refuses a date that isn't a calendar date", () => {
    expect(() => sampleEvents([], "2026-02-30", TODAY, TODAY)).toThrow(RangeError);
    expect(() => sampleEvents([], "2026-10-01", "2026-10-32", TODAY)).toThrow(RangeError);
    expect(() => sampleEvents([], "2026-10-01", TODAY, "18-10-2026")).toThrow(RangeError);
  });
});

// §8.6's check after building, over the committed seed's cars. §8.3's factors and §8.4's WhatsApp
// rate are read again from the text here, for the counts each week should give on average.

const TIER_BASE: Readonly<Record<SeedTier, number>> = { A: 12, B: 7, C: 4 };
// Sunday first, as getUTCDay counts the days
const WEEKDAY = [1.0, 1.0, 0.95, 1.0, 1.2, 0.6, 1.1];
const SPOTLIGHT = 1.3;
const NO_FEATURE: SampleCar["has"] = {
  inspection: false,
  audio: false,
  spin: false,
  journey: false,
  consumption: false,
  showroom: false,
};

const recency = (age: number) => (age < 7 ? 1.6 : age <= 20 ? 1.2 : age <= 44 ? 1.0 : 0.8);
const weekday = (day: string) => WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? Number.NaN;
/** A car's WhatsApp taps per view: its own draw from 0.03 to 0.05, keyed by its seed key, and 0.01 more for Tier A */
const whatsappRate = ({ seedKey, tier }: SampleCar) => 0.03 + 0.02 * keyedRandom(seedKey)() + (tier === "A" ? 0.01 : 0);

function committedSeed(): SeedFiles {
  const read = readSeedFiles(ROOT, new Date(`${TODAY}T12:00:00+03:00`));
  if ("problems" in read) throw new Error(read.problems.join("\n"));
  return read.files;
}

/**
 * The seed's cars as the sample counts them on `today`, their days counted from it as the daily
 * re-seed keeps them (§4.1). Features decide only the signals, not the views or the WhatsApp taps
 * (§8.4), so none is set.
 */
function seedCars({ cars, settings }: SeedFiles, today: string): SampleCar[] {
  const spotlit = new Set([settings.showcase.heroCar, ...settings.showcase.featuredCars]);
  return cars.map(({ seedKey, seedOffsets: { published, sold } }) => {
    const tier = SEED_TIERS[seedKey];
    if (tier === undefined) throw new Error(`${seedKey} has no tier`);
    return {
      id: seedKey,
      seedKey,
      tier,
      publishedOn: published === undefined ? null : addDays(today, published),
      soldOn: sold === undefined ? null : addDays(today, sold),
      spotlight: spotlit.has(seedKey),
      has: NO_FEATURE,
    };
  });
}

/** The event's count over the 7 days that end on `today` */
const weekCount = (files: SeedFiles, today: string, event: SampleEventRow["event"]) =>
  sampleEvents(seedCars(files, today), addDays(today, -6), today, today).reduce(
    (total, row) => (row.event === event ? total + row.count : total),
    0,
  );

/** The WhatsApp taps the 7 days that end on `today` give on average, from the factors */
function expectedWeekTaps(files: SeedFiles, today: string): number {
  let taps = 0;
  for (const car of seedCars(files, today)) {
    for (let offset = -6; offset <= 0; offset += 1) {
      const day = addDays(today, offset);
      const { publishedOn, soldOn } = car;
      if (publishedOn === null || day < publishedOn || (soldOn !== null && day >= soldOn)) continue;
      const views =
        TIER_BASE[car.tier] * recency(daysBetween(publishedOn, day)) * weekday(day) * (car.spotlight ? SPOTLIGHT : 1);
      taps += views * whatsappRate(car);
    }
  }
  return taps;
}

const mean = (values: readonly number[]) => values.reduce((total, value) => total + value, 0) / values.length;

describe("sampleEvents over the seed's cars (05-SEED-DATA §8.6)", () => {
  const files = committedSeed();

  it("gives about 230 car views a day over the week to the clock", () => {
    expect(Math.abs(weekCount(files, TODAY, "car_view") / 7 - 230) / 230).toBeLessThanOrEqual(0.1);
  });

  it("gives 60 to 85 WhatsApp taps over the week to the clock", () => {
    const taps = weekCount(files, TODAY, "contact_whatsapp");
    expect(taps).toBeGreaterThanOrEqual(60);
    expect(taps).toBeLessThanOrEqual(85);
  });

  it("keeps a year of weeks' WhatsApp taps within 6% of what the factors give, itself 60 to 85 a week", () => {
    // The range holds on average, not every week (§8.6), so the mean over 364 consecutive days is
    // held to the factors' expected value, 6% being about 3.7 of its standard deviations
    const todays = Array.from({ length: 364 }, (_, index) => addDays(TODAY, index));
    const expected = mean(todays.map((today) => expectedWeekTaps(files, today)));
    const drawn = mean(todays.map((today) => weekCount(files, today, "contact_whatsapp")));
    expect(Math.abs(drawn - expected) / expected).toBeLessThanOrEqual(0.06);
    expect(expected).toBeGreaterThanOrEqual(60);
    expect(expected).toBeLessThanOrEqual(85);
  });
});
