import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_CODES } from "@/lib/analytics/client-errors";
import { EVENT_SUBJECTS } from "@/lib/analytics/events";
import { EVENT_NAMES } from "@/lib/db/enums";
import { eventSchema } from "@/lib/validation/event";

// API-03's body (FR-47.1): an event from the fixed list and its locale, a car event's car, and a
// client_error's route template and code; anything else drops the event, the events only the server
// counts among them (the owner, 2026-11-01)

const CAR = "01923456-7890-7abc-8def-00000000000a";
const CODE_32 = "CHUNK_GSAP_".padEnd(32, "X");

const parsed = (body: unknown) => eventSchema.safeParse(body);

/** The events API-29 and API-04 count on the server */
const SERVER_ONLY: ReadonlySet<string> = new Set(["window_scan", "demo_dealer_entered"]);

describe("eventSchema", () => {
  it.each(EVENT_NAMES.filter((event) => EVENT_SUBJECTS[event] === "car" && !SERVER_ONLY.has(event)))(
    "takes %s with its car",
    (e) => {
      expect(parsed({ e, c: CAR, l: "ar" }).data).toStrictEqual({ e, c: CAR, l: "ar" });
    },
  );

  it.each(
    EVENT_NAMES.filter(
      (event) => EVENT_SUBJECTS[event] === "site" && event !== "client_error" && !SERVER_ONLY.has(event),
    ),
  )("takes %s with no car", (e) => {
    expect(parsed({ e, l: "en" }).data).toStrictEqual({ e, l: "en" });
  });

  it("takes a client_error with its route template and a code of up to 32 capitals, digits and underscores", () => {
    const body = { e: "client_error", l: "ar", r: "/[locale]/cars/[slug]", x: CODE_32 };
    expect(parsed(body).data).toStrictEqual(body);
    expect(parsed({ ...body, x: "A" }).success).toBe(true);
  });

  it.each(CLIENT_ERROR_CODES)("takes the code the browser reports as %s", (x) => {
    expect(parsed({ e: "client_error", l: "en", r: "/[locale]", x }).success).toBe(true);
  });

  it("writes a car's id in lower case, as Postgres does, so one car can't count as two", () => {
    expect(parsed({ e: "car_view", c: CAR.toUpperCase(), l: "ar" }).data).toStrictEqual({
      e: "car_view",
      c: CAR,
      l: "ar",
    });
  });

  it.each([
    ["an event not on the list", { e: "page_admin", l: "ar" }],
    ["a window card's scan, which API-29 counts on the server", { e: "window_scan", c: CAR, l: "ar" }],
    ["a visit to the demo, which API-04 counts on the server", { e: "demo_dealer_entered", l: "en" }],
    ["an event's name in another case", { e: "CAR_VIEW", c: CAR, l: "ar" }],
    ["a car event with no car", { e: "contact_whatsapp", l: "ar" }],
    ["a car that isn't a UUID", { e: "contact_whatsapp", c: "s02", l: "ar" }],
    ["a site event with a car", { e: "page_home", c: CAR, l: "ar" }],
    ["no locale", { e: "page_home" }],
    ["a locale the site doesn't have", { e: "page_home", l: "fr" }],
    ["a key it doesn't take", { e: "page_home", l: "ar", ref: "instagram" }],
    ["a route on another event", { e: "page_home", l: "ar", r: "/[locale]" }],
    ["a code on another event", { e: "car_view", c: CAR, l: "ar", x: "SEGMENT" }],
    ["a client_error with no route", { e: "client_error", l: "ar", x: "SEGMENT" }],
    ["a client_error with no code", { e: "client_error", l: "ar", r: "/[locale]" }],
    ["a client_error with a car", { e: "client_error", c: CAR, l: "ar", r: "/[locale]", x: "SEGMENT" }],
    ["a route not on the list", { e: "client_error", l: "ar", r: "/en/cars/2021-toyota", x: "SEGMENT" }],
    ["a code in lower case", { e: "client_error", l: "ar", r: "/[locale]", x: "segment" }],
    ["a code of 33 characters", { e: "client_error", l: "ar", r: "/[locale]", x: `${CODE_32}X` }],
    ["an empty code", { e: "client_error", l: "ar", r: "/[locale]", x: "" }],
    ["a code with a space", { e: "client_error", l: "ar", r: "/[locale]", x: "CHUNK GSAP" }],
    ["a list", [{ e: "page_home", l: "ar" }]],
    ["text", "page_home"],
    ["null", null],
  ])("drops %s", (_, body) => {
    expect(parsed(body).success).toBe(false);
  });
});
