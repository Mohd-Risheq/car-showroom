import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { type Catalog, catalogProblems, type Locale, readCatalog } from "../../../scripts/checks/i18n.ts";

// check:i18n's rules (NFR-I18N-01, NFR-I18N-03, BR-02, DESIGN §9.2), then pnpm check:i18n on the planted
// and clean fixtures in tests/fixtures/checks/i18n

const AR_COUNT =
  "{count, plural, zero {لا سيارات} one {سيارة} two {سيارتان} few {# سيارات} many {# سيارة} other {# سيارة}}";

function catalog(locale: Locale, messages: Record<string, unknown>): Catalog {
  return readCatalog(`messages/${locale}.json`, locale, messages).catalog;
}
const problems = (en: Record<string, unknown>, ar: Record<string, unknown>, deck: string[] = []) =>
  catalogProblems({ en: catalog("en", en), ar: catalog("ar", ar) }, deck);

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
      "<b>{kind, select, suv {{count, plural, one {# SUV} other {# SUVs}}} other {{count, selectordinal, other {#th}}}}</b>";
    const arabic = `<b>{kind, select, suv {${AR_COUNT}} other {{count, selectordinal, other {#}}}}</b>`;
    expect(problems({ a: nested }, { a: arabic })).toStrictEqual([
      "messages/en.json: a: the plural of {count} has no one, two and few form (NFR-I18N-03)",
    ]);
  });

  it("finds a plural inside another plural's form", () => {
    const inner = "{b, plural, one {#} other {#}}";
    expect(
      problems(
        { a: `{a, plural, one {${inner}} other {x}}` },
        { a: `{a, plural, zero {x} one {${inner}} two {x} few {x} many {x} other {x}}` },
      ),
    ).toStrictEqual(["messages/ar.json: a: the plural of {b} has no zero, two, few and many form (NFR-I18N-03)"]);
  });

  it("refuses a form the language never selects, where an exact value was meant", () => {
    expect(
      problems({ a: "{count, plural, zero {No cars} one {# car} other {# cars}}" }, { a: AR_COUNT }),
    ).toStrictEqual([
      "messages/en.json: a: the plural of {count} has a zero form, which English never selects (an exact value is written =n)",
    ]);
    expect(
      problems(
        { a: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" },
        { a: "{n, selectordinal, one {الأول} other {رقم #}}" },
      ),
    ).toStrictEqual([
      "messages/ar.json: a: the plural of {n} has a one form, which Arabic never selects (an exact value is written =n)",
    ]);
  });

  it("wants a plural in Arabic wherever English counts with one, and not the reverse", () => {
    const english = { a: "{count, plural, one {# car} other {# cars}}" };
    const line = "messages/ar.json: a: {count} has no plural, though messages/en.json counts it with one (NFR-I18N-03)";
    expect(problems(english, { a: "{count} سيارة" })).toStrictEqual([line]);
    // Inside a select, # is text
    expect(problems(english, { a: "{count, select, other {# سيارة}}" })).toStrictEqual([line]);
    expect(problems({ a: "Compare {count, number} cars" }, { a: `مقارنة ${AR_COUNT}` })).toStrictEqual([]);
  });

  it("refuses a number a plural counts printed as plain text, which ICU doesn't group (BR-02)", () => {
    const line = (locale: string, key: string, name: string) =>
      `messages/${locale}.json: ${key}: prints {${name}}, a number a plural counts, as plain text, which ICU doesn't group: write {${name}, number} (BR-02)`;
    expect(
      problems(
        {
          a: "Compare {count} cars",
          b: "{n, plural, one {# car} other {# cars}} of {n}",
          c: "Compare {count, number} cars",
          d: "{count, plural, one {# car} other {# cars}}",
          e: "{kind, select, new {{count} new cars} other {{count} cars}}",
        },
        {
          a: `مقارنة ${AR_COUNT}`,
          b: `${AR_COUNT.replaceAll("count", "n")} من {n}`,
          c: `مقارنة ${AR_COUNT}`,
          d: "{count} سيارة",
          e: `{kind, select, other {${AR_COUNT}}}`,
        },
      ),
    ).toStrictEqual([
      // Arabic without the plural English has is one problem, not two
      "messages/ar.json: d: {count} has no plural, though messages/en.json counts it with one (NFR-I18N-03)",
      line("en", "a", "count"),
      line("en", "b", "n"),
      line("ar", "b", "n"),
      line("en", "e", "count"),
    ]);
    // Where Arabic both counts and formats it, the plural is the reason given
    expect(
      problems(
        { a: "{n, plural, one {# car} other {# cars}} of {n}" },
        { a: `${AR_COUNT.replaceAll("count", "n")} من {n, number}` },
      ),
    ).toStrictEqual([line("en", "a", "n")]);
  });

  it("refuses a number the other language formats, printed as plain text (BR-02)", () => {
    expect(
      problems(
        {
          a: "Between {min, number} and {max, number}",
          b: "Up to {max} MB",
          c: "Between {min, number} and {max, number}",
          d: "Since {year}",
        },
        {
          a: "بين {min} و{max, number}",
          b: "حتى {max, number} ميغابايت",
          c: "بين {min, number} و{max, number}",
          d: "منذ {year}",
        },
      ),
    ).toStrictEqual([
      "messages/ar.json: a: prints {min}, a number messages/en.json formats, as plain text, which ICU doesn't group: write {min, number} (BR-02)",
      "messages/en.json: b: prints {max}, a number messages/ar.json formats, as plain text, which ICU doesn't group: write {max, number} (BR-02)",
    ]);
  });

  it("refuses ICU syntax the parser keeps as text: a quoted placeholder and a self-closing tag", () => {
    expect(
      problems(
        { a: "Results for '{query}'", b: "Line<br/>break", c: "Cars < 5 km" },
        { a: "نتائج '{query}'", b: "سطر<br/>جديد", c: "سيارات < 5 كم" },
      ),
    ).toStrictEqual([
      "messages/en.json: a: keeps ICU syntax as text, which shows as written: Results for {query}",
      "messages/en.json: b: keeps ICU syntax as text, which shows as written: <br/>",
      "messages/ar.json: a: keeps ICU syntax as text, which shows as written: نتائج {query}",
      "messages/ar.json: b: keeps ICU syntax as text, which shows as written: <br/>",
    ]);
  });

  it("looks inside a tag for syntax kept as text and for a number printed plain", () => {
    expect(
      problems(
        { a: "Compare <b>{count}</b> cars", b: "<b>Results for '{query}'</b>" },
        { a: `مقارنة <b>${AR_COUNT}</b>`, b: "<b>نتائج '{query}'</b>" },
      ),
    ).toStrictEqual([
      "messages/en.json: b: keeps ICU syntax as text, which shows as written: Results for {query}",
      "messages/ar.json: b: keeps ICU syntax as text, which shows as written: نتائج {query}",
      "messages/en.json: a: prints {count}, a number a plural counts, as plain text, which ICU doesn't group: write {count, number} (BR-02)",
    ]);
  });

  it("wants the same placeholders and tags in both languages, looking in every branch", () => {
    expect(
      problems(
        { a: "{price} JOD on <b>{date}</b>", b: "{n, plural, one {# car from {city}} other {# cars}}" },
        { a: "{price} د.أ", b: `{n, select, other {${AR_COUNT}}} {city}` },
      ),
    ).toStrictEqual([
      "messages/ar.json: a: lacks <b> and {date}, which messages/en.json has",
      "messages/en.json: b: lacks {count}, which messages/ar.json has",
      "messages/ar.json: b: {n} has no plural, though messages/en.json counts it with one (NFR-I18N-03)",
    ]);
  });

  it("takes a plural's # as printing its number, and a number argument as matching it", () => {
    expect(
      problems(
        { a: "{count, plural, one {# car} other {# cars}}" },
        { a: "{count, plural, zero {لا سيارات} one {سيارة} two {سيارتان} few {سيارات} many {سيارة} other {سيارة}}" },
      ),
    ).toStrictEqual(["messages/ar.json: a: lacks {count}, which messages/en.json has"]);
    // A tag inside a form passes the plural's number on to its #
    expect(
      problems(
        { a: "{count, plural, one {<b>#</b> car} other {<b>#</b> cars}}" },
        {
          a: "{count, plural, zero {<b>x</b>} one {<b>x</b>} two {<b>x</b>} few {<b>x</b>} many {<b>x</b>} other {<b>x</b>}}",
        },
      ),
    ).toStrictEqual(["messages/ar.json: a: lacks {count}, which messages/en.json has"]);
    expect(problems({ a: "Compare {count, number} cars" }, { a: `مقارنة ${AR_COUNT}` })).toStrictEqual([]);
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
      "messages/en.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck)",
      "messages/ar.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck)",
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
      `${planted}/en.json: inventory.none: the plural of {count} has a zero form, which English never selects (an exact value is written =n)`,
      `${planted}/en.json: search.results: keeps ICU syntax as text, which shows as written: Results for {query}`,
      `${planted}/ar.json: common.cancel: starts with "(", as the deck's notes do (DESIGN §9.2)`,
      `${planted}/ar.json: inventory.count: the plural of {count} has no zero, two, few and many form (NFR-I18N-03)`,
      `${planted}/ar.json: search.results: keeps ICU syntax as text, which shows as written: نتائج {query}`,
      `${planted}/ar.json: contact.viewing.template: lacks {title}, which ${planted}/en.json has`,
      `${planted}/ar.json: inventory.saved: lacks {count}, which ${planted}/en.json has`,
      `${planted}/ar.json: inventory.found: {count} has no plural, though ${planted}/en.json counts it with one (NFR-I18N-03)`,
      `${planted}/en.json: inventory.compare: prints {count}, a number a plural counts, as plain text, which ICU doesn't group: write {count, number} (BR-02)`,
      `${planted}/ar.json: search.radius: prints {km}, a number ${planted}/en.json formats, as plain text, which ICU doesn't group: write {km, number} (BR-02)`,
      `${planted}/en.json: common.retry: in the copy deck (DESIGN §9.2 and §9.3) but missing here`,
      `${planted}/ar.json: common.retry: in the copy deck (DESIGN §9.2 and §9.3) but missing here`,
      `${planted}/en.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck)`,
      `${planted}/ar.json: contact.viewing: a deck key, but here it holds other keys, and a key can't be both (rename it in the deck)`,
    ]);
  });

  it("passes the clean fixture", () => {
    const result = run("tests/fixtures/checks/i18n/clean");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("check:i18n: 7 messages in each catalog, every deck key present\n");
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
