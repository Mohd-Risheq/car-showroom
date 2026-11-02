import type * as Beacon from "./beacon";
import type { ClientErrorCode } from "./client-errors";
import type { BeaconEvent, CarEvent } from "./events";

// FR-47's client, the part a page loads with its first scripts, which imports nothing but types.
// What sends the events, beacon.ts, is a chunk of its own, which the first event loads, so a page
// that sends none never fetches it. A visitor with Global Privacy Control on sends nothing, and the
// chunk never loads (FR-47.3), nor does it in a browser with beacons turned off, whose events are
// lost as offline ones are. An event takes its page view and its page's path as it happens, so it
// counts where it happened, however late the chunk comes. A failed load, as offline, loses the event
// (FR-47's edge cases), and the next one asks for the chunk again. An error counts once, under the
// code of the place that reports it first, which a place that reports its own does before it throws
// or calls reportError. An error event nothing caught counts as UNCAUGHT when a script on the site's
// origin threw it, an inline script on the page included, whoever put it there: a browser mutes
// another origin's errors, and an extension's script file names the extension's address. A promise
// rejection nothing handled isn't counted (D-048).

type CarBeaconEvent = Extract<BeaconEvent, CarEvent>;
type SiteBeaconEvent = Exclude<BeaconEvent, CarEvent>;

/** The page view now: the first is 0, and each navigation to a new pathname starts the next */
let view = 0;
let viewPath: string | undefined;
const reported = new WeakSet<object>();

/** FR-47.3: the visitor has asked sites not to sell or share their data */
const optedOut = () => navigator.globalPrivacyControl === true;

/** A browser with beacons turned off, as Firefox's setting can, has no sendBeacon */
const sendsNoBeacons = () => typeof navigator.sendBeacon !== "function";

function withBeacon(call: (beacon: typeof Beacon) => void): void {
  import("./beacon").then(call, () => {
    // The chunk didn't load, as offline: the event is lost, and the next one asks for the chunk again
  });
}

/** Sends one of API-03's events: a car event with its car's id, any other without */
export function track(event: CarBeaconEvent, car: string): void;
export function track(event: SiteBeaconEvent): void;
export function track(event: BeaconEvent, car?: string): void {
  if (optedOut() || sendsNoBeacons()) return;
  const happened = { event, car, view, path: location.pathname };
  withBeacon((loaded) => loaded.send(happened));
}

/** Reports a failure in the browser by its code (NFR-OBS-02), with its error where there is one */
export function reportClientError(code: ClientErrorCode, error?: unknown): void {
  if (optedOut() || sendsNoBeacons()) return;
  if (typeof error === "object" && error !== null) {
    if (reported.has(error)) return;
    reported.add(error);
  }
  const path = location.pathname;
  withBeacon((loaded) => loaded.sendError(code, path));
}

/** The layout's note of the page's pathname, made before the page's effects run (FR-47.6) */
export function notePath(pathname: string): void {
  if (viewPath !== undefined && pathname !== viewPath) view += 1;
  viewPath = pathname;
}

/** Counts the errors nothing caught, until the function it returns stops it */
export function watchUncaughtErrors(): () => void {
  const report = (event: ErrorEvent) => {
    if (event.filename.startsWith(`${location.origin}/`)) reportClientError("UNCAUGHT", event.error);
  };
  addEventListener("error", report);
  return () => removeEventListener("error", report);
}
