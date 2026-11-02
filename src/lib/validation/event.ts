import { type CarEvent, EVENT_SUBJECTS, type IngestedEvent, isIngested, type SiteEvent } from "../analytics/events.ts";
import { ROUTE_TEMPLATES } from "../analytics/routes.ts";
import { EVENT_NAMES } from "../db/enums.ts";
import { LOCALES } from "../i18n/locales.ts";
import { recordId } from "./fields.ts";
import { z } from "./zod.ts";

// API-03's body (FR-47.1): an event from the fixed list but those the server counts itself, the
// page's locale, and for a car event the car's id. A client_error also names its page's route
// template and an error code, which go to the server's log alone (NFR-OBS-02). Anything else drops
// the event, an extra key among them.

const ERROR_CODE = /^[A-Z0-9_]{1,32}$/;

const ingested = EVENT_NAMES.filter(isIngested);
const carEvents = ingested.filter(
  (event): event is Extract<IngestedEvent, CarEvent> => EVENT_SUBJECTS[event] === "car",
);
const siteEvents = ingested.filter(
  (event): event is Exclude<Extract<IngestedEvent, SiteEvent>, "client_error"> =>
    EVENT_SUBJECTS[event] === "site" && event !== "client_error",
);
const locale = z.enum(LOCALES);

export const eventSchema = z.discriminatedUnion("e", [
  z.strictObject({ e: z.enum(carEvents), c: recordId(), l: locale }),
  z.strictObject({ e: z.enum(siteEvents), l: locale }),
  z.strictObject({
    e: z.literal("client_error"),
    l: locale,
    r: z.enum(ROUTE_TEMPLATES),
    x: z.string().regex(ERROR_CODE),
  }),
]);

export type IngestEvent = z.output<typeof eventSchema>;
