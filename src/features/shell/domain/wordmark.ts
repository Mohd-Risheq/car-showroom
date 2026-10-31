// DESIGN §2 and §10.3: the header's wordmark is the dealer's name, up to 60 characters (VR-21), and
// the header never wraps. The name takes a smaller size step as it grows (the wordmark utility in
// tokens.css); a name too long for the last step is cut with an ellipsis, and the link's name stays
// whole. Counted in code points: a name's marks are rare, and the step only needs its length.

export type WordmarkLength = "base" | "long" | "longest";

/** The longest name each step takes */
export const WORDMARK_STEPS = { base: 14, long: 24 } as const;

/** The size step for a dealer's name */
export function wordmarkLength(name: string): WordmarkLength {
  const length = [...name].length;
  if (length <= WORDMARK_STEPS.base) return "base";
  return length <= WORDMARK_STEPS.long ? "long" : "longest";
}
