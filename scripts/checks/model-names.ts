import { isRecord } from "../../src/lib/validation/seed.ts";
import type { StepTokens } from "../../src/styles/type-scale.ts";
import { cssComment, inWords } from "./text.ts";

// The rule that keeps a car title's model name whole, and in two lines where its letters allow
// (DESIGN §3.3, D-049), kept apart from the browser so tests can feed it. The model name takes the
// display step's HEXP by the ratio of its column to the step's size, at every width, at the ratios
// at which a phone's screen switches the step elsewhere (tokens.css, D-038). Where that HEXP would
// make a catalog name's longest word wider than the column, or give the name a third line that
// HEXP 0 would spare it, the name sets in HEXP 0; and where even HEXP 0 is too wide for its longest
// word, it is set smaller, at its column over that word's width. The catalog is closed (ENT-Model,
// FR-31), so pnpm fonts:fallbacks measures each of its names once, into
// src/styles/model-names.json, and writes src/styles/model-names.css from the list. Each condition
// there measures the column in the ems of the step's size before a name's cap, the font size of the
// title's model-name container (tokens.css), so it holds whatever sets the column's width. Node
// loads this module from the scripts, so it names its imports by their .ts paths.

/** Readex Pro's narrowest letters: its HEXP axis runs from 0 to 100 (DESIGN §3.3) */
const NARROWEST_HEXP = 0;

/**
 * How much wider each measured width is taken: the list is measured in Chromium, and the other
 * engines set some long names a little wider, WebKit up to 0.2 % (D-049). At most about 1.008, past
 * which Highlander's capped size at 1024 px would fall under four times the body's.
 */
export const MARGIN = 1.005;

/**
 * How far below its band a range starts, about a pixel of the step's smallest size, 56 px. The
 * step's HEXP and a name's ranges are conditions on the same container, so this is a margin, for the
 * ratios each is written to and any engine's rounding of them (D-049).
 */
export const EARLY = 0.02;

/**
 * How much larger than its CSS a browser can set a font size: Firefox keeps one to ten significant
 * bits, as 79.25 px for an Arabic title's 20 % of a 395.95 px column, 79.19
 */
export const SIZE_ROUNDING = 1 + 2 ** -10;

/** The widest classic scroll bar a browser takes from a title's column, Windows' 17 px (D-049) */
export const SCROLL_BAR = 17;

/**
 * The narrowest column for its size a title has: the 288 px of a 320 px phone less a classic scroll
 * bar, for the step's 56 px, or from 1024 px a hundred over the room share (tokens.css), 19 in
 * English and 20 in Arabic, where that is narrower; each less a browser's rounding of the size.
 * tests/unit/checks/model-names.test.ts reads each from tokens.css.
 */
export const NARROWEST_RATIO = {
  en: Math.min((288 - SCROLL_BAR) / 56, 100 / 19) / SIZE_ROUNDING,
  ar: Math.min((288 - SCROLL_BAR) / 56, 100 / 20) / SIZE_ROUNDING,
} as const;

export type Language = keyof typeof NARROWEST_RATIO;
const LANGUAGES: readonly Language[] = ["en", "ar"];
const LANGUAGE_NAMES: Record<Language, string> = { en: "English", ar: "Arabic" };

/**
 * A name's widths in ems of the display step at each HEXP of its list, narrowest first: its longest
 * word, and its widest line when set in two lines as narrowly as it can be, which is its longest word
 * for a name of one or two words
 */
export type NameWidths = { name: string; word: number[]; lines: number[] };
type ModelWidths = { key: string } & Record<Language, NameWidths>;
export type ModelNames = { hexps: number[]; models: ModelWidths[] };

/** A catalog model's names, as seed/reference.json has them */
export type CatalogModel = { key: string; nameEn: string; nameAr: string };

/** The ratio of column to size from which the display step takes a HEXP */
type Band = { hexp: number; from: number };

/** Ratios of column to size, in ems of the step's size before a name's cap; 0 has no lower bound */
export type Range = { from: number; to: number };

// A car title's model name's conditions (D-049), as "@container model-name (width < 5.8514em)"
const NAME_COLUMN = /^@container model-name \(width < ([\d.]+)em\)$/;

function displayOf(scale: StepTokens[]): StepTokens {
  const display = scale.find(({ id }) => id === "display");
  if (!display) throw new Error("The type scale has no display step");
  return display;
}

/**
 * The display step's bands, narrowest first, from a car title's model name's conditions, which are
 * ratios of its column to the step's size (D-049). A long name's own, in the same container, name its
 * model rather than every element in it.
 */
export function displayBands(scale: StepTokens[]): Band[] {
  const display = displayOf(scale);
  const conditions = display.narrower
    .flatMap(({ at, selector, hexp }) => {
      const ratio = selector === "*" ? NAME_COLUMN.exec(at)?.[1] : undefined;
      return ratio === undefined ? [] : [{ ratio: Number(ratio), hexp }];
    })
    .sort((a, b) => a.ratio - b.ratio);
  if (conditions.length === 0) throw new Error("The display step has no condition on a car title's model name");
  // Below each condition's ratio the step takes its HEXP, and from it the next one's
  const bands = conditions.map(({ hexp }, index) => ({ hexp, from: conditions[index - 1]?.ratio ?? 0 }));
  return [...bands, { hexp: display.hexp, from: conditions.at(-1)?.ratio ?? 0 }];
}

/** The HEXP a list is measured at: the narrowest, then each the display step takes */
export function measuredHexps(scale: StepTokens[]): number[] {
  return [NARROWEST_HEXP, ...displayBands(scale).map(({ hexp }) => hexp)];
}

/** A width the list measured, taken MARGIN wider */
function widthAt(widths: number[], hexps: number[], hexp: number): number {
  const width = widths[hexps.indexOf(hexp)];
  if (width === undefined) throw new Error(`No width measured at HEXP ${hexp}`);
  return width * MARGIN;
}

/** Ranges sorted and joined where they meet */
function joined(ranges: Range[]): Range[] {
  return [...ranges]
    .sort((a, b) => a.from - b.from)
    .reduce<Range[]>((out, range) => {
      const last = out.at(-1);
      if (last !== undefined && range.from <= last.to) last.to = Math.max(last.to, range.to);
      else out.push({ ...range });
      return out;
    }, []);
}

/** The ratio from which HEXP 0 holds a name in two lines: below it, the name may take three */
export function twoLinesFrom(widths: NameWidths, hexps: number[]): number {
  return widthAt(widths.lines, hexps, NARROWEST_HEXP);
}

/**
 * Where a name sets in HEXP 0: in each band, from just below the band up to where its longest word
 * at the band's HEXP fits, and from just below where HEXP 0 holds it in two lines up to where the
 * band's HEXP does. A range under the narrowest column the language's title has is left out.
 */
export function narrowRanges(widths: NameWidths, hexps: number[], bands: Band[], narrowest: number): Range[] {
  const twoLines = twoLinesFrom(widths, hexps) - EARLY;
  const ranges = bands.flatMap(({ hexp, from }) => {
    const start = Math.max(from - EARLY, 0);
    return [
      { from: start, to: widthAt(widths.word, hexps, hexp) },
      { from: Math.max(start, twoLines), to: widthAt(widths.lines, hexps, hexp) },
    ];
  });
  return joined(ranges.filter(({ from, to }) => to > from)).filter(({ to }) => to > narrowest);
}

/** The longest word's width at HEXP 0: it caps the name's size where it is wider than the column */
export function capOf(widths: NameWidths, hexps: number[], narrowest: number): number | null {
  const width = widthAt(widths.word, hexps, NARROWEST_HEXP);
  return width > narrowest ? width : null;
}

/**
 * A ratio or a width as the generated files write it, to four decimal places, the nearest: EARLY
 * and MARGIN are far wider than the rounding
 */
const asWritten = (value: number) => Number(value.toFixed(4));

/** A width in ems, as the CSS writes it */
const ems = (value: number) => `${asWritten(value)}em`;

const condition = ({ from, to }: Range, narrowest: number) =>
  from <= narrowest ? `(width < ${ems(to)})` : `(${ems(from)} <= width < ${ems(to)})`;

/** A block for each selector list, its selectors one to a line as Prettier writes them */
const block = (selectors: string[], declaration: string, indent = "") =>
  [`${indent}${selectors.join(`,\n${indent}`)} {`, `${indent}  ${declaration};`, `${indent}}`].join("\n");

/** The generated file's opening comment */
function cssHeader(bands: Band[]): string {
  const ratios = inWords(bands.slice(1).map(({ hexp, from }) => `${hexp} from ${asWritten(from)}`));
  const lines = [
    "Generated by scripts/font-fallbacks.ts from src/styles/model-names.json: run pnpm",
    "fonts:fallbacks again rather than editing this file. A car title's model name keeps its words",
    "whole, and its two lines where its letters allow (DESIGN §3.3, D-049): where the display step's",
    "HEXP would break its longest word, or give it a third line that HEXP 0 would spare it, it sets in",
    "HEXP 0, and where even HEXP 0 is too wide for its longest word, smaller. Each condition measures",
    "the title's column in ems of the step's size before the cap, the model-name container's font",
    "size (tokens.css). The step takes its HEXP by that ratio of column to size:",
    `${ratios}.`,
    `Each width is the list's, measured in Chromium, and ${Number(((MARGIN - 1) * 100).toFixed(2))} % more; each range starts`,
    `${EARLY} below where it is needed, a margin for the conditions' rounding.`,
  ];
  return cssComment(lines);
}

/** model-names.css's rules: each name the rule sets otherwise, with the names whose ranges match */
export function modelNamesCss(list: ModelNames, scale: StepTokens[]): string {
  const bands = displayBands(scale);
  const groups = new Map<string, { language: Language; ranges: Range[]; cap: number | null; models: ModelWidths[] }>();
  for (const language of LANGUAGES) {
    const narrowest = NARROWEST_RATIO[language];
    for (const model of [...list.models].sort((a, b) => (a.key < b.key ? -1 : 1))) {
      const ranges = narrowRanges(model[language], list.hexps, bands, narrowest);
      const cap = capOf(model[language], list.hexps, narrowest);
      if (ranges.length === 0 && cap === null) continue;
      const id = JSON.stringify({ language, ranges: ranges.map((range) => condition(range, narrowest)), cap });
      const group = groups.get(id) ?? { language, ranges, cap, models: [] };
      group.models.push(model);
      groups.set(id, group);
    }
  }
  const sections = [...groups.values()].map(({ language, ranges, cap, models }) => {
    const selectors = models.map(({ key }) => `[data-model="${key}"]:lang(${language})`);
    const names = `${inWords(models.map((model) => model[language].name))} (${models.map(({ key }) => key).join(", ")})`;
    const blocks = [
      ...ranges.map((range) =>
        [
          `@container model-name ${condition(range, NARROWEST_RATIO[language])} {`,
          block(selectors, `--display-hexp: ${NARROWEST_HEXP}`, "  "),
          "}",
        ].join("\n"),
      ),
      ...(cap === null ? [] : [block(selectors, `--display-cap: calc(100cqi / ${asWritten(cap)})`)]),
    ];
    return `/* ${names}, in ${LANGUAGE_NAMES[language]} */\n${blocks.join("\n\n")}`;
  });
  return [cssHeader(bands), ...sections, ""].join("\n\n").replace(/\n\n$/, "\n");
}

/**
 * A list's text: objects one field to a line and each name's widths on one, as Prettier writes
 * them. A model's key is its "model", as its titles' data-model names it: gitleaks' generic rule
 * takes a "key" set to a slug with digits for an API key (D-049).
 */
export function modelNamesJson(list: ModelNames): string {
  const widths = (values: number[]) => `[${values.map(asWritten).join(", ")}]`;
  const name = ({ name, word, lines }: NameWidths, indent: string) =>
    [
      "{",
      `${indent}  "name": ${JSON.stringify(name)},`,
      `${indent}  "word": ${widths(word)},`,
      `${indent}  "lines": ${widths(lines)}`,
      `${indent}}`,
    ].join("\n");
  const models = list.models.map((model) =>
    [
      "    {",
      `      "model": ${JSON.stringify(model.key)},`,
      `      "en": ${name(model.en, "      ")},`,
      `      "ar": ${name(model.ar, "      ")}`,
      "    }",
    ].join("\n"),
  );
  return [
    "{",
    '  "$comment": "The catalog\'s model names, measured at the display step for src/styles/model-names.css. Written by pnpm fonts:fallbacks.",',
    `  "hexps": ${widths(list.hexps)},`,
    '  "models": [',
    models.join(",\n"),
    "  ]",
    "}",
    "",
  ].join("\n");
}

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === "number");

/** The list in src/styles/model-names.json; throws unless each name has a width at each HEXP */
export function parseModelNames(text: string): ModelNames {
  const data: unknown = JSON.parse(text);
  if (!isRecord(data) || !isNumbers(data.hexps)) throw new Error("model-names.json has no HEXP list");
  if (!Array.isArray(data.models)) throw new Error("model-names.json has no models");
  const { hexps } = data;
  const isWidths = (value: unknown): value is number[] => isNumbers(value) && value.length === hexps.length;
  const models = data.models.map((item: unknown): ModelWidths => {
    if (!isRecord(item) || typeof item.model !== "string")
      throw new Error("model-names.json has an entry that names no model");
    const key = item.model;
    const widths = (language: Language): NameWidths => {
      const entry = item[language];
      if (!isRecord(entry) || typeof entry.name !== "string" || !isWidths(entry.word) || !isWidths(entry.lines))
        throw new Error(`model-names.json: ${key}'s ${LANGUAGE_NAMES[language]} widths aren't one for each HEXP`);
      return { name: entry.name, word: entry.word, lines: entry.lines };
    };
    return { key, en: widths("en"), ar: widths("ar") };
  });
  return { hexps, models };
}

/**
 * What keeps the list from being the catalog's, as measured for the display step: a model added,
 * renamed or taken out since, or HEXP the step no longer takes
 */
export function catalogProblems(list: ModelNames, catalog: CatalogModel[], scale: StepTokens[]): string[] {
  const hexps = measuredHexps(scale);
  const problems: string[] =
    list.hexps.join() === hexps.join()
      ? []
      : [`model-names.json was measured at HEXP ${inWords(list.hexps)}, but the display step takes ${inWords(hexps)}`];
  const measured = new Map(list.models.map((model) => [model.key, model]));
  for (const { key, nameEn, nameAr } of catalog) {
    const model = measured.get(key);
    if (model === undefined) {
      problems.push(`${key} isn't in model-names.json`);
      continue;
    }
    for (const [language, name] of [
      ["en", nameEn],
      ["ar", nameAr],
    ] as const)
      if (model[language].name !== name)
        problems.push(
          `${key}'s ${LANGUAGE_NAMES[language]} name is ${name} in seed/reference.json, but model-names.json measured ${model[language].name}`,
        );
  }
  const keys = new Set(catalog.map(({ key }) => key));
  for (const { key } of list.models)
    if (!keys.has(key)) problems.push(`model-names.json measures ${key}, which seed/reference.json doesn't have`);
  return problems;
}
