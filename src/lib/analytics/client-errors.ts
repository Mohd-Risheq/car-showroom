// NFR-OBS-02's codes for a failure in the browser, one for each place that reports one: a
// client_error carries its code and its page's route template to the server's log (API-03). A later
// place adds its own. Pure, and each code matches API-03's pattern.

export const CLIENT_ERROR_CODES = [
  // The lazy chunks a page does without when they fail (D-038): GSAP's scroll scrub, Motion's features
  "CHUNK_GSAP",
  "CHUNK_MOTION",
  // The parts a page loads on demand, which a failed load leaves closed (on-demand.ts, D-047): the
  // car page's fullscreen viewer, and the phone's menu sheet
  "CHUNK_VIEWER",
  "CHUNK_MENU",
  // A page that failed in the shell (error.tsx), and a root layout that failed (global-error.tsx)
  "SEGMENT",
  "ROOT",
  // The shell's arrival after a navigation (route-arrival.tsx)
  "ARRIVAL",
  // An error event nothing else reported, from a script on the site's origin (track.ts)
  "UNCAUGHT",
  // A car page's Share, when the link could be neither shared nor copied, and when the share sheet
  // failed for a reason other than its closing, though the link was copied (share-button.tsx)
  "SHARE",
  "SHARE_SHEET",
  // A car page's photo whose file didn't load (photo-gallery.tsx)
  "PHOTO",
  // A car page section's island that failed in the browser (near-viewport.tsx): each section's task
  // adds its section's code. The section lab's (/[locale]/dev/sections) never runs on a deployment.
  "SECTION_LAB",
] as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
