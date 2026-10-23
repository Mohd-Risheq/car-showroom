import { tokenBlocks } from "./token-blocks.ts";

// DESIGN §3.3's five public steps as tokens.css sets them, read from its text, so the steps are
// written there alone: the type specimen labels each sample with its step, and the fonts generator
// (scripts/font-fallbacks.ts) fits each step's fallback faces to its weight and HEXP. Node loads
// this module from the scripts, so it names its one import by its .ts path.

export const TYPE_STEPS = ["display", "head", "lead", "body", "small"] as const;
export type TypeStep = (typeof TYPE_STEPS)[number];

/** A token's value for Latin text and for Arabic, which is the Latin one unless Arabic sets its own */
export type ScriptValues = { latin: string; arabic: string };

export type StepTokens = {
  id: TypeStep;
  /** The font size, as tokens.css writes it */
  size: string;
  weight: number;
  hexp: number;
  /** The narrower HEXP the step takes under a media condition (D-038), in the stylesheet's order */
  narrower: Array<{ media: string; hexp: number }>;
  leading: ScriptValues;
  /** The letter spacing, for a step that sets one */
  tracking: ScriptValues | null;
  /** The factor on the size, for a step that sets one */
  scale: ScriptValues | null;
};

/** The Arabic values' block. tokens.css names the lang attribute, so Latin inside Arabic takes the Latin ones. */
const ARABIC = '[lang|="ar"]';
/** A block that applies to the root under a media condition, as "@media (width < 33.75rem) :root" */
const MEDIA_ROOT = /^@media (.+) :root$/;

function numberIn(token: string, value: string): number {
  const number = Number(value);
  if (value.trim() === "" || !Number.isFinite(number)) throw new Error(`${token} is not a number: ${value}`);
  return number;
}

/** Each public step's tokens, in DESIGN's order, from the text of tokens.css. A missing token throws. */
export function readTypeScale(css: string): StepTokens[] {
  const { blocks, problems } = tokenBlocks(css);
  if (problems.length > 0) throw new Error(`tokens.css can't be read: ${problems.join("; ")}`);
  const root = blocks.get(":root") ?? new Map<string, string>();
  const arabic = blocks.get(ARABIC) ?? new Map<string, string>();

  const required = (token: string): string => {
    const value = root.get(token);
    if (value === undefined) throw new Error(`tokens.css sets no ${token} on :root`);
    return value;
  };
  const both = (token: string): ScriptValues => ({
    latin: required(token),
    arabic: arabic.get(token) ?? required(token),
  });
  const optional = (token: string): ScriptValues | null => (root.has(token) ? both(token) : null);

  return TYPE_STEPS.map((id) => ({
    id,
    size: required(`--${id}-size`),
    weight: numberIn(`--${id}-weight`, required(`--${id}-weight`)),
    hexp: numberIn(`--${id}-hexp`, required(`--${id}-hexp`)),
    narrower: [...blocks].flatMap(([block, tokens]) => {
      const media = MEDIA_ROOT.exec(block)?.[1];
      const hexp = tokens.get(`--${id}-hexp`);
      return media === undefined || hexp === undefined ? [] : [{ media, hexp: numberIn(`--${id}-hexp`, hexp) }];
    }),
    leading: both(`--${id}-leading`),
    tracking: optional(`--${id}-tracking`),
    scale: optional(`--${id}-scale`),
  }));
}
