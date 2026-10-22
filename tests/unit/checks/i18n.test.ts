import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { type Catalog, catalogProblems, readCatalog } from "../../../scripts/checks/i18n.ts";

// check:i18n's rules (NFR-I18N-01, NFR-I18N-03, DESIGN §9.2), then pnpm check:i18n on the planted
// and clean fixtures in tests/fixtures/checks/i18n

const AR_COUNT =
  "{count, plural, zero {لا سيارات} one {سيارة} two {سيارتان} few {# سيارات} many {# سيارة} other {# سيارة}}";

function catalog(locale: "en" | "ar", messages: Record<string, unknown>): Catalog {
  return readCatalog(`messages/${locale}.json`, locale, messages).catalog;
}
const problems = (en: Record<string, unknown>, ar: Record<string, unknown>, deck: string[] = []) =>
  catalogProblems([catalog("en", en), catalog("ar", ar)], deck);

describe("readCatalog", () => {
  it("gives nested messages their dotted keys, and knows the groups", () => {
    const { catalog: read, problems: found } = readCatalog("messages/en.json", "en", {
      common: { close: "Close", nav: { cars: "Cars" } },
      title: "Muftah",
    });
    expect([...read.messages]).toStrictEqual([
      ["common.close", "Close"],
      ["common.nav.cars", "Cars"],
      ["title", "Muftah"],
    ]);
    expect([...read.namespaces]).toStrictEqual(["common", "common.nav"]);
    expect(found).toStrictEqual([]);
  });

  it("refuses values that aren't messages, and keys with a dot", () => {
    const { problems: found } = readCatalog("messages/en.json", "en", {
      common: { count: 3, list: ["a"], none: null, "a.b": "x" },
    });
    expect(found).toStrictEqual([
      "messages/en.json: common.count: a message must be text, not 3",
      'messages/en.json: common.list: a message must be text, not ["a"]',
      "messages/en.json: common.none: a message must be text, not null",
      "messages/en.json: common.a.b: next-intl nests keys by dot, so a key can't hold one",
    ]);
  });
});

describe("catalogProblems", () => {
  it("passes matching catalogs with every plural form", () => {
    expect(
      problems(
        { inventory: { count: "{count, plural, one {# car} other {# cars}}" } },
        { inventory: { count: AR_COUNT } },
      ),
    ).toStrictEqual([]);
  });

  it("names each key one catalog lacks (NFR-I18N-01)", () => {
    expect(problems({ a: "A", b: "B" }, { a: "أ", c: "ج" })).toStrictEqual([
      "messages/ar.json: b: missing, though messages/en.json has it (NFR-I18N-01)",
      "messages/en.json: c: missing, though messages/ar.json has it (NFR-I18N-01)",
    ]);
  });

  it("names a message that isn't valid ICU", () => {
    expect(problems({ a: "{count, plural, one {# car}}" }, { a: "{title" })).toStrictEqual([
      "messages/en.json: a: not valid ICU (MISSING_OTHER_CLAUSE)",
      "messages/ar.json: a: not valid ICU (EXPECT_ARGUMENT_CLOSING_BRACE)",
    ]);
  });

  it("wants all six Arabic forms and both English ones, exact matches aside (NFR-I18N-03)", () => {
    expect(
      problems(
        { a: "{n, plural, =1 {just one} other {# cars}}" },
        { a: "{n, plural, =0 {none} one {one} other {# cars}}" },
      ),
    ).toStrictEqual([
      "messages/en.json: a: the plural of {n} has no one form (NFR-I18N-03)",
      "messages/ar.json: a: the plural of {n} has no zero, two, few and many form (NFR-I18N-03)",
    ]);
  });

  it("finds plurals inside selects and tags, and holds ordinals to their own forms", () => {
    const nested =
      "<b>{kind, select, suv {{n, plural, one {# SUV} other {# SUVs}}} other {{n, selectordinal, other {#th}}}}</b>";
    expect(
      problems({ a: nested }, { a: `<b>{kind, select, suv {${AR_COUNT}} other {{n, selectordinal, other {#}}}}</b>` }),
    ).toStrictEqual(["messages/en.json: a: the plural of {n} has no one, two and few form (NFR-I18N-03)"]);
  });

  it("refuses the deck's note markers", () => {
    expect(problems({ a: "Save†", b: "Price (negotiable)" }, { a: "(حفظ)", b: "السعر (قابل للتفاوض)" })).toStrictEqual([
      "messages/en.json: a: holds the deck's note marker † (DESIGN §9.2)",
      'messages/ar.json: a: starts with "(", as the deck\'s notes do (DESIGN §9.2)',
    ]);
  });

  it("wants every deck key in both catalogs, and names one that is a group there", () => {
    expect(
      problems({ contact: { viewing: { template: "Hi" } } }, { contact: { viewing: { template: "مرحبًا" } } }, [
        "common.close",
        "contact.viewing",
        "contact.viewing.template",
      ]),
    ).toStrictEqual([
      "messages/en.json: common.close: in the copy deck (DESIGN §9.2 and §9.3) but missing here",
      "messages/ar.json: common.close: in the copy deck (DESIGN §9.2 and §9.3) but missing here",
      "messages/en.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck, T-14)",
      "messages/ar.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck, T-14)",
    ]);
  });
});

describe("pnpm check:i18n", () => {
  const run = (folder: string, deck = "tests/fixtures/checks/i18n/deck-keys.json") =>
    spawnSync(process.execPath, ["scripts/check-i18n.ts", folder, "--deck", deck], { encoding: "utf8" });
  const planted = "tests/fixtures/checks/i18n/planted";

  it("fails on the planted problems, naming each file, key and rule", () => {
    const result = run(planted);
    expect(result.status).toBe(1);
    expect(result.stderr.trim().split("\n")).toStrictEqual([
      `${planted}/en.json: common.count: a message must be text, not 3`,
      `${planted}/en.json: common.a.b: next-intl nests keys by dot, so a key can't hold one`,
      `${planted}/ar.json: common.back: missing, though ${planted}/en.json has it (NFR-I18N-01)`,
      `${planted}/en.json: common.cancel: missing, though ${planted}/ar.json has it (NFR-I18N-01)`,
      `${planted}/en.json: common.count: missing, though ${planted}/ar.json has it (NFR-I18N-01)`,
      `${planted}/en.json: common.save: holds the deck's note marker † (DESIGN §9.2)`,
      `${planted}/en.json: inventory.count: not valid ICU (EXPECT_ARGUMENT_CLOSING_BRACE)`,
      `${planted}/ar.json: common.cancel: starts with "(", as the deck's notes do (DESIGN §9.2)`,
      `${planted}/ar.json: inventory.count: the plural of {count} has no zero, two, few and many form (NFR-I18N-03)`,
      `${planted}/en.json: common.retry: in the copy deck (DESIGN §9.2 and §9.3) but missing here`,
      `${planted}/ar.json: common.retry: in the copy deck (DESIGN §9.2 and §9.3) but missing here`,
      `${planted}/en.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck, T-14)`,
      `${planted}/ar.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck, T-14)`,
    ]);
  });

  it("passes the clean fixture", () => {
    const result = run("tests/fixtures/checks/i18n/clean");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("check:i18n: 6 messages in each catalog, every deck key present\n");
  });

  it("fails when a catalog is missing", () => {
    const empty = mkdtempSync(path.join(tmpdir(), "check-i18n-"));
    onTestFinished(() => rmSync(empty, { recursive: true, force: true }));
    const result = run(empty);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("/en.json is missing\n");
    expect(result.stderr).toContain("/ar.json is missing\n");
  });
});
