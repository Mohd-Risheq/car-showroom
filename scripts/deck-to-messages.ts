// Writes the message catalogs, messages/en.json and messages/ar.json, from the copy deck (DESIGN
// §9.2 and §9.3) and the enum labels of SRS §6.3 (BUILD-PLAN T-14). Nobody edits the catalogs by
// hand: change the specification, run this and review the catalogs' diff. It writes nothing while a
// message breaks the deck's rules or check:i18n's.
//
// Usage: pnpm i18n:messages (private repository only: it reads docs/)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deckRows } from "./checks/deck.ts";
import { ROOT, shown } from "./checks/files.ts";
import { catalogProblems, type Locale, readCatalog } from "./checks/i18n.ts";
import { buildCatalogs, catalogJson, enumLabels, type MessageTree } from "./checks/messages.ts";

const DESIGN_SPEC = path.join(ROOT, "docs/03-DESIGN-SPEC.md");
const SRS = path.join(ROOT, "docs/02-SRS.md");
const file = (locale: Locale) => path.join(ROOT, "messages", `${locale}.json`);

/** Every problem with the catalogs, as check:i18n would find them once written */
function checked(catalogs: Record<Locale, MessageTree>, deckKeys: string[]): string[] {
  const en = readCatalog(shown(file("en")), "en", catalogs.en);
  const ar = readCatalog(shown(file("ar")), "ar", catalogs.ar);
  return [...en.problems, ...ar.problems, ...catalogProblems({ en: en.catalog, ar: ar.catalog }, deckKeys)];
}

if (!existsSync(DESIGN_SPEC) || !existsSync(SRS)) {
  console.error(
    "i18n:messages needs the private specification (docs/03-DESIGN-SPEC.md, docs/02-SRS.md). The catalogs and scripts/i18n-deck-keys.json are committed; regenerate them in the private repository (D-035).",
  );
  process.exit(1);
}

const deck = deckRows(readFileSync(DESIGN_SPEC, "utf8"));
const deckKeys = deck.map((row) => row.key);
const built = buildCatalogs(deck, enumLabels(readFileSync(SRS, "utf8")));
const problems = "problems" in built ? built.problems : checked(built.catalogs, deckKeys);

if ("problems" in built || problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else {
  for (const locale of ["en", "ar"] as const) {
    writeFileSync(file(locale), catalogJson(built.catalogs[locale]));
  }
  console.log(`i18n:messages: wrote ${shown(file("en"))} and ${shown(file("ar"))}`);
}
