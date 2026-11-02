// NFR-OBS-02's codes for a failure in the browser, one for each place that reports one: a
// client_error carries its code and its page's route template to the server's log (API-03). A later
// place adds its own. Pure, and each code matches API-03's pattern.

export const CLIENT_ERROR_CODES = [
  // The lazy chunks a page does without when they fail (D-038): GSAP's scroll scrub, Motion's features
  "CHUNK_GSAP",
  "CHUNK_MOTION",
  // A page that failed in the shell (error.tsx), and a root layout that failed (global-error.tsx)
  "SEGMENT",
  "ROOT",
  // The shell's arrival after a navigation (route-arrival.tsx)
  "ARRIVAL",
  // An error event nothing else reported, from a script on the site's origin (track.ts)
  "UNCAUGHT",
] as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
