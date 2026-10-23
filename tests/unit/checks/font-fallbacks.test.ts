import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokenBlocks } from "@/styles/token-blocks";
import { readTypeScale, type StepTokens, type TypeStep } from "@/styles/type-scale";
import {
  ANDROID_FONTS,
  arabicScale,
  cssHeader,
  fallbackCss,
  fallbackStacks,
  type Measured,
  type Scales,
  type Stack,
  stackNote,
  stackValue,
} from "../../../scripts/checks/font-fallbacks.ts";

// pnpm fonts:fallbacks's reasoning (D-033, D-038), fed by hand: the stacks the type scale needs,
// the arithmetic of the Arabic faces' scale, and the CSS written from measured scales. The generator
// runs only on a Mac with the private specification, so the last tests check that the committed CSS
// still matches tokens.css.

const TOKENS = readTypeScale(readFileSync("src/styles/tokens.css", "utf8"));

/** tokens.css's type scale with one step's tokens changed */
const withStep = (id: TypeStep, change: Partial<StepTokens>) =>
  TOKENS.map((step) => (step.id === id ? { ...step, ...change } : step));

describe("fallbackStacks", () => {
  it("gives body and small one stack with bold faces, each other step its own, and display one for each HEXP", () => {
    const stacks = fallbackStacks(TOKENS).map(({ variable, family, hexp, weights, media, corpus }) => ({
      variable,
      family,
      hexp,
      weights,
      media,
      corpus,
    }));
    const display = (hexp: number, media: string | null) => ({
      variable: "--font-display",
      family: `Readex Pro Display ${hexp}`,
      hexp,
      weights: [600],
      media,
      corpus: "models",
    });
    expect(stacks).toStrictEqual([
      { variable: "--font-sans", family: "Readex Pro Body", hexp: 0, weights: [400, 600], media: null, corpus: "copy" },
      { variable: "--font-lead", family: "Readex Pro Lead", hexp: 20, weights: [400], media: null, corpus: "copy" },
      { variable: "--font-head", family: "Readex Pro Head", hexp: 60, weights: [600], media: null, corpus: "copy" },
      display(100, null),
      display(80, "(width < 33.75rem)"),
      display(60, "(width < 26.875rem)"),
      display(40, "(width < 24.375rem)"),
      display(20, "(width < 22.5rem)"),
    ]);
  });

  it("follows a change to a step's HEXP, weight or narrower HEXP", () => {
    const head = fallbackStacks(
      withStep("head", { hexp: 70, weight: 700, narrower: [{ media: "(width < 30rem)", hexp: 40 }] }),
    ).filter(({ variable }) => variable === "--font-head");
    expect(head).toMatchObject([
      { family: "Readex Pro Head 70", hexp: 70, weights: [700], media: null },
      { family: "Readex Pro Head 40", hexp: 40, weights: [700], media: "(width < 30rem)" },
    ]);
  });

  it("throws when steps that share a stack differ in HEXP at any width", () => {
    expect(() => fallbackStacks(withStep("small", { hexp: 20 }))).toThrow(
      "body and small share --font-sans, so they need one HEXP at every width: HEXP 0; HEXP 20",
    );
    expect(() => fallbackStacks(withStep("small", { narrower: [{ media: "(width < 30rem)", hexp: 10 }] }))).toThrow(
      "HEXP 0; HEXP 0, 10 under (width < 30rem)",
    );
  });

  it("throws when a stack would need two faces for one weight band", () => {
    expect(() => fallbackStacks(withStep("small", { weight: 500 }))).toThrow(
      "--font-sans would need two faces for one weight band: wght 400, 500, 600",
    );
  });

  it("throws when the type scale has no step a stack sets", () => {
    expect(() => fallbackStacks(TOKENS.filter(({ id }) => id !== "lead"))).toThrow("The type scale has no lead step");
  });
});

describe("stackNote", () => {
  it("says which steps a stack sets, under which condition, and what it was measured at and on", () => {
    const [sans, , , , narrower] = fallbackStacks(TOKENS);
    if (!sans || !narrower) throw new Error("tokens.css lost a step");
    expect(stackNote(sans)).toBe("body and small (--font-sans): HEXP 0, wght 400 and 600, measured on the copy");
    expect(stackNote(narrower)).toBe(
      "display (--font-display) under (width < 33.75rem): HEXP 80, wght 600, measured on model names",
    );
  });
});

describe("arabicScale", () => {
  it("scales the Arabic face's share of the width alone", () => {
    // 30 px of spaces and digits in the Latin face and 50 px of Arabic at 100 %: Readex Pro's 90 px
    // needs the Arabic face at 120 %
    expect(arabicScale({ target: 90, single: 80, double: 130 })).toBeCloseTo(1.2, 12);
  });
});

describe("fallbackCss", () => {
  // A scale of its own for each font, so a face that took another font's scale would show
  const scales = (weight: number, value: number): Scales => ({
    weight,
    latin: { arial: value + 0.01, roboto: value + 0.02 },
    arabic: { geeza: value, arial: value + 0.03, naskh: value + 0.04 },
  });
  const stack = (variable: string, family: string, weights: number[], media: string | null = null): Stack => ({
    variable,
    steps: [],
    family,
    hexp: 0,
    weights,
    media,
    corpus: "copy",
  });
  const measured: Measured = {
    stacks: [
      { stack: stack("--font-sans", "Readex Pro Body", [400, 600]), scales: [scales(400, 1.25), scales(600, 1.25)] },
      { stack: stack("--font-head", "Readex Pro Head 60", [600]), scales: [scales(600, 2)] },
      { stack: stack("--font-head", "Readex Pro Head 40", [600], "(width < 30rem)"), scales: [scales(600, 1.5)] },
    ],
    figures: { name: "Menlo-Regular", scale: 1.08 },
  };
  const pinned = [
    { family: "Roboto", subset: "latin", url: "https://fonts.gstatic.com/s/roboto/v1/a.woff2", sha256: "ab12" },
  ];
  const { css, faces } = fallbackCss(measured, pinned);
  const facesOf = (family: string) =>
    [...css.matchAll(/@font-face \{[^}]*\}/g)].map(([rule]) => rule).filter((rule) => rule.includes(`"${family}"`));

  it("declares five faces for each stack and weight, and one for the figures", () => {
    expect(faces).toBe(21);
    expect(css.match(/@font-face/g)).toHaveLength(21);
  });

  it("gives a stack of one weight the whole weight range, and one of two a regular and a bold band", () => {
    expect(
      facesOf("Readex Pro Head 60 Fallback Arial").map((rule) => /font-weight: ([^;]+);/.exec(rule)?.[1]),
    ).toStrictEqual(["100 900", "100 900"]);
    expect(
      facesOf("Readex Pro Body Fallback Geeza").map((rule) => /font-weight: ([^;]+);/.exec(rule)?.[1]),
    ).toStrictEqual(["100 549", "550 900"]);
  });

  it("scales each face and divides Readex Pro's metrics by the scale, so the line box keeps its height", () => {
    const [geeza] = facesOf("Readex Pro Head 60 Fallback Geeza");
    expect(geeza).toContain('src: local("Geeza Pro Bold"), local("GeezaPro-Bold");');
    expect(geeza).toContain("size-adjust: 200%;");
    expect(geeza).toContain("ascent-override: 50%;");
    expect(geeza).toContain("descent-override: 12.5%;");
    expect(geeza).toContain("unicode-range: U+0600-06FF");
  });

  it("scales each face by its own font's measure", () => {
    const sizes = (platform: string) =>
      facesOf(`Readex Pro Head 60 Fallback ${platform}`).map((rule) => /size-adjust: ([^;]+);/.exec(rule)?.[1]);
    expect(sizes("Geeza")).toStrictEqual(["200%"]);
    // Latin, then Arabic
    expect(sizes("Arial")).toStrictEqual(["201%", "203%"]);
    expect(sizes("Android")).toStrictEqual(["202%", "204%"]);
  });

  it("notes above each stack's faces what they were measured at", () => {
    expect(css).toContain(`/* ${stackNote(stack("--font-head", "Readex Pro Head 40", [600], "(width < 30rem)"))} */`);
  });

  it("sets each first stack as a Tailwind font token, and each narrower one under its media condition", () => {
    const { blocks, problems } = tokenBlocks(css);
    expect(problems).toEqual([]);
    expect(Object.fromEntries(blocks.get("@theme inline") ?? [])).toStrictEqual({
      "--font-sans": stackValue(stack("", "Readex Pro Body", [])),
      "--font-head": stackValue(stack("", "Readex Pro Head 60", [])),
      "--font-figures": 'var(--font-martian-mono), "Martian Mono Fallback"',
    });
    expect(Object.fromEntries(blocks.get("@media (width < 30rem) :root") ?? [])).toStrictEqual({
      "--font-head": stackValue(stack("", "Readex Pro Head 40", [])),
    });
  });

  it("names each pinned font file and its hash in the header", () => {
    expect(css).toContain("   - Roboto (latin), SHA-256 ab12:\n     https://fonts.gstatic.com/s/roboto/v1/a.woff2 */");
  });

  it("throws when a font couldn't be measured", () => {
    const [body] = measured.stacks;
    if (!body) throw new Error("no body stack");
    const missing: Measured = {
      ...measured,
      stacks: [{ ...body, scales: [{ ...scales(400, 1.25), arabic: { arial: 1.25, naskh: 1.25 } }] }],
    };
    expect(() => fallbackCss(missing, pinned)).toThrow(
      "Geeza Pro, Readex Pro Body at wght 400 could not be measured: is the font on this Mac?",
    );
  });
});

describe("src/styles/font-fallbacks.css", () => {
  const css = readFileSync("src/styles/font-fallbacks.css", "utf8");
  const stale = "font-fallbacks.css doesn't match tokens.css: run pnpm fonts:fallbacks";

  it("was generated for the type scale tokens.css sets", () => {
    for (const stack of fallbackStacks(TOKENS)) expect(css, stale).toContain(`/* ${stackNote(stack)} */`);
  });

  it("switches to the narrower stacks in tokens.css's order, as the last condition that matches wins", () => {
    const conditions = [...tokenBlocks(css).blocks.keys()].filter((block) => block.startsWith("@media "));
    expect(conditions, stale).toStrictEqual(
      fallbackStacks(TOKENS).flatMap(({ media }) => (media === null ? [] : [`@media ${media} :root`])),
    );
  });

  it("was measured on the pinned Android font files", () => {
    const header = cssHeader(Object.values(ANDROID_FONTS));
    expect(css.startsWith(`${header}\n`), "font-fallbacks.css names other font files: run pnpm fonts:fallbacks").toBe(
      true,
    );
  });

  it("sets each stack under its media condition, with faces for every family it names", () => {
    const { blocks } = tokenBlocks(css);
    for (const stack of fallbackStacks(TOKENS)) {
      const block = stack.media === null ? "@theme inline" : `@media ${stack.media} :root`;
      expect(blocks.get(block)?.get(stack.variable), stale).toBe(stackValue(stack));
      for (const platform of ["Geeza", "Arial", "Android"])
        expect(css, stale).toContain(`font-family: "${stack.family} Fallback ${platform}";`);
    }
  });
});
