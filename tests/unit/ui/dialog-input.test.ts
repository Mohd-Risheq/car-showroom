import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inputOf, inputOfClick } from "@/components/ui/dialog-input";

// The input behind a dialog's open or close, which Base UI reports, and behind a click: from the
// keyboard a dialog shows and leaves at once, and a zoom button zooms at once (DESIGN §4.2)

describe("the input behind a click", () => {
  it("is a key for a click that counts no presses, as a click a key makes, and a pointer for any other", () => {
    expect(inputOfClick({ detail: 0 })).toBe("keyboard");
    expect(inputOfClick({ detail: 1 })).toBe("pointer");
    expect(inputOfClick({ detail: 2 })).toBe("pointer");
  });
});

describe("the input behind a change Base UI reports", () => {
  // Node has no UI events: these stand in for the browser's, with what inputOf reads
  class FakeMouseEvent extends Event {
    readonly detail: number;
    constructor(type: string, detail: number) {
      super(type);
      this.detail = detail;
    }
  }
  class FakeKeyboardEvent extends Event {}

  beforeEach(() => {
    vi.stubGlobal("MouseEvent", FakeMouseEvent);
    vi.stubGlobal("KeyboardEvent", FakeKeyboardEvent);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a key for a press of the trigger or the close button whose click counts no presses", () => {
    for (const reason of ["trigger-press", "close-press"] as const) {
      expect(inputOf({ reason, event: new FakeMouseEvent("click", 0) })).toBe("keyboard");
      expect(inputOf({ reason, event: new FakeKeyboardEvent("keydown") })).toBe("keyboard");
      expect(inputOf({ reason, event: new FakeMouseEvent("click", 1) })).toBe("pointer");
    }
  });

  it("is a key for Escape, and a pointer for a press outside, whatever its event counts", () => {
    expect(inputOf({ reason: "escape-key", event: new FakeKeyboardEvent("keydown") })).toBe("keyboard");
    expect(inputOf({ reason: "outside-press", event: new FakeMouseEvent("pointerdown", 0) })).toBe("pointer");
  });

  it("isn't known where the event doesn't tell, as for the close a drag's release asks for", () => {
    expect(inputOf({ reason: "imperative-action", event: new Event("close") })).toBeNull();
  });
});
