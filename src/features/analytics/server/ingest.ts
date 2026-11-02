import "server-only";
import { after } from "next/server";
import { getPublicCarIds } from "@/features/inventory/server/inventory-index";
import { getDealerId } from "@/features/settings/server/dealer-id";
import { isBot } from "@/lib/analytics/bots";
import { NO_CAR } from "@/lib/analytics/events";
import { countEvent } from "@/lib/analytics/store";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { db } from "@/lib/db/client";
import { ammanDate } from "@/lib/format/calendar";
import { mediaTypeOf, parseJson, readCapped } from "@/lib/http/body";
import { log } from "@/lib/log/logger";
import { requestIdFrom } from "@/lib/log/request-id";
import { clientNetwork } from "@/lib/rate-limit/client-network";
import { rateLimitKey, rateLimitSecret } from "@/lib/rate-limit/key";
import { MemoryLimiter } from "@/lib/rate-limit/memory";
import { ROUTE_LIMITS } from "@/lib/rate-limit/routes";
import { consume } from "@/lib/rate-limit/store";
import { eventSchema, type IngestEvent } from "@/lib/validation/event";

// API-03 (FR-47, BR-35): always 204, with no cookie, and no address, user agent or body kept. An
// event from the site's own page (SEC-14), sent by a browser (FR-47.4) whose visitor hasn't turned
// Global Privacy Control on (FR-47.3), with a body of at most 1 KB the schema takes, is counted
// after the response (SRS §11.5 rule 11); anything else is dropped at once. The count waits on its
// network's limit, first in this instance's memory and then in the database, which holds every
// instance's (SRS §8.3), and a car event on its car being one the site shows (the owner,
// 2026-10-31). A drop is logged at DEBUG by its reason alone, and a failure at ERROR by the error's
// name alone, as its message may hold the values it failed on. Each line also gives how long the
// request had taken (NFR-OBS-01).

const MAX_EVENT_BYTES = 1024;
const ROUTE = "/api/events";
// sendBeacon sends a string as text/plain, which a page can send to another site without asking
const MEDIA_TYPES = new Set(["application/json", "text/plain"]);
const LIMIT = ROUTE_LIMITS["API-03"];

type DropReason =
  | "cross_origin"
  | "gpc"
  | "bot"
  | "media_type"
  | "unreadable"
  | "too_large"
  | "invalid"
  | "unknown_car"
  | "rate_limited";

export type EventsHandlerOptions = {
  readonly now?: () => Date;
  /** Runs work once the response is sent: after() of next/server, or a test's own */
  readonly schedule?: (task: () => Promise<void>) => void;
};

/** The event a request carries, or why it's dropped before anything is counted */
async function readEvent(request: Request): Promise<IngestEvent | DropReason> {
  const { headers } = request;
  if (!isSameOrigin(headers)) return "cross_origin";
  if (headers.get("sec-gpc") === "1") return "gpc";
  if (isBot(headers.get("user-agent"))) return "bot";
  if (!MEDIA_TYPES.has(mediaTypeOf(headers))) return "media_type";
  let body: Uint8Array | "too_large";
  try {
    body = await readCapped(request.body, MAX_EVENT_BYTES);
  } catch {
    // The upload broke off, as when a browser drops it part way: still a 204 (FR-47, error states)
    return "unreadable";
  }
  if (body === "too_large") return "too_large";
  const parsed = eventSchema.safeParse(parseJson(new TextDecoder().decode(body)));
  return parsed.success ? parsed.data : "invalid";
}

type Arrival = {
  readonly event: IngestEvent;
  readonly network: string;
  readonly at: Date;
  readonly requestId: string;
  /** performance.now() when the request arrived */
  readonly started: number;
};

/**
 * Counts an event the request's checks took, or gives why it's dropped. The limit in memory comes
 * first, so a flood costs neither the car list nor the database.
 */
async function tally(
  limiter: MemoryLimiter,
  { event, network, at, requestId, started }: Arrival,
): Promise<DropReason | undefined> {
  const key = rateLimitKey(rateLimitSecret(), { scope: "network", route: "API-03", subject: network }, at);
  if (!limiter.consume(key, at).allowed) return "rate_limited";
  if ("c" in event && !(await getPublicCarIds(await getDealerId())).has(event.c)) return "unknown_car";
  if (!(await consume(db, key, LIMIT, at)).allowed) return "rate_limited";
  // NFR-OBS-02: the page by its route template, and the code
  if (event.e === "client_error") {
    log("warn", "client_error", {
      requestId,
      route: ROUTE,
      durationMs: Math.round(performance.now() - started),
      page: event.r,
      clientCode: event.x,
    });
  }
  const carId = "c" in event ? event.c : NO_CAR;
  await countEvent(db, { day: ammanDate(at), event: event.e, carId, locale: event.l });
  return undefined;
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** POST /api/events. The route makes one handler, so its limiter holds the instance's windows. */
export function createEventsHandler({ now = () => new Date(), schedule = after }: EventsHandlerOptions = {}): (
  request: Request,
) => Promise<Response> {
  const limiter = new MemoryLimiter(LIMIT);

  return async function POST(request) {
    const started = performance.now();
    const at = now();
    const requestId = requestIdFrom(request.headers);
    const drop = (reason: DropReason) =>
      log("debug", "event_dropped", {
        requestId,
        route: ROUTE,
        durationMs: Math.round(performance.now() - started),
        reason,
      });
    const event = await readEvent(request);
    if (typeof event === "string") {
      drop(event);
      return noContent();
    }
    const network = clientNetwork(request);
    schedule(async () => {
      try {
        const reason = await tally(limiter, { event, network, at, requestId, started });
        if (reason !== undefined) drop(reason);
      } catch (error) {
        log("error", "event_ingest_failed", {
          requestId,
          route: ROUTE,
          durationMs: Math.round(performance.now() - started),
          error: error instanceof Error ? error.name : "unknown",
        });
      }
    });
    return noContent();
  };
}
