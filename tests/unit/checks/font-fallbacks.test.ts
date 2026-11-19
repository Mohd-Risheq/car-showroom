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
// still matches tokens.css and the long model names' rule, model-names.css (D-049).

const TOKENS_CSS = readFileSync("src/styles/tokens.css", "utf8");
const TOKENS = readTypeScale(TOKENS_CSS);

/** tokens.css's type scale with one step's tokens changed */
const withStep = (id: TypeStep, change: Partial<StepTokens>) =>
  TOKENS.map((step) => (step.id === id ? { ...step, ...change } : step));

describe("fallbackStacks", () => {
  it("gives body and small one stack with bold faces, each other step its own, and display one where each HEXP is", () => {
    const stacks = fallbackStacks(TOKENS).map(({ variable, family, hexp, weights, under, corpus }) => ({
      variable,
      family,
      hexp,
      weights,
      under,
      corpus,
    }));
    const display = (hexp: number, under: Stack["under"]) => ({
      variable: "--font-display",
      family: `Readex Pro Display ${hexp}`,
      hexp,
      weights: [600],
      under,
      corpus: "models",
    });
    // On phones by the screen's width (D-038), and a car title's model name by its own column's (D-049)
    const phone = (width: string) => ({ at: `@media (width < ${width})`, selector: ":root" });
    const title = (ratio: string) => ({ at: `@container model-name (width < ${ratio})`, selector: "*" });
    expect(stacks).toStrictEqual([
      { variable: "--font-sans", family: "Readex Pro Body", hexp: 0, weights: [400, 600], under: null, corpus: "copy" },
      { variable: "--font-lead", family: "Readex Pro Lead", hexp: 20, weights: [400], under: null, corpus: "copy" },
      { variable: "--font-head", family: "Readex Pro Head", hexp: 60, weights: [600], under: null, corpus: "copy" },
      {
        variable: "--font-subhead",
        family: "Readex Pro Subhead",
        hexp: 20,
        weights: [600],
        under: null,
        corpus: "copy",
      },
      display(100, null),
      display(80, phone("33.75rem")),
      display(60, phone("26.875rem")),
      display(40, phone("24.375rem")),
      display(20, phone("22.5rem")),
      display(80, title("7.8805em")),
      display(60, title("6.879em")),
      display(40, title("6.3866em")),
      display(20, title("5.8514em")),
    ]);
  });

  it("follows a change to a step's HEXP, weight or narrower HEXP", () => {
    const head = fallbackStacks(
      withStep("head", {
        hexp: 70,
        weight: 700,
        narrower: [{ at: "@media (width < 30rem)", selector: ":root", hexp: 40 }],
      }),
    ).filter(({ variable }) => variable === "--font-head");
    expect(head).toMatchObject([
      { family: "Readex Pro Head 70", hexp: 70, weights: [700], under: null },
      {
        family: "Readex Pro Head 40",
        hexp: 40,
        weights: [700],
        under: { at: "@media (width < 30rem)", selector: ":root" },
      },
    ]);
  });

  it("gives a long model name the HEXP 0 stack under each of its conditions, as one family", () => {
    const commander = '[data-model="jeep-commander"]:lang(en)';
    const names = `@container model-name (width < 9.3143em) { ${commander} { --display-hexp: 0 } }
@container model-name (9.5em <= width < 9.6em) { ${commander} { --display-hexp: 0 } }`;
    const long = fallbackStacks(readTypeScale(`${TOKENS_CSS}\n${names}`)).filter(
      ({ variable, hexp }) => variable === "--font-display" && hexp === 0,
    );
    expect(long.map(({ variable, family, under }) => ({ variable, family, under }))).toStrictEqual([
      {
        variable: "--font-display",
        family: "Readex Pro Display 0",
        under: { at: "@container model-name (width < 9.3143em)", selector: commander },
      },
      {
        variable: "--font-display",
        family: "Readex Pro Display 0",
        under: { at: "@container model-name (9.5em <= width < 9.6em)", selector: commander },
      },
    ]);
  });

  it("throws when steps that share a stack differ in HEXP at any width", () => {
    expect(() => fallbackStacks(withStep("small", { hexp: 20 }))).toThrow(
      "body and small share --font-sans, so they need one HEXP at every width: HEXP 0; HEXP 20",
    );
    const narrower = [{ at: "@media (width < 30rem)", selector: ":root", hexp: 10 }];
    expect(() => fallbackStacks(withStep("small", { narrower }))).toThrow(
      "HEXP 0; HEXP 0, 10 under @media (width < 30rem)",
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
  it("says which steps a stack sets, and what its faces were measured at and on, wherever it switches in", () => {
    const [sans, , , subhead, , phone, , , , title] = fallbackStacks(TOKENS);
    if (!sans || !subhead || !phone || !title) throw new Error("tokens.css lost a step");
    expect(stackNote(sans)).toBe("body and small (--font-sans): HEXP 0, wght 400 and 600, measured on the copy");
    expect(stackNote(subhead)).toBe("subhead (--font-subhead): HEXP 20, wght 600, measured on the copy");
    expect(stackNote(phone)).toBe("display (--font-display): HEXP 80, wght 600, measured on model names");
    expect(stackNote(title)).toBe(stackNote(phone));
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
  const stack = (
    variable: string,
    family: string,
    weights: number[],
    { hexp = 0, under = null }: Partial<Pick<Stack, "hexp" | "under">> = {},
  ): Stack => ({ variable, steps: [], family, hexp, weights, under, corpus: "copy" });
  // One narrower stack that switches in under a media condition, under a container's, and for a long
  // model name under its own container's
  const phone = { at: "@media (width < 30rem)", selector: ":root" };
  const title = { at: "@container car-title (width < 40rem)", selector: "*" };
  const name = { at: "@container model-name (width < 9.5em)", selector: '[data-model="jeep-commander"]:lang(en)' };
  const measured: Measured = {
    stacks: [
      { stack: stack("--font-sans", "Readex Pro Body", [400, 600]), scales: [scales(400, 1.25), scales(600, 1.25)] },
      { stack: stack("--font-head", "Readex Pro Head 60", [600], { hexp: 60 }), scales: [scales(600, 2)] },
      {
        stack: stack("--font-head", "Readex Pro Head 40", [600], { hexp: 40, under: phone }),
        scales: [scales(600, 1.5)],
      },
      {
        stack: stack("--font-head", "Readex Pro Head 40", [600], { hexp: 40, under: title }),
        scales: [scales(600, 1.5)],
      },
      {
        stack: stack("--font-head", "Readex Pro Head 40", [600], { hexp: 40, under: name }),
        scales: [scales(600, 1.5)],
      },
    ],
    figures: { name: "Menlo-Regular", scale: 1.08 },
  };
  const pinned = [
    { family: "Roboto", subset: "latin", url: "https://fonts.gstatic.com/s/roboto/v1/a.woff2", sha256: "ab12" },
  ];
  const { css, faces } = fallbackCss(measured, pinned);
  const facesOf = (family: string) =>
    [...css.matchAll(/@font-face \{[^}]*\}/g)].map(([rule]) => rule).filter((rule) => rule.includes(`"${family}"`));

  it("declares five faces for each family and weight, once wherever the family switches in, and one for the figures", () => {
    expect(faces).toBe(21);
    expect(css.match(/@font-face/g)).toHaveLength(21);
    expect(facesOf("Readex Pro Head 40 Fallback Geeza")).toHaveLength(1);
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

  it("notes above each family's faces what they were measured at", () => {
    const note = `/* ${stackNote(stack("--font-head", "Readex Pro Head 40", [600], { hexp: 40, under: phone }))} */`;
    expect(css.split(note)).toHaveLength(2);
  });

  it("sets each first stack as a Tailwind font token, and each narrower one under its condition", () => {
    const { blocks, problems } = tokenBlocks(css);
    expect(problems).toEqual([]);
    expect(Object.fromEntries(blocks.get("@theme inline") ?? [])).toStrictEqual({
      "--font-sans": stackValue(stack("", "Readex Pro Body", [])),
      "--font-head": stackValue(stack("", "Readex Pro Head 60", [])),
      "--font-figures": 'var(--font-martian-mono), "Martian Mono Fallback"',
    });
    for (const block of [
      "@media (width < 30rem) :root",
      "@container car-title (width < 40rem) *",
      '@container model-name (width < 9.5em) [data-model="jeep-commander"]:lang(en)',
    ])
      expect(Object.fromEntries(blocks.get(block) ?? []), block).toStrictEqual({
        "--font-head": stackValue(stack("", "Readex Pro Head 40", [])),
      });
    // A container's condition is never a media query, which would test the screen's width instead
    expect([...blocks.keys()].filter((block) => block.startsWith("@media"))).toStrictEqual([
      "@media (width < 30rem) :root",
    ]);
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
  const stale = "font-fallbacks.css doesn't match tokens.css and model-names.css: run pnpm fonts:fallbacks";
  // The type scale with the long model names' conditions, which take the HEXP 0 stack
  const scale = () => readTypeScale(`${TOKENS_CSS}\n${readFileSync("src/styles/model-names.css", "utf8")}`);

  it("was generated for the type scale tokens.css and model-names.css set", () => {
    for (const stack of fallbackStacks(scale())) expect(css, stale).toContain(`/* ${stackNote(stack)} */`);
  });

  it("switches to the narrower stacks in the stylesheets' order, as the last condition that matches wins", () => {
    const conditions = [...tokenBlocks(css).blocks.keys()].filter((block) => /^@(media|container) /.test(block));
    expect(conditions, stale).toStrictEqual(
      fallbackStacks(scale()).flatMap(({ under }) => (under === null ? [] : [`${under.at} ${under.selector}`])),
    );
  });

  it("was measured on the pinned Android font files", () => {
    const header = cssHeader(Object.values(ANDROID_FONTS));
    expect(css.startsWith(`${header}\n`), "font-fallbacks.css names other font files: run pnpm fonts:fallbacks").toBe(
      true,
    );
  });

  it("sets each stack under its condition, with faces for every family it names", () => {
    const { blocks } = tokenBlocks(css);
    for (const stack of fallbackStacks(scale())) {
      const block = stack.under === null ? "@theme inline" : `${stack.under.at} ${stack.under.selector}`;
      expect(blocks.get(block)?.get(stack.variable), stale).toBe(stackValue(stack));
      for (const platform of ["Geeza", "Arial", "Android"])
        expect(css, stale).toContain(`font-family: "${stack.family} Fallback ${platform}";`);
    }
  });
});
