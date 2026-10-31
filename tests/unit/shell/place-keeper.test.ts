import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTRY_KEY, entryIdOf, PLACES_KEY, placeOf, withPlace } from "@/features/shell/domain/scroll-memory";
import { HOLD_FRAMES, moveTo, PlaceKeeper, RESTORE_MS, VISITOR_INPUT } from "@/features/shell/ui/place-keeper";
import { DIALOG, offerReturn, takeReturn } from "@/features/shell/ui/return-control";

// FR-02.5's places in the browser (src/features/shell/ui/place-keeper.ts): each history entry's
// place is noted as the page scrolls and saved when scrolling pauses, before a click or a form, as
// a step leaves the page and as the document unloads, and put back as the entry's page comes into
// view, held until it stays put (D-047). React may render a step before the keeper hears it, so
// steps are tried in both orders. Each path runs on a stand-in for the window: a page that scrolls
// as far as it is tall, history entries with their states, session storage, and frames and timers
// that run as the test steps them. The control each entry's page was left by, which a step back or
// forward offers to the page's arrival (FR-02.4), runs on the page's controls, as return-control.ts
// reads them.

/** A history state as the Next.js router writes it */
const ROUTER_STATE = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["", {}], renderedSearch: "" } };
const FRAME_MS = 16;
const VIEWPORT = 800;

type Entry = { address: string; hash: string; state: unknown };
type Listener = (event: object) => void;

/** A link, a field or a button on the stand-in page, as return-control.ts reads it */
class FakeControl {
  readonly localName: string;
  readonly textContent: string;
  /** Whether it has boxes: none in a menu that has closed, or in a page kept hidden */
  shown = true;
  /** Whether it is in a dialog, as the menu sheet's links are */
  inDialog = false;
  readonly #attributes: Map<string, string>;

  constructor(localName: string, attributes: Record<string, string> = {}, textContent = "") {
    this.localName = localName;
    this.#attributes = new Map(Object.entries(attributes));
    this.textContent = textContent;
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  /** Itself, as the control it is, and as the dialog it is in for the module's selector of dialogs */
  closest(selector: string): FakeControl | null {
    return selector === DIALOG && !this.inDialog ? null : this;
  }

  getClientRects(): object[] {
    return this.shown ? [{}] : [];
  }
}

/** Session storage, which can refuse every read and write, as some private windows do */
class FakeStorage {
  refuses = false;
  readonly #items = new Map<string, string>();

  getItem(key: string): string | null {
    if (this.refuses) throw new Error("storage refused");
    return this.#items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.refuses) throw new Error("storage refused");
    this.#items.set(key, value);
  }
}

/** The tab's history as the keeper reads it: the current entry's state, written in place */
class FakeHistory {
  scrollRestoration: ScrollRestoration = "auto";
  /** Whether a write is refused, as Safari refuses one when a page writes history too often */
  refusesWrites = false;
  readonly #page: FakeWindow;

  constructor(page: FakeWindow) {
    this.#page = page;
  }

  get state(): unknown {
    return this.#page.entry.state;
  }

  replaceState(state: unknown): void {
    if (this.refusesWrites) throw new Error("history write refused");
    this.#page.entry.state = structuredClone(state);
  }
}

/** The address of the tab's current entry */
class FakeLocation {
  readonly reload: () => void;
  readonly #page: FakeWindow;

  constructor(page: FakeWindow, reload: () => void) {
    this.#page = page;
    this.reload = reload;
  }

  get pathname(): string {
    return this.#page.entry.address.split("?")[0] ?? "";
  }

  get search(): string {
    const query = this.#page.entry.address.split("?")[1];
    return query === undefined ? "" : `?${query}`;
  }

  get hash(): string {
    return this.#page.entry.hash;
  }
}

/** The window as the keeper reads it: one page's scroll, its history, its storage, frames and timers */
class FakeWindow {
  scrollY = 0;
  /** How tall the page is */
  height = 5000;
  readonly sessionStorage = new FakeStorage();
  readonly reloads = vi.fn();
  readonly history = new FakeHistory(this);
  readonly location = new FakeLocation(this, this.reloads);
  readonly entries: Entry[];
  index = 0;
  /** The page's controls, in the document's order */
  readonly controls: FakeControl[] = [];
  /** The control the focus is on, if any */
  focused: FakeControl | null = null;
  #now = 0;
  #lastId = 0;
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #frames = new Map<number, () => void>();
  readonly #timers = new Map<number, { at: number; run: () => void }>();

  constructor(address: string, state: unknown = ROUTER_STATE) {
    this.entries = [{ address, hash: "", state: structuredClone(state) }];
  }

  get entry(): Entry {
    const entry = this.entries[this.index];
    if (entry === undefined) throw new Error("no current entry");
    return entry;
  }

  scrollTo({ top }: { top: number }): void {
    this.scrollY = Math.min(Math.max(0, top), Math.max(0, this.height - VIEWPORT));
  }

  addEventListener(type: string, listener: Listener, options: { signal?: AbortSignal } = {}): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    options.signal?.addEventListener("abort", () => listeners.delete(listener));
  }

  dispatch(type: string, event: object = {}): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) listener(event);
  }

  requestAnimationFrame(run: () => void): number {
    this.#lastId += 1;
    this.#frames.set(this.#lastId, run);
    return this.#lastId;
  }

  cancelAnimationFrame(frame: number): void {
    this.#frames.delete(frame);
  }

  setTimeout(run: () => void, delay: number): number {
    this.#lastId += 1;
    this.#timers.set(this.#lastId, { at: this.#now + delay, run });
    return this.#lastId;
  }

  clearTimeout(timer: number): void {
    this.#timers.delete(timer);
  }

  /** Time moves on by a frame: the timers due run, then what asked for the frame */
  step(): void {
    this.#now += FRAME_MS;
    for (const [id, timer] of [...this.#timers]) {
      if (timer.at > this.#now) continue;
      this.#timers.delete(id);
      timer.run();
    }
    const due = [...this.#frames.values()];
    this.#frames.clear();
    for (const run of due) run();
  }

  /** Time moves on by at least this long, a frame at a time */
  wait(ms: number): void {
    for (let passed = 0; passed < ms; passed += FRAME_MS) this.step();
  }

  /** The visitor scrolls the page */
  scroll(top: number): void {
    this.scrollTo({ top });
    this.dispatch("scroll");
  }

  /** The router opens a page in a new entry, after the current one, as a link does */
  push(address: string, state: unknown = ROUTER_STATE, hash = ""): void {
    this.entries.splice(this.index + 1, Infinity, { address, hash, state: structuredClone(state) });
    this.index += 1;
  }

  /** The router writes the current entry anew, at a new address or the same one, as a filter or a refresh does */
  replace(address: string, state: unknown = ROUTER_STATE): void {
    this.entries[this.index] = { address, hash: "", state: structuredClone(state) };
  }

  /** A step back or forward, by a key or the browser's own button: the entry changes, then popstate fires */
  go(delta: number): void {
    this.index += delta;
    this.dispatch("popstate", { state: this.entry.state });
  }

  /**
   * A step whose page React renders before the keeper hears popstate, as when the router's listener
   * comes first: the entry changes, the page arrives, then the keeper hears the step
   */
  goRenderedFirst(delta: number, keeper: PlaceKeeper): void {
    const { state } = this.entries[this.index + delta] ?? {};
    this.index += delta;
    rendered(this, keeper);
    this.scrollTo({ top: this.scrollY });
    this.dispatch("popstate", { state });
  }

  /** The place the record in session storage holds for an entry */
  savedPlace(entry: Entry | undefined): number | null {
    const id = entryIdOf(entry?.state);
    return id === null ? null : placeOf(this.sessionStorage.getItem(PLACES_KEY), id);
  }
}

/** Puts a stand-in window in place, with an element at section-9 on its page, and its controls */
function stubWindow(address: string, state?: unknown): FakeWindow {
  const page = new FakeWindow(address, state);
  const section = { scrollIntoView: () => page.scrollTo({ top: 2400 }) };
  vi.stubGlobal("window", page);
  vi.stubGlobal("Element", FakeControl);
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "section-9" ? section : null),
    getElementsByName: () => [],
    querySelectorAll: () => page.controls,
    get activeElement() {
      return page.focused;
    },
  });
  return page;
}

/** The keeper on the page shown, started as the shell mounts */
function startKeeper(page: FakeWindow): { keeper: PlaceKeeper; stop: () => void } {
  const keeper = new PlaceKeeper(page.location.pathname, page.location.search.slice(1));
  return { keeper, stop: keeper.start() };
}

/**
 * What React does as it commits the page the router has rendered for the current entry: the keeper
 * hears the page on screen leave, while it is still there, then the new one arrive
 */
function rendered(page: FakeWindow, keeper: PlaceKeeper): void {
  keeper.leave();
  keeper.arrive(page.location.pathname, page.location.search.slice(1));
}

/**
 * A link's new page, in the order React and the router take it: the page on screen leaves while its
 * entry is still the current one, then the router adds the new page's entry, and the page arrives
 */
function opened(page: FakeWindow, keeper: PlaceKeeper, address: string): void {
  keeper.leave();
  page.push(address);
  keeper.arrive(page.location.pathname, page.location.search.slice(1));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlaceKeeper", () => {
  it("gives the shown entry an id, and a new page its own one, at its top", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    const first = entryIdOf(page.entry.state);
    expect(first).not.toBeNull();
    expect(page.entry.state).toMatchObject(ROUTER_STATE);
    page.scroll(1200);
    page.dispatch("click");
    page.push("/en/b");
    rendered(page, keeper);
    expect(page.scrollY).toBe(0);
    expect(entryIdOf(page.entry.state)).not.toBeNull();
    expect(entryIdOf(page.entry.state)).not.toBe(first);
  });

  it("saves the place when scrolling pauses for 200 ms, not sooner", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    page.scroll(300);
    page.wait(160);
    page.scroll(700);
    page.wait(176);
    expect(page.savedPlace(page.entry)).toBeNull();
    page.wait(32);
    expect(page.savedPlace(page.entry)).toBe(700);
  });

  it("writes storage only for a place noted since the last save", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.push("/en/b");
    rendered(page, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    const writes = vi.spyOn(page.sessionStorage, "setItem");
    page.scroll(300);
    page.scroll(700);
    page.wait(208);
    expect(writes).toHaveBeenCalledOnce();
    // A step whose page React renders first: b's place is noted and saved as React replaces b, and
    // nothing is noted after
    page.goRenderedFirst(-1, keeper);
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it("saves the place before a click or a form can open another page, and restores nothing itself from then", () => {
    for (const event of ["click", "submit"]) {
      const page = stubWindow("/en/a");
      startKeeper(page);
      page.scrollTo({ top: 400 });
      page.dispatch(event);
      expect(page.savedPlace(page.entry), event).toBe(400);
      expect(page.history.scrollRestoration, event).toBe("manual");
    }
  });

  it("saves the page left as a step leaves it, with no click and no pause in scrolling before", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.push("/en/b");
    rendered(page, keeper);
    page.go(-1);
    rendered(page, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    // A scroll, and at once a step forward by a key, then back
    page.scroll(1500);
    page.go(1);
    expect(page.savedPlace(page.entries[0])).toBe(1500);
    rendered(page, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.go(-1);
    rendered(page, keeper);
    expect(page.scrollY).toBe(1500);
  });

  it("saves the place noted before a step whose page React rendered before the keeper heard it", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.push("/en/b");
    rendered(page, keeper);
    page.goRenderedFirst(-1, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.scroll(1500);
    // Page b, a page shorter than the place a was at, has replaced a when the keeper hears the step
    page.height = 1200;
    page.goRenderedFirst(1, keeper);
    expect(page.savedPlace(page.entries[0])).toBe(1500);
    // Nor is the arrived page's place read as the one left
    expect(page.savedPlace(page.entries[1])).toBeNull();
    page.height = 5000;
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.goRenderedFirst(-1, keeper);
    expect(page.scrollY).toBe(1500);
    // The page's own restore holds it there, which the late popstate leaves to run
    page.scrollTo({ top: 1490 });
    page.step();
    expect(page.scrollY).toBe(1500);
  });

  it("saves the place of a page React replaced before its last scroll was heard, as a quick step can", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.push("/en/b");
    rendered(page, keeper);
    page.goRenderedFirst(-1, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    // A scroll the browser has yet to tell of when React renders the step's page
    page.scrollTo({ top: 1500 });
    page.goRenderedFirst(1, keeper);
    expect(page.savedPlace(page.entries[0])).toBe(1500);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.goRenderedFirst(-1, keeper);
    expect(page.scrollY).toBe(1500);
  });

  it("holds a step's page at its top when it has no place saved, though React rendered it before the step was heard", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.push("/en/b");
    rendered(page, keeper);
    // The router goes on to c from code while b still holds its top, so b has no place saved
    page.push("/en/c");
    rendered(page, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.scroll(1500);
    page.goRenderedFirst(-1, keeper);
    expect(page.savedPlace(page.entries[1])).toBeNull();
    expect(page.scrollY).toBe(0);
    // A glide still running carries the page on for a frame, and the hold puts it back
    page.scrollTo({ top: 30 });
    page.step();
    expect(page.scrollY).toBe(0);
  });

  it("ends the restore still holding one page's place as a step brings another", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.scroll(1500);
    page.dispatch("click");
    page.push("/en/b");
    rendered(page, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.scroll(300);
    page.dispatch("click");
    page.push("/en/c");
    rendered(page, keeper);
    page.wait(FRAME_MS * HOLD_FRAMES);
    // Back twice, the second before the first one's page has held its place
    page.go(-1);
    rendered(page, keeper);
    expect(page.scrollY).toBe(300);
    page.go(-1);
    rendered(page, keeper);
    expect(page.scrollY).toBe(1500);
    page.wait(FRAME_MS * HOLD_FRAMES);
    // The page is the visitor's again once its own place has held
    page.scroll(1700);
    page.wait(208);
    expect(page.scrollY).toBe(1700);
    expect(page.savedPlace(page.entries[0])).toBe(1700);
  });

  it("keeps a page's place through a router write of a new query, under a new id for its entry, for a step either way", () => {
    for (const renderedFirst of [false, true]) {
      const page = stubWindow("/en/p");
      const { keeper } = startKeeper(page);
      const step = (delta: number) => {
        if (renderedFirst) page.goRenderedFirst(delta, keeper);
        else {
          page.go(delta);
          rendered(page, keeper);
        }
      };
      page.push("/en/a");
      rendered(page, keeper);
      page.wait(FRAME_MS * HOLD_FRAMES);
      const before = entryIdOf(page.entry.state);
      // The place is saved as scrolling pauses, and no scroll comes after the write
      page.scroll(900);
      page.wait(208);
      page.replace("/en/a?view=replaced");
      rendered(page, keeper);
      expect(page.scrollY, String(renderedFirst)).toBe(900);
      const after = entryIdOf(page.entry.state);
      expect(after, String(renderedFirst)).not.toBeNull();
      expect(after, String(renderedFirst)).not.toBe(before);
      step(-1);
      page.wait(FRAME_MS * HOLD_FRAMES);
      step(1);
      expect(page.scrollY, String(renderedFirst)).toBe(900);
    }
  });

  it("saves the place of the page left as the router writes a new address itself, with no click before it", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    // A scroll, and before it pauses, a new query the router pushes from code
    page.scroll(900);
    page.push("/en/a?fuel=hybrid");
    rendered(page, keeper);
    expect(page.savedPlace(page.entries[0])).toBe(900);
    page.scroll(1500);
    page.wait(208);
    expect(page.savedPlace(page.entries[1])).toBe(1500);
    expect(page.savedPlace(page.entries[0])).toBe(900);
    page.go(-1);
    rendered(page, keeper);
    expect(page.scrollY).toBe(900);
  });

  it("gives the entry its id back on the next save after the router writes it anew, as on a refresh", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    const id = entryIdOf(page.entry.state);
    page.replace("/en/a");
    expect(entryIdOf(page.entry.state)).toBeNull();
    page.scroll(300);
    page.wait(208);
    expect(entryIdOf(page.entry.state)).toBe(id);
    page.replace("/en/a");
    page.dispatch("click");
    expect(entryIdOf(page.entry.state)).toBe(id);
    expect(page.savedPlace(page.entry)).toBe(300);
    // And as the document unloads, so that the reload finds the place under it
    page.replace("/en/a");
    page.dispatch("pagehide", { persisted: false });
    expect(entryIdOf(page.entry.state)).toBe(id);
  });

  it("goes on when the browser refuses a history write, and writes the entry's id on a later try", () => {
    const page = stubWindow("/en/a");
    page.history.refusesWrites = true;
    startKeeper(page);
    expect(entryIdOf(page.entry.state)).toBeNull();
    page.history.refusesWrites = false;
    page.scroll(300);
    expect(entryIdOf(page.entry.state)).not.toBeNull();
    page.wait(208);
    expect(page.savedPlace(page.entry)).toBe(300);
  });

  it("gives its id to no other entry while a step's page is still to render", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.push("/en/b", ROUTER_STATE);
    rendered(page, keeper);
    const shown = entryIdOf(page.entry.state);
    // An entry from before the keeper ran, with no id, stepped back to: its page isn't rendered yet
    page.entries[0] = { address: "/en/a", hash: "", state: ROUTER_STATE };
    page.go(-1);
    page.dispatch("click");
    expect(entryIdOf(page.entry.state)).toBeNull();
    rendered(page, keeper);
    expect(entryIdOf(page.entry.state)).not.toBeNull();
    expect(entryIdOf(page.entry.state)).not.toBe(shown);
  });

  it("gives an entry a router link to another of the page's fragments added an id of its own on its first scroll", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    const pageId = entryIdOf(page.entry.state);
    page.scrollTo({ top: 100 });
    page.dispatch("click");
    // The router adds the entry, with its own state and no id, and glides to the section
    page.push("/en/a", ROUTER_STATE, "#section-9");
    page.scroll(900);
    const jumpId = entryIdOf(page.entry.state);
    expect(jumpId).not.toBeNull();
    expect(jumpId).not.toBe(pageId);
    page.scroll(2400);
    page.wait(208);
    expect(page.savedPlace(page.entries[0])).toBe(100);
    expect(page.savedPlace(page.entries[1])).toBe(2400);
    page.go(-1);
    expect(page.scrollY).toBe(100);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.go(1);
    expect(page.scrollY).toBe(2400);
  });

  it("saves the place noted for the page as an entry at another of its fragments comes with no click before it", () => {
    for (const link of ["router", "plain"]) {
      const page = stubWindow("/en/a");
      startKeeper(page);
      // A scroll, and before it pauses, a new entry at a fragment, from code or the address bar
      page.scroll(100);
      if (link === "router") {
        page.push("/en/a", ROUTER_STATE, "#section-9");
        page.scroll(2400);
      } else {
        page.push("/en/a", null, "#section-9");
        page.scrollTo({ top: 2400 });
        page.dispatch("popstate", { state: null });
      }
      expect(page.savedPlace(page.entries[0]), link).toBe(100);
    }
  });

  it("gives an entry at another of the page's fragments its id back after the router writes it anew", () => {
    for (const link of ["router", "plain"]) {
      const page = stubWindow("/en/a");
      startKeeper(page);
      page.dispatch("click");
      if (link === "router") {
        page.push("/en/a", ROUTER_STATE, "#section-9");
        page.scroll(2400);
      } else {
        page.push("/en/a", null, "#section-9");
        page.scrollTo({ top: 2400 });
        page.dispatch("popstate", { state: null });
      }
      const jumpId = entryIdOf(page.entry.state);
      expect(jumpId, link).not.toBeNull();
      // A refresh writes the entry anew, at the same address and fragment
      page.history.replaceState(ROUTER_STATE);
      page.scroll(2300);
      expect(entryIdOf(page.entry.state), link).toBe(jumpId);
    }
  });

  it("gives a new entry at a fragment an id of its own after a step back from one at the same fragment", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    const pageId = entryIdOf(page.entry.state);
    page.scroll(100);
    page.dispatch("click");
    page.push("/en/a", ROUTER_STATE, "#section-9");
    page.scroll(2400);
    page.go(-1);
    page.wait(FRAME_MS * HOLD_FRAMES);
    // The same link again: the router adds an entry at the same fragment, in place of the one left
    page.dispatch("click");
    page.push("/en/a", ROUTER_STATE, "#section-9");
    page.scroll(2400);
    const againId = entryIdOf(page.entry.state);
    expect(againId).not.toBeNull();
    expect(againId).not.toBe(pageId);
    page.go(-1);
    expect(page.scrollY).toBe(100);
  });

  it("goes to the element a new page's fragment names, when no place was saved", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.push("/en/b", ROUTER_STATE, "#section-9");
    rendered(page, keeper);
    expect(page.scrollY).toBe(2400);
  });

  it("leaves a page where it is for a new query with no place saved", () => {
    const page = stubWindow("/en/a");
    const { keeper } = startKeeper(page);
    page.scrollTo({ top: 650 });
    page.push("/en/a?fuel=hybrid");
    rendered(page, keeper);
    expect(page.scrollY).toBe(650);
  });

  it("gives an in-page link's entry the page's router state under an id of its own, and steps within the page", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    const pageId = entryIdOf(page.entry.state);
    page.scrollTo({ top: 100 });
    page.dispatch("click");
    // The browser adds the entry with no state and scrolls to the element, then fires popstate
    page.push("/en/a", null, "#section-9");
    page.scrollTo({ top: 2400 });
    page.dispatch("popstate", { state: null });
    const jumpId = entryIdOf(page.entry.state);
    expect(page.entry.state).toMatchObject(ROUTER_STATE);
    expect(jumpId).not.toBeNull();
    expect(jumpId).not.toBe(pageId);
    expect(page.savedPlace(page.entries[0])).toBe(100);
    // A step back within the page saves the jump's place and goes to the page's own
    page.go(-1);
    expect(page.scrollY).toBe(100);
    expect(page.savedPlace(page.entries[1])).toBe(2400);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.go(1);
    expect(page.scrollY).toBe(2400);
  });

  it("gives an id to an entry stepped to within the page that the router wrote anew without one", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    // A refresh writes the entry anew, and an in-page jump comes before any save gives the id back
    page.replace("/en/a");
    page.push("/en/a", null, "#section-9");
    page.scrollTo({ top: 2400 });
    page.dispatch("popstate", { state: null });
    page.go(-1);
    expect(entryIdOf(page.entry.state)).not.toBeNull();
    page.scrollTo({ top: 300 });
    page.dispatch("click");
    page.go(1);
    page.wait(FRAME_MS * HOLD_FRAMES);
    page.go(-1);
    expect(page.scrollY).toBe(300);
  });

  it("reloads the page for a step to an entry with no state at another address, keeping the place left", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    page.entries.unshift({ address: "/en/x", hash: "", state: null });
    page.index = 1;
    page.scrollTo({ top: 820 });
    page.go(-1);
    expect(page.reloads).toHaveBeenCalledTimes(1);
    expect(page.savedPlace(page.entries[1])).toBe(820);
    // The document unloads for the reload while the page on screen is still the one stepped away from
    page.scrollTo({ top: 10 });
    page.dispatch("pagehide", { persisted: false });
    expect(page.savedPlace(page.entries[1])).toBe(820);
    expect(page.entries[0]?.state).toBeNull();
  });

  it("leaves the place as the document unloads for good, not as it goes into the back-forward cache", () => {
    const page = stubWindow("/en/a");
    startKeeper(page);
    page.scrollTo({ top: 650 });
    page.dispatch("pagehide", { persisted: true });
    expect(page.savedPlace(page.entry)).toBeNull();
    page.dispatch("pagehide", { persisted: false });
    expect(page.savedPlace(page.entry)).toBe(650);
  });

  it("takes a reloaded document to its entry's place, and leaves one with none to the browser", () => {
    const state = { ...ROUTER_STATE, [ENTRY_KEY]: "reloaded" };
    const page = stubWindow("/en/a", state);
    page.sessionStorage.setItem(PLACES_KEY, withPlace(null, "reloaded", 900));
    startKeeper(page);
    expect(page.scrollY).toBe(900);
    expect(page.history.scrollRestoration).toBe("manual");

    const fresh = stubWindow("/en/a", state);
    startKeeper(fresh);
    expect(fresh.scrollY).toBe(0);
    expect(fresh.history.scrollRestoration).toBe("auto");
  });

  it("saves nothing while a restore holds the page at its place", () => {
    const page = stubWindow("/en/a", { ...ROUTER_STATE, [ENTRY_KEY]: "held" });
    page.sessionStorage.setItem(PLACES_KEY, withPlace(null, "held", 900));
    page.height = 1200;
    startKeeper(page);
    // The page can't reach its place yet, so the restore holds on
    page.scroll(400);
    page.dispatch("click");
    page.wait(208);
    expect(page.savedPlace(page.entry)).toBe(900);
    page.dispatch("pagehide", { persisted: false });
    expect(page.savedPlace(page.entry)).toBe(900);
    page.height = 5000;
    page.wait(FRAME_MS * (HOLD_FRAMES + 1));
    expect(page.scrollY).toBe(900);
    page.scroll(1000);
    page.dispatch("click");
    expect(page.savedPlace(page.entry)).toBe(1000);
  });

  it("keeps the places for the document alone when session storage refuses them", () => {
    const page = stubWindow("/en/a");
    page.sessionStorage.refuses = true;
    const { keeper } = startKeeper(page);
    page.scrollTo({ top: 1100 });
    page.dispatch("click");
    page.push("/en/b");
    rendered(page, keeper);
    page.go(-1);
    rendered(page, keeper);
    expect(page.scrollY).toBe(1100);
  });

  it("stops keeping places once stopped, and gives restoring back to the browser", () => {
    const page = stubWindow("/en/a");
    const { stop } = startKeeper(page);
    page.dispatch("click");
    page.scroll(500);
    stop();
    expect(page.history.scrollRestoration).toBe("auto");
    page.wait(208);
    page.dispatch("click");
    expect(page.savedPlace(page.entry)).toBe(0);
  });
});

describe("the control a page was left by (FR-02.4)", () => {
  /**
   * The lab with the demo banner's Hide button first, then links home from the header and from two
   * of the lab's wordmarks, and the lab's toast button, the keeper started on it, and nothing on
   * offer
   */
  function lab() {
    const page = stubWindow("/en/lab");
    const hide = new FakeControl("button", {}, "Hide");
    const header = new FakeControl("a", { href: "/en" });
    const first = new FakeControl("a", { href: "/en" });
    const second = new FakeControl("a", { href: "/en" });
    const toast = new FakeControl("button", {}, "Show a toast");
    page.controls.push(hide, header, first, second, toast);
    const { keeper } = startKeeper(page);
    offerReturn("", null);
    return { page, keeper, hide, header, first, second, toast };
  }

  it("offers a step back the link its page was left by with a pointer's click, and a new page nothing", () => {
    const { page, keeper, second } = lab();
    page.dispatch("click", { detail: 1, target: second });
    opened(page, keeper, "/en");
    expect(takeReturn("/en")).toBeNull();
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBe(second);
  });

  it("offers the step whose page React rendered before the keeper heard it the same link", () => {
    const { page, keeper, second } = lab();
    page.dispatch("click", { detail: 1, target: second });
    opened(page, keeper, "/en");
    page.goRenderedFirst(-1, keeper);
    expect(takeReturn("/en/lab")).toBe(second);
  });

  it("offers the control the focus moved to before a click with no pointer, as Enter in a form's field makes", () => {
    const { page, keeper, toast } = lab();
    const field = new FakeControl("input", { type: "search", name: "q" });
    page.controls.push(field);
    page.dispatch("focusin", { target: field });
    // Enter in the field submits its form by a click on the form's button, with no pointer
    page.dispatch("click", { detail: 0, target: toast });
    opened(page, keeper, "/en/cars");
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBe(field);
  });

  it("offers a page a step left the control the focus was on then, and a page left with none nothing", () => {
    const { page, keeper, first, second, toast } = lab();
    page.dispatch("click", { detail: 1, target: first });
    opened(page, keeper, "/en");
    // Home: a click that leaves no focus, as WebKit's on a button, then the browser's step back
    page.dispatch("click", { detail: 1, target: toast });
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBe(first);
    // The lab: the keyboard moves the focus on to the second link, then the browser's step forward
    page.focused = second;
    page.dispatch("focusin", { target: second });
    page.go(1);
    rendered(page, keeper);
    expect(takeReturn("/en")).toBeNull();
    page.focused = null;
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBe(second);
  });

  it("offers nothing for a page left with no control, though the page before it was left by one", () => {
    const { page, keeper, second } = lab();
    page.dispatch("click", { detail: 1, target: second });
    opened(page, keeper, "/en");
    // Home: nothing pressed or focused, then another page, as a script opens
    opened(page, keeper, "/en/cars");
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en")).toBeNull();
  });

  it("forgets the control of a page left again with none, as after the focus has moved off it", () => {
    const { page, keeper, second } = lab();
    page.dispatch("click", { detail: 1, target: second });
    opened(page, keeper, "/en");
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBe(second);
    // The lab, back again, is left by a step with the focus on nothing
    page.go(1);
    rendered(page, keeper);
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBeNull();
  });

  it("finds the link by where it leads and its place among such links, as other controls come and go", () => {
    const { page, keeper, hide, second } = lab();
    page.dispatch("click", { detail: 1, target: second });
    opened(page, keeper, "/en");
    // The banner hidden on the way, as its Hide button hides it on every page
    hide.shown = false;
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBe(second);
  });

  it("offers nothing for a control no longer on screen, as a link in a menu that has closed", () => {
    const { page, keeper, second } = lab();
    page.dispatch("click", { detail: 1, target: second });
    opened(page, keeper, "/en");
    second.shown = false;
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBeNull();
  });

  it("offers nothing for a page left from a dialog, as by the menu sheet's links, gone as the next page comes", () => {
    const { page, keeper } = lab();
    const menuButton = new FakeControl("button", { "aria-label": "Menu" });
    const menuLink = new FakeControl("a", { href: "/en/compare" });
    menuLink.inDialog = true;
    page.controls.push(menuButton, menuLink);
    page.dispatch("click", { detail: 1, target: menuButton });
    page.dispatch("click", { detail: 1, target: menuLink });
    opened(page, keeper, "/en/compare");
    // A quick step back, while the sheet, closing still, holds its link on screen
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBeNull();
  });

  it("offers nothing for an arrival on the same path, as a new query makes, where the focus stays put", () => {
    const { page, keeper, second } = lab();
    page.dispatch("click", { detail: 1, target: second });
    opened(page, keeper, "/en/lab?sort=price");
    expect(takeReturn("/en/lab")).toBeNull();
    page.go(-1);
    rendered(page, keeper);
    expect(takeReturn("/en/lab")).toBeNull();
  });
});

describe("moveTo", () => {
  /** Moves the page, and counts the restore's ends */
  function move(page: FakeWindow, place: Parameters<typeof moveTo>[0]) {
    const ended = vi.fn();
    const end = moveTo(place, ended);
    return { ended, end };
  }

  it("holds a place until it stays put for 2 frames", () => {
    expect(HOLD_FRAMES).toBe(2);
    const page = stubWindow("/en/a");
    const { ended } = move(page, { kind: "saved", top: 900 });
    expect(page.scrollY).toBe(900);
    page.step();
    expect(ended).not.toHaveBeenCalled();
    page.step();
    expect(ended).toHaveBeenCalledTimes(1);
    page.wait(RESTORE_MS);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("puts the page back when it drifts, as a glide still running carries it on, and holds again", () => {
    const page = stubWindow("/en/a");
    const { ended } = move(page, { kind: "saved", top: 900 });
    page.step();
    page.scrollTo({ top: 960 });
    page.step();
    expect(page.scrollY).toBe(900);
    page.step();
    expect(ended).not.toHaveBeenCalled();
    page.step();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("follows a page still growing until it reaches the place", () => {
    const page = stubWindow("/en/a");
    page.height = 1000;
    const { ended } = move(page, { kind: "saved", top: 900 });
    expect(page.scrollY).toBe(200);
    page.wait(FRAME_MS * 4);
    expect(ended).not.toHaveBeenCalled();
    page.height = 3000;
    page.step();
    expect(page.scrollY).toBe(900);
    page.wait(FRAME_MS * HOLD_FRAMES);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("gives up at 2 s on a place the page can't reach", () => {
    expect(RESTORE_MS).toBe(2000);
    const page = stubWindow("/en/a");
    page.height = 1000;
    const { ended } = move(page, { kind: "saved", top: 900 });
    page.wait(RESTORE_MS - FRAME_MS);
    expect(ended).not.toHaveBeenCalled();
    page.wait(FRAME_MS);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("ends when the visitor takes over, by any of their own inputs, once", () => {
    expect(VISITOR_INPUT).toStrictEqual(["wheel", "touchstart", "pointerdown", "keydown"]);
    for (const input of VISITOR_INPUT) {
      const page = stubWindow("/en/a");
      page.height = 1000;
      const { ended } = move(page, { kind: "saved", top: 900 });
      page.dispatch(input);
      expect(ended, input).toHaveBeenCalledTimes(1);
      page.dispatch(input);
      page.wait(RESTORE_MS);
      expect(ended, input).toHaveBeenCalledTimes(1);
    }
  });

  it("ends when ended, as when another place comes first", () => {
    const page = stubWindow("/en/a");
    page.height = 1000;
    const { ended, end } = move(page, { kind: "saved", top: 900 });
    end();
    expect(ended).toHaveBeenCalledTimes(1);
    page.height = 3000;
    page.wait(FRAME_MS * 4);
    expect(page.scrollY).toBe(200);
  });

  it("goes to a fragment's element, or to the top when the fragment names nothing", () => {
    const page = stubWindow("/en/a");
    move(page, { kind: "fragment", id: "section-9" });
    expect(page.scrollY).toBe(2400);
    move(page, { kind: "fragment", id: "nothing" });
    expect(page.scrollY).toBe(0);
    page.scrollTo({ top: 300 });
    move(page, { kind: "top" });
    expect(page.scrollY).toBe(0);
  });
});
