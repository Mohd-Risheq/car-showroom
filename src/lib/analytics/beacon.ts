import { DEFAULT_LOCALE, isAppLocale } from "../i18n/locales";
import type { ClientErrorCode } from "./client-errors";
import type { BeaconEvent } from "./events";
import { routeTemplateOf } from "./routes";

// FR-47's beacon, the chunk track.ts loads. It sends each event to API-03 with sendBeacon, whose
// string body goes as text/plain, so the request needs no preflight and outlives the page. A
// signature feature and race_run send once in a page view (FR-47.6), and so do the page events,
// whose page view is theirs, should a page's effect run twice; contacts, shares and saves send each
// time (FR-25.7). A client error names its page by its route template, never its path (NFR-OBS-02),
// and sends once per code and template, at most five a document, as errors share API-03's 60 a
// minute with the contacts.

const ENDPOINT = "/api/events";
const ONCE_A_VIEW: ReadonlySet<BeaconEvent> = new Set([
  ...["page_home", "page_inventory", "car_view"],
  ...["sig_body_scan", "sig_sound_play", "sig_spin", "sig_journey", "sig_cost", "race_run"],
] as const);
const MAX_ERRORS = 5;

/** An event as track() took it: its page view and its page's path when it happened */
export type Happened = {
  readonly event: BeaconEvent;
  readonly car: string | undefined;
  readonly view: number;
  readonly path: string;
};

const sentInView = new Set<string>();
const errorsSent = new Set<string>();

/** The page's language, from its path, or the site's default on a path that names none */
function localeOf(path: string) {
  const segment = path.split("/")[1];
  return isAppLocale(segment) ? segment : DEFAULT_LOCALE;
}

function post(body: Record<string, string | undefined>): void {
  navigator.sendBeacon(ENDPOINT, JSON.stringify(body));
}

export function send({ event, car, view, path }: Happened): void {
  if (ONCE_A_VIEW.has(event)) {
    const key = `${view} ${event}`;
    if (sentInView.has(key)) return;
    sentInView.add(key);
  }
  post({ e: event, c: car, l: localeOf(path) });
}

export function sendError(code: ClientErrorCode, path: string): void {
  const route = routeTemplateOf(path);
  const key = `${code} ${route}`;
  if (errorsSent.has(key) || errorsSent.size >= MAX_ERRORS) return;
  errorsSent.add(key);
  post({ e: "client_error", l: localeOf(path), r: route, x: code });
}
