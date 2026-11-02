import { describe, expect, it } from "vitest";
import { EVENT_SUBJECTS, type EventName, NO_CAR } from "@/lib/analytics/events";
import { EVENT_NAMES } from "@/lib/db/enums";
import { type SampleCar, sampleEvents } from "@/lib/demo/sample-analytics";

// API-03's events and what each counts under in ENT-EventDaily: a car the site shows, or the site

// SRS §16's test clock, a Sunday in Amman
const TODAY = "2026-10-18";
const CAR: SampleCar = {
  id: "01923456-7890-7abc-8def-00000000000a",
  seedKey: "s01",
  tier: "A",
  publishedOn: "2026-07-01",
  soldOn: null,
  spotlight: true,
  has: { inspection: true, audio: true, spin: true, journey: true, consumption: true, showroom: true },
};

describe("API-03's events", () => {
  it("count an event about no car under the zero UUID (ENT-EventDaily)", () => {
    expect(NO_CAR).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("each count under a car or the site", () => {
    expect(Object.keys(EVENT_SUBJECTS).sort()).toStrictEqual([...EVENT_NAMES].sort());
  });

  it("count under the subject the demo's sample counts them under, so the dashboard adds like to like", () => {
    // The sample's 90 days, in which each of its events counts at least once
    const rows = sampleEvents([CAR], "2026-07-21", TODAY, TODAY);
    expect(new Set(rows.map((row) => row.event)).size).toBe(17);
    for (const row of rows) expect(EVENT_SUBJECTS[row.event], row.event).toBe(row.carId === NO_CAR ? "site" : "car");
  });

  it("count the dealer side and the browser's errors as site totals (the owner, 2026-10-31; NFR-OBS-02)", () => {
    const events: readonly EventName[] = [
      "demo_dealer_entered",
      "car_published",
      "share_kit_generate",
      "reel_generated",
      "client_error",
    ];
    for (const event of events) expect(EVENT_SUBJECTS[event], event).toBe("site");
  });
});
