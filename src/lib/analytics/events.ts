import type { EVENT_NAMES } from "../db/enums.ts";

// API-03's events (FR-47) and what ENT-EventDaily counts each under: a car the site shows, whose id
// the event carries, or the site, under the zero UUID. Contacts, shares and the buyer tools are on
// the car page, as the demo's sample counts them (05-SEED-DATA §8); the dealer side counts as site
// totals (the owner, 2026-10-31). Pure, and imported by its relative .ts path, as lib/demo is.

export type EventName = (typeof EVENT_NAMES)[number];

/** ENT-EventDaily's car for an event about no car */
export const NO_CAR = "00000000-0000-0000-0000-000000000000";

export const EVENT_SUBJECTS = {
  page_home: "site",
  page_inventory: "site",
  car_view: "car",
  sig_body_scan: "car",
  sig_sound_play: "car",
  sig_spin: "car",
  sig_journey: "car",
  sig_cost: "car",
  race_run: "site",
  contact_whatsapp: "car",
  contact_call: "car",
  contact_viewing: "car",
  share_family: "car",
  share_native: "car",
  window_scan: "car",
  garage_save: "car",
  compare_add: "car",
  demo_dealer_entered: "site",
  car_published: "site",
  share_kit_generate: "site",
  reel_generated: "site",
  client_error: "site",
} as const satisfies Record<EventName, "car" | "site">;

type Subject<S> = { [E in EventName]: (typeof EVENT_SUBJECTS)[E] extends S ? E : never }[EventName];

export type CarEvent = Subject<"car">;
export type SiteEvent = Subject<"site">;

/**
 * The events only the server counts: a window card's scan (API-29) and a visit to the demo (API-04).
 * API-03 drops them, as it drops an event not on its list, so a request made by hand can't count
 * either twice (the owner, 2026-11-01).
 */
export const SERVER_COUNTED = ["window_scan", "demo_dealer_entered"] as const satisfies readonly EventName[];

/** The events API-03 counts */
export type IngestedEvent = Exclude<EventName, (typeof SERVER_COUNTED)[number]>;

const serverCounted: ReadonlySet<EventName> = new Set(SERVER_COUNTED);

/** Whether API-03 counts the event: any but those the server counts itself */
export const isIngested = (event: EventName): event is IngestedEvent => !serverCounted.has(event);

/** The events the browser sends: API-03's, but client_error, which has its own call */
export type BeaconEvent = Exclude<IngestedEvent, "client_error">;
