import { afterEach, describe, expect, it, vi } from "vitest";
import { controlKeyOf, controlOf, DIALOG, offerReturn, takeReturn } from "@/features/shell/ui/return-control";

// FR-02.4's return of the focus after a step back or forward
// (src/features/shell/ui/return-control.ts): a control is known by its kind, where a link leads or
// what any other control is called, and by which of that kind on screen it is, so the page rendered
// again finds it, and the control found is offered to the arrival on its path, once (D-047). Each
// path runs on a stand-in for the document: its elements say what they are, which control they are
// in and whether they have boxes.

/** An element of the stand-in page: a control, or a part of one, or of none, or a dialog */
class PageElement extends EventTarget {
  readonly localName: string;
  readonly textContent: string;
  readonly parent: PageElement | null;
  readonly isControl: boolean;
  readonly isDialog: boolean;
  /** Whether it has boxes: none in a menu that has closed, or in a page kept hidden */
  shown = true;
  readonly #attributes: Map<string, string>;

  constructor(
    localName: string,
    {
      attributes = {},
      text = "",
      parent = null,
      isControl = true,
      isDialog = false,
    }: {
      attributes?: Record<string, string>;
      text?: string;
      parent?: PageElement | null;
      isControl?: boolean;
      isDialog?: boolean;
    } = {},
  ) {
    super();
    this.localName = localName;
    this.#attributes = new Map(Object.entries(attributes));
    this.textContent = text;
    this.parent = parent;
    this.isControl = isControl;
    this.isDialog = isDialog;
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  /** The dialog it is or is in, for the module's selector of dialogs, and else the control */
  closest(selector: string): PageElement | null {
    const matches = selector === DIALOG ? this.isDialog : this.isControl;
    return matches ? this : (this.parent?.closest(selector) ?? null);
  }

  getClientRects(): object[] {
    return this.shown ? [{}] : [];
  }
}

/** Puts a stand-in document in place, whose controls are these, in its order */
function stubDocument(controls: PageElement[]): void {
  vi.stubGlobal("Element", PageElement);
  vi.stubGlobal("document", { querySelectorAll: () => controls });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("controlKeyOf and controlOf", () => {
  it("know a link by where it leads and its place among the links there that show", () => {
    const hidden = new PageElement("a", { attributes: { href: "/en/cars" } });
    hidden.shown = false;
    const header = new PageElement("a", { attributes: { href: "/en" } });
    const other = new PageElement("a", { attributes: { href: "/en/cars" } });
    const wordmark = new PageElement("a", { attributes: { href: "/en" } });
    stubDocument([hidden, header, other, wordmark]);
    const key = controlKeyOf(wordmark);
    expect(key).toStrictEqual({ kind: "a /en", index: 1 });
    expect(controlOf({ kind: "a /en/cars", index: 0 })).toBe(other);
    if (key !== null) expect(controlOf(key)).toBe(wordmark);
  });

  it("know any other control by its element, type, name and label, its own or its text's", () => {
    const field = new PageElement("input", { attributes: { type: "search", name: "q" } });
    const search = new PageElement("button", { attributes: { type: "submit", "aria-label": "Search cars" } });
    const toast = new PageElement("button", { text: "  Show a toast " });
    stubDocument([field, search, toast]);
    expect(controlKeyOf(field)).toStrictEqual({ kind: "input search q ", index: 0 });
    expect(controlKeyOf(search)).toStrictEqual({ kind: "button submit  Search cars", index: 0 });
    expect(controlKeyOf(toast)).toStrictEqual({ kind: "button   Show a toast", index: 0 });
  });

  it("take the control an element is in, and nothing for an element in none or what is no element", () => {
    const link = new PageElement("a", { attributes: { href: "/en/cars/one" } });
    const price = new PageElement("span", { parent: link, isControl: false });
    const text = new PageElement("p", { isControl: false });
    stubDocument([link]);
    expect(controlKeyOf(price)).toStrictEqual({ kind: "a /en/cars/one", index: 0 });
    expect(controlKeyOf(text)).toBeNull();
    expect(controlKeyOf(null)).toBeNull();
    expect(controlKeyOf(new EventTarget())).toBeNull();
  });

  it("pass over a control in a dialog, as the menu sheet's links, gone as the page they open comes", () => {
    const footer = new PageElement("a", { attributes: { href: "/en/compare" } });
    const sheet = new PageElement("div", { attributes: { role: "dialog" }, isControl: false, isDialog: true });
    const menu = new PageElement("a", { attributes: { href: "/en/compare" }, parent: sheet });
    // The sheet comes last, as its portal does, and a sheet still closing holds its links on screen
    stubDocument([footer, menu]);
    expect(controlKeyOf(menu)).toBeNull();
    expect(controlKeyOf(footer)).toStrictEqual({ kind: "a /en/compare", index: 0 });
    expect(controlOf({ kind: "a /en/compare", index: 1 })).toBeNull();
  });

  it("give nothing for a control with no boxes, and none past the controls of a kind that show", () => {
    const first = new PageElement("a", { attributes: { href: "/en" } });
    const second = new PageElement("a", { attributes: { href: "/en" } });
    stubDocument([first, second]);
    second.shown = false;
    expect(controlKeyOf(second)).toBeNull();
    expect(controlOf({ kind: "a /en", index: 1 })).toBeNull();
    expect(controlOf({ kind: "a /en/compare", index: 0 })).toBeNull();
  });
});

describe("offerReturn and takeReturn", () => {
  it("give the control offered for a path once, and nothing for another path", () => {
    const control = {} as HTMLElement;
    offerReturn("/en/lab", control);
    expect(takeReturn("/en")).toBeNull();
    // A take for another path ends the offer too
    expect(takeReturn("/en/lab")).toBeNull();
    offerReturn("/en/lab", control);
    expect(takeReturn("/en/lab")).toBe(control);
    expect(takeReturn("/en/lab")).toBeNull();
  });

  it("give nothing once the offer is of nothing", () => {
    offerReturn("/en/lab", {} as HTMLElement);
    offerReturn("/en/lab", null);
    expect(takeReturn("/en/lab")).toBeNull();
  });
});
