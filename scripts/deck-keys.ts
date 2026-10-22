// Lists the copy deck's keys (DESIGN §9.2 and §9.3) in scripts/i18n-deck-keys.json, which
// check:i18n requires in both catalogs. CI never reads the private specification, so the list is
// committed: run this again whenever the deck changes. It stops on a duplicate key, and warns
// about keys that are also the start of other keys, which the catalogs can't hold until the deck
// renames them (T-14).
//
// Usage: pnpm i18n:deck-keys (private repository only: it reads docs/)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deckRows, namespaceClashes } from "./checks/deck.ts";
import { ROOT, shown } from "./checks/files.ts";

const DESIGN_SPEC = path.join(ROOT, "docs/03-DESIGN-SPEC.md");
const OUT = path.join(ROOT, "scripts/i18n-deck-keys.json");

const keys = deckRows(readFileSync(DESIGN_SPEC, "utf8")).map((row) => row.key);
const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
if (duplicates.length > 0) throw new Error(`The deck lists these keys twice: ${[...new Set(duplicates)].join(", ")}`);
for (const key of namespaceClashes(keys)) {
  console.warn(`${key}: a deck key and also the start of other deck keys, which a catalog can't hold (T-14)`);
}

const list = {
  $comment:
    "The copy deck's keys (DESIGN §9.2 and §9.3), required in both catalogs by check:i18n. Written by pnpm i18n:deck-keys.",
  keys: keys.toSorted(),
};
writeFileSync(OUT, `${JSON.stringify(list, null, 2)}\n`);
console.log(`${keys.length} deck keys in ${shown(OUT)}`);
