import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deckRows, namespaceClashes, parseDeckKeys } from "../../../scripts/checks/deck.ts";

// The copy deck's rows (DESIGN §9.2 and §9.3) and the committed key list check:i18n reads

const DESIGN_SPEC = new URL("../../../docs/03-DESIGN-SPEC.md", import.meta.url);
const KEY_LIST = new URL("../../../scripts/i18n-deck-keys.json", import.meta.url);

describe("deckRows", () => {
  const markdown = [
    "### 9.1 Voice and tone",
    "| Key | EN | AR |",
    "|---|---|---|",
    "| `voice.example` | Not a deck row | ليس من الجدول |",
    "### 9.2 Copy deck",
    "**Shell**",
    "",
    "| Key | EN | AR |",
    "|---|---|---|",
    "| `common.skip` | Skip to content | الانتقال إلى المحتوى |",
    "| `common.or` | This \\| that | هذا \\| ذاك |",
    "#### A smaller heading inside the deck",
    "| Key | EN | AR |",
    "|:--|:--|:--|",
    "| `contact.viewing.template` | Hello {title} | مرحبًا {title}",
    "",
    "| Name | Value |",
    "|---|---|",
    "| `not.a.key` | from another table |",
    "### 9.3 Message templates",
    "| Key | EN | AR |",
    "|---|---|---|",
    "| `family.text` | What do you think? | شو رأيكم؟ |",
    "### 9.4 Arabic typography",
    "| Key | EN | AR |",
    "|---|---|---|",
    "| `after.deck` | Not a deck row | ليس من الجدول |",
  ].join("\n");

  it("reads the Key, EN and AR tables under §9.2 and §9.3 only", () => {
    expect(deckRows(markdown)).toStrictEqual([
      { key: "common.skip", en: "Skip to content", ar: "الانتقال إلى المحتوى" },
      { key: "common.or", en: "This | that", ar: "هذا | ذاك" },
      { key: "contact.viewing.template", en: "Hello {title}", ar: "مرحبًا {title}" },
      { key: "family.text", en: "What do you think?", ar: "شو رأيكم؟" },
    ]);
  });

  it("stops at a row it can't read, naming its line", () => {
    const broken = ["### 9.2 Copy deck", "| Key | EN | AR |", "|---|---|---|", "| common skip | Skip | تخطي |"].join(
      "\n",
    );
    expect(() => deckRows(broken)).toThrow("line 4 is not a deck row: | common skip | Skip | تخطي |");
  });
});

describe("namespaceClashes", () => {
  it("names keys that also start other keys", () => {
    expect(
      namespaceClashes(["contact.viewing", "contact.viewing.template", "common.close", "common.closeAll"]),
    ).toStrictEqual(["contact.viewing"]);
  });
});

describe("parseDeckKeys", () => {
  it("gives the keys of a list, and names a list of another shape", () => {
    expect(parseDeckKeys({ $comment: "Written by pnpm i18n:deck-keys", keys: ["a.b"] }, "keys.json")).toStrictEqual([
      "a.b",
    ]);
    expect(parseDeckKeys({ keys: "a.b" }, "keys.json")).toMatch(/^keys\.json is not a list of deck keys:\n/);
  });
});

describe("scripts/i18n-deck-keys.json", () => {
  const keys = parseDeckKeys(JSON.parse(readFileSync(KEY_LIST, "utf8")), "scripts/i18n-deck-keys.json");
  if (typeof keys === "string") throw new Error(keys);

  it("lists each key once, sorted", () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toStrictEqual(keys.toSorted());
  });

  // The specification is private, so only the private repository can compare (D-035)
  it.skipIf(!existsSync(DESIGN_SPEC))("matches the copy deck in DESIGN §9.2 and §9.3", () => {
    const deck = deckRows(readFileSync(DESIGN_SPEC, "utf8")).map((row) => row.key);
    expect(keys).toStrictEqual(deck.toSorted());
  });
});
