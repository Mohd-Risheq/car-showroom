import { describe, expect, it } from "vitest";
import { isolate } from "@/lib/i18n/bidi";

// FR-01.8: a value inside a message sits in a first-strong isolate

const FIRST_STRONG_ISOLATE = String.fromCodePoint(0x2068);
const POP_DIRECTIONAL_ISOLATE = String.fromCodePoint(0x2069);

describe("isolate", () => {
  it("opens a first-strong isolate before the text and closes it after", () => {
    expect(isolate("Chrome on macOS")).toBe(`${FIRST_STRONG_ISOLATE}Chrome on macOS${POP_DIRECTIONAL_ISOLATE}`);
    expect(isolate("سفاري")).toBe(`${FIRST_STRONG_ISOLATE}سفاري${POP_DIRECTIONAL_ISOLATE}`);
  });
});
