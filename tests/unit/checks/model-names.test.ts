import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seedReferenceSchema } from "@/lib/validation/seed";
import { tokenBlocks } from "@/styles/token-blocks";
import { readTypeScale, type StepTokens } from "@/styles/type-scale";
import {
  type CatalogModel,
  capOf,
  catalogProblems,
  displayBands,
  EARLY,
  MARGIN,
  measuredHexps,
  type ModelNames,
  modelNamesCss,
  modelNamesJson,
  NARROWEST_RATIO,
  type NameWidths,
  narrowRanges,
  parseModelNames,
  SCROLL_BAR,
  SIZE_ROUNDING,
  twoLinesFrom,
} from "../../../scripts/checks/model-names.ts";

// The rule that keeps a car title's model name whole and in two lines (DESIGN §3.3, D-049), fed by
// hand: the display step's bands of column to size, where a name sets in HEXP 0 and where smaller,
// and the CSS written from the measured list. The generator measures in a browser, so the last tests
// check that the committed list still holds the catalog's names and the committed CSS still follows
// from it.

const TOKENS_CSS = readFileSync("src/styles/tokens.css", "utf8");
const SCALE = readTypeScale(TOKENS_CSS);
const BANDS = displayBands(SCALE);
const HEXPS = measuredHexps(SCALE);

/** tokens.css's type scale with the display step's tokens changed */
const withDisplay = (change: Partial<StepTokens>) =>
  SCALE.map((step) => (step.id === "display" ? { ...step, ...change } : step));

/** A name whose two lines are no wider than its longest word: one word, or two */
const words = (name: string, word: number[]): NameWidths => ({ name, word, lines: word });

// Widths in ems at HEXP 0, 20, 40, 60, 80 and 100, as Chromium sets the catalog's names
const COMMANDER = words("Commander", [5.887, 6.563, 7.239, 7.916, 8.592, 9.268]);
const DISCOVERY = words("Discovery", [4.752, 5.351, 5.949, 6.547, 7.146, 7.744]);
const CHEROKEE = words("Cherokee", [4.544, 5.112, 5.679, 6.246, 6.813, 7.381]);
const PATHFINDER = words("Pathfinder", [5.01, 5.694, 6.377, 7.06, 7.744, 8.427]);
const MORNING = words("Morning", [4.018, 4.51, 5.01, 5.51, 6.01, 6.51]);
const VELAR: NameWidths = {
  name: "Range Rover Velar",
  word: [3.008, 3.348, 3.687, 4.026, 4.366, 4.705],
  lines: [5.502, 6.179, 6.857, 7.534, 8.212, 8.89],
};
// Made up: a longest word 4.838 wide, as the rule takes it, at HEXP 20, and one at HEXP 0, each just
// under the narrowest column, the 271 px a classic scroll bar leaves a 320 px phone, for the step's 56
const UNDER_AT_20 = words("Under at 20", [4.5, 4.838 / MARGIN, 5.5, 6, 6.5, 7]);
const UNDER_AT_0 = words("Under at 0", [4.838 / MARGIN, 5.5, 6, 6.5, 7, 7.5]);

/** A length as tokens.css writes one, in px on a screen so wide: rem, vw, a sum of them, or a clamp */
function pxAt(value: string, screen: number): number {
  const clamp = /^clamp\((.+), (.+), (.+)\)$/.exec(value);
  if (clamp !== null) {
    const [, least = "", ideal = "", most = ""] = clamp;
    return Math.max(pxAt(least, screen), Math.min(pxAt(ideal, screen), pxAt(most, screen)));
  }
  return value.split(" + ").reduce((sum, term) => {
    const [, number, unit] = /^([\d.]+)(rem|vw)$/.exec(term) ?? [];
    if (number === undefined) throw new Error(`Not a length the test reads: ${term}`);
    return sum + Number(number) * (unit === "rem" ? 16 : screen / 100);
  }, 0);
}

describe("displayBands", () => {
  it("reads the ratio of column to size from which the display step takes each HEXP, from a car title's model name's conditions", () => {
    // A phone's screen narrows the step below its media widths (D-038), where its column is the screen
    // less the page margin each side (px-band, globals.css). A title's model name narrows it at those
    // ratios of column to size, less a browser's rounding of the size, to four places down, so a phone
    // keeps its letters, and a classic scroll bar can't make them too wide (the owner, 2026-11-11)
    const display = SCALE.find(({ id }) => id === "display");
    const margin = tokenBlocks(TOKENS_CSS).blocks.get("@theme")?.get("--spacing-page") ?? "";
    const screens = (display?.narrower ?? [])
      .flatMap(({ at, hexp }) => {
        const rem = /^@media \(width < ([\d.]+)rem\)$/.exec(at)?.[1];
        return rem === undefined ? [] : [{ screen: Number(rem) * 16, hexp }];
      })
      .sort((a, b) => a.screen - b.screen);
    expect(screens.map(({ hexp }) => hexp)).toStrictEqual([20, 40, 60, 80]);
    const ratioAt = (screen: number) =>
      Math.floor(((screen - 2 * pxAt(margin, screen)) / pxAt(display?.size ?? "", screen) / SIZE_ROUNDING) * 1e4) / 1e4;
    const [to40, to60, to80, to100] = screens.map(({ screen }) => ratioAt(screen));
    expect(BANDS).toStrictEqual([
      { hexp: 20, from: 0 },
      { hexp: 40, from: to40 },
      { hexp: 60, from: to60 },
      { hexp: 80, from: to80 },
      { hexp: 100, from: to100 },
    ]);
    // A long name's own conditions, in the same container, aren't the step's
    expect(displayBands(readTypeScale(`${TOKENS_CSS}\n${modelNamesCss(LIST, SCALE)}`))).toStrictEqual(BANDS);
  });

  it("throws when the step has no condition on a car title's model name", () => {
    expect(() => displayBands(withDisplay({ narrower: [] }))).toThrow(
      "The display step has no condition on a car title's model name",
    );
  });
});

describe("NARROWEST_RATIO", () => {
  it("is the narrowest column for its size a title has, by tokens.css: a 320 px phone's less a classic scroll bar, or a hundred over the room share", () => {
    // A phone's column is the screen less the page margin each side, at the step's size there, and
    // from 1024 px a title's model name takes the room share of its column (D-049)
    const { blocks } = tokenBlocks(TOKENS_CSS);
    const margin = blocks.get("@theme")?.get("--spacing-page") ?? "";
    const size = SCALE.find(({ id }) => id === "display")?.size ?? "";
    const phone = (320 - 2 * pxAt(margin, 320) - SCROLL_BAR) / pxAt(size, 320);
    const share = (language: "en" | "ar") => Number(blocks.get(`[lang|="${language}"]`)?.get("--display-room-share"));
    expect(NARROWEST_RATIO).toStrictEqual({
      en: Math.min(phone, 100 / share("en")) / SIZE_ROUNDING,
      ar: Math.min(phone, 100 / share("ar")) / SIZE_ROUNDING,
    });
  });
});

describe("measuredHexps", () => {
  it("is HEXP 0, then each HEXP the display step takes, narrowest first", () => {
    expect(HEXPS).toStrictEqual([0, 20, 40, 60, 80, 100]);
  });
});

describe("narrowRanges", () => {
  const ranges = (widths: NameWidths, language: "en" | "ar" = "en") =>
    narrowRanges(widths, HEXPS, BANDS, NARROWEST_RATIO[language]);

  it("is empty for a name whose words fit the narrowest column at every HEXP", () => {
    expect(ranges(MORNING)).toStrictEqual([]);
  });

  it("covers each band where the name's longest word at the band's HEXP is wider than the column, from just below the band", () => {
    const found = ranges(DISCOVERY);
    const from = (band: number) => (BANDS[band]?.from ?? NaN) - EARLY;
    const expected = [
      { from: 0, to: 5.351 * MARGIN },
      { from: from(1), to: 5.949 * MARGIN },
      { from: from(2), to: 6.547 * MARGIN },
      { from: from(3), to: 7.146 * MARGIN },
    ];
    // At HEXP 100 it fits wherever the step takes 100
    expect(found).toHaveLength(expected.length);
    found.forEach((range, index) => {
      expect(range.from).toBeCloseTo(expected[index]?.from ?? NaN, 12);
      expect(range.to).toBeCloseTo(expected[index]?.to ?? NaN, 12);
    });
  });

  it("joins the bands' ranges where they meet", () => {
    expect(ranges(COMMANDER)).toStrictEqual([{ from: 0, to: 9.268 * MARGIN }]);
  });

  it("covers where a name's two lines would need a third, from just below where HEXP 0 holds two", () => {
    const [range, ...rest] = ranges(VELAR);
    expect(rest).toStrictEqual([]);
    // Below 5.5295 even HEXP 0 can't hold two lines, so the name takes three, and below 5.5095 it
    // keeps its letters
    expect(range?.from).toBeCloseTo(5.502 * MARGIN - EARLY, 12);
    expect(range?.to).toBeCloseTo(8.89 * MARGIN, 12);
  });

  it("covers the column a classic scroll bar leaves a 320 px phone, and leaves out a range under it", () => {
    // Cherokee's 5.112 at HEXP 20 fits a 320 px phone's 288 px at 56 px, but not the 271 px a 17 px
    // scroll bar leaves, in either language
    expect(ranges(CHEROKEE, "en")).toStrictEqual([{ from: 0, to: 5.112 * MARGIN }]);
    expect(ranges(CHEROKEE, "ar")).toStrictEqual([{ from: 0, to: 5.112 * MARGIN }]);
    // A word 4.8 wide at HEXP 20 fits even that
    expect(ranges(words("Made up", [4.4, 4.8, 5.2, 5.6, 6, 6.4]))).toStrictEqual([]);
  });

  it("keeps a range that ends under the narrowest column by less than a browser's rounding of the size", () => {
    // Firefox keeps a font size to ten significant bits, so it can set the step up to 1/1024 larger
    // than its CSS, and a title's ratio of column to size that much under the narrowest
    const [range, ...rest] = ranges(UNDER_AT_20);
    expect(rest).toStrictEqual([]);
    expect(range?.from).toBe(0);
    expect(range?.to).toBeCloseTo(4.838, 12);
  });
});

describe("twoLinesFrom", () => {
  it("is the ratio from which HEXP 0 holds a name in two lines: its widest line in two there, MARGIN wider", () => {
    expect(twoLinesFrom(VELAR, HEXPS)).toBeCloseTo(5.502 * MARGIN, 12);
    // A name of one or two words is in two lines wherever its longest word fits
    expect(twoLinesFrom(COMMANDER, HEXPS)).toBeCloseTo(5.887 * MARGIN, 12);
  });
});

describe("capOf", () => {
  it("is the longest word's width at HEXP 0 where that can be wider than the column, and null where it can't", () => {
    expect(capOf(COMMANDER, HEXPS, NARROWEST_RATIO.en)).toBeCloseTo(5.887 * MARGIN, 12);
    expect(capOf(DISCOVERY, HEXPS, NARROWEST_RATIO.en)).toBeNull();
    // Pathfinder's word at HEXP 0 is wider than the 271 px a classic scroll bar leaves a 320 px phone
    expect(capOf(PATHFINDER, HEXPS, NARROWEST_RATIO.en)).toBeCloseTo(5.01 * MARGIN, 12);
    // Range Rover Velar's two lines, which take a third instead, never set it smaller
    expect(capOf(VELAR, HEXPS, NARROWEST_RATIO.en)).toBeNull();
    // A word under the narrowest column by less than a browser's rounding of the size can be wider
    expect(capOf(UNDER_AT_0, HEXPS, NARROWEST_RATIO.ar)).toBeCloseTo(4.838, 12);
  });
});

const LIST: ModelNames = {
  hexps: HEXPS,
  models: [
    { key: "jeep-commander", en: COMMANDER, ar: words("كوماندر", [3.355, 3.89, 4.425, 4.96, 5.495, 6.03]) },
    { key: "kia-morning", en: MORNING, ar: words("مورنينج", [3, 3.3, 3.6, 3.9, 4.2, 4.5]) },
    { key: "geely-geometry-c", en: { ...DISCOVERY, name: "Geometry C" }, ar: MORNING },
    { key: "geely-geometry-e", en: { ...DISCOVERY, name: "Geometry E" }, ar: MORNING },
  ],
};

describe("modelNamesCss", () => {
  const { blocks, problems } = tokenBlocks(modelNamesCss(LIST, SCALE));
  const commander = '[data-model="jeep-commander"]:lang(en)';

  it("sets HEXP 0 under each of a name's ranges, measured in the ems of its container", () => {
    expect(problems).toStrictEqual([]);
    expect(Object.fromEntries(blocks.get(`@container model-name (width < 9.3143em) ${commander}`) ?? [])).toStrictEqual(
      { "--display-hexp": "0" },
    );
    const geometry = [...blocks.keys()].filter((block) => block.includes("geely-geometry"));
    expect(geometry).toContain(
      '@container model-name (5.8314em <= width < 5.9787em) [data-model="geely-geometry-c"]:lang(en)',
    );
  });

  it("caps a name whose longest word at HEXP 0 can be wider than its column at its column over that width", () => {
    expect(Object.fromEntries(blocks.get(commander) ?? [])).toStrictEqual({
      "--display-cap": "calc(100cqi / 5.9164)",
    });
  });

  it("gives names with the same ranges one block, and none to a name that fits", () => {
    const named = [...blocks.keys()].map((block) => block.replace(/^@container model-name \([^)]*\) /, ""));
    expect(new Set(named)).toStrictEqual(
      new Set([commander, '[data-model="geely-geometry-c"]:lang(en)', '[data-model="geely-geometry-e"]:lang(en)']),
    );
    expect(modelNamesCss(LIST, SCALE)).toMatch(
      /\/\* Geometry C and Geometry E \(geely-geometry-c, geely-geometry-e\), in English \*\/\n@container/,
    );
  });

  it("is read by the type scale as the display step's narrower HEXP, so the fonts generator gives them faces", () => {
    const display = readTypeScale(`${TOKENS_CSS}\n${modelNamesCss(LIST, SCALE)}`).find(({ id }) => id === "display");
    expect(display?.narrower.filter(({ selector }) => selector === commander)).toStrictEqual([
      { at: "@container model-name (width < 9.3143em)", selector: commander, hexp: 0 },
    ]);
  });
});

describe("modelNamesJson", () => {
  it("writes each model's key as the model its titles' data-model names, and is read back as the list", () => {
    const text = modelNamesJson(LIST);
    expect(parseModelNames(text)).toStrictEqual(LIST);
    // Not as a "key": gitleaks' generic rule reads a key set to a slug with digits as an API key
    expect(text).toContain('\n      "model": "jeep-commander",\n');
    expect(text).not.toContain('"key"');
  });
});

describe("parseModelNames", () => {
  const [commander] = LIST.models;
  const withEntry = (changes: object) =>
    JSON.stringify({
      hexps: HEXPS,
      models: [{ model: "jeep-commander", en: COMMANDER, ar: commander?.ar, ...changes }],
    });

  it("throws on a model without a width at each HEXP", () => {
    expect(() => parseModelNames(withEntry({ en: { ...COMMANDER, word: [5.887] } }))).toThrow(
      "model-names.json: jeep-commander's English widths aren't one for each HEXP",
    );
    // Its two lines' widths too, in either language
    expect(() => parseModelNames(withEntry({ ar: { ...commander?.ar, lines: [3.355] } }))).toThrow(
      "model-names.json: jeep-commander's Arabic widths aren't one for each HEXP",
    );
  });

  it("throws on a list without its HEXP, its models, or an entry's model", () => {
    expect(() => parseModelNames(JSON.stringify({ models: [] }))).toThrow("model-names.json has no HEXP list");
    expect(() => parseModelNames(JSON.stringify({ hexps: HEXPS }))).toThrow("model-names.json has no models");
    expect(() => parseModelNames(withEntry({ model: undefined }))).toThrow(
      "model-names.json has an entry that names no model",
    );
  });
});

describe("catalogProblems", () => {
  const catalog: CatalogModel[] = [
    { key: "jeep-commander", nameEn: "Commander", nameAr: "كوماندر" },
    { key: "kia-morning", nameEn: "Morning", nameAr: "مورنينج" },
    { key: "geely-geometry-c", nameEn: "Geometry C", nameAr: "Morning" },
    { key: "geely-geometry-e", nameEn: "Geometry E", nameAr: "Morning" },
  ];

  it("finds nothing when the list measured every model's names, at the display step's HEXP", () => {
    expect(catalogProblems(LIST, catalog, SCALE)).toStrictEqual([]);
  });

  it("names a model added, renamed or taken out since the list was measured", () => {
    const changed: CatalogModel[] = [
      { key: "jeep-commander", nameEn: "Commander", nameAr: "كوماندر" },
      { key: "kia-morning", nameEn: "Morning", nameAr: "مورنينغ" },
      { key: "geely-geometry-c", nameEn: "Geometry C", nameAr: "Morning" },
      { key: "byd-dolphin", nameEn: "Dolphin", nameAr: "دولفين" },
    ];
    expect(catalogProblems(LIST, changed, SCALE)).toStrictEqual([
      "kia-morning's Arabic name is مورنينغ in seed/reference.json, but model-names.json measured مورنينج",
      "byd-dolphin isn't in model-names.json",
      "model-names.json measures geely-geometry-e, which seed/reference.json doesn't have",
    ]);
  });

  it("names a list measured at other HEXP than the display step takes", () => {
    expect(catalogProblems({ ...LIST, hexps: [0, 20, 40, 60, 80] }, catalog, SCALE)).toStrictEqual([
      "model-names.json was measured at HEXP 0, 20, 40, 60 and 80, but the display step takes 0, 20, 40, 60, 80 and 100",
    ]);
  });
});

describe("src/styles/model-names.json and model-names.css", () => {
  const stale = "run pnpm fonts:fallbacks with the app running";
  const list = () => parseModelNames(readFileSync("src/styles/model-names.json", "utf8"));

  it("measured every model of the catalog, by the names it has in both languages", () => {
    const { models: catalog } = seedReferenceSchema.parse(JSON.parse(readFileSync("seed/reference.json", "utf8")));
    expect(catalogProblems(list(), catalog, SCALE), stale).toStrictEqual([]);
  });

  it("is the list's own text, and the CSS the list gives", () => {
    expect(readFileSync("src/styles/model-names.json", "utf8"), stale).toBe(modelNamesJson(list()));
    expect(readFileSync("src/styles/model-names.css", "utf8"), stale).toBe(modelNamesCss(list(), SCALE));
  });

  it("sets the catalog's long names in HEXP 0, and smaller Commander and Highlander, and others a scroll bar narrows", () => {
    const { blocks } = tokenBlocks(readFileSync("src/styles/model-names.css", "utf8"));
    const named = (property: string) =>
      [
        ...new Set(
          [...blocks]
            .filter(([, tokens]) => tokens.has(property))
            .map(([block]) => /\[data-model="([^"]+)"\]:lang\((\w+)\)$/.exec(block)?.slice(1).join(" ")),
        ),
      ].sort();
    // Silverado, the Cherokees, Gladiator, Wrangler, Sportage, Defender and the Geometrys in Arabic
    // only below a 320 px phone's ratio, where a classic scroll bar narrows its column
    expect(named("--display-hexp")).toStrictEqual([
      "chevrolet-silverado en",
      "chevrolet-trailblazer en",
      "geely-geometry-c ar",
      "geely-geometry-c en",
      "geely-geometry-e ar",
      "geely-geometry-e en",
      "jeep-cherokee en",
      "jeep-commander en",
      "jeep-gladiator en",
      "jeep-grand-cherokee en",
      "jeep-wrangler en",
      "kia-sportage en",
      "land-rover-defender en",
      "land-rover-discovery ar",
      "land-rover-discovery en",
      "land-rover-range-rover-evoque ar",
      "land-rover-range-rover-evoque en",
      "land-rover-range-rover-sport ar",
      "land-rover-range-rover-sport en",
      "land-rover-range-rover-velar ar",
      "land-rover-range-rover-velar en",
      "mitsubishi-outlander en",
      "nissan-pathfinder en",
      "toyota-highlander en",
    ]);
    // Pathfinder, Trailblazer and Discovery in Arabic set smaller only there too
    expect(named("--display-cap")).toStrictEqual([
      "chevrolet-trailblazer en",
      "jeep-commander en",
      "land-rover-discovery ar",
      "nissan-pathfinder en",
      "toyota-highlander en",
    ]);
  });
});
