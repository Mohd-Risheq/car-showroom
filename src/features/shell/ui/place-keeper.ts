import {
  entryIdOf,
  type Place,
  PLACES_KEY,
  placeOf,
  placeOnArrival,
  withEntryId,
  withPlace,
} from "../domain/scroll-memory";
import { type ControlKey, controlKeyOf, controlOf, offerReturn } from "./return-control";

// FR-02.5's places in the browser, for scroll-memory.tsx, apart from React so that
// tests/unit/shell/place-keeper.test.ts drives each path. Next.js leaves a step back to the browser,
// which restores the place it saved as the next page came in, and a shorter next page has cut that
// place short by then (D-047). So the keeper gives each history entry an id and keeps its place under
// it (domain/scroll-memory.ts), and puts it back once a step's page has rendered, or as a document
// that finds its entry's place starts. From the first click, and from such a start, the browser
// restores nothing itself. Each scroll notes the place with its entry's id, and so does React as it
// is about to replace the page on screen. The note is saved when scrolling pauses, before a click or
// a form can open another page, as a page arrives or a step leaves one, and as the document unloads.
// React renders a router's step at once inside popstate, and the router's listener can come before
// the keeper's, even before the browser has told of the last scroll, so a step saves the note taken
// as React replaced the page left, and the page React has rendered isn't noted while it goes to its
// own place.
//
// A plain in-page link, as the skip link, adds an entry with no state, which the router can't step
// back to, so that entry takes the router state of the page it was added on, under an id of its own.
// The router writes an entry's state anew without the id: after a change of path or query the entry
// takes a new one; after a link to another of the page's fragments, the new entry takes one on its
// first scroll; and after a refresh, the next scroll, click or form gives the entry its id back.
//
// The keeper also notes the control each entry's page was left by, and offers it to the arrival of
// that page when a step brings it back (FR-02.4, return-control.ts). It keeps them for the
// document's life: a document loaded anew leaves the focus to the browser.

/** How long scrolling must pause before the place is saved, so a scroll writes storage once */
const SAVE_DELAY_MS = 200;
/** How long a page still growing has to reach its saved place */
export const RESTORE_MS = 2000;
/** How many frames in a row a place must hold once reached before the page is the visitor's again */
export const HOLD_FRAMES = 2;
/** The visitor's own input, which ends a restore still holding its place */
export const VISITOR_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/**
 * The page on screen: its path and query, its address and fragment as the browser writes them, its
 * entry's id, and its router state
 */
type ShownPage = { pathname: string; search: string; address: string; hash: string; id: string | null; state: unknown };

/** An entry's place, noted as the page scrolled and not yet saved */
type Note = { id: string; top: number };

const currentAddress = () => window.location.pathname + window.location.search;

/** A new entry's id, random so that no other entry in the tab's session takes it */
const newEntryId = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), (part) => part.toString(36)).join("");

/** Writes the current entry's state, which a browser refuses when a page writes its history too often */
function writeState(state: Record<string, unknown>) {
  try {
    window.history.replaceState(state, "");
  } catch {
    // Refused: the entry keeps the state it had, and the next scroll or click tries again
  }
}

/** Keeps each history entry's place, and puts it back as the entry's page comes into view */
export class PlaceKeeper {
  #shown: ShownPage;
  readonly #mover = new PlaceMover();
  #note: Note | null = null;
  #saveTimer = 0;
  /** The places record for this document alone, once session storage refuses it, as some private windows do */
  #unstored: string | null = null;
  #storageRefused = false;
  /** The control the visitor last pressed, or moved the focus to, on the page on screen */
  #lastControl: ControlKey | null = null;
  /** The control each entry's page was left by */
  readonly #leftBy = new Map<string, ControlKey>();

  constructor(pathname: string, search: string) {
    this.#shown = { pathname, search, address: "", hash: "", id: null, state: null };
  }

  /**
   * The page on screen is about to be replaced, as React commits another: its place, and the
   * control it is left by, are noted while it is there
   */
  leave(): void {
    this.#notePlace();
    this.#noteLeftBy();
  }

  /** A new page, or the page a step back or forward has rendered, goes to its place before it paints */
  arrive(pathname: string, search: string): void {
    const before = this.#shown;
    if (before.pathname === pathname && before.search === search) return;
    // The place of the page left, noted as React replaced it
    this.#saveNote();
    const id = this.#currentEntryId();
    const { hash } = window.location;
    this.#shown = { pathname, search, address: currentAddress(), hash, id, state: window.history.state };
    this.#lastControl = null;
    this.#mover.goTo(placeOnArrival(this.#placeOf(id), hash, pathname !== before.pathname));
    // A new entry has no control: only an entry stepped back or forward to was left by one. The
    // arrival moves the focus only on a new path (route-arrival.tsx).
    offerReturn(pathname, pathname === before.pathname ? null : this.#controlLeftBy(id));
  }

  /** Starts keeping places once the shell is on screen, and returns the way to stop */
  start(): () => void {
    this.#shown.address = currentAddress();
    this.#shown.hash = window.location.hash;
    this.#shown.id = this.#currentEntryId();
    this.#shown.state = window.history.state;

    const listeners = new AbortController();
    const { signal } = listeners;
    window.addEventListener("scroll", () => this.#onScroll(), { passive: true, signal });
    window.addEventListener("click", (event) => this.#onClick(event), { capture: true, signal });
    window.addEventListener("focusin", (event) => this.#noteControl(event.target), { capture: true, signal });
    window.addEventListener("submit", () => this.#beforeLeaving(), { capture: true, signal });
    window.addEventListener("popstate", (event) => this.#onStep(event), { signal });
    window.addEventListener("pagehide", (event) => this.#onUnload(event), { signal });

    // A document reloaded, or stepped back to after it unloaded, finds its entry's place and goes
    // there itself, as the browser's own restore falls short of a page still growing
    const saved = this.#placeOf(this.#shown.id);
    if (saved !== null) {
      window.history.scrollRestoration = "manual";
      this.#mover.goTo(placeOnArrival(saved, window.location.hash, false));
    }

    return () => {
      listeners.abort();
      window.clearTimeout(this.#saveTimer);
      this.#mover.stop();
      window.history.scrollRestoration = "auto";
    };
  }

  #onClick(event: MouseEvent): void {
    this.#beforeLeaving();
    // A pointer's click, which leaves a link or a button without the focus in WebKit; a click the
    // keyboard makes, as Enter on a link or in a form's field, presses what the focus is on, which
    // focusin noted
    if (event.detail > 0) this.#noteControl(event.target);
  }

  /**
   * Notes what the visitor last pressed or moved the focus to: the control an element is or is in, or
   * none, as for a dialog's title or link, which leaves the page no control to go back to
   */
  #noteControl(element: EventTarget | null): void {
    this.#lastControl = controlKeyOf(element);
  }

  /**
   * Notes the control the page on screen is left by, for its entry. A step back or forward, which
   * the browser takes, leaves by the control the focus is on, if any; a link, a button or a form by
   * the control the visitor last pressed or moved the focus to. As React replaces the page, a step
   * has already moved history to its own entry, while the router writes a new page's entry after.
   */
  #noteLeftBy(): void {
    const { id } = this.#shown;
    if (id === null) return;
    const stepped = entryIdOf(window.history.state) !== id;
    const control = stepped ? controlKeyOf(document.activeElement) : this.#lastControl;
    if (control === null) this.#leftBy.delete(id);
    else this.#leftBy.set(id, control);
  }

  /** The control an entry's page was left by, while it is on screen */
  #controlLeftBy(id: string | null): HTMLElement | null {
    const control = id === null ? undefined : this.#leftBy.get(id);
    return control === undefined ? null : controlOf(control);
  }

  #onScroll(): void {
    this.#followRouter();
    this.#notePlace();
    window.clearTimeout(this.#saveTimer);
    this.#saveTimer = window.setTimeout(() => this.#saveNote(), SAVE_DELAY_MS);
  }

  /** Before another page can replace this one: the place is saved, and the browser restores nothing from now on */
  #beforeLeaving(): void {
    this.#followRouter();
    this.#notePlace();
    this.#saveNote();
    window.history.scrollRestoration = "manual";
  }

  #onStep(event: PopStateEvent): void {
    const state: unknown = event.state;
    const address = currentAddress();
    if (state === null && address === this.#shown.address) {
      // A plain in-page link's new entry, which the browser has begun scrolling to the element it
      // names, after the link's click saved the place, or a step to one added before this could see
      // it: it takes the page's router state, under an id of its own
      this.#saveNote();
      this.#shown.id = this.#newEntryOfPage();
      this.#shown.hash = window.location.hash;
      return;
    }
    // The page left, still on screen at its place; or, when the router's listener came first, the page
    // React has rendered for the step, noted only when it keeps its place, as on a new query, since a
    // place still being restored isn't noted
    this.#notePlace();
    this.#saveNote();
    if (address !== this.#shown.address) {
      // Another page, which goes to its place once rendered. The router renders nothing for an entry
      // with no state, as one a plain in-page link added before this ran, so that page loads anew, as
      // the router loads one for an entry whose state it didn't write.
      if (state === null) window.location.reload();
      return;
    }
    // The page React rendered for the step went to its place as it arrived
    if (this.#shown.id !== null && entryIdOf(window.history.state) === this.#shown.id) return;
    // A step within the page renders nothing new, so the page goes to its place now
    this.#shown.id = this.#currentEntryId();
    this.#shown.hash = window.location.hash;
    this.#mover.goTo(placeOnArrival(this.#placeOf(this.#shown.id), window.location.hash, false));
  }

  // Only a document unloading for good leaves its place, the page's own: not on a step the router
  // reloads the page for, when the page on screen is still the one stepped away from
  #onUnload(event: PageTransitionEvent): void {
    if (event.persisted || currentAddress() !== this.#shown.address) return;
    this.#followRouter();
    this.#notePlace();
    this.#saveNote();
  }

  /** Notes the place of the page on screen for its entry */
  #notePlace(): void {
    const { id } = this.#shown;
    // A place still being restored isn't the visitor's
    if (id === null || this.#mover.waiting) return;
    this.#note = { id, top: window.scrollY };
  }

  #saveNote(): void {
    if (this.#note === null) return;
    this.#writePlaces(withPlace(this.#readPlaces(), this.#note.id, this.#note.top));
    this.#note = null;
  }

  /**
   * Follows the router's own writes to history, which leave the id out of an entry's state: a new
   * entry at another fragment of the page, as a link to one of its sections adds, takes an id of its
   * own, and the entry on screen written anew, as on a refresh, gets its id back. Not while a step's
   * page is still to render, when the entry is the next page's.
   */
  #followRouter(): void {
    const { id, address, hash } = this.#shown;
    if (currentAddress() !== address || entryIdOf(window.history.state) !== null) return;
    if (window.location.hash !== hash) {
      this.#saveNote();
      this.#shown.id = this.#currentEntryId();
      this.#shown.hash = window.location.hash;
      return;
    }
    const state = id === null ? null : withEntryId(window.history.state, id);
    if (state !== null) writeState(state);
  }

  /** The current entry's id, which an entry whose state has none takes now */
  #currentEntryId(): string | null {
    const id = entryIdOf(window.history.state);
    if (id !== null) return id;
    const fresh = newEntryId();
    const state = withEntryId(window.history.state, fresh);
    if (state === null) return null;
    writeState(state);
    return fresh;
  }

  /** The id of an entry an in-page link added, which takes the page's router state under it */
  #newEntryOfPage(): string | null {
    const id = newEntryId();
    const state = withEntryId(this.#shown.state, id);
    if (state === null) return null;
    writeState(state);
    return id;
  }

  #placeOf(id: string | null): number | null {
    return id === null ? null : placeOf(this.#readPlaces(), id);
  }

  #readPlaces(): string | null {
    if (!this.#storageRefused) {
      try {
        return window.sessionStorage.getItem(PLACES_KEY);
      } catch {
        this.#storageRefused = true;
      }
    }
    return this.#unstored;
  }

  #writePlaces(record: string): void {
    if (!this.#storageRefused) {
      try {
        window.sessionStorage.setItem(PLACES_KEY, record);
        return;
      } catch {
        this.#storageRefused = true;
      }
    }
    this.#unstored = record;
  }
}

/** Moves the page to its places, one at a time: a new one ends a restore still holding its place */
class PlaceMover {
  #end: (() => void) | null = null;

  /** Whether a restore is still holding its place, which isn't the visitor's yet */
  get waiting(): boolean {
    return this.#end !== null;
  }

  goTo(place: Place | null): void {
    this.stop();
    if (place === null) return;
    this.#end = moveTo(place, () => {
      this.#end = null;
    });
  }

  stop(): void {
    this.#end?.();
  }
}

/**
 * Scrolls to a place, at once, past the smooth scrolling of in-page jumps (FR-02.6), and holds it there
 * until it stays put for HOLD_FRAMES frames: in Chromium a glide still running carries the page on for
 * a frame after an instant scroll, and a page still growing reaches a saved place only as it grows. The
 * hold ends sooner when the visitor takes over, or after RESTORE_MS. Returns the way to end it.
 */
export function moveTo(place: Place, onEnd: () => void): () => void {
  const put = placer(place);
  let there = put();
  let landed = window.scrollY;
  let held = 0;
  let frame = 0;
  const wait = new AbortController();
  const end = () => {
    wait.abort();
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    onEnd();
  };
  const hold = () => {
    if (there && Math.abs(window.scrollY - landed) < 1) held += 1;
    else {
      held = 0;
      there = put();
      landed = window.scrollY;
    }
    if (held >= HOLD_FRAMES) end();
    else frame = window.requestAnimationFrame(hold);
  };
  frame = window.requestAnimationFrame(hold);
  const timer = window.setTimeout(end, RESTORE_MS);
  for (const type of VISITOR_INPUT) {
    window.addEventListener(type, end, { capture: true, passive: true, signal: wait.signal });
  }
  return end;
}

/** Puts the page at a place at once, and says whether it got there: a page yet to grow falls short */
function placer(place: Place): () => boolean {
  if (place.kind === "fragment") {
    const target = document.getElementById(place.id) ?? document.getElementsByName(place.id)[0];
    if (target !== undefined) {
      return () => {
        target.scrollIntoView({ behavior: "instant" });
        return true;
      };
    }
  }
  // A fragment naming nothing on the page leaves it at its top
  const top = place.kind === "saved" ? place.top : 0;
  return () => {
    window.scrollTo({ top, behavior: "instant" });
    // Within a pixel is there: a zoomed page scrolls by fractions of one
    return Math.abs(window.scrollY - top) < 1;
  };
}
