// Readex Pro's and Martian Mono's fallback faces (T-11, DESIGN §3.3 and §10.2: no layout shift from
// fonts). While a web font loads, text shows in a local font. Each type step has its own fallback
// families, scaled with size-adjust so fallback text is, over the whole corpus, as wide as the same
// text in Readex Pro at that step's HEXP and weight: most lines break in the same places, so little
// moves when the font swaps in. The vertical metrics are Readex Pro's, so the baseline stays put.
//
// The widths are measured in Chromium on real copy: the deck's EN and AR cells (DESIGN §9.2 to §9.4)
// and the seed's descriptions and notes. The specimen's copy (/dev/type) is held out, so the
// specimen stays an independent check. Writes src/styles/font-fallbacks.css, the same on every run
// for the same fonts and copy. Run it again whenever a step's HEXP or weight changes.
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
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { CHROMIUM_FLAGS } from "./checks/chromium.ts";

const ORIGIN = process.argv[2] ?? "http://localhost:3000";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "src/styles/font-fallbacks.css");
const SPECIMEN = path.join(ROOT, "src/app/[locale]/(public)/(dev)/dev/type/copy.ts");
const DESIGN_SPEC = path.join(ROOT, "docs/03-DESIGN-SPEC.md");
const SEED_DATA = path.join(ROOT, "docs/05-SEED-DATA.md");

type StepId = "body" | "lead" | "head" | "display";
type Step = { id: StepId; name: string; hexp: number; weights: number[] };

// DESIGN §3.3. The small step and UI text share the body step's HEXP 0; body text also comes bold.
const STEPS: Step[] = [
  { id: "body", name: "Body", hexp: 0, weights: [400, 600] },
  { id: "lead", name: "Lead", hexp: 20, weights: [400] },
  { id: "head", name: "Head", hexp: 60, weights: [600] },
  { id: "display", name: "Display", hexp: 100, weights: [600] },
];

// Local font names, full name and PostScript name, by weight
type Names = Record<400 | 600, string[]>;
const ARIAL: Names = { 400: ["Arial", "ArialMT"], 600: ["Arial Bold", "Arial-BoldMT"] };
const LIBERATION: Names = {
  400: ["Liberation Sans", "LiberationSans"],
  600: ["Liberation Sans Bold", "LiberationSans-Bold"],
};
const GEEZA: Names = { 400: ["Geeza Pro Regular", "GeezaPro"], 600: ["Geeza Pro Bold", "GeezaPro-Bold"] };
// Android 12 and later ship Roboto as one variable font, so bold may only resolve as "Roboto"
const ROBOTO: Names = {
  400: ["Roboto", "Roboto Regular", "Roboto-Regular"],
  600: ["Roboto Bold", "Roboto-Bold", "Roboto", "Roboto-Regular"],
};
const NASKH: Names = {
  400: ["Noto Naskh Arabic", "NotoNaskhArabic-Regular", "Noto Naskh Arabic UI", "NotoNaskhArabicUI-Regular"],
  600: ["Noto Naskh Arabic Bold", "NotoNaskhArabic-Bold", "Noto Naskh Arabic UI Bold", "NotoNaskhArabicUI-Bold"],
};
const MONO = [
  "Menlo-Regular",
  "Menlo",
  "Courier New",
  "CourierNewPSMT",
  "Droid Sans Mono",
  "DroidSansMono",
  "Liberation Mono",
  "LiberationMono",
];

// Weights from here up take the bold local faces, and the lighter ones the regular faces
const BOLD_FROM = 550;

// Readex Pro's vertical metrics (1000 units per em), and Martian Mono's
const READEX = { ascent: 1, descent: 0.25 };
const MARTIAN = { ascent: 1, descent: 0.2 };

// The Arabic blocks of Readex Pro's arabic subset: each Arabic fallback face takes this range
const ARABIC_RANGE = "U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200E, U+FB50-FDFF, U+FE70-FEFF";
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const clean = (text: string) =>
  text
    .replace(/\{[^{}]*\}/g, " ")
    .replace(/[`*†]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Far fewer than the copy gives today (1,334 cells, 54 descriptions and 102 notes, making 663
// Latin, 637 Arabic and 368 figure strings), so only a parse that broke trips them
const MIN_COUNTS = { cells: 1000, descriptions: 40, notes: 80, latin: 500, arabic: 500, figures: 250 };

type Corpus = { latin: string[]; arabic: string[]; figures: string[] };

/** The text from one heading to the next one named; throws when either is missing */
function section(document: string, from: string, to: string): string {
  const start = document.indexOf(from);
  const end = document.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`docs/03-DESIGN-SPEC.md no longer has "${from}" followed by "${to}"`);
  return document.slice(start, end);
}

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

function corpus(): Corpus {
  const specimen = existsSync(SPECIMEN)
    ? [...readFileSync(SPECIMEN, "utf8").matchAll(/"([^"\n]{4,})"/g)].map((match) => clean(match[1] ?? ""))
    : [];
  const heldOut = (text: string) => specimen.some((held) => text.includes(held) || held.includes(text));
  const deck = section(readFileSync(DESIGN_SPEC, "utf8"), "### 9.2 Copy deck", "### 9.5 Formats");
  const cells = deck
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .flatMap((line) =>
      line
        .split(" | ")
        .slice(1)
        .map((cell) => clean(cell.replace(/\|$/, ""))),
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
    latin: strings.filter((text) => !ARABIC.test(text) && /[A-Za-z]/.test(text)),
    arabic: strings.filter((text) => ARABIC.test(text)),
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
    latin: text.latin.length,
    arabic: text.arabic.length,
    figures: text.figures.length,
  });
  return text;
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
}

// Google Fonts' copy of a family, one subset, as base64
async function googleFont(family: string, axis: string, subset: string): Promise<string> {
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const css = await (
    await fetchOk(`https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@${axis}`, {
      headers: { "user-agent": userAgent },
    })
  ).text();
  const url = css
    .split("/* ")
    .find((block) => block.startsWith(`${subset} */`))
    ?.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!url) throw new Error(`Google Fonts has no ${subset} file for ${family}`);
  return Buffer.from(await (await fetchOk(url)).arrayBuffer()).toString("base64");
}

// Where a face's glyphs come from in the browser: local names, or a font file's bytes
type Source = { local: string[] } | { data: string };
type Android = { roboto: string; naskh: string };
type Measured = {
  results: { step: string; weight: number; latin: Record<string, number>; arabic: Record<string, number> }[];
  figures: { name: string; scale: number } | null;
};

// Every step's and the figures' scales, measured in Chromium against the page's own web fonts
async function measure(text: Corpus, android: Android): Promise<Measured> {
  const browser = await chromium.launch({ args: [...CHROMIUM_FLAGS] });
  try {
    const page = await browser.newPage();
    await page.goto(`${ORIGIN}/en`, { waitUntil: "load" });
    return await page.evaluate(measureInPage, {
      text,
      steps: STEPS,
      sources: { arial: ARIAL, liberation: LIBERATION, geeza: GEEZA, mono: MONO },
      android,
      arabicRange: ARABIC_RANGE,
      boldFrom: BOLD_FROM,
    });
  } finally {
    await browser.close();
  }
}

// Runs in the page, so it uses nothing from this module but its arguments
async function measureInPage({
  text,
  steps,
  sources,
  android,
  arabicRange,
  boldFrom,
}: {
  text: Corpus;
  steps: Step[];
  sources: { arial: Names; liberation: Names; geeza: Names; mono: string[] };
  android: Android;
  arabicRange: string;
  boldFrom: number;
}): Promise<Measured> {
  const readex =
    getComputedStyle(document.documentElement).getPropertyValue("--font-readex-pro").split(",")[0]?.trim() ?? "";
  const martian =
    getComputedStyle(document.documentElement).getPropertyValue("--font-martian-mono").split(",")[0]?.trim() ?? "";
  if (!readex || !martian) throw new Error("The page sets neither --font-readex-pro nor --font-martian-mono");
  await Promise.all(
    [400, 600].map((weight) =>
      document.fonts.load(`${weight} 100px ${readex}`, [...text.latin, ...text.arabic].join(" ")),
    ),
  );
  await document.fonts.load(`450 100px ${martian}`, text.figures.join(" "));
  await document.fonts.ready;

  document.body.replaceChildren();
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;top:0;left:0;visibility:hidden;font-size:100px;line-height:1;white-space:pre";
  document.body.append(box);
  type Style = { hexp?: number; weight?: number; lang?: string; stretch?: string; numeric?: string };
  // Total width of a list of strings at 100px, one line each
  const width = (
    family: string,
    strings: string[],
    { hexp = 0, weight = 400, lang = "en", stretch = "100%", numeric = "normal" }: Style,
  ) => {
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
  };
  const bytes = (data: string) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0)).buffer;
  let count = 0;
  // A family of faces at given scales; null when a face's font isn't here
  const family = async (faces: { source: Source; scale: number; range?: string }[]) => {
    const name = `Calibrate${++count}`;
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
      return name;
    } catch {
      return null;
    }
  };
  const drawsArabic = (name: string) =>
    Math.abs(
      width(`${name}, monospace`, text.arabic.slice(0, 20), { lang: "ar" }) -
        width("monospace", text.arabic.slice(0, 20), { lang: "ar" }),
    ) > 1;

  const results: { step: string; weight: number; latin: Record<string, number>; arabic: Record<string, number> }[] = [];
  for (const step of steps) {
    for (const weight of step.weights) {
      const style = { hexp: step.hexp, weight };
      const finalLatin = width(readex, text.latin, style);
      const finalArabic = width(readex, text.arabic, { ...style, lang: "ar" });
      const key = weight >= boldFrom ? 600 : 400;
      const latinSources: Record<string, Source> = {
        arial: { local: sources.arial[key] },
        liberation: { local: sources.liberation[key] },
        roboto: { data: android.roboto },
      };
      const latin: Record<string, number> = {};
      for (const [group, source] of Object.entries(latinSources)) {
        const name = await family([{ source, scale: 1 }]);
        if (name) latin[group] = finalLatin / width(name, text.latin, style);
      }
      // Arabic text keeps spaces, digits and Latin punctuation in the Latin face, so the Arabic
      // face's share of the width is separated by measuring it at 100 % and 200 %
      const arabicSources: [string, Source, string][] = [
        ["geeza", { local: sources.geeza[key] }, "arial"],
        ["arial", { local: sources.arial[key] }, "arial"],
        ["naskh", { data: android.naskh }, "roboto"],
      ];
      const arabic: Record<string, number> = {};
      for (const [group, source, latinGroup] of arabicSources) {
        const latinSource = latinSources[latinGroup];
        const latinScale = latin[latinGroup];
        if (!latinSource || !latinScale) continue;
        const at = async (scale: number) =>
          family([
            { source: latinSource, scale: latinScale },
            { source, scale, range: arabicRange },
          ]);
        const [single, double] = [await at(1), await at(2)];
        if (!single || !double || !drawsArabic(single)) continue;
        const one = width(single, text.arabic, { ...style, lang: "ar" });
        const share = width(double, text.arabic, { ...style, lang: "ar" }) - one;
        arabic[group] = (finalArabic - (one - share)) / share;
      }
      results.push({ step: step.id, weight, latin, arabic });
    }
  }

  // Figures: Martian Mono at wdth 87.5, wght 450, tabular, against the first monospace font here
  const figuresStyle = { weight: 450, stretch: "87.5%", numeric: "tabular-nums" };
  const finalFigures = width(martian, text.figures, figuresStyle);
  let figures: { name: string; scale: number } | null = null;
  for (const local of sources.mono) {
    const name = await family([{ source: { local: [local] }, scale: 1 }]);
    if (name) {
      figures = { name: local, scale: finalFigures / width(name, text.figures, { ...figuresStyle, stretch: "100%" }) };
      break;
    }
  }
  return { results, figures };
}

function byStep(measured: Measured, step: StepId, weight: number) {
  const found = measured.results.find((result) => result.step === step && result.weight === weight);
  if (!found) throw new Error(`Nothing measured for ${step} at ${weight}`);
  return found;
}

function need(value: number | undefined, what: string): number {
  if (!value) throw new Error(`${what} could not be measured: is the font on this Mac?`);
  return value;
}

const pct = (value: number) => `${Number((value * 100).toFixed(2))}%`;
const local = (names: string[]) => names.map((name) => `local("${name}")`).join(", ");
function face(
  family: string,
  names: string[],
  scale: number,
  weight: string,
  metrics: { ascent: number; descent: number },
  range?: string,
) {
  return [
    "@font-face {",
    `  font-family: "${family}";`,
    `  src: ${local(names)};`,
    `  font-weight: ${weight};`,
    `  size-adjust: ${pct(scale)};`,
    `  ascent-override: ${pct(metrics.ascent / scale)};`,
    `  descent-override: ${pct(metrics.descent / scale)};`,
    "  line-gap-override: 0%;",
    ...(range ? [`  unicode-range: ${range};`] : []),
    "}",
  ].join("\n");
}

/** The generated CSS, and how many faces it declares */
function fallbackCss(measured: Measured): { css: string; faces: number } {
  if (!measured.figures) throw new Error("No monospace font found for the figures");
  const faces: string[] = [];
  const stacks: string[] = [];
  for (const step of STEPS) {
    const families = {
      geeza: `Readex Pro ${step.name} Fallback Geeza`,
      arial: `Readex Pro ${step.name} Fallback Arial`,
      android: `Readex Pro ${step.name} Fallback Android`,
    };
    for (const weight of step.weights) {
      const result = byStep(measured, step.id, weight);
      const key = weight >= BOLD_FROM ? 600 : 400;
      const band = step.weights.length === 1 ? "100 900" : key === 400 ? `100 ${BOLD_FROM - 1}` : `${BOLD_FROM} 900`;
      const at = `${step.id} at wght ${weight}`;
      faces.push(
        face(families.geeza, GEEZA[key], need(result.arabic.geeza, `Geeza Pro, ${at}`), band, READEX, ARABIC_RANGE),
      );
      faces.push(
        face(
          families.arial,
          [...ARIAL[key], ...LIBERATION[key]],
          need(result.latin.arial, `Arial, ${at}`),
          band,
          READEX,
        ),
      );
      faces.push(
        face(
          families.arial,
          ARIAL[key],
          need(result.arabic.arial, `Arial's Arabic, ${at}`),
          band,
          READEX,
          ARABIC_RANGE,
        ),
      );
      faces.push(face(families.android, ROBOTO[key], need(result.latin.roboto, `Roboto, ${at}`), band, READEX));
      faces.push(
        face(
          families.android,
          NASKH[key],
          need(result.arabic.naskh, `Noto Naskh Arabic, ${at}`),
          band,
          READEX,
          ARABIC_RANGE,
        ),
      );
    }
    const variable = step.id === "body" ? "--font-sans" : `--font-${step.id}`;
    stacks.push(
      `  ${variable}: var(--font-readex-pro), "${families.geeza}", "${families.arial}", "${families.android}";`,
    );
  }
  faces.push(face("Martian Mono Fallback", MONO, measured.figures.scale, "100 900", MARTIAN));
  stacks.push('  --font-figures: var(--font-martian-mono), "Martian Mono Fallback";');

  const css = [
    "/* Generated by scripts/font-fallbacks.ts: run it again rather than editing this file.",
    "   What text shows in while Readex Pro and Martian Mono load (next/font's own fallback is off,",
    "   src/styles/fonts.ts). Each type step has fallback faces scaled to that step's HEXP and weight,",
    "   so most lines break the same way in both fonts and little moves when the web font swaps in.",
    "   In each stack: Geeza Pro for Arabic on Apple devices, then Arial (Windows, and Latin on Apple),",
    "   then Roboto and Noto Naskh Arabic for Android. */",
    "",
    faces.join("\n\n"),
    "",
    "/* body and small: font-sans; lead, head and display: font-lead, font-head, font-display;",
    "   figures: font-figures */",
    "@theme inline {",
    ...stacks,
    "}",
    "",
  ].join("\n");
  return { css, faces: faces.length };
}

async function main(): Promise<void> {
  if (!existsSync(DESIGN_SPEC) || !existsSync(SEED_DATA)) {
    console.error(
      "font-fallbacks needs the private specification (docs/03-DESIGN-SPEC.md, docs/05-SEED-DATA.md). src/styles/font-fallbacks.css is committed; regenerate it in the private repository.",
    );
    process.exit(1);
  }
  const text = corpus();
  const android = {
    roboto: await googleFont("Roboto", "100..900", "latin"),
    naskh: await googleFont("Noto Naskh Arabic", "400..700", "arabic"),
  };
  const measured = await measure(text, android);
  const { css, faces } = fallbackCss(measured);
  writeFileSync(OUT, css);
  for (const result of measured.results)
    console.log(`${result.step} ${result.weight}`, JSON.stringify(result.latin), JSON.stringify(result.arabic));
  console.log("figures", JSON.stringify(measured.figures));
  console.log(
    `Wrote ${path.relative(ROOT, OUT)}: ${faces} faces, from ${text.latin.length} Latin and ${text.arabic.length} Arabic strings`,
  );
}

await main();
