// The message catalogs as pnpm i18n:messages (scripts/deck-to-messages.ts) builds them, never by
// hand (BUILD-PLAN T-14): the copy deck's rows (DESIGN §9.2 and §9.3), then the enum labels of SRS
// §6.3 under enum.<enum>.<value>. The text is the specification's. The generator applies only the
// rules DESIGN gives for it: the deck's markers (§9.2, §9.3), a no-break space between a number
// and its unit, and an isolated phone number in Arabic (§9.4).
import type { DeckRow } from "./deck.ts";
import { errorMessage } from "./files.ts";
import type { Locale } from "./i18n.ts";

/** One catalog as next-intl reads it: keys nest by dot */
export type MessageTree = { [name: string]: string | MessageTree };

const NBSP = String.fromCodePoint(0xa0);
// Unicode's left-to-right isolate and the mark that closes it
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

// The units the copy writes after a number, a placeholder or a plural's #: money, distance, size,
// thickness, angle, time and engine speed. A line never breaks between the two (DESIGN §9.4).
const UNITS: Record<Locale, string[]> = {
  en: [
    ...["JOD", "km", "metre", "metres", "mm", "MB", "µm", "micron", "microns", "degree", "degrees"],
    ...["second", "seconds", "hour", "hours", "day", "days", "month", "months", "rpm"],
  ],
  ar: [
    ...["د.أ", "دينار", "دينارًا", "دنانير", "كم", "متر", "مترًا", "أمتار", "ملم", "ميغابايت", "ميكرون"],
    ...["درجة", "درجات"],
    ...["ثانية", "ثوانٍ", "ساعة", "ساعات", "يوم", "يومًا", "أيام", "شهر", "شهرًا", "أشهر", "دورة/دقيقة"],
  ],
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The space after a digit, a placeholder or # when a unit follows it as a whole word */
const unitSpace = (units: string[]) =>
  new RegExp(
    `(?<=[\\d#}]) (?=(?:${units
      .toSorted((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|")})(?![\\p{L}\\p{M}\\p{N}]))`,
    "gu",
  );
const UNIT_SPACE: Record<Locale, RegExp> = { en: unitSpace(UNITS.en), ar: unitSpace(UNITS.ar) };

// A phone number or the pattern of one, such as +962 7X XXX XXXX
const PHONE = /\+\d[\dX ]*[\dX]/g;

/** A deck cell as the catalog holds it. A cell that breaks the deck's own rules stops it. */
export function messageText(cell: string, locale: Locale): string {
  // † marks a string the owner is most likely to change, and isn't part of it (DESIGN §9.2)
  const text = cell.endsWith(" †") ? cell.slice(0, -2) : cell;
  if (text.includes("†")) throw new Error("† belongs at the end of a value, after a space (DESIGN §9.2)");
  if (/[‘’“”«»„‟‹›]/u.test(text)) throw new Error("typographic quotes: the copy uses straight ones (DESIGN §9.4)");
  if (text.includes("`")) throw new Error("a cell holds the text alone, without markdown (DESIGN §9.2)");

  // ⏎ is a line break (DESIGN §9.3)
  const withBreaks = text.replaceAll("⏎", "\n").replace(UNIT_SPACE[locale], NBSP);
  // In Arabic, a phone number keeps its left-to-right order (DESIGN §9.4)
  return locale === "ar" ? withBreaks.replace(PHONE, (phone) => `${LRI}${phone}${PDI}`) : withBreaks;
}

const ENUM_SECTION = "### 6.3 ";
// The enum table's rows, after its header and divider. A row may lack its closing pipe, as a deck
// row may.
const ENUM_ROW = /^\|\s*`([a-z][a-z0-9_]*)`\s*\|(.*?)\|?\s*$/;
const ENUM_HEADER = /^\|\s*Enum\s*\|/;
const TABLE_DIVIDER = /^\|[\s|:-]+$/;
// A value and its labels: `draft (Draft / مسودة)`. The English label has no slash; the Arabic may.
const LABELLED = /^([a-z][a-z0-9_]*) \(([^()/]+?) \/ ([^()]+)\)$/u;

/** A cell's comma-separated items, splitting only outside parentheses */
function items(cell: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < cell.length; index += 1) {
    if (cell[index] === "(") depth += 1;
    else if (cell[index] === ")") depth -= 1;
    else if (cell[index] === "," && depth === 0) {
      found.push(cell.slice(start, index).trim());
      start = index + 1;
    }
  }
  return [...found, cell.slice(start).trim()];
}

// The enums of SRS §6.3 that the interface never names, and why. Every other enum labels each of
// its values.
const UNLABELLED_ENUMS: Readonly<Record<string, string>> = {
  spin_direction: "the spin wizard offers Reverse direction, a deck key, instead",
  place_kind: "a journey stop shows its place's name",
  media_kind: "the kind of a stored file",
  media_status: "an upload's state on the server",
  spin_status: "a spin set's state on the server",
  consumption_source: "the wizard's EPA keys in the deck say where the figures came from",
  event_name: "analytics events (API-03)",
  user_role: "the deck's role keys name the roles",
};

/**
 * The enum labels of SRS §6.3 as rows keyed enum.<enum>.<value>. Each enum labels all its values
 * as (EN / AR), unless it is one the interface never names. An enum in neither state, or a table
 * row it can't read, stops it.
 */
export function enumLabels(srs: string, unlabelled: Readonly<Record<string, string>> = UNLABELLED_ENUMS): DeckRow[] {
  const rows: DeckRow[] = [];
  const unnamed = new Set(Object.keys(unlabelled));
  let enums = 0;
  let inSection = false;
  for (const [index, line] of srs.split("\n").entries()) {
    if (/^#{1,3} /.test(line)) inSection = line.startsWith(ENUM_SECTION);
    if (!inSection || !line.startsWith("|") || ENUM_HEADER.test(line) || TABLE_DIVIDER.test(line)) continue;
    const row = ENUM_ROW.exec(line);
    if (!row) throw new Error(`SRS §6.3 line ${index + 1} is not an enum row: ${line}`);
    const [, name = "", cell = ""] = row;
    enums += 1;
    const values = items(cell.trim()).map((item) => ({ item, labelled: LABELLED.exec(item) }));
    const hasLabels = values.some(({ labelled }) => labelled !== null);
    if (unnamed.delete(name)) {
      if (hasLabels) throw new Error(`SRS §6.3 ${name}: labelled, though listed as an enum the interface never names`);
      continue;
    }
    if (!hasLabels) throw new Error(`SRS §6.3 ${name}: no (EN / AR) labels, and not an enum the interface never names`);
    for (const { item, labelled } of values) {
      if (!labelled) throw new Error(`SRS §6.3 ${name}: "${item}" has no (EN / AR) label, as its other values do`);
      const [, value = "", en = "", ar = ""] = labelled;
      rows.push({ key: `enum.${name}.${value}`, en: en.trim(), ar: ar.trim() });
    }
  }
  if (enums === 0) throw new Error("SRS §6.3 has no enum table: its heading or table has changed");
  if (unnamed.size > 0) {
    throw new Error(`SRS §6.3 has no enum ${[...unnamed].join(", ")}, listed as one the interface never names`);
  }
  return rows;
}

/** The catalog of messages given in order, nested by dot. A key given twice, or as both a message and the start of other keys, stops it. */
export function nest(messages: Array<[key: string, text: string]>): MessageTree {
  const root: MessageTree = {};
  for (const [key, text] of messages) {
    const names = key.split(".");
    let node = root;
    for (const [index, name] of names.entries()) {
      const path = names.slice(0, index + 1).join(".");
      // Only the tree's own keys: a key such as valueOf isn't taken from Object.prototype
      const existing = Object.hasOwn(node, name) ? node[name] : undefined;
      if (index === names.length - 1) {
        if (existing !== undefined) {
          throw new Error(typeof existing === "string" ? `${key} is given twice` : `${key} also starts other keys`);
        }
        node[name] = text;
      } else if (typeof existing === "string") {
        throw new Error(`${path} is a message and also starts ${key}`);
      } else {
        const child: MessageTree = existing ?? {};
        node[name] = child;
        node = child;
      }
    }
  }
  return root;
}

/** Both catalogs, the deck's messages first and the enum labels after, or every problem found */
export function buildCatalogs(
  deck: DeckRow[],
  enums: DeckRow[],
): { catalogs: Record<Locale, MessageTree> } | { problems: string[] } {
  const problems: string[] = [];
  const messages: Record<Locale, Array<[string, string]>> = { en: [], ar: [] };
  for (const row of [...deck, ...enums]) {
    for (const locale of ["en", "ar"] as const) {
      try {
        messages[locale].push([row.key, messageText(row[locale], locale)]);
      } catch (error) {
        problems.push(`${row.key} (${locale}): ${errorMessage(error)}`);
      }
    }
  }
  if (problems.length > 0) return { problems };
  try {
    return { catalogs: { en: nest(messages.en), ar: nest(messages.ar) } };
  } catch (error) {
    return { problems: [errorMessage(error)] };
  }
}

/** A catalog's file as the generator writes it: JSON indented by two, keys in the order built, then a newline */
export const catalogJson = (tree: MessageTree) => `${JSON.stringify(tree, null, 2)}\n`;
