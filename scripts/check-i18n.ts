// pnpm check:i18n: the message catalogs against NFR-I18N-01, NFR-I18N-03 and the copy deck (DESIGN
// §9.2 and §9.3): the same keys in both, valid ICU, every plural form each language needs, every
// deck key present and no deck note markers. Each problem names its file, key and rule, and the
// check exits 1. The deck's keys come from scripts/i18n-deck-keys.json, since CI never reads the
// private specification (pnpm i18n:deck-keys writes it).
//
// Usage: pnpm check:i18n [folder with en.json and ar.json] [--deck keys.json]
import path from "node:path";
import { parseArgs } from "node:util";
import { parseDeckKeys } from "./checks/deck.ts";
import { readJson, ROOT, shown } from "./checks/files.ts";
import { type Catalog, catalogProblems, type Locale, readCatalog } from "./checks/i18n.ts";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { deck: { type: "string" } } });
const folder = positionals[0] ?? path.join(ROOT, "messages");
const deckFile = values.deck ?? path.join(ROOT, "scripts/i18n-deck-keys.json");

/** The deck's keys, or the one problem that keeps them from being read */
function loadDeck(): string[] | string {
  const read = readJson(deckFile);
  return "problem" in read ? read.problem : parseDeckKeys(read.json, shown(deckFile));
}

/** A catalog, or the one problem that keeps it from being read */
function load(locale: Locale): { catalog: Catalog; problems: string[] } | string {
  const file = path.join(folder, `${locale}.json`);
  const read = readJson(file);
  return "problem" in read ? read.problem : readCatalog(shown(file), locale, read.json);
}

function check(): { problems: string[]; messages: number } {
  const deck = loadDeck();
  const en = load("en");
  const ar = load("ar");
  if (typeof deck === "string" || typeof en === "string" || typeof ar === "string") {
    return { problems: [deck, en, ar].filter((result) => typeof result === "string"), messages: 0 };
  }
  const problems = [...en.problems, ...ar.problems, ...catalogProblems([en.catalog, ar.catalog], deck)];
  return { problems, messages: en.catalog.messages.size };
}

const { problems, messages } = check();
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exitCode = 1;
else console.log(`check:i18n: ${messages} messages in each catalog, every deck key present`);
