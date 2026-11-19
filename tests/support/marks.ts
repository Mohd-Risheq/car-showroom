// The invisible characters the tests name, each written here apart from the code that writes it
// (src/lib/i18n/bidi.ts, src/lib/format/units.ts), so a test holds that code to Unicode rather than
// to itself: UAX #9's isolates and mark, and the no-break space.

export const LEFT_TO_RIGHT_ISOLATE = String.fromCodePoint(0x2066);
export const RIGHT_TO_LEFT_ISOLATE = String.fromCodePoint(0x2067);
export const FIRST_STRONG_ISOLATE = String.fromCodePoint(0x2068);
export const POP_DIRECTIONAL_ISOLATE = String.fromCodePoint(0x2069);
export const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);
export const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
