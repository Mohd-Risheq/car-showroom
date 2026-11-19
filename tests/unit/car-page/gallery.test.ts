import { describe, expect, it } from "vitest";
import {
  followsOnPage,
  inGroup,
  nextSide,
  photoGroupsOf,
  photosBeside,
  railOf,
  stepFromKey,
  stepTo,
} from "@/features/car-page/domain/gallery";
import type { PhotoGroup } from "@/lib/db/enums";
import { press } from "../../support/viewer-input";

// FR-10's gallery on the page: the photo groups as quick filters, the desktop rail's thumbnails
// (DESIGN §7.2.3, §10.3), the arrow keys, which follow the page's reading direction (FR-10.3), and
// the clicks that follow the link to the imperfections on the page (FR-09.13a)

const photos = (...groups: PhotoGroup[]) => groups.map((group, index) => ({ id: `p${index + 1}`, group }));

describe("photoGroupsOf", () => {
  it("names the groups that have photos, in FR-10's order, with how many each has", () => {
    expect(photoGroupsOf(photos("imperfection", "interior", "exterior", "imperfection", "exterior"))).toStrictEqual([
      { group: "exterior", count: 2 },
      { group: "interior", count: 1 },
      { group: "imperfection", count: 2 },
    ]);
  });

  it("names none for a car without photos", () => {
    expect(photoGroupsOf([])).toStrictEqual([]);
  });
});

describe("inGroup", () => {
  const all = photos("exterior", "imperfection", "interior", "imperfection");

  it("keeps the group's photos in the dealer's order", () => {
    expect(inGroup(all, "imperfection").map(({ id }) => id)).toStrictEqual(["p2", "p4"]);
  });

  it("keeps them all with no group chosen", () => {
    expect(inGroup(all, null)).toStrictEqual(all);
  });
});

describe("railOf", () => {
  it("shows no rail for one photo, and every photo up to seven", () => {
    expect(railOf(0)).toStrictEqual({ thumbnails: 0, more: 0 });
    expect(railOf(1)).toStrictEqual({ thumbnails: 0, more: 0 });
    expect(railOf(2)).toStrictEqual({ thumbnails: 2, more: 0 });
    expect(railOf(7)).toStrictEqual({ thumbnails: 7, more: 0 });
  });

  it("shows six thumbnails and a tile for the rest past seven, as +18 for 24 and +34 for 40", () => {
    expect(railOf(8)).toStrictEqual({ thumbnails: 6, more: 2 });
    expect(railOf(24)).toStrictEqual({ thumbnails: 6, more: 18 });
    expect(railOf(40)).toStrictEqual({ thumbnails: 6, more: 34 });
  });
});

describe("nextSide", () => {
  it("has the next photo wait on the right in English and on the left in Arabic (DESIGN §4.6)", () => {
    expect(nextSide("ltr")).toBe(1);
    expect(nextSide("rtl")).toBe(-1);
  });
});

describe("stepFromKey", () => {
  it("goes on with ArrowRight and back with ArrowLeft in English", () => {
    expect(stepFromKey(press("ArrowRight"), "ltr")).toBe(1);
    expect(stepFromKey(press("ArrowLeft"), "ltr")).toBe(-1);
  });

  it("goes on with ArrowLeft and back with ArrowRight in Arabic (TC-10-2)", () => {
    expect(stepFromKey(press("ArrowLeft"), "rtl")).toBe(1);
    expect(stepFromKey(press("ArrowRight"), "rtl")).toBe(-1);
  });

  it("takes no step for another key", () => {
    for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Home", "a"]) {
      expect(stepFromKey(press(key), "ltr"), key).toBe(0);
      expect(stepFromKey(press(key), "rtl"), key).toBe(0);
    }
  });

  it("leaves an arrow held with Alt, Ctrl or Cmd to the browser and the system, as Alt+ArrowLeft is Back", () => {
    for (const held of ["altKey", "ctrlKey", "metaKey"] as const) {
      for (const dir of ["ltr", "rtl"] as const) {
        expect(stepFromKey(press("ArrowLeft", { [held]: true }), dir), `${held} ${dir}`).toBe(0);
        expect(stepFromKey(press("ArrowRight", { [held]: true }), dir), `${held} ${dir}`).toBe(0);
      }
    }
  });
});

describe("stepTo", () => {
  it("moves by the step, and stops at the first photo and the last", () => {
    expect(stepTo(0, 1, 18)).toBe(1);
    expect(stepTo(5, -1, 18)).toBe(4);
    expect(stepTo(0, -1, 18)).toBe(0);
    expect(stepTo(17, 1, 18)).toBe(17);
    expect(stepTo(3, 0, 18)).toBe(3);
  });
});

describe("photosBeside", () => {
  it("has a photo wait each way of the one in view, but before the first and after the last", () => {
    expect(photosBeside(0, 5)).toStrictEqual({ previous: false, next: true });
    expect(photosBeside(2, 5)).toStrictEqual({ previous: true, next: true });
    expect(photosBeside(4, 5)).toStrictEqual({ previous: true, next: false });
    expect(photosBeside(0, 1)).toStrictEqual({ previous: false, next: false });
  });
});

describe("followsOnPage", () => {
  /** A click with the main button and no key held, unless the changes say otherwise */
  const click = (changes: Partial<Parameters<typeof followsOnPage>[0]> = {}) => ({
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    ...changes,
  });

  it("follows a click with the main button, as a press of Enter makes", () => {
    expect(followsOnPage(click())).toBe(true);
  });

  it("leaves a click with a key held to the browser, which opens the link elsewhere or saves it", () => {
    for (const held of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
      expect(followsOnPage(click({ [held]: true })), held).toBe(false);
    }
  });

  it("leaves a click with another button, and one a handler has taken", () => {
    expect(followsOnPage(click({ button: 1 }))).toBe(false);
    expect(followsOnPage(click({ defaultPrevented: true }))).toBe(false);
  });
});
