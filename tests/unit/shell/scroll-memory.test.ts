import { describe, expect, it } from "vitest";
import {
  ENTRY_KEY,
  entryIdOf,
  isRouterState,
  PLACES_KEPT,
  placeOf,
  placeOnArrival,
  withEntryId,
  withPlace,
} from "@/features/shell/domain/scroll-memory";

// FR-02.5's places (src/features/shell/domain/scroll-memory.ts): which history entries take an id,
// how a place is kept under it in the record session storage holds, and where a page goes as it
// comes into view.

/** A history state as the Next.js router writes it */
const ROUTER_STATE = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["", {}], renderedSearch: "" } };

describe("a history entry's id", () => {
  it("is taken only by an entry the Next.js router wrote", () => {
    expect(isRouterState(ROUTER_STATE)).toBe(true);
    for (const state of [null, undefined, 1, "state", {}, { __NA: "true" }, { __N: true }]) {
      expect(isRouterState(state), JSON.stringify(state)).toBe(false);
      expect(withEntryId(state, "e1"), JSON.stringify(state)).toBeNull();
    }
  });

  it("is written beside the router's state, which it leaves as it was", () => {
    const state = withEntryId(ROUTER_STATE, "e1");
    expect(state).toStrictEqual({ ...ROUTER_STATE, [ENTRY_KEY]: "e1" });
    expect(ROUTER_STATE).not.toHaveProperty(ENTRY_KEY);
    expect(entryIdOf(state)).toBe("e1");
  });

  it("isn't written again when the entry holds it already", () => {
    expect(withEntryId(withEntryId(ROUTER_STATE, "e1"), "e1")).toBeNull();
  });

  it("is a new one for an entry an in-page link added, over the state of the page it was added on", () => {
    const pageState = { ...ROUTER_STATE, [ENTRY_KEY]: "page" };
    expect(withEntryId(pageState, "jump")).toStrictEqual({ ...ROUTER_STATE, [ENTRY_KEY]: "jump" });
    expect(pageState).toHaveProperty(ENTRY_KEY, "page");
  });

  it("reads as none when the state holds no usable id", () => {
    for (const id of [undefined, null, "", 7, ["e1"]]) {
      expect(entryIdOf({ ...ROUTER_STATE, [ENTRY_KEY]: id }), String(id)).toBeNull();
    }
    expect(entryIdOf(ROUTER_STATE)).toBeNull();
    expect(entryIdOf(null)).toBeNull();
  });
});

describe("an entry's place in the record", () => {
  it("is read back under its entry's id, and the latest saved wins", () => {
    const record = withPlace(withPlace(null, "a", 1200), "b", 300);
    expect(placeOf(record, "a")).toBe(1200);
    expect(placeOf(record, "b")).toBe(300);
    expect(placeOf(record, "c")).toBeNull();
    expect(placeOf(withPlace(record, "a", 40), "a")).toBe(40);
  });

  it("is the top while the page bounces past it, and keeps a fraction, as a zoomed page scrolls", () => {
    expect(placeOf(withPlace(null, "a", -24), "a")).toBe(0);
    expect(placeOf(withPlace(null, "a", 640.5), "a")).toBe(640.5);
  });

  it(`is kept for the ${PLACES_KEPT} entries saved last, the oldest dropped first`, () => {
    expect(PLACES_KEPT).toBe(100);
    let record: string | null = null;
    for (let entry = 0; entry <= PLACES_KEPT; entry += 1) record = withPlace(record, `e${entry}`, entry);
    expect(placeOf(record, "e0")).toBeNull();
    expect(placeOf(record, "e1")).toBe(1);
    expect(placeOf(record, `e${PLACES_KEPT}`)).toBe(PLACES_KEPT);
    // Saving one again makes it the latest, so the next to go is the oldest of the others
    record = withPlace(record, "e1", 1);
    record = withPlace(record, "new", 0);
    expect(placeOf(record, "e1")).toBe(1);
    expect(placeOf(record, "e2")).toBeNull();
  });

  it("reads as none from a record that isn't one, and passes over a pair that isn't a place", () => {
    for (const record of [null, "", "not json", "null", "900", "{}", JSON.stringify({ a: 900 })]) {
      expect(placeOf(record, "a"), String(record)).toBeNull();
    }
    const pairs = [["a"], ["b", 1, 2], ["", 3], [4, 5], ["c", "900"], ["d", -1], ["e", null], "f", ["g", 70]];
    const record = JSON.stringify(pairs);
    for (const id of ["a", "b", "", "c", "d", "e", "f"]) expect(placeOf(record, id), id).toBeNull();
    expect(placeOf(record, "g")).toBe(70);
    expect(placeOf(withPlace(record, "h", 8), "g")).toBe(70);
    // A number too large to be finite, which JSON reads as Infinity
    expect(placeOf('[["i",1e999]]', "i")).toBeNull();
  });
});

describe("where a page goes as it comes into view", () => {
  it("is its saved place after a step back or forward, before any fragment or the top", () => {
    expect(placeOnArrival(1200, "", true)).toStrictEqual({ kind: "saved", top: 1200 });
    expect(placeOnArrival(1200, "#section-9", true)).toStrictEqual({ kind: "saved", top: 1200 });
    expect(placeOnArrival(1200, "", false)).toStrictEqual({ kind: "saved", top: 1200 });
  });

  it("is its top when that is the place saved, before any fragment, on the same page too", () => {
    expect(placeOnArrival(0, "#section-9", true)).toStrictEqual({ kind: "saved", top: 0 });
    expect(placeOnArrival(0, "", false)).toStrictEqual({ kind: "saved", top: 0 });
  });

  it("is the element its fragment names, when no place was saved", () => {
    expect(placeOnArrival(null, "#section-9", true)).toStrictEqual({ kind: "fragment", id: "section-9" });
    expect(placeOnArrival(null, "#content", false)).toStrictEqual({ kind: "fragment", id: "content" });
  });

  it("reads the fragment percent-decoded, or as written where it doesn't decode", () => {
    expect(placeOnArrival(null, "#%D9%85%D9%88%D8%A7%D8%B5%D9%81%D8%A7%D8%AA", true)).toStrictEqual({
      kind: "fragment",
      id: "مواصفات",
    });
    expect(placeOnArrival(null, "#100%", true)).toStrictEqual({ kind: "fragment", id: "100%" });
  });

  it("is the top of a new page with neither", () => {
    expect(placeOnArrival(null, "", true)).toStrictEqual({ kind: "top" });
    expect(placeOnArrival(null, "#", true)).toStrictEqual({ kind: "top" });
  });

  it("is where it is for a new query on the same page, as a filter makes", () => {
    expect(placeOnArrival(null, "", false)).toBeNull();
  });
});
