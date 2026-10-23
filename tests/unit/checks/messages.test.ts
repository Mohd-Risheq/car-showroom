import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locales";
import { deckRows } from "../../../scripts/checks/deck.ts";
import type { Locale } from "../../../scripts/checks/i18n.ts";
import { buildCatalogs, catalogJson, enumLabels, messageText, nest } from "../../../scripts/checks/messages.ts";

// How pnpm i18n:messages turns the copy deck (DESIGN §9.2 and §9.3) and the enum labels of SRS §6.3
// into the catalogs, and that the committed catalogs are its output

const NBSP = String.fromCodePoint(0xa0);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

const DESIGN_SPEC = new URL("../../../docs/03-DESIGN-SPEC.md", import.meta.url);
const SRS = new URL("../../../docs/02-SRS.md", import.meta.url);
const catalogFile = (locale: Locale) =>
  readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8");

describe("messageText", () => {
  it("drops the deck's † marker, which ends a value, and stops on one anywhere else", () => {
    expect(messageText("شوف الفحص قبل ما تشوف السيارة †", "ar")).toBe("شوف الفحص قبل ما تشوف السيارة");
    expect(() => messageText("Built † by {author}", "en")).toThrow("† belongs at the end of a value");
  });

  it("turns ⏎ into a line break", () => {
    expect(messageText("New price: {price}.⏎{url}", "en")).toBe("New price: {price}.\n{url}");
  });

  it("joins a number, a placeholder or a plural's # to the unit after it with a no-break space", () => {
    expect(messageText("Typical is 12,000 to 25,000 km a year", "en")).toBe(
      `Typical is 12,000 to 25,000${NBSP}km a year`,
    );
    expect(messageText("larger than {max} MB", "en")).toBe(`larger than {max}${NBSP}MB`);
    expect(messageText("{n, plural, one {# day} other {# days}}", "en")).toBe(
      `{n, plural, one {#${NBSP}day} other {#${NBSP}days}}`,
    );
    expect(messageText("بين 0 و2,000 ميكرون", "ar")).toBe(`بين 0 و2,000${NBSP}ميكرون`);
    expect(messageText("{a, plural, few {# دنانير} other {# دينار}}", "ar")).toBe(
      `{a, plural, few {#${NBSP}دنانير} other {#${NBSP}دينار}}`,
    );
    expect(messageText("14,500 د.أ", "ar")).toBe(`14,500${NBSP}د.أ`);
    expect(messageText("×1000 rpm", "en")).toBe(`×1000${NBSP}rpm`);
    expect(messageText("×1000 دورة/دقيقة", "ar")).toBe(`×1000${NBSP}دورة/دقيقة`);
    // Every form a plural gives the unit
    expect(messageText("{n, plural, few {# درجات} many {# مترًا} other {# درجة}}", "ar")).toBe(
      `{n, plural, few {#${NBSP}درجات} many {#${NBSP}مترًا} other {#${NBSP}درجة}}`,
    );
  });

  it("leaves a counted noun, a unit inside a longer word and a unit with no number before it", () => {
    for (const text of ["5 photos and {count} cars", "20 kmh", "17 letters", "Prices in JOD"]) {
      expect(messageText(text, "en")).toBe(text);
    }
    expect(messageText("على بُعد متر من الماتور", "ar")).toBe("على بُعد متر من الماتور");
  });

  it("keeps a phone number's order in Arabic with a left-to-right isolate, and leaves English alone", () => {
    expect(messageText("مثل +962 7X XXX XXXX", "ar")).toBe(`مثل ${LRI}+962 7X XXX XXXX${PDI}`);
    expect(messageText("like +962 7X XXX XXXX", "en")).toBe("like +962 7X XXX XXXX");
  });

  it("stops on typographic quotes and on markdown in a cell", () => {
    expect(() => messageText("No cars match “{query}”", "en")).toThrow("typographic quotes");
    expect(() => messageText("«مرحبًا»", "ar")).toThrow("typographic quotes");
    expect(() => messageText("Run `pnpm build`", "en")).toThrow("without markdown");
  });
});

describe("enumLabels", () => {
  const srs = (rows: string[]) =>
    ["### 6.3 Enumerations", "| Enum | Values (EN label / AR label) |", "|---|---|", ...rows, "### 6.4 Next"].join(
      "\n",
    );
  const DIESEL = "| `fuel_type` | diesel (Diesel / ديزل) |";
  const STATUS = "| `media_status` | pending, ready |";

  it("keys each labelled value enum.<enum>.<value>, keeping a slash in the Arabic and a comma in brackets", () => {
    expect(
      enumLabels(
        srs([
          "| `body_type` | suv (SUV / اس يو في), sedan (Sedan / صالون / سيدان) |",
          "| `audio_source` | same_engine (Same engine type, not this car / محرك من النوع نفسه، وليس لهذه السيارة) |",
        ]),
        {},
      ),
    ).toStrictEqual([
      { key: "enum.body_type.suv", en: "SUV", ar: "اس يو في" },
      { key: "enum.body_type.sedan", en: "Sedan", ar: "صالون / سيدان" },
      {
        key: "enum.audio_source.same_engine",
        en: "Same engine type, not this car",
        ar: "محرك من النوع نفسه، وليس لهذه السيارة",
      },
    ]);
  });

  it("skips only the enums listed as never named, and stops on any other without labels", () => {
    const unlabelled = { media_status: "an upload's state on the server" };
    expect(enumLabels(srs([STATUS, DIESEL]), unlabelled)).toHaveLength(1);
    expect(() => enumLabels(srs(["| `color_family` | white, black |", DIESEL]), unlabelled)).toThrow(
      "SRS §6.3 color_family: no (EN / AR) labels, and not an enum the interface never names",
    );
    expect(() => enumLabels(srs(["| `transmission` | automatic (Automatic / أوتوماتيك), manual |"]), {})).toThrow(
      'SRS §6.3 transmission: "manual" has no (EN / AR) label, as its other values do',
    );
  });

  it("stops when the list of never-named enums no longer matches §6.3", () => {
    expect(() =>
      enumLabels(srs(["| `media_status` | pending (Pending / قيد الرفع) |"]), { media_status: "x" }),
    ).toThrow("SRS §6.3 media_status: labelled, though listed as an enum the interface never names");
    expect(() => enumLabels(srs([DIESEL]), { media_status: "x" })).toThrow(
      "SRS §6.3 has no enum media_status, listed as one the interface never names",
    );
  });

  it("reads a row without its closing pipe, and stops on a row it can't read", () => {
    expect(enumLabels(srs([DIESEL, "| `gearbox_kind` | cvt (CVT / سي في تي)"]), {})).toHaveLength(2);
    for (const row of ["| gearbox_kind | cvt (CVT / سي في تي) |", "| `gearboxKind` | cvt (CVT / سي في تي) |"]) {
      expect(() => enumLabels(srs([DIESEL, row]), {})).toThrow(`SRS §6.3 line 5 is not an enum row: ${row}`);
    }
  });

  it("reads §6.3 only, and stops when it finds no enum table there", () => {
    const outside = ["### 6.2 Other", DIESEL].join("\n");
    expect(() => enumLabels(outside, {})).toThrow("SRS §6.3 has no enum table");
  });
});

describe("nest", () => {
  // toStrictEqual ignores the order of keys, which the catalogs keep, so these compare JSON
  it("nests keys by dot in the order given", () => {
    const tree = nest([
      ["nav.home", "Home"],
      ["common.close", "Close"],
      ["nav.about", "About"],
    ]);
    expect(JSON.stringify(tree)).toBe(
      JSON.stringify({ nav: { home: "Home", about: "About" }, common: { close: "Close" } }),
    );
  });

  it("takes keys that Object.prototype also names, and leaves Object alone", () => {
    const tree = nest([
      ["common.valueOf", "Value"],
      ["common.constructor.hint", "Hint"],
    ]);
    expect(JSON.stringify(tree)).toBe(JSON.stringify({ common: { valueOf: "Value", constructor: { hint: "Hint" } } }));
    expect(Object.hasOwn(Object, "hint")).toBe(false);
  });

  it("stops on a key given twice, or that is a message and starts others, in either order", () => {
    expect(() =>
      nest([
        ["a.b", "1"],
        ["a.b", "2"],
      ]),
    ).toThrow("a.b is given twice");
    expect(() =>
      nest([
        ["locale.prompt", "1"],
        ["locale.prompt.switch", "2"],
      ]),
    ).toThrow("locale.prompt is a message and also starts locale.prompt.switch");
    expect(() =>
      nest([
        ["locale.prompt.switch", "1"],
        ["locale.prompt", "2"],
      ]),
    ).toThrow("locale.prompt also starts other keys");
  });
});

describe("buildCatalogs", () => {
  it("puts the deck before the enum labels, and lists every cell that breaks a rule", () => {
    const deck = [{ key: "home.tagline", en: "See the inspection", ar: "شوف الفحص †" }];
    const enums = [{ key: "enum.fuel_type.diesel", en: "Diesel", ar: "ديزل" }];
    // As JSON, which keeps the order of keys: the deck's home before enum, though enum sorts first
    expect(JSON.stringify(buildCatalogs(deck, enums))).toBe(
      JSON.stringify({
        catalogs: {
          en: { home: { tagline: "See the inspection" }, enum: { fuel_type: { diesel: "Diesel" } } },
          ar: { home: { tagline: "شوف الفحص" }, enum: { fuel_type: { diesel: "ديزل" } } },
        },
      }),
    );
    const broken = [{ key: "a.b", en: "“x”", ar: "† y" }];
    expect(buildCatalogs(broken, [])).toStrictEqual({
      problems: [
        "a.b (en): typographic quotes: the copy uses straight ones (DESIGN §9.4)",
        "a.b (ar): † belongs at the end of a value, after a space (DESIGN §9.2)",
      ],
    });
  });

  it("names a key that is both a message and the start of others, as a problem", () => {
    const rows = [
      { key: "a.b", en: "x", ar: "y" },
      { key: "a.b.c", en: "x", ar: "y" },
    ];
    expect(buildCatalogs(rows, [])).toStrictEqual({ problems: ["a.b is a message and also starts a.b.c"] });
  });

  // The specification is private, so only the private repository can compare (D-035)
  it.skipIf(!existsSync(DESIGN_SPEC))("built the committed catalogs from the specification as it is", () => {
    const built = buildCatalogs(deckRows(readFileSync(DESIGN_SPEC, "utf8")), enumLabels(readFileSync(SRS, "utf8")));
    if ("problems" in built) throw new Error(built.problems.join("\n"));
    // Byte for byte, so the order of keys and the layout count too
    for (const locale of LOCALES) expect(catalogFile(locale)).toBe(catalogJson(built.catalogs[locale]));
  });
});
