import type { StepTokens, TypeStep } from "../../src/styles/type-scale.ts";

// The reasoning half of pnpm fonts:fallbacks (scripts/font-fallbacks.ts), kept apart from the
// browser and the file system so tests can feed it: the font stacks the type scale in tokens.css
// needs, the local fonts that stand in for Readex Pro and Martian Mono while they load, and the CSS
// of src/styles/font-fallbacks.css from the scales measured for them (T-11, D-033).

/** Local font names, full name and PostScript name, for the regular faces and the bold ones */
export type Names = Record<400 | 600, string[]>;

export const ARIAL: Names = { 400: ["Arial", "ArialMT"], 600: ["Arial Bold", "Arial-BoldMT"] };
export const LIBERATION: Names = {
  400: ["Liberation Sans", "LiberationSans"],
  600: ["Liberation Sans Bold", "LiberationSans-Bold"],
};
export const GEEZA: Names = { 400: ["Geeza Pro Regular", "GeezaPro"], 600: ["Geeza Pro Bold", "GeezaPro-Bold"] };
// Android 12 and later ship Roboto as one variable font, so bold may only resolve as "Roboto"
const ROBOTO: Names = {
  400: ["Roboto", "Roboto Regular", "Roboto-Regular"],
  600: ["Roboto Bold", "Roboto-Bold", "Roboto", "Roboto-Regular"],
};
const NASKH: Names = {
  400: ["Noto Naskh Arabic", "NotoNaskhArabic-Regular", "Noto Naskh Arabic UI", "NotoNaskhArabicUI-Regular"],
  600: ["Noto Naskh Arabic Bold", "NotoNaskhArabic-Bold", "Noto Naskh Arabic UI Bold", "NotoNaskhArabicUI-Bold"],
};
export const MONO = [
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
export const BOLD_FROM = 550;

/** Which of a family's local faces stands in at a weight */
export const localWeight = (weight: number): 400 | 600 => (weight >= BOLD_FROM ? 600 : 400);

// Readex Pro's vertical metrics (1000 units per em), and Martian Mono's
const READEX = { ascent: 1, descent: 0.25 };
const MARTIAN = { ascent: 1, descent: 0.2 };

// The Arabic blocks of Readex Pro's arabic subset: each Arabic fallback face takes this range
export const ARABIC_RANGE = "U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200E, U+FB50-FDFF, U+FE70-FEFF";

/** The text a stack's faces are measured on: the deck's and the seed's copy, or the seed's model names */
export type CorpusName = "copy" | "models";

/** A font stack of the CSS, and what its faces are measured at */
export type Stack = {
  /** The CSS variable that holds it, as --font-head */
  variable: string;
  /** The type steps whose text it sets */
  steps: TypeStep[];
  /** What its families' names begin with, as "Readex Pro Head" */
  family: string;
  hexp: number;
  /** One weight that stands for all of them, or a regular weight and a bold one */
  weights: number[];
  /** The media condition under which it replaces the variable's first stack; null for the first */
  media: string | null;
  corpus: CorpusName;
};

// The stacks, in the order the CSS declares them, and the steps whose text each one sets. Small
// text and UI text are set in body's stack, font-sans, Tailwind's default family. Body text also
// comes bold (strong, and Arabic emphasis in globals.css), so that stack has bold faces as well.
// The display step sets model names (D-038), so its faces are measured on them.
const STACKS: ReadonlyArray<{
  variable: string;
  name: string;
  steps: TypeStep[];
  bold: boolean;
  corpus: CorpusName;
}> = [
  { variable: "--font-sans", name: "Body", steps: ["body", "small"], bold: true, corpus: "copy" },
  { variable: "--font-lead", name: "Lead", steps: ["lead"], bold: false, corpus: "copy" },
  { variable: "--font-head", name: "Head", steps: ["head"], bold: false, corpus: "copy" },
  { variable: "--font-display", name: "Display", steps: ["display"], bold: false, corpus: "models" },
];

// The weight bold body text is measured at
const BOLD = 600;

/** A step's HEXP at every width, as tokens.css sets it */
const hexpByWidth = ({ hexp, narrower }: StepTokens) =>
  [`HEXP ${hexp}`, ...narrower.map((step) => `${step.hexp} under ${step.media}`)].join(", ");

/**
 * The stacks the type scale needs, each at the HEXP and weights tokens.css gives its steps. A step
 * whose HEXP narrows under a media condition gets a stack for each HEXP, and names each stack's
 * families by its HEXP.
 */
export function fallbackStacks(scale: StepTokens[]): Stack[] {
  return STACKS.flatMap(({ variable, name, steps, bold, corpus }) => {
    const tokens = steps.map((id) => {
      const step = scale.find((candidate) => candidate.id === id);
      if (!step) throw new Error(`The type scale has no ${id} step`);
      return step;
    });
    const widths = [...new Set(tokens.map(hexpByWidth))];
    const [first] = tokens;
    if (!first || widths.length > 1)
      throw new Error(
        `${steps.join(" and ")} share ${variable}, so they need one HEXP at every width: ${widths.join("; ")}`,
      );
    const weights = [...new Set([...tokens.map((step) => step.weight), ...(bold ? [BOLD] : [])])].sort((a, b) => a - b);
    // Each weight band has one face, so a stack has at most one weight on each side of BOLD_FROM
    if (
      weights.filter((weight) => weight < BOLD_FROM).length > 1 ||
      weights.filter((weight) => weight >= BOLD_FROM).length > 1
    )
      throw new Error(`${variable} would need two faces for one weight band: wght ${weights.join(", ")}`);
    const variants: Array<{ hexp: number; media: string | null }> = [
      { hexp: first.hexp, media: null },
      ...first.narrower,
    ];
    return variants.map(({ hexp, media }) => ({
      variable,
      steps,
      family: first.narrower.length > 0 ? `Readex Pro ${name} ${hexp}` : `Readex Pro ${name}`,
      hexp,
      weights,
      media,
      corpus,
    }));
  });
}

/** Words in a list, as "body and small" or "400 and 600" */
const inWords = (items: Array<string | number>) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${String(items.at(-1))}` : items.join("");

/**
 * What a stack's faces were measured at, as the CSS notes it above them. The notes are how
 * tests/unit/checks/font-fallbacks.test.ts tells that the CSS was generated for tokens.css as it is.
 */
export function stackNote({ variable, steps, hexp, weights, media, corpus }: Stack): string {
  const under = media === null ? "" : ` under ${media}`;
  const text = corpus === "models" ? "model names" : "the copy";
  return `${inWords(steps)} (${variable})${under}: HEXP ${hexp}, wght ${inWords(weights)}, measured on ${text}`;
}

/** A stack's value: Readex Pro, then its families for Apple, for Windows and for Android */
export const stackValue = ({ family }: Stack): string =>
  `var(--font-readex-pro), "${family} Fallback Geeza", "${family} Fallback Arial", "${family} Fallback Android"`;

/**
 * The scale that makes Arabic text in a local Arabic face as wide as in Readex Pro. Arabic text keeps
 * spaces, digits and Latin punctuation in the Latin face, so it is measured with the Arabic face at
 * 100 % and at 200 %: the difference is the Arabic face's share of the width.
 */
export function arabicScale({ target, single, double }: { target: number; single: number; double: number }): number {
  const share = double - single;
  return (target - (single - share)) / share;
}

/** One stack's scales at one weight: Readex Pro's width over each local font's, by font */
export type Scales = { weight: number; latin: Record<string, number>; arabic: Record<string, number> };

export type Measured = {
  stacks: Array<{ stack: Stack; scales: Scales[] }>;
  /** The first monospace font found, and its scale */
  figures: { name: string; scale: number };
};

/** A font file the generator downloads, and the SHA-256 it must have */
export type PinnedFont = { family: string; subset: string; url: string; sha256: string };

// Google Fonts' copies of Android's fonts, which macOS doesn't have, pinned by hash: the scales
// depend on the exact file, so another one stops the run. To move to a new version, take the URL
// from the matching block of https://fonts.googleapis.com/css2?family=Roboto:wght@100..900 or
// ?family=Noto+Naskh+Arabic:wght@400..700, check the file, and update both its URL and its hash.
export const ANDROID_FONTS = {
  roboto: {
    family: "Roboto",
    subset: "latin",
    url: "https://fonts.gstatic.com/s/roboto/v51/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3yUBHMdazQ.woff2",
    sha256: "0a44e0bb6ba5c8537e8814c148ef7755f1bce12112361231f595ecc584a18d7a",
  },
  naskh: {
    family: "Noto Naskh Arabic",
    subset: "arabic",
    url: "https://fonts.gstatic.com/s/notonaskharabic/v44/RrQKbpV-9Dd1b1OAGA6M9PkyDuVBeN2DHV2mLXgzTrc.woff2",
    sha256: "bb07eddbc50a85b3357b1eb06189d2e3012d40e488b2d891d678a93ed520b5e1",
  },
} satisfies Record<string, PinnedFont>;

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

/** A stack's faces at one weight: Geeza Pro, Arial for both scripts, then Roboto and Noto Naskh Arabic */
function facesAt(stack: Stack, { weight, latin, arabic }: Scales): string[] {
  const key = localWeight(weight);
  const band = stack.weights.length === 1 ? "100 900" : key === 400 ? `100 ${BOLD_FROM - 1}` : `${BOLD_FROM} 900`;
  const at = `${stack.family} at wght ${weight}`;
  return [
    face(
      `${stack.family} Fallback Geeza`,
      GEEZA[key],
      need(arabic.geeza, `Geeza Pro, ${at}`),
      band,
      READEX,
      ARABIC_RANGE,
    ),
    face(
      `${stack.family} Fallback Arial`,
      [...ARIAL[key], ...LIBERATION[key]],
      need(latin.arial, `Arial, ${at}`),
      band,
      READEX,
    ),
    face(
      `${stack.family} Fallback Arial`,
      ARIAL[key],
      need(arabic.arial, `Arial's Arabic, ${at}`),
      band,
      READEX,
      ARABIC_RANGE,
    ),
    face(`${stack.family} Fallback Android`, ROBOTO[key], need(latin.roboto, `Roboto, ${at}`), band, READEX),
    face(
      `${stack.family} Fallback Android`,
      NASKH[key],
      need(arabic.naskh, `Noto Naskh Arabic, ${at}`),
      band,
      READEX,
      ARABIC_RANGE,
    ),
  ];
}

/** The generated file's opening comment, which names each font file measured and its hash */
export function cssHeader(fonts: PinnedFont[]): string {
  const lines = [
    "Generated by scripts/font-fallbacks.ts: run it again rather than editing this file.",
    "What text shows in while Readex Pro and Martian Mono load (next/font's own fallback is off,",
    "src/styles/fonts.ts). Each type step has fallback faces scaled to that step's HEXP and weight,",
    "so most lines break the same way in both fonts and little moves when the web font swaps in.",
    "In each stack: Geeza Pro for Arabic on Apple devices, then Arial (Windows, and Latin on Apple),",
    "then Roboto and Noto Naskh Arabic for Android, measured on these files from Google Fonts:",
    ...fonts.flatMap(({ family, subset, url, sha256 }) => [`- ${family} (${subset}), SHA-256 ${sha256}:`, `  ${url}`]),
  ];
  return `/* ${lines.join("\n   ")} */`;
}

/** The generated CSS, and how many faces it declares */
export function fallbackCss(measured: Measured, fonts: PinnedFont[]): { css: string; faces: number } {
  const sections = measured.stacks.map(({ stack, scales }) => ({
    note: stackNote(stack),
    faces: scales.flatMap((scale) => facesAt(stack, scale)),
  }));
  const first = measured.stacks
    .filter(({ stack }) => stack.media === null)
    .map(({ stack }) => `  ${stack.variable}: ${stackValue(stack)};`);
  const narrower = measured.stacks.flatMap(({ stack }) =>
    stack.media === null
      ? []
      : [
          [`@media ${stack.media} {`, "  :root {", `    ${stack.variable}: ${stackValue(stack)};`, "  }", "}"].join(
            "\n",
          ),
        ],
  );
  const css = [
    cssHeader(fonts),
    "",
    ...sections.flatMap(({ note, faces }) => [`/* ${note} */`, faces.join("\n\n"), ""]),
    "/* figures (--font-figures): wdth 87.5, wght 450, measured on the seed's figures */",
    face("Martian Mono Fallback", MONO, measured.figures.scale, "100 900", MARTIAN),
    "",
    "/* The first stacks, as Tailwind's font tokens: font-sans (body and small), font-lead, font-head,",
    "   font-display and font-figures */",
    "@theme inline {",
    ...first,
    '  --font-figures: var(--font-martian-mono), "Martian Mono Fallback";',
    "}",
    ...(narrower.length === 0
      ? []
      : [
          "",
          "/* A step whose HEXP narrows on phones (tokens.css, D-038) takes the stack of each narrower HEXP",
          "   under the same media condition. The type-* utilities read the stack through var(), so they",
          "   switch with it; a font-* class doesn't, as @theme inline writes the first stack into it. */",
          narrower.join("\n\n"),
        ]),
    "",
  ].join("\n");
  return { css, faces: sections.reduce((count, { faces }) => count + faces.length, 1) };
}
