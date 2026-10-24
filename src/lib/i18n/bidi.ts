// FR-01.8: a value placed inside a message, such as a browser's name in auth.devices.name, goes in a
// first-strong isolate. A Latin name inside Arabic text, or Arabic inside English, then keeps its own
// direction, and the punctuation and numbers around it stay where they belong (UAX #9). The marks are
// text, so they work in attributes and titles too, where a <bdi> can't go.
const FIRST_STRONG_ISOLATE = String.fromCodePoint(0x2068);
const POP_DIRECTIONAL_ISOLATE = String.fromCodePoint(0x2069);

/** The text in an isolate whose direction its first strong letter sets */
export function isolate(text: string): string {
  return `${FIRST_STRONG_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}`;
}
