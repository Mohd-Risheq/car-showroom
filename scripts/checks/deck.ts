// The copy deck (DESIGN §9.2 and §9.3): the rows of each | Key | EN | AR | table under those two
// headings. scripts/deck-keys.ts lists their keys for check:i18n, and T-14 turns the rows into
// the message catalogs.
import { z } from "zod";

export type DeckRow = { key: string; en: string; ar: string };

const keyListSchema = z.object({ keys: z.array(z.string()) });

/** The keys of the committed list (scripts/i18n-deck-keys.json), or why the list can't be read */
export function parseDeckKeys(json: unknown, file: string): string[] | string {
  const parsed = keyListSchema.safeParse(json);
  return parsed.success ? parsed.data.keys : `${file} is not a list of deck keys:\n${z.prettifyError(parsed.error)}`;
}

const DECK_SECTIONS = ["### 9.2 ", "### 9.3 "];
const HEADER = /^\|\s*Key\s*\|\s*EN\s*\|\s*AR\s*\|\s*$/;
const DIVIDER = /^\|[\s|:-]+$/;
const KEY = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;

/** The deck's rows in the order the specification gives them. A row it can't read stops it. */
export function deckRows(markdown: string): DeckRow[] {
  const rows: DeckRow[] = [];
  let inDeck = false;
  let inTable = false;
  for (const [index, line] of markdown.split("\n").entries()) {
    const heading = /^(#{1,3}) /.exec(line);
    if (heading) {
      inDeck = DECK_SECTIONS.some((section) => line.startsWith(section));
      inTable = false;
    } else if (!line.startsWith("|")) {
      inTable = false;
    } else if (inDeck && HEADER.test(line)) {
      inTable = true;
    } else if (inTable && !DIVIDER.test(line)) {
      // Cells split on pipes that aren't escaped; a row may lack its closing pipe
      const [key = "", en = "", ar = ""] = line
        .split(/(?<!\\)\|/)
        .slice(1)
        .map((cell) => cell.trim().replaceAll("\\|", "|"));
      const bare = key.replace(/^`(.*)`$/, "$1");
      if (!KEY.test(bare) || !en || !ar) throw new Error(`line ${index + 1} is not a deck row: ${line}`);
      rows.push({ key: bare, en, ar });
    }
  }
  return rows;
}

/** Keys that are also the start of other keys: a catalog can't hold both, since keys nest by dot */
export function namespaceClashes(keys: string[]): string[] {
  return keys.filter((key) => keys.some((other) => other.startsWith(`${key}.`)));
}
