// Lists the copy deck's keys (DESIGN §9.2 and §9.3) in scripts/i18n-deck-keys.json, which
// check:i18n requires in both catalogs. CI never reads the private specification, so the list is
// committed: pnpm i18n:messages runs this after it writes the catalogs, so a run that stops writes
// neither. It stops on a duplicate key, and on a key that also starts other keys, which a catalog
// can't hold.
//
// Usage: pnpm i18n:deck-keys (private repository only: it reads docs/)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deckRows, namespaceClashes } from "./checks/deck.ts";
import { ROOT, shown } from "./checks/files.ts";

const DESIGN_SPEC = path.join(ROOT, "docs/03-DESIGN-SPEC.md");
const OUT = path.join(ROOT, "scripts/i18n-deck-keys.json");

if (!existsSync(DESIGN_SPEC)) {
  console.error(
    "i18n:deck-keys needs the private specification (docs/03-DESIGN-SPEC.md). scripts/i18n-deck-keys.json is committed; regenerate it in the private repository (D-035).",
  );
  process.exit(1);
}

const keys = deckRows(readFileSync(DESIGN_SPEC, "utf8")).map((row) => row.key);
const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
if (duplicates.length > 0) throw new Error(`The deck lists these keys twice: ${[...new Set(duplicates)].join(", ")}`);
const clashes = namespaceClashes(keys);
if (clashes.length > 0) {
  throw new Error(`These deck keys also start other keys, which a catalog can't hold: ${clashes.join(", ")}`);
}

const list = {
  $comment:
    "The copy deck's keys (DESIGN §9.2 and §9.3), required in both catalogs by check:i18n. Written by pnpm i18n:deck-keys.",
  keys: keys.toSorted(),
};
writeFileSync(OUT, `${JSON.stringify(list, null, 2)}\n`);
console.log(`${keys.length} deck keys in ${shown(OUT)}`);
