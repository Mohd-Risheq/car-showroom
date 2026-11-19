import type { ClientErrorCode } from "@/lib/analytics/client-errors";
import { reportClientError } from "@/lib/analytics/track";

// D-047: a part of a page that loads once the visitor asks for it, as the car page's fullscreen
// viewer and the phone's menu sheet do. A load that fails, as offline, opens nothing and counts
// under the part's code (NFR-OBS-02), once a page, and the next ask loads it again. An error in
// what the caller does with the part is no failure of the load's: it is left unhandled, as D-048
// leaves a promise's.

/** The loader of a part the page loads on demand: it hands the part to `use` once it is in */
export function onDemand<T>(load: () => Promise<T>, code: ClientErrorCode): (use: (part: T) => void) => void {
  return (use) => {
    load().then(use, (error: unknown) => reportClientError(code, error));
  };
}
