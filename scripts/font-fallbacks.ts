// Readex Pro's and Martian Mono's fallback faces (T-11, DESIGN §3.3 and §10.2: no layout shift from
// fonts). While a web font loads, text shows in a local font. Each type step has its own fallback
// families, scaled with size-adjust so fallback text is, over the whole corpus, as wide as the same
// text in Readex Pro at that step's HEXP and weight: most lines break in the same places, so little
// moves when the font swaps in. The vertical metrics are Readex Pro's, so the baseline stays put.
// Each step's HEXP and weight are read from src/styles/tokens.css. The display step narrows its
// HEXP on phones (D-038), in a car's title (D-049) and for a long model name, so it has faces for
// each HEXP, switched under the same media and container conditions.
//
// First it measures the catalog's model names (seed/reference.json) as the display step sets them,
// each one's longest word and its widest line in two, at HEXP 0 and at each HEXP the step takes, into
// src/styles/model-names.json, and writes from that list src/styles/model-names.css, where a long
// name takes HEXP 0 and the longest a smaller size (scripts/checks/model-names.ts, D-049).
//
// The widths are measured in Chromium on real copy: the deck's EN and AR cells (DESIGN §9.2 to §9.4)
// and the seed's descriptions and notes. The display step sets model names, so its faces are
// measured on the catalog's model names in both languages (seed/reference.json). The specimen's copy
// (/dev/type) is held out, so the specimen stays an independent check. Writes the three files, the
// same on every run for the same tokens, fonts, catalog and copy. Run it again whenever a step's
// HEXP, weight or narrower steps change, or the catalog's models do: a unit test fails until then.
//
// Local fonts, by platform:
// - Apple: Geeza Pro for Arabic, first in each stack, and Arial for Latin;
// - Windows: Arial for both scripts (Liberation Sans, metric-compatible, stands in on Linux);
// - Android: Roboto and Noto Naskh Arabic, measured on Google Fonts' copies because macOS has
//   neither. Whether Chrome on Android resolves these local() names is unverified (D-033);
// - figures: a monospace font, since Martian Mono is one. Menlo, Courier New, Droid Sans Mono and
//   Liberation Mono are all 0.6 em wide, so one scale fits each.
//
// Usage, on macOS with the app running: pnpm fonts:fallbacks [origin]. It reads the private
// specification (docs/), so it runs in the private repository only; the public one has the CSS.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { COPY, JOINED_AR } from "../src/app/[locale]/(public)/(dev)/dev/type/copy.ts";
import { seedReferenceSchema } from "../src/lib/validation/seed.ts";
import { readTypeScale } from "../src/styles/type-scale.ts";
import { CHROMIUM_FLAGS } from "./checks/chromium.ts";
import {
  ANDROID_FONTS,
  ARABIC_RANGE,
  ARIAL,
  arabicScale,
  fallbackCss,
  fallbackStacks,
  firstOfEachFamily,
  GEEZA,
  LIBERATION,
  localWeight,
  MONO,
  type CorpusName,
  type Measured,
  type PinnedFont,
  type Scales,
  type Stack,
} from "./checks/font-fallbacks.ts";
import {
  type CatalogModel,
  type Language,
  measuredHexps,
  type ModelNames,
  modelNamesCss,
  modelNamesJson,
  parseModelNames,
} from "./checks/model-names.ts";

const ORIGIN = process.argv[2] ?? "http://localhost:3000";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "src/styles/font-fallbacks.css");
const NAMES_LIST = path.join(ROOT, "src/styles/model-names.json");
const NAMES_CSS = path.join(ROOT, "src/styles/model-names.css");
const TOKENS = path.join(ROOT, "src/styles/tokens.css");
const CATALOG = path.join(ROOT, "seed/reference.json");
const DESIGN_SPEC = path.join(ROOT, "docs/03-DESIGN-SPEC.md");
const SEED_DATA = path.join(ROOT, "docs/05-SEED-DATA.md");

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const clean = (text: string) =>
  text
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/[`*†]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Every string in a value, however deep */
const stringsIn = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : typeof value === "object" && value !== null
      ? Object.values(value).flatMap(stringsIn)
      : [];

// The specimen's copy, held out of the corpus. Units and short codes (km, GXR) are left out of it,
// as they would hold out every string that contains them.
const SPECIMEN = stringsIn([COPY, JOINED_AR])
  .filter((text) => text.length >= 4)
  .map(clean);

// Far fewer than the copy gave on 2026-11-11 (1,950 cells, 54 descriptions and 106 notes, making
// 954 Latin, 894 Arabic and 373 figure strings; the catalog's 158 models, making 149 Latin and 114
// Arabic names), so only a parse that broke trips them
const MIN_COUNTS = {
  cells: 1000,
  descriptions: 40,
  notes: 80,
  latin: 500,
  arabic: 500,
  figures: 250,
  models: 120,
  modelsLatin: 110,
  modelsArabic: 85,
};

type Text = { latin: string[]; arabic: string[] };
type Corpus = Record<CorpusName, Text> & { figures: string[] };

/** The text of a file from one heading to the next one named; throws when either is missing */
function section(file: string, from: string, to: string): string {
  const document = readFileSync(file, "utf8");
  const start = document.indexOf(from);
  const end = document.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`${path.relative(ROOT, file)} no longer has "${from}" followed by "${to}"`);
  return document.slice(start, end);
}

/** The cells of a section's table rows, each row a list of cells after its key */
const rows = (table: string) =>
  table
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) =>
      line
        .split(" | ")
        .slice(1)
        .map((cell) => clean(cell.replace(/\|$/, ""))),
    );

/** Strings by script: Arabic if it has an Arabic letter, Latin if it has a Latin one and no Arabic */
const byScript = (strings: string[]): Text => ({
  latin: strings.filter((text) => !ARABIC.test(text) && /[A-Za-z]/.test(text)),
  arabic: strings.filter((text) => ARABIC.test(text)),
});

function checkCounts(counts: Record<keyof typeof MIN_COUNTS, number>): void {
  console.log("corpus", JSON.stringify(counts));
  const short = Object.entries(MIN_COUNTS).filter(
    ([name, minimum]) => counts[name as keyof typeof MIN_COUNTS] < minimum,
  );
  if (short.length)
    throw new Error(
      `The corpus is too small, so the copy's format may have changed: ${short.map(([name, minimum]) => `${name} under ${minimum}`).join(", ")}`,
    );
}

function corpus(catalog: CatalogModel[]): Corpus {
  const heldOut = (text: string) => SPECIMEN.some((held) => text.includes(held) || held.includes(text));
  const cells = rows(section(DESIGN_SPEC, "### 9.2 Copy deck", "### 9.5 Formats")).flat();
  // The catalog's model names, English and Arabic
  const names = [...new Set(catalog.flatMap(({ nameEn, nameAr }) => [nameEn, nameAr]))].filter(
    (text) => text.length > 1 && !heldOut(text),
  );
  const records = readFileSync(SEED_DATA, "utf8").split("\n#### S").slice(1);
  // S01 is the specimen's car, so its description is held out with the rest of the specimen
  const descriptions = records
    .filter((record) => !record.startsWith("01 "))
    .flatMap((record) =>
      [...record.matchAll(/\*\*Description (?:EN|AR):\*\* "([^"]+)"/g)].map((match) => clean(match[1] ?? "")),
    );
  const notes = records.flatMap((record) =>
    [...record.matchAll(/"([^"\n]{6,})" \/ "([^"\n]{6,})"/g)].flatMap((match) => [
      clean(match[1] ?? ""),
      clean(match[2] ?? ""),
    ]),
  );
  const strings = [...new Set([...cells, ...descriptions, ...notes])].filter(
    (text) => text.length > 1 && !heldOut(text),
  );
  const seed = records.join("\n");
  const text: Corpus = {
    copy: byScript(strings),
    models: byScript(names),
    // Prices, distances, years and VINs, as the seed writes them
    figures: [
      ...new Set(
        [...seed.matchAll(/\b(?:\d{1,3}(?:,\d{3})+|\d{2,4}|[A-HJ-NPR-Z0-9]{17})\b/g)].map((match) => match[0]),
      ),
    ],
  };
  checkCounts({
    cells: cells.length,
    descriptions: descriptions.length,
    notes: notes.length,
    latin: text.copy.latin.length,
    arabic: text.copy.arabic.length,
    figures: text.figures.length,
    models: catalog.length,
    modelsLatin: text.models.latin.length,
    modelsArabic: text.models.arabic.length,
  });
  return text;
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
}

/** A pinned font file, as base64; throws unless its SHA-256 is the pinned one */
async function pinnedFont({ family, url, sha256 }: PinnedFont): Promise<string> {
  const bytes = Buffer.from(await (await fetchOk(url)).arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== sha256)
    throw new Error(`${url} is not the pinned ${family} file: its SHA-256 is ${hash}, not ${sha256}`);
  return bytes.toString("base64");
}

// Where a face's glyphs come from in the browser: local names, or a font file's bytes
type Source = { local: string[] } | { data: string };
type Face = { source: Source; scale: number; range?: string };
type Android = { roboto: string; naskh: string };
type TextStyle = { hexp?: number; weight?: number; lang?: string; stretch?: string; numeric?: string };

// page.evaluate sends each of the next four functions to the page as source text, so each uses
// nothing but its arguments and the page's own globals.

/** Loads Readex Pro for the strings and Martian Mono for the figures, and sets up the box text is measured in */
async function setUpPage({ strings, figures, weights }: { strings: string[]; figures: string[]; weights: number[] }) {
  const root = getComputedStyle(document.documentElement);
  const readex = root.getPropertyValue("--font-readex-pro").split(",")[0]?.trim() ?? "";
  const martian = root.getPropertyValue("--font-martian-mono").split(",")[0]?.trim() ?? "";
  if (!readex || !martian) throw new Error("The page sets neither --font-readex-pro nor --font-martian-mono");
  await Promise.all(weights.map((weight) => document.fonts.load(`${weight} 100px ${readex}`, strings.join(" "))));
  await document.fonts.load(`450 100px ${martian}`, figures.join(" "));
  await document.fonts.ready;

  const box = document.createElement("div");
  box.id = "calibration";
  box.style.cssText = "position:absolute;top:0;left:0;visibility:hidden;font-size:100px;line-height:1;white-space:pre";
  document.body.replaceChildren(box);
  return { readex, martian };
}

/** The total width of strings at 100px, one line each */
function widthInPage({ family, strings, style }: { family: string; strings: string[]; style: TextStyle }) {
  const { hexp = 0, weight = 400, lang = "en", stretch = "100%", numeric = "normal" } = style;
  const box = document.getElementById("calibration");
  if (!box) throw new Error("The page isn't set up for measuring");
  box.replaceChildren(
    ...strings.map((value) => {
      const span = document.createElement("span");
      span.style.cssText = `display:block;width:max-content;font-family:${family};font-weight:${weight};font-variation-settings:"HEXP" ${hexp};font-stretch:${stretch};font-variant-numeric:${numeric}`;
      span.lang = lang;
      span.dir = lang === "ar" ? "rtl" : "ltr";
      span.textContent = value;
      return span;
    }),
  );
  return [...box.children].reduce((sum, span) => sum + span.getBoundingClientRect().width, 0);
}

/**
 * Each name's longest word, and its widest line when set in two lines as narrowly as it can be, in
 * ems of the display step at each HEXP, set as a car title's model name is but on one line
 */
function nameWidthsInPage({ names, lang, hexps }: { names: string[]; lang: string; hexps: number[] }) {
  const box = document.getElementById("calibration");
  if (!box) throw new Error("The page isn't set up for measuring");
  const span = document.createElement("span");
  span.className = "type-display";
  span.lang = lang;
  span.dir = lang === "ar" ? "rtl" : "ltr";
  span.style.whiteSpace = "nowrap";
  box.replaceChildren(span);
  const range = document.createRange();
  const width = (text: string) => {
    span.textContent = text;
    range.selectNodeContents(span);
    return range.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(span).fontSize);
  };
  return names.map((name) => {
    const words = name.split(" ");
    // Each place to break the name in two, as its two lines
    const splits = words.slice(1).map((_, at) => [words.slice(0, at + 1).join(" "), words.slice(at + 1).join(" ")]);
    const word: number[] = [];
    const lines: number[] = [];
    for (const hexp of hexps) {
      span.style.fontVariationSettings = `"HEXP" ${hexp}`;
      word.push(Math.max(...words.map(width)));
      lines.push(Math.min(width(name), ...splits.map((parts) => Math.max(...parts.map(width)))));
    }
    return { word, lines };
  });
}

/** Adds a family of faces at their scales; false when a face's font isn't here */
async function addFamilyInPage({ name, faces }: { name: string; faces: Face[] }) {
  const bytes = (data: string) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0)).buffer;
  const fonts = faces.map(({ source, scale, range }) => {
    // TypeScript's DOM types don't list size-adjust yet; Chromium and WebKit both take it
    const descriptors: FontFaceDescriptors & { sizeAdjust: string } = {
      weight: "100 900",
      sizeAdjust: `${scale * 100}%`,
    };
    if (range) descriptors.unicodeRange = range;
    return new FontFace(
      name,
      "local" in source ? source.local.map((local) => `local("${local}")`).join(", ") : bytes(source.data),
      descriptors,
    );
  });
  for (const font of fonts) document.fonts.add(font);
  try {
    await Promise.all(fonts.map((font) => font.load()));
    return true;
  } catch {
    return false;
  }
}

/** Measuring in one page: widths, and families of faces, each family under a name of its own */
function calibration(page: Page) {
  let count = 0;
  const width = (family: string, strings: string[], style: TextStyle) =>
    page.evaluate(widthInPage, { family, strings, style });
  // The faces stay in the page, so a name is never used twice
  const family = async (faces: Face[]): Promise<string | null> => {
    const name = `Calibrate${++count}`;
    return (await page.evaluate(addFamilyInPage, { name, faces })) ? name : null;
  };
  return { width, family };
}

type Calibration = ReturnType<typeof calibration>;

/** Each local font's scale for one stack at one weight, measured on the stack's own text */
async function measureStack(
  { width, family }: Calibration,
  { readex, text, android }: { readex: string; text: Text; android: Android },
  stack: Stack,
  weight: number,
): Promise<Scales> {
  const style = { hexp: stack.hexp, weight };
  const arabicStyle = { ...style, lang: "ar" };
  const finalLatin = await width(readex, text.latin, style);
  const finalArabic = await width(readex, text.arabic, arabicStyle);
  const key = localWeight(weight);
  const latinSources: Record<string, Source> = {
    arial: { local: ARIAL[key] },
    liberation: { local: LIBERATION[key] },
    roboto: { data: android.roboto },
  };
  const latin: Record<string, number> = {};
  for (const [group, source] of Object.entries(latinSources)) {
    const name = await family([{ source, scale: 1 }]);
    if (name) latin[group] = finalLatin / (await width(name, text.latin, style));
  }

  const sample = text.arabic.slice(0, 20);
  const drawsArabic = async (name: string) =>
    Math.abs(
      (await width(`${name}, monospace`, sample, { lang: "ar" })) - (await width("monospace", sample, { lang: "ar" })),
    ) > 1;
  // Each Arabic face, with the Latin face its text keeps for spaces, digits and punctuation
  const arabicSources: [string, Source, string][] = [
    ["geeza", { local: GEEZA[key] }, "arial"],
    ["arial", { local: ARIAL[key] }, "arial"],
    ["naskh", { data: android.naskh }, "roboto"],
  ];
  const arabic: Record<string, number> = {};
  for (const [group, source, latinGroup] of arabicSources) {
    const latinSource = latinSources[latinGroup];
    const latinScale = latin[latinGroup];
    if (!latinSource || !latinScale) continue;
    const at = (scale: number) =>
      family([
        { source: latinSource, scale: latinScale },
        { source, scale, range: ARABIC_RANGE },
      ]);
    const [single, double] = [await at(1), await at(2)];
    if (!single || !double || !(await drawsArabic(single))) continue;
    arabic[group] = arabicScale({
      target: finalArabic,
      single: await width(single, text.arabic, arabicStyle),
      double: await width(double, text.arabic, arabicStyle),
    });
  }
  return { weight, latin, arabic };
}

/** Martian Mono at wdth 87.5, wght 450, tabular, against the first monospace font here */
async function measureFigures({ width, family }: Calibration, martian: string, figures: string[]) {
  const style = { weight: 450, stretch: "87.5%", numeric: "tabular-nums" };
  const target = await width(martian, figures, style);
  for (const local of MONO) {
    const name = await family([{ source: { local: [local] }, scale: 1 }]);
    if (name) return { name: local, scale: target / (await width(name, figures, { ...style, stretch: "100%" })) };
  }
  throw new Error("No monospace font found for the figures");
}

/** The catalog's model names in both languages, measured at each HEXP of the list */
async function measureNames(page: Page, catalog: CatalogModel[], hexps: number[]): Promise<ModelNames> {
  const widthsIn = (lang: Language) =>
    page.evaluate(nameWidthsInPage, {
      names: catalog.map(({ nameEn, nameAr }) => (lang === "en" ? nameEn : nameAr)),
      lang,
      hexps,
    });
  const english = await widthsIn("en");
  const arabic = await widthsIn("ar");
  const models = catalog.map(({ key, nameEn, nameAr }, index) => {
    const en = english[index];
    const ar = arabic[index];
    if (en === undefined || ar === undefined) throw new Error(`${key}'s names weren't measured`);
    return { key, en: { name: nameEn, ...en }, ar: { name: nameAr, ...ar } };
  });
  return { hexps, models };
}

/** Every stack's and the figures' scales, measured against the page's own web fonts */
async function measureStacks(
  calibrate: Calibration,
  stacks: Stack[],
  { fonts, text, android }: { fonts: { readex: string; martian: string }; text: Corpus; android: Android },
): Promise<Measured> {
  const measured: Measured["stacks"] = [];
  // A family that switches in under more than one condition is measured once
  const scalesByFamily = new Map<string, Scales[]>();
  for (const stack of stacks) {
    let scales = scalesByFamily.get(stack.family);
    if (scales === undefined) {
      scales = [];
      for (const weight of stack.weights)
        scales.push(
          await measureStack(calibrate, { readex: fonts.readex, text: text[stack.corpus], android }, stack, weight),
        );
      scalesByFamily.set(stack.family, scales);
    }
    measured.push({ stack, scales });
  }
  return { stacks: measured, figures: await measureFigures(calibrate, fonts.martian, text.figures) };
}

// The catalog's names, and then every stack's and the figures' scales, measured in Chromium. A long
// name's narrower letters are the display step's under conditions of their own, which add stacks, so
// the names come first.
async function measure(
  tokens: string,
  catalog: CatalogModel[],
  { text, android }: { text: Corpus; android: Android },
): Promise<{ list: ModelNames; namesCss: string; measured: Measured }> {
  const scale = readTypeScale(tokens);
  const browser = await chromium.launch({ args: [...CHROMIUM_FLAGS] });
  try {
    const page = await browser.newPage();
    await page.goto(`${ORIGIN}/en`, { waitUntil: "load" });
    const weights = [...new Set(fallbackStacks(scale).flatMap((stack) => stack.weights))];
    const copy = [...text.copy.latin, ...text.copy.arabic];
    // Every name of the catalog's, those held out of the corpus too, as the list measures each
    const names = catalog.flatMap(({ nameEn, nameAr }) => [nameEn, nameAr]);
    const fonts = await page.evaluate(setUpPage, { strings: [...copy, ...names], figures: text.figures, weights });
    // As the JSON keeps it, so the CSS is the one the committed list gives
    const list = parseModelNames(modelNamesJson(await measureNames(page, catalog, measuredHexps(scale))));
    const namesCss = modelNamesCss(list, scale);
    const stacks = fallbackStacks(readTypeScale(`${tokens}\n${namesCss}`));
    return { list, namesCss, measured: await measureStacks(calibration(page), stacks, { fonts, text, android }) };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  if (!existsSync(DESIGN_SPEC) || !existsSync(SEED_DATA)) {
    console.error(
      "font-fallbacks needs the private specification (docs/03-DESIGN-SPEC.md, docs/05-SEED-DATA.md). src/styles/font-fallbacks.css is committed; regenerate it in the private repository.",
    );
    process.exit(1);
  }
  const catalog = seedReferenceSchema.parse(JSON.parse(readFileSync(CATALOG, "utf8"))).models;
  const text = corpus(catalog);
  const android = {
    roboto: await pinnedFont(ANDROID_FONTS.roboto),
    naskh: await pinnedFont(ANDROID_FONTS.naskh),
  };
  const { list, namesCss, measured } = await measure(readFileSync(TOKENS, "utf8"), catalog, { text, android });
  writeFileSync(NAMES_LIST, modelNamesJson(list));
  writeFileSync(NAMES_CSS, namesCss);
  const { css, faces } = fallbackCss(measured, Object.values(ANDROID_FONTS));
  writeFileSync(OUT, css);
  // Each family once, though it switches in under more than one condition
  for (const { stack, scales } of firstOfEachFamily(measured.stacks))
    for (const { weight, latin, arabic } of scales)
      console.log(`${stack.family} at wght ${weight}`, JSON.stringify(latin), JSON.stringify(arabic));
  console.log("figures", JSON.stringify(measured.figures));
  const { copy, models } = text;
  console.log(
    `Wrote ${path.relative(ROOT, NAMES_LIST)} and ${path.relative(ROOT, NAMES_CSS)}, from the ${catalog.length} models of ${path.relative(ROOT, CATALOG)}`,
  );
  console.log(
    `Wrote ${path.relative(ROOT, OUT)}: ${faces} faces, from ${copy.latin.length} Latin and ${copy.arabic.length} Arabic strings of copy, and ${models.latin.length} Latin and ${models.arabic.length} Arabic model names`,
  );
}

await main();
