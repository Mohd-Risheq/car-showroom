import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  KEYBOARD_VIEWPORT_HEIGHT,
  keyboardOpen,
  keyboardOpenNow,
  onKeyboardChange,
  useKeyboardOpen,
} from "@/components/ui/keyboard";

// DESIGN §8.4: a bar fixed to the bottom of the screen steps aside while the on-screen keyboard is
// open, taken to be while a text field has the focus and the visual viewport is under 500 px tall

/** An element that matches a selector list as the element written this way does */
function element(written: string): Element {
  return { matches: (selectors: string) => selectors.split(", ").includes(written) } as unknown as Element;
}

const TEXT_FIELDS = [
  "input:not([type])",
  ...["text", "search", "email", "tel", "url", "number", "password"].map((type) => `input[type="${type}"]`),
  "textarea",
  '[contenteditable]:not([contenteditable="false"])',
];

describe("keyboardOpen", () => {
  it("is open while a text field has the focus and the visual viewport is under 500 px tall", () => {
    for (const field of TEXT_FIELDS) expect(keyboardOpen(element(field), 499.5), field).toBe(true);
  });

  it("is closed from 500 px tall", () => {
    expect(KEYBOARD_VIEWPORT_HEIGHT).toBe(500);
    expect(keyboardOpen(element('input[type="search"]'), 500)).toBe(false);
  });

  it("is closed while the focus is on what opens no keyboard, or on nothing", () => {
    for (const other of ['input[type="checkbox"]', "button", "a", '[contenteditable="false"]']) {
      expect(keyboardOpen(element(other), 300), other).toBe(false);
    }
    expect(keyboardOpen(null, 300)).toBe(false);
  });

  it("is closed where the browser has no visual viewport", () => {
    expect(keyboardOpen(element("textarea"), undefined)).toBe(false);
  });
});

describe("the keyboard's state in the page", () => {
  /** A page whose focused element and visual viewport the test sets */
  function page(focused: Element | null, height: number | undefined) {
    const document = Object.assign(new EventTarget(), { activeElement: focused });
    const visualViewport = height === undefined ? undefined : Object.assign(new EventTarget(), { height });
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", { visualViewport });
    return { document, visualViewport };
  }

  it("is read from the focused element and the visual viewport", () => {
    page(element("textarea"), 420);
    expect(keyboardOpenNow()).toBe(true);
    page(element("textarea"), 780);
    expect(keyboardOpenNow()).toBe(false);
    page(element("textarea"), undefined);
    expect(keyboardOpenNow()).toBe(false);
  });

  it("is read again as the focus moves and the visual viewport resizes, until the page stops listening", () => {
    const { document, visualViewport } = page(null, 780);
    const onChange = vi.fn();
    const stop = onKeyboardChange(onChange);
    document.dispatchEvent(new Event("focusin"));
    document.dispatchEvent(new Event("focusout"));
    visualViewport?.dispatchEvent(new Event("resize"));
    expect(onChange).toHaveBeenCalledTimes(3);
    // The focus moving on to another field: each move is read
    document.dispatchEvent(new Event("focusin"));
    document.dispatchEvent(new Event("focusout"));
    expect(onChange).toHaveBeenCalledTimes(5);
    stop();
    for (const type of ["focusin", "focusout"]) document.dispatchEvent(new Event(type));
    visualViewport?.dispatchEvent(new Event("resize"));
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("is still read from the focus where the browser has no visual viewport", () => {
    const { document } = page(null, undefined);
    const onChange = vi.fn();
    const stop = onKeyboardChange(onChange);
    document.dispatchEvent(new Event("focusin"));
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("is closed in the server's HTML, which always has the bar", () => {
    function Bar() {
      return <p>{useKeyboardOpen() ? "aside" : "shown"}</p>;
    }
    expect(renderToStaticMarkup(<Bar />)).toBe("<p>shown</p>");
  });
});
