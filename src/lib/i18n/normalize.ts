// Text folded for matching (FR-08.3): the command palette, the model aliases (stored folded, §6.2)
// and place search (FR-40.4) compare what normalizeSearch returns, so a query matches however it
// was typed. Beside FR-08's alef forms, ة and ى, the owner added the hamza seats ؤ and ئ, tatweel,
// and the Persian yeh and keheh some phone keyboards type (24 Oct 2026). Numeric fields read typed
// digits through normalizeDigits (FR-31.5). The palette runs in the browser and the seed scripts
// load this module, so it has no imports. Code points are written as numbers, since several of
// these letters look alike.

const char = (codePoint: number) => String.fromCodePoint(codePoint);
const span = (from: number, to: number) => `${char(from)}-${char(to)}`;
const anyOf = (chars: Iterable<string>) => new RegExp(`[${[...chars].join("")}]`, "gu");

// Arabic-Indic (U+0660) and Persian (U+06F0) digits, and the Arabic decimal and thousands separators
const DIGIT_FOLDS: ReadonlyMap<string, string> = new Map([
  ...Array.from({ length: 10 }, (_, digit) => [char(0x0660 + digit), String(digit)] as const),
  ...Array.from({ length: 10 }, (_, digit) => [char(0x06f0 + digit), String(digit)] as const),
  [char(0x066b), "."],
  [char(0x066c), ","],
]);
const DIGITS = anyOf(DIGIT_FOLDS.keys());

const LETTER_FOLDS: ReadonlyMap<string, string> = new Map(
  (
    [
      // alef with madda, with hamza above, with hamza below, and alef wasla
      [[0x0622, 0x0623, 0x0625, 0x0671], 0x0627],
      // teh marbuta
      [[0x0629], 0x0647],
      // alef maksura, yeh with hamza above, and the Persian yeh
      [[0x0649, 0x0626, 0x06cc], 0x064a],
      // waw with hamza above
      [[0x0624], 0x0648],
      // the Persian keheh
      [[0x06a9], 0x0643],
    ] as const
  ).flatMap(([letters, folded]) => letters.map((letter) => [char(letter), char(folded)] as const)),
);
const LETTERS = anyOf(LETTER_FOLDS.keys());

// The marks U+064B to U+065F (tanween, the short vowels, shadda, sukun and hamza typed as a mark),
// the superscript alef, tatweel, and the invisible format characters pasted text carries
const DROPPED = new RegExp(`[${span(0x064b, 0x065f)}${char(0x0670)}${char(0x0640)}]|\\p{Cf}`, "gu");

export function normalizeDigits(text: string): string {
  return text.replace(DIGITS, (digit) => DIGIT_FOLDS.get(digit) ?? digit);
}

// NFKC first: it writes presentation forms and full-width Latin as plain letters, and composes a
// hamza typed as a mark with the letter before it, which the folds then take
export function normalizeSearch(text: string): string {
  return normalizeDigits(text.normalize("NFKC"))
    .replace(LETTERS, (letter) => LETTER_FOLDS.get(letter) ?? letter)
    .replace(DROPPED, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}
