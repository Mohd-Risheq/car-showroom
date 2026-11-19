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

// A name a dealer types, as a car's trim, can mix the scripts, and a first-strong isolate would set
// all of it in the direction of its first letter: in Arabic, "E 300 AMG لاين نايت" would then read
// its Latin part last. So each script's part goes in an isolate of that script's direction, which
// reads in the text's order inside text of either direction, the Latin parts isolated (DESIGN
// §10.3). A part runs from a word of its script to its script's last word before the other's,
// taking in the words of neither script between them, as a number or a sign. Such words at an end
// of the text go with the part beside them, so "Crozz Pure +" keeps its sign, and between the parts
// of two scripts stay outside both, in the text's own direction.
const LEFT_TO_RIGHT_ISOLATE = String.fromCodePoint(0x2066);
const RIGHT_TO_LEFT_ISOLATE = String.fromCodePoint(0x2067);
const ARABIC = /\p{Script=Arabic}/u;
const LATIN = /\p{Script=Latin}/u;

type Part = { from: number; to: number; opens: string };

/** The isolate a word's script opens, or null for a word of neither, as a number or a sign */
function isolateOf(word: string): string | null {
  if (ARABIC.test(word)) return RIGHT_TO_LEFT_ISOLATE;
  if (LATIN.test(word)) return LEFT_TO_RIGHT_ISOLATE;
  return null;
}

/** The text with each of its Latin and Arabic parts in an isolate of the part's direction */
export function isolateScripts(text: string): string {
  const words = Array.from(text.matchAll(/\S+/g), ({ 0: word, index }) => ({
    from: index,
    to: index + word.length,
    opens: isolateOf(word),
  }));
  const parts: Part[] = [];
  for (const { from, to, opens } of words) {
    if (opens === null) continue;
    const last = parts.at(-1);
    if (last?.opens === opens) last.to = to;
    else parts.push({ from, to, opens });
  }
  const first = parts[0];
  const last = parts.at(-1);
  if (first === undefined || last === undefined) return text;
  first.from = words[0]?.from ?? first.from;
  last.to = words.at(-1)?.to ?? last.to;
  let isolated = "";
  let at = 0;
  for (const { from, to, opens } of parts) {
    isolated += `${text.slice(at, from)}${opens}${text.slice(from, to)}${POP_DIRECTIONAL_ISOLATE}`;
    at = to;
  }
  return isolated + text.slice(at);
}

// A number that its message follows with a sign, as car.battery's "{pct}%" does, can't take an
// isolate, which would part it from the sign: in Arabic the sign would then show on the number's
// left. A left-to-right mark before the number makes the number and the sign one left-to-right run
// (UAX #9, W7), so 91% reads 91% in both languages (DESIGN §9.5).
const LEFT_TO_RIGHT_MARK = String.fromCodePoint(0x200e);

/** The number with a left-to-right mark before it, for a message that puts a sign after it */
export function beforeSign(number: string): string {
  return `${LEFT_TO_RIGHT_MARK}${number}`;
}
