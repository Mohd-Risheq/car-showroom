// FR-02.5: each page's place, how far down it was scrolled, is kept for its history entry. An entry is
// known by an id the shell writes once into its state, under ENTRY_KEY beside the state the Next.js
// router writes there, and its place is kept under that id in a record in session storage
// (PLACES_KEY). So the place of a page being left is saved as a step leaves it, when history can
// write only the entry stepped to, and a reload, or a step back to a document that unloaded, finds
// it. Only an entry whose state the router wrote, which it marks __NA, takes an id: the router
// reloads the page on a step back to an entry holding a state it didn't write, and ignores a step to
// one holding none (D-047).

export const ENTRY_KEY = "muftahEntry";
export const PLACES_KEY = "muftah:places";
/** How many entries keep their places, the latest saved: more than a browser keeps in a tab's history */
export const PLACES_KEPT = 100;

type HistoryState = Record<string, unknown>;

/** Where a page goes as it comes into view: a saved place, the element its address names, or its top */
export type Place = { kind: "saved"; top: number } | { kind: "fragment"; id: string } | { kind: "top" };

const isHistoryState = (value: unknown): value is HistoryState => typeof value === "object" && value !== null;

/** A place a page can have: a finite number of pixels from its top, or null */
const asTop = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** Whether the Next.js router wrote this history state */
export function isRouterState(state: unknown): state is HistoryState {
  return isHistoryState(state) && state.__NA === true;
}

/** The id an entry's state holds, or null when it holds none */
export function entryIdOf(state: unknown): string | null {
  if (!isHistoryState(state)) return null;
  const id = state[ENTRY_KEY];
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * The router state with an entry's id beside the router's own, or null when the entry can't take one
 * or holds it already. An entry an in-page link added, which the browser leaves empty, takes the
 * state of the page it was added on, under an id of its own.
 */
export function withEntryId(state: unknown, id: string): HistoryState | null {
  if (!isRouterState(state) || entryIdOf(state) === id) return null;
  return { ...state, [ENTRY_KEY]: id };
}

/** The places a record holds, as [id, top] pairs, the oldest first; none when it isn't one */
function placesIn(record: string | null): [string, number][] {
  if (record === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(record);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((pair: unknown): [string, number][] => {
    if (!Array.isArray(pair) || pair.length !== 2) return [];
    const [id, value]: unknown[] = pair;
    const top = asTop(value);
    return typeof id === "string" && id !== "" && top !== null ? [[id, top]] : [];
  });
}

/** The places record with an entry's place saved as the latest, past PLACES_KEPT the oldest dropped */
export function withPlace(record: string | null, id: string, top: number): string {
  const others = placesIn(record).filter(([saved]) => saved !== id);
  // A page bouncing past its top, as iOS lets it, is at its top
  return JSON.stringify([...others, [id, Math.max(0, top)]].slice(-PLACES_KEPT));
}

/** The place an entry has in the places record, or null */
export function placeOf(record: string | null, id: string): number | null {
  return placesIn(record).find(([saved]) => saved === id)?.[1] ?? null;
}

/**
 * Where a page goes as it comes into view (FR-02.5): after a step back or forward, the place saved
 * for its entry; else the element its address's fragment names; else, for a new page, its top. A new
 * query on the same page, as a filter makes, keeps its place.
 */
export function placeOnArrival(saved: number | null, hash: string, newPage: boolean): Place | null {
  if (saved !== null) return { kind: "saved", top: saved };
  const id = fragmentId(hash);
  if (id !== null) return { kind: "fragment", id };
  return newPage ? { kind: "top" } : null;
}

/** The id a URL's fragment (location.hash, "#" and all) names, percent-decoded; null for none */
function fragmentId(hash: string): string | null {
  const fragment = hash.slice(1);
  if (fragment === "") return null;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}
