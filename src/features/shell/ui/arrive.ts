// FR-02.4's arrival on a new page, for route-arrival.tsx, apart from React so that
// tests/unit/shell/arrive.test.ts drives each path: the focus moves to the page's heading once the
// page can take it, or after a step back or forward to the control the page was left by, and the
// title is announced at once when it is in place, else as soon as it comes (D-047).

/** How long to wait for the page to come back to assistive technology, as while the menu sheet closes */
export const ARRIVAL_WAIT_MS = 2000;

/**
 * A page hidden from assistive technology: Base UI's modal sheet hides everything else with
 * aria-hidden while it is open, and a closing one until its cleanup runs, as when Back closes the
 * menu; an inert page would refuse the focus as well
 */
const HIDDEN_PAGE = '[inert], [aria-hidden="true"]';

/** Says which title to announce: one neither empty nor the last one, from the first page's */
export type TitleAnnouncer = (title: string) => string | null;

/**
 * The titles to announce after the first page's, which the browser reads out itself as the page
 * loads. An empty title is one still to come, as metadata can stream in after its page, and the last
 * one isn't announced again, as Next.js doesn't, between two unknown paths say.
 */
export function titleAnnouncer(firstTitle: string): TitleAnnouncer {
  let last = firstTitle;
  return (title) => {
    if (title === "" || title === last) return null;
    last = title;
    return title;
  };
}

/**
 * Focuses the control the page was left by, given after a step back or forward, or else the new
 * page's heading or main, once the page can take the focus, then announces its title by
 * announceTitle, which says whether there was a new one to announce, or else as soon as it comes.
 * Returns a cancel.
 */
export function arrive(announceTitle: () => boolean, leftBy: HTMLElement | null = null): (() => void) | undefined {
  const main = document.getElementById("content");
  if (main === null) return;
  // A page kept for a quick return stays in the document under display: none, which leaves its heading
  // no boxes, so it is passed over. Not checkVisibility(), which Safari has only from 17.4 (SRS C-09).
  const heading = Array.from(main.querySelectorAll("h1")).find((element) => element.getClientRects().length > 0);
  const page = heading ?? main;
  const target = leftBy ?? page;
  const until = performance.now() + ARRIVAL_WAIT_MS;
  let frame = 0;
  // A title still to come, with metadata that streams in after its page
  const titleComing = new MutationObserver(() => {
    if (announceTitle()) titleComing.disconnect();
  });
  const tryFocus = () => {
    // The focus and the announcement wait for the page to come back, or a screen reader may not hear them
    if (target.closest(HIDDEN_PAGE) === null) {
      focusOn(leftBy, page);
      if (!announceTitle()) titleComing.observe(document.head, { childList: true, subtree: true, characterData: true });
      return;
    }
    if (performance.now() < until) frame = requestAnimationFrame(tryFocus);
  };
  tryFocus();
  return () => {
    cancelAnimationFrame(frame);
    titleComing.disconnect();
  };
}

/**
 * Focuses, without scrolling, the control the page was left by; when there is none, or it refuses
 * the focus as a control disabled since does, the page's heading or main, given a tabindex of -1
 */
function focusOn(leftBy: HTMLElement | null, page: HTMLElement): void {
  leftBy?.focus({ preventScroll: true });
  if (leftBy !== null && document.activeElement === leftBy) return;
  if (!page.hasAttribute("tabindex")) page.tabIndex = -1;
  page.focus({ preventScroll: true });
}
