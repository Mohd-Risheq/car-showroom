// FR-02.3: the demo banner stays hidden for the rest of the browser session once the visitor hides
// it. The head script hides it again before the first paint of every page after, so a hidden banner
// never flashes or moves the page; globals.css hides the banner under the attribute it sets. Session
// storage may be blocked, as in some private windows, and then the banner shows again.

/** The session storage key, and the value that hides the banner */
export const DEMO_BANNER_KEY = "muftah:demo-banner";
export const DEMO_BANNER_HIDDEN = "hidden";

/** The head script: sets data-demo-banner="hidden" on <html> when this session hid the banner */
export const DEMO_BANNER_SCRIPT = `try{if(sessionStorage.getItem(${JSON.stringify(DEMO_BANNER_KEY)})===${JSON.stringify(DEMO_BANNER_HIDDEN)})document.documentElement.dataset.demoBanner=${JSON.stringify(DEMO_BANNER_HIDDEN)}}catch(e){}`;

/** Hides the banner on this page and for the rest of the session, where storage allows */
export function hideDemoBanner(): void {
  document.documentElement.dataset.demoBanner = DEMO_BANNER_HIDDEN;
  try {
    sessionStorage.setItem(DEMO_BANNER_KEY, DEMO_BANNER_HIDDEN);
  } catch {
    // Storage blocked: hidden on this page only
  }
}
