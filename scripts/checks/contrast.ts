// The rules of pnpm check:contrast (scripts/check-contrast.ts), from DESIGN §3.1, §3.2 and §4.5 and
// NFR-A11Y-01: every colour pair in the pair list, recomputed from the tokens in tokens.css with the
// WCAG 2 contrast ratio, reaches its minimum (4.5:1 for text, 3:1 for UI), and a pair DESIGN gives a
// ratio for still has that ratio at the precision DESIGN writes it in.
//
// A scope layers token blocks as the cascade does when they all apply to <html>: a later block
// overrides an earlier one, and var() resolves after the layering. On an element below <html>, a
// var() set on :root keeps the value it had there, which this check can't see, so the theme and
// accent attributes belong on <html> (D-037).
import { z } from "zod";
import { blockName, type TokenBlocks } from "../../src/styles/token-blocks.ts";

/** An opaque colour's red, green and blue, 0 to 255 */
export type Rgb = [number, number, number];

/** An opaque #RGB or #RRGGBB colour's channels, or undefined for any other text */
export function hexColour(text: string): Rgb | undefined {
  if (!/^#(?:[0-9a-f]{3}){1,2}$/i.test(text)) return undefined;
  const digits = text.length === 4 ? text.slice(1).replace(/./g, "$&$&") : text.slice(1);
  const channel = (at: number) => Number.parseInt(digits.slice(at, at + 2), 16);
  return [channel(0), channel(2), channel(4)];
}

/** WCAG 2 relative luminance. Its 0.03928 threshold and sRGB's 0.04045 agree on every 8-bit channel. */
function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** The WCAG 2 contrast ratio of two colours, from 1 to 21 */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [one, two] = [luminance(first), luminance(second)];
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

const colourSchema = z
  .string()
  .regex(/^(?:--[\w-]+|#(?:[0-9a-fA-F]{3}){1,2})$/, "a token such as --ink, or a colour such as #FFFFFF");
const pairSchema = z
  .object({
    scope: z.string(),
    fg: colourSchema,
    bg: colourSchema,
    min: z.number().min(3, "WCAG asks at least 3:1 of any pair"),
    stated: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'the ratio as DESIGN writes it, such as "4.26"')
      .optional(),
    design: z.string().startsWith("DESIGN §", "the DESIGN section the pair comes from"),
  })
  .strict();
const pairListSchema = z
  .object({
    $comment: z.array(z.string()).optional(),
    scopes: z.record(z.string(), z.array(z.string()).min(1)),
    pairs: z.array(pairSchema).min(1),
  })
  .strict()
  .superRefine(({ scopes, pairs }, context) => {
    pairs.forEach(({ scope }, index) => {
      if (!Object.hasOwn(scopes, scope)) {
        context.addIssue({ code: "custom", path: ["pairs", index, "scope"], message: `no scope is named ${scope}` });
      }
    });
  });

export type PairList = z.infer<typeof pairListSchema>;
export type Pair = PairList["pairs"][number];
export type PairResult = { pair: Pair; ratio: number };

/** The pair list, or why it doesn't meet its schema */
export function parsePairs(json: unknown, file: string): PairList | string {
  const parsed = pairListSchema.safeParse(json);
  return parsed.success ? parsed.data : `${file} is not valid:\n${z.prettifyError(parsed.error)}`;
}

/** The ratio to the fewest decimals, from two, that still show it under the minimum: 4.4952 as 4.495, not 4.50 */
function under(ratio: number, minimum: number): string {
  let decimals = 2;
  while (Number(ratio.toFixed(decimals)) >= minimum) decimals++;
  return ratio.toFixed(decimals);
}

/** Why a pair's ratio misses its minimum or the ratio DESIGN states, or undefined when it holds both */
export function ratioProblem(pair: Pair, ratio: number): string | undefined {
  const colours = `${pair.fg} on ${pair.bg}`;
  if (ratio < pair.min) {
    return `${colours} is ${under(ratio, pair.min)}:1, below its minimum of ${pair.min}:1 (${pair.design})`;
  }
  if (pair.stated === undefined) return undefined;
  const shown = ratio.toFixed(pair.stated.split(".")[1]?.length ?? 0);
  return shown === pair.stated
    ? undefined
    : `${colours} is ${shown}:1, but DESIGN states ${pair.stated}:1 (${pair.design})`;
}

export type Layered = { tokens: ReadonlyMap<string, string> } | { missing: string[] };

/** A scope's tokens, its blocks layered in order, or the blocks the stylesheet lacks */
export function layer(blocks: TokenBlocks, names: string[]): Layered {
  const missing = names.filter((name) => !blocks.has(blockName(name)));
  if (missing.length > 0) return { missing };
  return { tokens: new Map(names.flatMap((name) => [...(blocks.get(blockName(name)) ?? [])])) };
}

const VAR = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*?))?\s*\)$/;

/** The colour a token or hex names among a scope's tokens, following var(), or why it can't be read */
export function colourOf(reference: string, tokens: ReadonlyMap<string, string>): Rgb | string {
  let value = reference.startsWith("--") ? `var(${reference})` : reference;
  const followed: string[] = [];
  for (let match = VAR.exec(value); match; match = VAR.exec(value)) {
    const [, name = "", fallback] = match;
    if (followed.includes(name)) return `var() loops: ${[...followed, name].join(" > ")}`;
    followed.push(name);
    const next = tokens.get(name) ?? fallback;
    if (next === undefined) return `${name} is not defined`;
    value = next.trim();
  }
  return (
    hexColour(value) ??
    `${followed.at(-1) ?? reference} is ${JSON.stringify(value)}, not an opaque #RGB or #RRGGBB colour`
  );
}

/** Every pair's ratio among its scope's tokens, and every problem with the tokens or the ratios */
export function checkPairs(blocks: TokenBlocks, list: PairList): { results: PairResult[]; problems: string[] } {
  const scopes = new Map(Object.entries(list.scopes).map(([scope, names]) => [scope, layer(blocks, names)]));
  const results: PairResult[] = [];
  // A problem with a scope or a token shows once, however many pairs meet it
  const problems = new Set<string>();
  for (const pair of list.pairs) {
    const scope = scopes.get(pair.scope);
    if (scope === undefined) {
      problems.add(`no scope is named ${pair.scope}`);
      continue;
    }
    if ("missing" in scope) {
      for (const name of scope.missing) problems.add(`${pair.scope}: no block matches ${name}`);
      continue;
    }
    const fg = colourOf(pair.fg, scope.tokens);
    const bg = colourOf(pair.bg, scope.tokens);
    if (typeof fg === "string" || typeof bg === "string") {
      for (const unread of [fg, bg]) {
        if (typeof unread === "string") problems.add(`${pair.scope}: ${unread}`);
      }
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    results.push({ pair, ratio });
    const problem = ratioProblem(pair, ratio);
    if (problem) problems.add(`${pair.scope}: ${problem}`);
  }
  return { results, problems: [...problems] };
}
